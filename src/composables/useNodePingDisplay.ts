import type { MaybeRefOrGetter } from 'vue'
import type { NodePingHistoryPoint, NodePingIpFamily, NodePingStatsState } from '@/composables/useNodePingStats'
import { computed, toValue } from 'vue'
import { NODE_PING_BAR_COUNT, useNodePingStats } from '@/composables/useNodePingStats'
import { formatDateTime } from '@/utils/helper'

export type NodePingMetric = 'latency' | 'loss'

// getRecords 在新版主控中返回的是近期可用样本，不保证覆盖完整 1 小时。
const RECENT_PING_RECORDS_QUERY_HOURS = 1

export interface NodePingBar {
  key: string
  className: string
  tooltip: string
}

export interface NodePingTaskDisplay {
  key: NodePingIpFamily
  protocolLabel: string
  taskName: string
  latencyRenderBars: NodePingBar[]
  lossRenderBars: NodePingBar[]
  latencyDisplay: string
  lossDisplay: string
  latencyPanelTooltip: string
  lossPanelTooltip: string
}

interface UseNodePingDisplayOptions {
  enabled?: MaybeRefOrGetter<boolean>
  loadingDisplayText?: string
  emptyDisplayText?: string
  loadingPanelTooltipText?: Partial<Record<NodePingMetric, string>>
  emptyPanelTooltipText?: Partial<Record<NodePingMetric, string>>
}

function getLatencyToneClass(latency: number): string {
  if (latency <= 60)
    return 'bg-[#5EEAA6]/90'
  if (latency <= 100)
    return 'bg-[#47B592]/80'
  if (latency <= 160)
    return 'bg-lime-400/80'
  if (latency <= 200)
    return 'bg-yellow-400/80'
  return 'bg-rose-500/80'
}

function getLossToneClass(loss: number): string {
  if (loss <= 1)
    return 'bg-[#5EEAA6]/90'
  if (loss <= 3)
    return 'bg-[#47B592]/90'
  if (loss <= 6)
    return 'bg-lime-400/90'
  if (loss <= 9)
    return 'bg-yellow-400/90'
  return 'bg-rose-500/80'
}

