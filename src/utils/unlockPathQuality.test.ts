import type { NetworkComparisonWindow } from '@/utils/networkComparison'
import type { UnlockQualitySnapshot } from '@/utils/unlockQuality'
// @ts-expect-error Bun exposes this module at test runtime; the app tsconfig intentionally omits Bun globals.
import { describe, expect, test } from 'bun:test'
import { buildEstimatedUnlockPaths } from '@/utils/unlockPathQuality'

function route(score: number, failurePercent: number) {
  return {
    route_mode: 'system' as const,
    status: 'available' as const,
    score,
    grade: '良好',
    coverage_percent: 100,
    samples_sent: 60,
    samples_received: 60,
    failure_percent: failurePercent,
    dns_ms: 1,
    connect_ms: 2,
    tls_ms: 3,
    ttfb_p50_ms: 100,
    ttfb_p95_ms: 150,
    total_p50_ms: 110,
    total_p95_ms: 160,
    jitter_ms: 4,
    trend: [],
  }
}

const snapshot: UnlockQualitySnapshot = {
  task_id: 1,
  task_name: 'ChatGPT',
  service: 'chatgpt',
  window_hours: 12,
  generated_at: '2026-08-21T12:00:00Z',
  path_bindings: [
    { ping_task_id: 10, exit_node_uuid: 'exit-a', family: 4 },
    { ping_task_id: 11, exit_node_uuid: 'exit-a', family: 6 },
    { ping_task_id: 12, exit_node_uuid: 'entry-a', family: 4 },
  ],
  nodes: [
    { uuid: 'exit-a', name: 'Exit A', rank: 1, score: 90, grade: '优秀', system: route(90, 10) },
    { uuid: 'entry-a', name: 'Entry A', rank: 2, score: 80, grade: '良好', system: route(80, 0) },
  ],
}

const networkWindow: NetworkComparisonWindow = {
  schema_version: 1,
  generated_at: '2026-08-21T12:00:00Z',
  start: '2026-08-21T00:00:00Z',
  end: '2026-08-21T12:00:00Z',
  hours: 12,
  scoring: {
    name: 'test',
    weights: { loss: 0, p50: 0, p95: 0, volatility: 0, coverage: 0 },
    minimum_samples: 1,
    minimum_coverage_percent: 1,
    minimum_rankable_nodes: 1,
    grade_thresholds: { excellent: 90, good: 75, fair: 60 },
  },
  tasks: [
    { id: 20, name: '福建移动', type: 'icmp', interval: 60, node_count: 1, rankable_node_count: 1, ranking_available: true, nodes: [{ uuid: 'entry-a', name: 'Entry A', region: '', rank: 1, rankable: true, score: 85, grade: '良好', p50: 30, p95: 50, loss_percent: 1, loss_count: 1, samples: 60, expected_samples: 60, coverage_percent: 100, volatility: 0.1 }] },
    { id: 10, name: 'Exit A v4', type: 'icmp', interval: 60, node_count: 1, rankable_node_count: 1, ranking_available: true, nodes: [{ uuid: 'entry-a', name: 'Entry A', region: '', rank: 1, rankable: true, score: 80, grade: '良好', p50: 20, p95: 30, loss_percent: 5, loss_count: 3, samples: 60, expected_samples: 60, coverage_percent: 100, volatility: 0.1 }] },
    { id: 11, name: 'Exit A v6', type: 'icmp', interval: 60, node_count: 1, rankable_node_count: 1, ranking_available: true, nodes: [{ uuid: 'entry-a', name: 'Entry A', region: '', rank: 1, rankable: true, score: 95, grade: '优秀', p50: 10, p95: 20, loss_percent: 0, loss_count: 0, samples: 60, expected_samples: 60, coverage_percent: 100, volatility: 0.1 }] },
    { id: 12, name: 'Entry A v4', type: 'icmp', interval: 60, node_count: 1, rankable_node_count: 1, ranking_available: true, nodes: [{ uuid: 'entry-a', name: 'Entry A', region: '', rank: 1, rankable: true, score: 100, grade: '优秀', p50: 1, p95: 1, loss_percent: 0, loss_count: 0, samples: 60, expected_samples: 60, coverage_percent: 100, volatility: 0 }] },
  ],
}

describe('buildEstimatedUnlockPaths', () => {
  test('chooses the better address family and excludes the entry node itself', () => {
    const paths = buildEstimatedUnlockPaths('entry-a', snapshot, networkWindow)
    expect(paths).toHaveLength(1)
    expect(paths[0]?.exit_uuid).toBe('exit-a')
    expect(paths[0]?.family).toBe(6)
    expect(paths[0]?.estimated_p50_ms).toBe(110)
    expect(paths[0]?.estimated_p95_ms).toBe(170)
    expect(paths[0]?.estimated_failure_percent).toBe(10)
  })

  test('adds the selected domestic access segment and models a cold proxy connection', () => {
    const paths = buildEstimatedUnlockPaths('entry-a', snapshot, networkWindow, {
      access_task_id: 20,
      scenario: 'first',
    })
    expect(paths).toHaveLength(1)
    expect(paths[0]?.access_task_name).toBe('福建移动')
    expect(paths[0]?.daily_p50_ms).toBe(140)
    expect(paths[0]?.daily_p95_ms).toBe(220)
    expect(paths[0]?.first_p50_ms).toBe(220)
    expect(paths[0]?.first_p95_ms).toBe(360)
    expect(paths[0]?.estimated_failure_percent).toBe(10.9)
  })
})
