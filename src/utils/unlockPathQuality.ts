import type { NetworkComparisonNode, NetworkComparisonWindow } from '@/utils/networkComparison'
import type { UnlockQualitySnapshot, UnlockQualitySnapshotNode, UnlockQualityStatus } from '@/utils/unlockQuality'

export interface EstimatedUnlockPath {
  entry_uuid: string
  exit_uuid: string
  exit_name: string
  exit_remark?: string
  ping_task_id: number
  ping_task_name: string
  family: 4 | 6
  link: NetworkComparisonNode
  unlock: UnlockQualitySnapshotNode
  estimated_p50_ms: number
  estimated_p95_ms: number
  estimated_failure_percent: number
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

function combinedFailurePercent(linkLoss: number, unlockFailure: number): number {
  const linkSuccess = 1 - Math.min(100, Math.max(0, linkLoss)) / 100
  const unlockSuccess = 1 - Math.min(100, Math.max(0, unlockFailure)) / 100
  return roundMetric((1 - linkSuccess * unlockSuccess) * 100)
}

function combinedPathScore(linkScore: number | null, unlockScore: number | null, status: UnlockQualityStatus): number | null {
  if (linkScore === null || unlockScore === null)
    return null
  const weighted = linkScore * 0.35 + unlockScore * 0.65
  const bottleneckCap = Math.min(linkScore, unlockScore) + 12
  let score = Math.min(weighted, bottleneckCap, 100)
  if (status === 'partial')
    score = Math.min(score, 69.9)
  else if (status === 'region_limited' || status === 'unavailable')
    score = Math.min(score, 39.9)
  return roundMetric(Math.max(0, score))
}

function betterLink(left: EstimatedUnlockPath, right: EstimatedUnlockPath): EstimatedUnlockPath {
  const leftRankable = left.score !== null
  const rightRankable = right.score !== null
  if (leftRankable !== rightRankable)
    return leftRankable ? left : right
  if ((left.link.score ?? -1) !== (right.link.score ?? -1))
    return (left.link.score ?? -1) > (right.link.score ?? -1) ? left : right
  return left.estimated_p50_ms <= right.estimated_p50_ms ? left : right
}

export function buildEstimatedUnlockPaths(
  entryUUID: string,
  snapshot: UnlockQualitySnapshot,
  networkWindow: NetworkComparisonWindow,
): EstimatedUnlockPath[] {
  if (!entryUUID)
    return []

  const taskByID = new Map(networkWindow.tasks.map(task => [task.id, task]))
  const exitByUUID = new Map(snapshot.nodes.map(node => [node.uuid, node]))
  const bestByExit = new Map<string, EstimatedUnlockPath>()

  for (const binding of snapshot.path_bindings ?? []) {
    if (binding.exit_node_uuid === entryUUID)
      continue
    const task = taskByID.get(binding.ping_task_id)
    const link = task?.nodes.find(node => node.uuid === entryUUID)
    const unlock = exitByUUID.get(binding.exit_node_uuid)
    if (!task || !link || !unlock || link.p50 === null || link.p95 === null)
      continue

    const score = combinedPathScore(link.score, unlock.system.score, unlock.system.status)
    const candidate: EstimatedUnlockPath = {
      entry_uuid: entryUUID,
      exit_uuid: unlock.uuid,
      exit_name: unlock.name,
      exit_remark: unlock.public_remark,
      ping_task_id: task.id,
      ping_task_name: task.name,
      family: binding.family,
      link,
      unlock,
      estimated_p50_ms: roundMetric(link.p50 + unlock.system.ttfb_p50_ms),
      estimated_p95_ms: roundMetric(link.p95 + unlock.system.ttfb_p95_ms),
      estimated_failure_percent: combinedFailurePercent(link.loss_percent, unlock.system.failure_percent),
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
