import { getSharedRpc } from '@/utils/rpc'

export interface TCPQualityPublicTask {
  id: number
  name: string
  province_codes: string[]
  isp_codes: string[]
  ip_versions: string[]
  large_enabled: boolean
}

export interface TCPQualityTargetLabel {
  key: string
  province: string
  province_code: string
  isp: string
  isp_code: string
  ip_version: number
}

export interface TCPQualityModeStats {
  loss_percent: number
  p50_ms: number
  p95_ms: number
  samples_sent: number
  samples_received: number
  runs: number
  coverage_percent: number
  score: number | null
  rankable: boolean
  reason?: string
}

export interface TCPQualityNodeTarget {
  target_key: string
  standard?: TCPQualityModeStats
  large?: TCPQualityModeStats
}

export interface TCPQualityTrendPoint {
  time: string
  loss_percent: number
  p50_ms: number
  p95_ms: number
}

export interface TCPQualitySnapshotNode {
  uuid: string
  name: string
  region: string
  public_remark?: string
  rank: number | null
  grade: string
  rankable: boolean
  reason?: string
  icmp_score: number | null
  tcp_standard_score: number | null
  large_experimental_score: number | null
  tcp_score: number | null
  overall_score: number | null
  standard: TCPQualityModeStats
  large?: TCPQualityModeStats
  targets: TCPQualityNodeTarget[]
  trend: TCPQualityTrendPoint[]
}

export interface TCPQualitySnapshot {
  task_id: number
  task_name: string
  window_hours: number
  generated_at: string
  catalog_revision: string
  observed_catalog_revisions: string[]
  targets: TCPQualityTargetLabel[]
  excluded_target_keys: string[]
  nodes: TCPQualitySnapshotNode[]
  valid_nodes: number
  best_node_uuid?: string
  score_model: {
    version: string
    weights: Record<string, unknown>
    guards: Record<string, unknown>
  }
  privacy: string
}

let publicTaskCache: Promise<TCPQualityPublicTask[]> | null = null
const snapshotCache = new Map<string, Promise<TCPQualitySnapshot>>()

export function loadTCPQualityTasks(force = false): Promise<TCPQualityPublicTask[]> {
  if (force)
    publicTaskCache = null
  if (!publicTaskCache) {
    publicTaskCache = getSharedRpc().getClient().call<TCPQualityPublicTask[]>('public:getPublicTCPQualityTasks').catch((error) => {
      publicTaskCache = null
      throw error
    })
  }
  return publicTaskCache
}

export function loadTCPQualitySnapshot(taskId: number, windowHours: number, force = false): Promise<TCPQualitySnapshot> {
  const key = `${taskId}:${windowHours}`
  if (force)
    snapshotCache.delete(key)
  const cached = snapshotCache.get(key)
  if (cached)
    return cached
  const request = getSharedRpc().getClient().call<TCPQualitySnapshot>('public:getPublicTCPQualitySnapshot', {
    task_id: taskId,
    window_hours: windowHours,
  }).catch((error) => {
    snapshotCache.delete(key)
    throw error
  })
  snapshotCache.set(key, request)
  return request
}

export function formatTCPQualityScore(value: number | null): string {
  return value === null ? '--' : value.toFixed(1)
}

export function formatTCPQualityLoss(value: number): string {
  if (value >= 99.95)
    return '100%'
  if (value < 0.1)
    return `${value.toFixed(2)}%`
  return `${value.toFixed(value < 10 ? 1 : 0)}%`
}
