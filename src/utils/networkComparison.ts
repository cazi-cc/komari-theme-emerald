import { getSharedRpc } from '@/utils/rpc'

export const NETWORK_COMPARISON_BASE = '/emerald-analytics'
const CACHE_TTL_MS = 5 * 60 * 1000

export interface NetworkScoreComponents {
  loss: number
  p50: number
  p95: number
  volatility: number
  coverage: number
}

export interface NetworkComparisonNode {
  uuid: string
  name: string
  region: string
  rank: number | null
  rankable: boolean
  unranked_reason?: string
  score: number | null
  grade: string
  p005?: number | null
  p50: number | null
  p95: number | null
  p995?: number | null
  loss_percent: number
  loss_count: number
  samples: number
  expected_samples: number
  coverage_percent: number
  volatility: number | null
  score_components?: NetworkScoreComponents
}

export interface NetworkComparisonTask {
  id: number
  name: string
  type: string
  interval: number
  node_count: number
  rankable_node_count: number
  ranking_available: boolean
  nodes: NetworkComparisonNode[]
}

export interface NetworkComparisonWindow {
  schema_version: number
  generated_at: string
  start: string
  end: string
  hours: number
  scoring: {
    name: string
    model_version?: number
    volatility_scale?: string
    weights: NetworkScoreComponents
    minimum_samples: number
    minimum_coverage_percent: number
    minimum_rankable_nodes: number
    grade_thresholds: {
      excellent: number
      good: number
      fair: number
    }
  }
  tasks: NetworkComparisonTask[]
}

export interface NetworkComparisonManifest {
  schema_version: number
  generated_at: string
  windows: Record<string, {
    path: string
    generated_at: string
    hours: number
  }>
}

interface MetricPoint {
  time: string
  value: number | null
  count?: number
}

type ProbeMetricKey
  = | 'probe.reachable'
    | 'probe.latency.min_ms'
    | 'probe.latency.max_ms'
    | 'probe.jitter_ms'
    | 'probe.samples.sent'
    | 'probe.samples.received'
    | 'probe.packet.size_bytes'
    | 'probe.dns_ms'
    | 'probe.connect_ms'
    | 'probe.tls_ms'
    | 'probe.ttfb_ms'
    | 'probe.http.status_code'
    | 'probe.http.status_ok_ratio'
    | 'probe.tcp.retransmissions'

interface MetricSeries {
  metric_key: 'ping.latency_ms' | 'ping.loss' | ProbeMetricKey
  entity_id: string
  points: MetricPoint[]
}

interface MetricQueryResponse {
  series: MetricSeries[]
}

export interface NetworkTrendSeries {
  uuid: string
  metric: 'latency' | 'loss'
  points: Array<[string, number | null]>
}

export interface NetworkProbeDiagnostic {
  uuid: string
  reachablePercent: number | null
  statusOkPercent: number | null
  latencyMinMs: number | null
  latencyMaxMs: number | null
  jitterMs: number | null
  dnsMs: number | null
  connectMs: number | null
  tlsMs: number | null
  ttfbMs: number | null
  httpStatus: number | null
  retransmissions: number | null
  packetSizeBytes: number | null
  samplesSent: number | null
  samplesReceived: number | null
}

interface CacheEntry<T> {
  expiresAt: number
  value: T
}

const responseCache = new Map<string, CacheEntry<unknown>>()
const pendingRequests = new Map<string, Promise<unknown>>()

async function fetchCachedJson<T>(url: string, force = false): Promise<T> {
  const cached = responseCache.get(url)
  if (!force && cached && cached.expiresAt > Date.now())
    return cached.value as T

  const pending = pendingRequests.get(url)
  if (!force && pending)
    return pending as Promise<T>

  const request = fetch(url, {
    credentials: 'same-origin',
    cache: force ? 'reload' : 'default',
  }).then(async (response) => {
    if (!response.ok)
      throw new Error(`缓存读取失败：HTTP ${response.status}`)
    const value = await response.json() as T
    responseCache.set(url, { expiresAt: Date.now() + CACHE_TTL_MS, value })
    return value
  }).finally(() => {
    pendingRequests.delete(url)
  })

  pendingRequests.set(url, request)
  return request
}

