import type { NetworkComparisonNode, NetworkComparisonWindow } from '@/utils/networkComparison'
import type { UnlockQualitySnapshot, UnlockQualitySnapshotNode, UnlockQualityStatus } from '@/utils/unlockQuality'

export type UnlockPathScenario = 'daily' | 'first'

export interface UnlockPathOptions {
  access_task_id?: number | null
  scenario?: UnlockPathScenario
}

export interface EstimatedUnlockPath {
  entry_uuid: string
  exit_uuid: string
  exit_name: string
  exit_remark?: string
  access_task_id: number | null
  access_task_name: string
  access: NetworkComparisonNode | null
  ping_task_id: number
  ping_task_name: string
  family: 4 | 6
  link: NetworkComparisonNode
  unlock: UnlockQualitySnapshotNode
  daily_p50_ms: number
  daily_p95_ms: number
  first_p50_ms: number
  first_p95_ms: number
  estimated_p50_ms: number
  estimated_p95_ms: number
  estimated_failure_percent: number
  daily_score: number | null
  first_score: number | null
  score: number | null
  grade: string
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100
}

function pathGrade(score: number | null): string {
  if (score === null)
    return '未评级'
  if (score >= 90)
    return '优秀'
  if (score >= 75)
    return '良好'
  if (score >= 60)
    return '一般'
  return '较差'
}

function combinedFailurePercent(...failures: number[]): number {
  const success = failures.reduce((current, failure) => {
    return current * (1 - Math.min(100, Math.max(0, failure)) / 100)
  }, 1)
  return roundMetric((1 - success) * 100)
}

function descendingScore(value: number, points: Array<[number, number]>): number {
  if (value <= points[0]![0])
    return points[0]![1]
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1]!
    const right = points[index]!
    if (value <= right[0]) {
      const ratio = (value - left[0]) / (right[0] - left[0])
      return left[1] + (right[1] - left[1]) * ratio
    }
  }
  return points.at(-1)![1]
}

function scoreEstimatedPath(
  p50: number,
  p95: number,
  failure: number,
  status: UnlockQualityStatus,
  rankable: boolean,
): number | null {
  if (!rankable)
    return null
  const failureScore = descendingScore(failure, [[0, 100], [0.1, 99], [0.5, 95], [1, 90], [3, 75], [5, 60], [10, 35], [20, 10], [30, 0]])
  const p50Score = descendingScore(p50, [[100, 100], [150, 95], [250, 85], [400, 70], [600, 50], [1000, 20], [1500, 0]])
  const p95Score = descendingScore(p95, [[150, 100], [250, 95], [400, 85], [700, 65], [1200, 35], [2000, 0]])
  const tailScore = descendingScore(Math.max(0, p95 - p50), [[50, 100], [100, 90], [250, 70], [500, 40], [1000, 0]])
  let score = failureScore * 0.4 + p50Score * 0.3 + p95Score * 0.25 + tailScore * 0.05
  if (status === 'partial')
    score = Math.min(score, 69.9)
  else if (status === 'region_limited' || status === 'unavailable')
    score = Math.min(score, 39.9)
  return roundMetric(Math.max(0, Math.min(100, score)))
}

function betterLink(left: EstimatedUnlockPath, right: EstimatedUnlockPath): EstimatedUnlockPath {
  const leftRankable = left.score !== null
  const rightRankable = right.score !== null
  if (leftRankable !== rightRankable)
    return leftRankable ? left : right
  if ((left.score ?? -1) !== (right.score ?? -1))
    return (left.score ?? -1) > (right.score ?? -1) ? left : right
  return left.estimated_p50_ms <= right.estimated_p50_ms ? left : right
}

export function buildEstimatedUnlockPaths(
  entryUUID: string,
  snapshot: UnlockQualitySnapshot,
  networkWindow: NetworkComparisonWindow,
  options: UnlockPathOptions = {},
): EstimatedUnlockPath[] {
  if (!entryUUID)
    return []

  const scenario = options.scenario ?? 'daily'
  const taskByID = new Map(networkWindow.tasks.map(task => [task.id, task]))
  const exitByUUID = new Map(snapshot.nodes.map(node => [node.uuid, node]))
  const accessTask = options.access_task_id ? taskByID.get(options.access_task_id) : undefined
  const access = accessTask?.nodes.find(node => node.uuid === entryUUID) ?? null
  if (options.access_task_id && (!access || access.p50 === null || access.p95 === null))
    return []

  const bestByExit = new Map<string, EstimatedUnlockPath>()
  for (const binding of snapshot.path_bindings ?? []) {
    if (binding.exit_node_uuid === entryUUID)
      continue
    const task = taskByID.get(binding.ping_task_id)
    const link = task?.nodes.find(node => node.uuid === entryUUID)
    const unlock = exitByUUID.get(binding.exit_node_uuid)
    if (!task || !link || !unlock || link.p50 === null || link.p95 === null)
      continue

    const accessP50 = access?.p50 ?? 0
    const accessP95 = access?.p95 ?? 0
    const dailyP50 = roundMetric(accessP50 + link.p50 + unlock.system.ttfb_p50_ms)
    const dailyP95 = roundMetric(accessP95 + link.p95 + unlock.system.ttfb_p95_ms)
    // Cold TLS 1.3 proxy hops add roughly one TCP RTT and one TLS RTT each.
    // Destination TCP/TLS is already included in the measured ChatGPT TTFB.
    const firstP50 = roundMetric(dailyP50 + 2 * (accessP50 + link.p50))
    const firstP95 = roundMetric(dailyP95 + 2 * (accessP95 + link.p95))
    const failure = combinedFailurePercent(access?.loss_percent ?? 0, link.loss_percent, unlock.system.failure_percent)
    const rankable = link.score !== null && unlock.system.score !== null && (!access || access.score !== null)
    const dailyScore = scoreEstimatedPath(dailyP50, dailyP95, failure, unlock.system.status, rankable)
    const firstScore = scoreEstimatedPath(firstP50, firstP95, failure, unlock.system.status, rankable)
    const score = scenario === 'first' ? firstScore : dailyScore
    const candidate: EstimatedUnlockPath = {
      entry_uuid: entryUUID,
      exit_uuid: unlock.uuid,
      exit_name: unlock.name,
      exit_remark: unlock.public_remark,
      access_task_id: accessTask?.id ?? null,
      access_task_name: accessTask?.name ?? '',
      access,
      ping_task_id: task.id,
      ping_task_name: task.name,
      family: binding.family,
      link,
      unlock,
      daily_p50_ms: dailyP50,
      daily_p95_ms: dailyP95,
      first_p50_ms: firstP50,
      first_p95_ms: firstP95,
      estimated_p50_ms: scenario === 'first' ? firstP50 : dailyP50,
      estimated_p95_ms: scenario === 'first' ? firstP95 : dailyP95,
      estimated_failure_percent: failure,
      daily_score: dailyScore,
      first_score: firstScore,
      score,
      grade: pathGrade(score),
    }
    const current = bestByExit.get(candidate.exit_uuid)
    bestByExit.set(candidate.exit_uuid, current ? betterLink(current, candidate) : candidate)
  }

  return [...bestByExit.values()].sort((left, right) => {
    if (left.score !== null && right.score !== null)
      return right.score - left.score
    if (left.score !== null)
      return -1
    if (right.score !== null)
      return 1
    return left.exit_name.localeCompare(right.exit_name, 'zh-CN')
  })
}