export function useNodePingDisplay(
  uuid: MaybeRefOrGetter<string>,
  options: UseNodePingDisplayOptions = {},
) {
  // Komari 1.2.6+ uses metric-store retention and keeps the legacy public
  // record fields for compatibility only. They can report records as disabled
  // even when ping metrics are available, so only an explicit caller option
  // should prevent the query.
  const pingStatsEnabled = computed(() => options.enabled === undefined || toValue(options.enabled))

  const pingRecordsQueryHours = computed(() => RECENT_PING_RECORDS_QUERY_HOURS)

  const pingStats = useNodePingStats(uuid, {
    hours: pingRecordsQueryHours,
    enabled: pingStatsEnabled,
  })

  function buildPingBars(
    metric: NodePingMetric,
    points: NodePingHistoryPoint[],
    taskName = '',
  ): NodePingBar[] {
    if (!points.length)
      return []

    return points.map((point, index) => {
      const value = point[metric]
      const taskPrefix = taskName ? `${taskName}\n` : ''

      return {
        key: `${point.time}-${index}`,
        className: value === null
          ? 'bg-muted-foreground/15'
          : metric === 'latency'
            ? getLatencyToneClass(value)
            : getLossToneClass(value),
        tooltip: value === null
          ? `${taskPrefix}${formatDateTime(point.time, 'HH:mm:ss')} N/A`
          : metric === 'latency'
            ? `${taskPrefix}${formatDateTime(point.time, 'HH:mm:ss')}\n${Math.round(value)} ms`
            : `${taskPrefix}${formatDateTime(point.time, 'HH:mm:ss')}\n${value.toFixed(1)}%`,
      }
    })
  }

  function buildEmptyPingBars(metric: NodePingMetric): NodePingBar[] {
    const tooltip = pingStats.loading.value
      ? '加载中'
      : pingStats.error.value
        ? '加载失败'
        : !pingStatsEnabled.value
            ? '未启用记录'
            : metric === 'latency'
              ? 'N/A'
              : 'N/A'

    return Array.from({ length: NODE_PING_BAR_COUNT }, (_, index) => ({
      key: `${metric}-empty-${index}`,
      className: 'bg-muted-foreground/10',
      tooltip,
    }))
  }

  function getDisplayText(stats: NodePingStatsState | null, metric: NodePingMetric): string {
    if (stats?.hasData) {
      return metric === 'latency'
        ? (stats.history.some(point => point.latency !== null) ? `${Math.round(stats.avgLatency)} ms` : '-')
        : `${stats.avgLoss.toFixed(1)}%`
    }
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  }

  function getPanelTooltip(
    stats: NodePingStatsState | null,
    metric: NodePingMetric,
    taskName = '',
  ): string {
    if (!stats?.hasData) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.[metric] ?? ''
      return options.emptyPanelTooltipText?.[metric] ?? ''
    }

    const prefix = taskName ? `${taskName} · ` : ''
    if (metric === 'latency') {
      return stats.history.some(point => point.latency !== null)
        ? `${prefix}平均延迟 ${Math.round(stats.avgLatency)} ms`
        : `${prefix}暂无有效延迟`
    }

    const volatility = stats.avgVolatility > 0
      ? `，平均波动 ${stats.avgVolatility.toFixed(2)}`
      : ''
    return `${prefix}平均丢包 ${stats.avgLoss.toFixed(1)}%${volatility}`
  }

  function createTaskDisplay(ipFamily: 'ipv4' | 'ipv6'): NodePingTaskDisplay {
    const taskStats = pingStats.stats.value.taskStats.find(task => task.ipFamily === ipFamily) ?? null
    const taskName = taskStats?.taskName ?? ''
    const protocolLabel = ipFamily === 'ipv4' ? 'IPv4' : 'IPv6'
    const latencyBars = taskStats ? buildPingBars('latency', taskStats.history, taskName) : []
    const lossBars = taskStats ? buildPingBars('loss', taskStats.history, taskName) : []

    return {
      key: ipFamily,
      protocolLabel,
      taskName,
      latencyRenderBars: latencyBars.length ? latencyBars : buildEmptyPingBars('latency'),
      lossRenderBars: lossBars.length ? lossBars : buildEmptyPingBars('loss'),
      latencyDisplay: getDisplayText(taskStats, 'latency'),
      lossDisplay: getDisplayText(taskStats, 'loss'),
      latencyPanelTooltip: getPanelTooltip(taskStats, 'latency', taskName),
      lossPanelTooltip: getPanelTooltip(taskStats, 'loss', taskName),
    }
  }

  const latencyBars = computed(() => buildPingBars('latency', pingStats.history.value))
  const lossBars = computed(() => buildPingBars('loss', pingStats.history.value))
  const latencyRenderBars = computed(() => latencyBars.value.length ? latencyBars.value : buildEmptyPingBars('latency'))
  const lossRenderBars = computed(() => lossBars.value.length ? lossBars.value : buildEmptyPingBars('loss'))

  const latencyDisplay = computed(() => {
    if (pingStats.hasData.value)
      return `${Math.round(pingStats.avgLatency.value)} ms`
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  })

  const lossDisplay = computed(() => {
    if (pingStats.hasData.value)
      return `${pingStats.avgLoss.value.toFixed(1)}%`
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '加载中'
    return options.emptyDisplayText ?? '-'
  })

  const latencyPanelTooltip = computed(() => {
    if (!pingStats.hasData.value) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.latency ?? ''
      return options.emptyPanelTooltipText?.latency ?? ''
    }
    return `平均延迟 ${Math.round(pingStats.avgLatency.value)} ms`
  })

  const lossPanelTooltip = computed(() => {
    if (!pingStats.hasData.value) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.loss ?? ''
      return options.emptyPanelTooltipText?.loss ?? ''
    }

    const volatility = pingStats.avgVolatility.value > 0
      ? `，平均波动 ${pingStats.avgVolatility.value.toFixed(2)}`
      : ''
    return `平均丢包 ${pingStats.avgLoss.value.toFixed(1)}%${volatility}`
  })

  const pingTaskDisplays = computed<NodePingTaskDisplay[]>(() => [
    createTaskDisplay('ipv4'),
    createTaskDisplay('ipv6'),
  ])

  return {
    pingStats,
    pingStatsEnabled,
    pingRecordsQueryHours,
    latencyRenderBars,
    lossRenderBars,
    latencyDisplay,
    lossDisplay,
    latencyPanelTooltip,
    lossPanelTooltip,
    pingTaskDisplays,
  }
}