export function loadNetworkComparisonManifest(force = false): Promise<NetworkComparisonManifest> {
  return fetchCachedJson<NetworkComparisonManifest>(`${NETWORK_COMPARISON_BASE}/manifest.json`, force)
}

export function loadNetworkComparisonWindow(
  manifest: NetworkComparisonManifest,
  hours: number,
  force = false,
): Promise<NetworkComparisonWindow> {
  const entry = manifest.windows[String(hours)]
  if (!entry)
    throw new Error(`服务器尚未生成 ${hours} 小时缓存`)
  return fetchCachedJson<NetworkComparisonWindow>(`${NETWORK_COMPARISON_BASE}/${entry.path}`, force)
}

function trendCacheKey(taskId: number, hours: number, entityIds: string[]): string {
  return `trend:${taskId}:${hours}:${[...entityIds].sort().join(',')}`
}

export async function loadNetworkTrend(
  taskId: number,
  hours: number,
  entityIds: string[],
  force = false,
): Promise<NetworkTrendSeries[]> {
  const key = trendCacheKey(taskId, hours, entityIds)
  const cached = responseCache.get(key)
  if (!force && cached && cached.expiresAt > Date.now())
    return cached.value as NetworkTrendSeries[]

  const pending = pendingRequests.get(key)
  if (!force && pending)
    return pending as Promise<NetworkTrendSeries[]>

  const request = getSharedRpc().getClient().call<MetricQueryResponse>('public:queryMetrics', {
    metric_keys: ['ping.latency_ms', 'ping.loss'],
    entity_ids: entityIds,
    hours,
    tags: { task_id: String(taskId) },
    downsample: true,
    max_points: 300,
    aggregation_by_metric: {
      'ping.latency_ms': 'avg',
      'ping.loss': 'avg',
    },
  }).then((result) => {
    const series = (result.series ?? []).map(item => ({
      uuid: item.entity_id,
      metric: item.metric_key === 'ping.loss' ? 'loss' as const : 'latency' as const,
      points: (item.points ?? []).map(point => [
        point.time,
        point.value === null
          ? null
          : item.metric_key === 'ping.loss'
            ? point.value * 100
            : point.value,
      ] as [string, number | null]),
    }))
    responseCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: series })
    return series
  }).finally(() => {
    pendingRequests.delete(key)
  })

  pendingRequests.set(key, request)
  return request
}

const probeMetricKeys: ProbeMetricKey[] = [
  'probe.reachable',
  'probe.latency.min_ms',
  'probe.latency.max_ms',
  'probe.jitter_ms',
  'probe.samples.sent',
  'probe.samples.received',
  'probe.packet.size_bytes',
  'probe.dns_ms',
  'probe.connect_ms',
  'probe.tls_ms',
  'probe.ttfb_ms',
  'probe.http.status_code',
  'probe.http.status_ok_ratio',
  'probe.tcp.retransmissions',
]

function probeCacheKey(taskId: number, hours: number, entityIds: string[]): string {
  return `probe:${taskId}:${hours}:${[...entityIds].sort().join(',')}`
}

function metricValues(series: MetricSeries): number[] {
  return (series.points ?? [])
    .map(point => point.value)
    .filter((value): value is number => value !== null && Number.isFinite(value))
}

function createProbeDiagnostic(uuid: string): NetworkProbeDiagnostic {
  return {
    uuid,
    reachablePercent: null,
    statusOkPercent: null,
    latencyMinMs: null,
    latencyMaxMs: null,
    jitterMs: null,
    dnsMs: null,
    connectMs: null,
    tlsMs: null,
    ttfbMs: null,
    httpStatus: null,
    retransmissions: null,
    packetSizeBytes: null,
    samplesSent: null,
    samplesReceived: null,
  }
}

function sumMetric(current: number | null, values: number[]): number | null {
  if (values.length === 0)
    return current
  return (current ?? 0) + values.reduce((sum, value) => sum + value, 0)
}

