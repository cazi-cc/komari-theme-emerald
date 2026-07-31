import type { MaybeRefOrGetter } from 'vue'
import type { NodePingHistoryPoint, NodePingStatsState } from '@/composables/useNodePingStats'
import { computed, toValue } from 'vue'
import { NODE_PING_BAR_COUNT, useNodePingStats } from '@/composables/useNodePingStats'
import { useAppStore } from '@/stores/app'
import { formatDateTime } from '@/utils/helper'
import { resolveHomePingTaskId } from '@/utils/themeSettings'

export type NodePingMetric = 'latency' | 'loss'

export interface NodePingBar {
  key: string
  className: string
  style?: Record<string, string | number>
  tooltip: string
}

export interface NodePingTaskDisplay {
  key: string
  taskId: number | null
  taskName: string
  isPlaceholder: boolean
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

export function useNodePingDisplay(
  uuid: MaybeRefOrGetter<string>,
  options: UseNodePingDisplayOptions = {},
) {
  const appStore = useAppStore()
  const pingStatsEnabled = computed(() => options.enabled === undefined || toValue(options.enabled))
  const pingRecordsQueryHours = computed(() => appStore.themeSettings.homePingHistoryHours)
  const pingStats = useNodePingStats(uuid, {
    hours: pingRecordsQueryHours,
    enabled: pingStatsEnabled,
  })

  function formatPingHistoryTime(time: string): string {
    return formatDateTime(time, pingRecordsQueryHours.value >= 24 ? 'MM-DD HH:mm' : 'HH:mm:ss')
  }

  function formatPingRangeLabel(): string {
    const hours = pingRecordsQueryHours.value
    if (hours % 24 === 0)
      return `${hours / 24} 天`
    return `${hours} 小时`
  }

  function getToneColor(metric: NodePingMetric, value: number): string {
    const settings = appStore.themeSettings
    if (metric === 'latency') {
      if (value <= 60)
        return settings.pingExcellentColor
      if (value <= 100)
        return settings.pingGoodColor
      if (value <= 160)
        return settings.pingModerateColor
      if (value <= 200)
        return settings.pingWarningColor
      return settings.pingCriticalColor
    }

    if (value <= 1)
      return settings.pingExcellentColor
    if (value <= 3)
      return settings.pingGoodColor
    if (value <= 6)
      return settings.pingModerateColor
    if (value <= 9)
      return settings.pingWarningColor
    return settings.pingCriticalColor
  }

  function buildEmptyPingBars(metric: NodePingMetric, taskName = ''): NodePingBar[] {
    const stateText = pingStats.loading.value
      ? '加载中'
      : pingStats.error.value
        ? '加载失败'
        : 'N/A'
    const prefix = taskName ? `${taskName}\n` : ''

    return Array.from({ length: NODE_PING_BAR_COUNT }, (_, index) => ({
      key: `${metric}-empty-${index}`,
      className: 'bg-muted-foreground/10',
      tooltip: `${prefix}${stateText}`,
    }))
  }

  function buildPingBars(
    metric: NodePingMetric,
    points: NodePingHistoryPoint[],
    taskName: string,
  ): NodePingBar[] {
    const bars = points.slice(-NODE_PING_BAR_COUNT).map((point, index): NodePingBar => {
      const value = point[metric]
      const taskPrefix = taskName ? `${taskName}\n` : ''
      return {
        key: `${point.time}-${index}`,
        className: value === null ? 'bg-muted-foreground/15' : '',
        style: value === null
          ? undefined
          : { backgroundColor: getToneColor(metric, value), opacity: metric === 'latency' ? 0.9 : 0.86 },
        tooltip: value === null
          ? `${taskPrefix}${formatPingHistoryTime(point.time)} N/A`
          : metric === 'latency'
            ? `${taskPrefix}${formatPingHistoryTime(point.time)}\n${Math.round(value)} ms`
            : `${taskPrefix}${formatPingHistoryTime(point.time)}\n${value.toFixed(1)}%`,
      }
    })

    const missing = NODE_PING_BAR_COUNT - bars.length
    if (missing <= 0)
      return bars

    return [
      ...Array.from({ length: missing }, (_, index): NodePingBar => ({
        key: `${metric}-padding-${index}`,
        className: 'bg-muted-foreground/10',
        tooltip: `${taskName}\nN/A`,
      })),
      ...bars,
    ]
  }

  function getDisplayText(stats: NodePingStatsState | null, metric: NodePingMetric): string {
    if (stats?.hasData) {
      return metric === 'latency'
        ? (stats.history.some(point => point.latency !== null) ? `${Math.round(stats.avgLatency)} ms` : '--')
        : `${stats.avgLoss.toFixed(1)}%`
    }
    if (pingStats.loading.value)
      return options.loadingDisplayText ?? '...'
    return options.emptyDisplayText ?? '--'
  }

  function getPanelTooltip(stats: NodePingStatsState | null, metric: NodePingMetric, taskName: string): string {
    if (!stats?.hasData) {
      if (pingStats.loading.value)
        return options.loadingPanelTooltipText?.[metric] ?? `${taskName} · 加载中`
      return options.emptyPanelTooltipText?.[metric] ?? `${taskName} · 暂无数据`
    }

    if (metric === 'latency') {
      return stats.history.some(point => point.latency !== null)
        ? `${taskName} · 最近 ${formatPingRangeLabel()}平均延迟 ${Math.round(stats.avgLatency)} ms`
        : `${taskName} · 最近 ${formatPingRangeLabel()}暂无有效延迟`
    }
    return `${taskName} · 最近 ${formatPingRangeLabel()}平均丢包 ${stats.avgLoss.toFixed(1)}%`
  }

  function createTaskDisplay(taskId: number | null, rowIndex: number): NodePingTaskDisplay {
    const availableTaskIds = new Set(pingStats.tasks.value.map(task => task.id))
    const resolvedTaskId = resolveHomePingTaskId(
      taskId,
      pingStats.tasksLoaded.value,
      availableTaskIds,
    )
    const taskStats = resolvedTaskId === null
      ? null
      : pingStats.stats.value.taskStats.find(task => task.taskId === resolvedTaskId) ?? null
    const taskInfo = resolvedTaskId === null
      ? null
      : pingStats.tasks.value.find(task => task.id === resolvedTaskId)
    const taskName = taskStats?.taskName || taskInfo?.name || (resolvedTaskId === null ? '未配置' : '加载中')
    const latencyBars = taskStats ? buildPingBars('latency', taskStats.history, taskName) : buildEmptyPingBars('latency', taskName)
    const lossBars = taskStats ? buildPingBars('loss', taskStats.history, taskName) : buildEmptyPingBars('loss', taskName)

    return {
      key: `${rowIndex}-${resolvedTaskId ?? 'empty'}`,
      taskId: resolvedTaskId,
      taskName,
      isPlaceholder: resolvedTaskId === null,
      latencyRenderBars: latencyBars,
      lossRenderBars: lossBars,
      latencyDisplay: getDisplayText(taskStats, 'latency'),
      lossDisplay: getDisplayText(taskStats, 'loss'),
      latencyPanelTooltip: getPanelTooltip(taskStats, 'latency', taskName),
      lossPanelTooltip: getPanelTooltip(taskStats, 'loss', taskName),
    }
  }

  const pingTaskDisplays = computed<NodePingTaskDisplay[]>(() => {
    const nodeUuid = toValue(uuid)
    const configuredMap = appStore.themeSettings.homePingTasksByNode
    const hasConfiguration = Object.hasOwn(configuredMap, nodeUuid)
    const selectedTaskIds = hasConfiguration
      ? (configuredMap[nodeUuid] ?? [])
      : pingStats.stats.value.taskStats.map(task => task.taskId).slice(0, appStore.themeSettings.homePingRowCount)
    const rowCount = appStore.themeSettings.homePingRowCount

    return Array.from({ length: rowCount }, (_, index) => createTaskDisplay(selectedTaskIds[index] ?? null, index))
  })
  const firstTaskDisplay = computed(() => pingTaskDisplays.value[0])

  return {
    pingStats,
    pingStatsEnabled,
    pingRecordsQueryHours,
    pingTaskDisplays,
    latencyRenderBars: computed(() => firstTaskDisplay.value?.latencyRenderBars ?? []),
    lossRenderBars: computed(() => firstTaskDisplay.value?.lossRenderBars ?? []),
  }
}
