import { getSharedRpc } from '@/utils/rpc'

export type UnlockQualityStatus = 'available' | 'partial' | 'region_limited' | 'unavailable' | 'stale' | 'unknown'

export interface UnlockQualityPublicTask {
  id: number
  name: string
  service: string
}

export interface UnlockQualityScoreParts {
  unlock: number
  reliability: number
  ttfb: number
  transport: number
  stability: number
}

export interface UnlockQualityTrendPoint {
  time: string
  ttfb_p50_ms: number
  ttfb_p95_ms: number
  ttfb_min_ms: number
  ttfb_max_ms: number
  failure_count: number
  samples_sent: number
}

export interface UnlockQualityRouteSummary {
  route_mode: 'system' | 'control' | 'fixed'
  status: UnlockQualityStatus
  score: number | null
  grade: string
  coverage_percent: number
  samples_sent: number
  samples_received: number
  failure_percent: number
  dns_ms: number
  connect_ms: number
  tls_ms: number
  ttfb_p50_ms: number
  ttfb_p95_ms: number
  total_p50_ms: number
  total_p95_ms: number
  jitter_ms: number
  exit_country?: string
  edge_colo?: string
  latest_at?: string
  components?: UnlockQualityScoreParts
  trend: UnlockQualityTrendPoint[]
}

export interface UnlockQualitySnapshotNode {
  uuid: string
  name: string
  public_remark?: string
  rank: number | null
  score: number | null
  grade: string
  system: UnlockQualityRouteSummary
  control?: UnlockQualityRouteSummary
  fixed_diagnostic?: UnlockQualityRouteSummary
  improvement_score?: number
}

export interface UnlockQualitySnapshot {
  task_id: number
  task_name: string
  service: string
  window_hours: number
  generated_at: string
  nodes: UnlockQualitySnapshotNode[]
}

let taskCache: Promise<UnlockQualityPublicTask[]> | null = null
const snapshotCache = new Map<string, Promise<UnlockQualitySnapshot>>()

export function loadUnlockQualityTasks(force = false): Promise<UnlockQualityPublicTask[]> {
  if (force)
    taskCache = null
  if (!taskCache) {
    taskCache = getSharedRpc().getClient().call<UnlockQualityPublicTask[]>('public:getPublicUnlockQualityTasks').catch((error) => {
      taskCache = null
      throw error
    })
  }
  return taskCache
}

export function loadUnlockQualitySnapshot(taskId: number, windowHours: number, force = false): Promise<UnlockQualitySnapshot> {
  const key = `${taskId}:${windowHours}`
  if (force)
    snapshotCache.delete(key)
  const cached = snapshotCache.get(key)
  if (cached)
    return cached
  const request = getSharedRpc().getClient().call<UnlockQualitySnapshot>('public:getPublicUnlockQualitySnapshot', {
    task_id: taskId,
    window_hours: windowHours,
  }).catch((error) => {
    snapshotCache.delete(key)
    throw error
  })
  snapshotCache.set(key, request)
  return request
}

export function formatUnlockQualityScore(value: number | null): string {
  return value === null ? '--' : value.toFixed(1)
}

export function formatUnlockQualityPercent(value: number): string {
  if (value >= 99.95)
    return '100%'
  if (value < 0.1)
    return `${value.toFixed(2)}%`
  return `${value.toFixed(value < 10 ? 1 : 0)}%`
}

export function unlockQualityStatusLabel(status: UnlockQualityStatus): string {
  return {
    available: '地区可用',
    partial: '部分可用',
    region_limited: '地区受限',
    unavailable: '不可用',
    stale: '数据过期',
    unknown: '待检测',
  }[status]
}