export async function loadProbeDiagnostics(
  taskId: number,
  hours: number,
  entityIds: string[],
  force = false,
): Promise<NetworkProbeDiagnostic[]> {
  const key = probeCacheKey(taskId, hours, entityIds)
  const cached = responseCache.get(key)
  if (!force && cached && cached.expiresAt > Date.now())
    return cached.value as NetworkProbeDiagnostic[]

  const pending = pendingRequests.get(key)
  if (!force && pending)
    return pending as Promise<NetworkProbeDiagnostic[]>

  const request = getSharedRpc().getClient().call<MetricQueryResponse>('public:queryMetrics', {
    metric_keys: probeMetricKeys,
    entity_ids: entityIds,
    hours,
    tags: { task_id: String(taskId) },
    downsample: true,
    max_points: 1,
    aggregation_by_metric: {
      'probe.reachable': 'avg',
      'probe.latency.min_ms': 'min',
      'probe.latency.max_ms': 'max',
      'probe.jitter_ms': 'avg',
      'probe.samples.sent': 'sum',
      'probe.samples.received': 'sum',
      'probe.packet.size_bytes': 'last',
      'probe.dns_ms': 'avg',
      'probe.connect_ms': 'avg',
      'probe.tls_ms': 'avg',
      'probe.ttfb_ms': 'avg',
      'probe.http.status_code': 'last',
      'probe.http.status_ok_ratio': 'avg',
      'probe.tcp.retransmissions': 'sum',
    },
  }).then((result) => {
    const diagnostics = new Map(entityIds.map(uuid => [uuid, createProbeDiagnostic(uuid)]))

    for (const series of result.series ?? []) {
      const diagnostic = diagnostics.get(series.entity_id)
      const values = metricValues(series)
      if (!diagnostic || values.length === 0)
        continue

      const first = values[0] ?? 0
      switch (series.metric_key) {
        case 'probe.reachable':
          diagnostic.reachablePercent = first * 100
          break
        case 'probe.http.status_ok_ratio':
          diagnostic.statusOkPercent = first * 100
          break
        case 'probe.latency.min_ms':
          diagnostic.latencyMinMs = diagnostic.latencyMinMs === null
            ? Math.min(...values)
            : Math.min(diagnostic.latencyMinMs, ...values)
          break
        case 'probe.latency.max_ms':
          diagnostic.latencyMaxMs = diagnostic.latencyMaxMs === null
            ? Math.max(...values)
            : Math.max(diagnostic.latencyMaxMs, ...values)
          break
        case 'probe.jitter_ms':
          diagnostic.jitterMs = first
          break
        case 'probe.dns_ms':
          diagnostic.dnsMs = first
          break
        case 'probe.connect_ms':
          diagnostic.connectMs = first
          break
        case 'probe.tls_ms':
          diagnostic.tlsMs = first
          break
        case 'probe.ttfb_ms':
          diagnostic.ttfbMs = first
          break
        case 'probe.http.status_code':
          diagnostic.httpStatus = first
          break
        case 'probe.packet.size_bytes':
          diagnostic.packetSizeBytes = first
          break
        case 'probe.samples.sent':
          diagnostic.samplesSent = sumMetric(diagnostic.samplesSent, values)
          break
        case 'probe.samples.received':
          diagnostic.samplesReceived = sumMetric(diagnostic.samplesReceived, values)
          break
        case 'probe.tcp.retransmissions':
          diagnostic.retransmissions = sumMetric(diagnostic.retransmissions, values)
          break
      }
    }

    const value = [...diagnostics.values()].filter(diagnostic =>
      Object.entries(diagnostic).some(([field, fieldValue]) => field !== 'uuid' && fieldValue !== null),
    )
    responseCache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value })
    return value
  }).finally(() => {
    pendingRequests.delete(key)
  })

  pendingRequests.set(key, request)
  return request
}

export function formatLossRate(value: number): string {
  if (value === 0)
    return '0%'
  if (value < 0.01)
    return `${value.toFixed(3)}%`
  if (value < 0.1)
    return `${value.toFixed(2)}%`
  return `${value.toFixed(value < 10 ? 2 : 1)}%`
}

export function formatCoverage(value: number): string {
  if (value >= 99.95)
    return '100%'
  return `${value.toFixed(1)}%`
}
