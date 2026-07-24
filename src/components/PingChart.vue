<script setup lang="ts">
import { Icon } from '@iconify/vue'
import dayjs from 'dayjs'
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import VChart from 'vue-echarts'
import { Button } from '@/components/ui/button'
import { DataTooltip } from '@/components/ui/data-tooltip'
import { Empty } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useAppStore } from '@/stores/app'
import { loadPingChartData } from '@/utils/pingChartCache'
import { cutPeakValues, interpolateNullsLinear } from '@/utils/recordHelper'
import { getSharedRpc, RpcError } from '@/utils/rpc'
import '@/utils/echarts' // 共享 ECharts 配置

const props = defineProps<{
  uuid: string
}>()

const appStore = useAppStore()
const { pickSurfaceClass } = useBackgroundSurface()
const isDark = computed(() => appStore.isDark)
// 使用共享的 RPC 实例，避免重复创建连接
const rpc = getSharedRpc()

// 图表主题相关颜色
const chartThemeColors = computed(() => ({
  text: isDark.value ? 'rgba(255, 255, 255, 0.85)' : 'rgba(0, 0, 0, 0.85)',
  textSecondary: isDark.value ? 'rgba(255, 255, 255, 0.55)' : 'rgba(0, 0, 0, 0.55)',
  textTertiary: isDark.value ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.35)',
  borderColor: isDark.value ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.06)',
  splitLineColor: isDark.value ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)',
  tooltipBg: isDark.value ? 'rgba(40, 40, 40, 0.95)' : 'rgba(255, 255, 255, 0.8)',
  tooltipShadow: isDark.value ? 'rgba(0, 0, 0, 0.4)' : 'rgba(0, 0, 0, 0.06)',
  crosshairColor: isDark.value ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
}))

// 优化后的图表配色方案（多任务时使用）
const chartColors = [
  '#FF6B6B', // 珊瑚红
  '#4ECDC4', // 青绿色
  '#A78BFA', // 紫罗兰
  '#60A5FA', // 天蓝色
  '#FFB347', // 琥珀黄
  '#F472B6', // 粉红色
  '#34D399', // 翠绿色
  '#FB923C', // 橙色
]

// 从 publicSettings 获取记录保留时间
const maxPingRecordPreserveTime = computed(() => appStore.publicSettings?.ping_record_preserve_time || 168)

// 视图选项
const presetViews = [
  { label: '1 小时', hours: 1 },
  { label: '6 小时', hours: 6 },
  { label: '12 小时', hours: 12 },
  { label: '1 天', hours: 24 },
  { label: '3 天', hours: 72 },
  { label: '7 天', hours: 168 },
]

// 可用视图列表
const availableViews = computed(() => {
  const views: { label: string, hours: number }[] = []
  const maxHours = maxPingRecordPreserveTime.value

  for (const v of presetViews) {
    if (maxHours >= v.hours) {
      views.push(v)
    }
  }

  const maxPreset = presetViews.at(-1)
  if (maxPreset && maxHours > maxPreset.hours) {
    const label = maxHours % 24 === 0
      ? `${Math.floor(maxHours / 24)} 天`
      : `${maxHours} 小时`
    views.push({ label, hours: maxHours })
  }
  else if (maxHours > 1 && !presetViews.some(v => v.hours === maxHours)) {
    const label = maxHours % 24 === 0
      ? `${Math.floor(maxHours / 24)} 天`
      : `${maxHours} 小时`
    views.push({ label, hours: maxHours })
  }

  return views
})

// 当前选中的视图
const selectedView = ref<string>('')
const selectedHours = computed(() => {
  const view = availableViews.value.find(v => v.label === selectedView.value)
  return view?.hours || 1
})

// 初始化默认视图
watch(availableViews, (views) => {
  if (!selectedView.value) {
    const preferred = views.find(view => view.hours === appStore.themeSettings.pingChartDefaultHours)
    const initialView = preferred ?? views[0]
    if (initialView)
      selectedView.value = initialView.label
  }
}, { immediate: true })

// ==================== 类型定义 ====================

interface PingRecord {
  client: string
  task_id: number
  time: string
  value: number
  metric?: 'latency' | 'loss'
}

interface TaskInfo {
  id: number
  name: string
  interval: number
  loss: number
  p99?: number
  p50?: number
  p99_p50_ratio?: number
  min?: number
  max?: number
  avg?: number
  latest?: number
  total?: number
  type?: string
}

interface MetricPoint {
  time: string
  value: number | null
  tags?: Record<string, string>
  tag?: Record<string, string>
}

interface MetricSeries {
  metric_key: 'ping.latency_ms' | 'ping.loss'
  tags?: Record<string, string>
  tag?: Record<string, string>
  points: MetricPoint[]
}

interface MetricQueryResponse {
  series: MetricSeries[]
}

interface PingMetricTaskStats {
  task_id: string
  name?: string
  type?: string
  interval?: number
  loss: number
  min?: number
  max?: number
  avg?: number
  latest?: number
  total: number
  p50?: number
  p99?: number
  p99_p50_ratio?: number
}

interface PingMetricStatsResponse {
  stats: PingMetricTaskStats[]
}

interface PingRecordsResponse {
  records: PingRecord[]
  tasks?: TaskInfo[]
}

interface PingChartData {
  records: PingRecord[]
  tasks: TaskInfo[]
}

// 数据状态
const remoteData = shallowRef<PingRecord[]>([])
const tasks = shallowRef<TaskInfo[]>([])
const loading = ref(false)
const error = ref<string | null>(null)
let fetchRequestId = 0
let metricRpcSupported: boolean | null = null

// 任务选择
const selectedTaskIds = ref<number[]>([])
const cutPeak = ref(false)
const showDelay = ref(true)
const showLoss = ref(true)
const chartLayout = ref(appStore.themeSettings.pingChartLayout)
const autoRefresh = ref(appStore.themeSettings.pingChartAutoRefresh)
const analysisTaskId = ref<number | null>(null)
const combinedChartRef = ref<unknown>(null)
const latencyChartRef = ref<unknown>(null)
const lossChartRef = ref<unknown>(null)
const chartMargin = computed(() => ({
  top: 30,
  right: 56,
  bottom: appStore.themeSettings.pingChartShowZoom ? 72 : 52,
  left: 56,
}))
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null

const mergeToleranceMs = computed(() => {
  const taskIntervals = tasks.value
    .map(t => t.interval)
    .filter((v): v is number => typeof v === 'number' && v > 0)

  const fallbackIntervalSec = taskIntervals.length ? Math.min(...taskIntervals) : 60
  return Math.min(
    6000,
    Math.max(800, Math.floor(fallbackIntervalSec * 1000 * 0.25)),
  )
})

// ==================== 数据获取 ====================

function isMethodNotFoundError(err: unknown): boolean {
  return err instanceof RpcError && err.code === -32601
}

function getMetricTaskId(series: MetricSeries, point: MetricPoint): number | null {
  const taskId = Number(
    point.tags?.task_id
    ?? series.tags?.task_id
    ?? point.tag?.task_id
    ?? series.tag?.task_id,
  )

  return Number.isInteger(taskId) ? taskId : null
}

async function fetchMetricRecords(uuid: string, hours: number): Promise<PingChartData> {
  const [metricResult, statsResult] = await Promise.all([
    rpc.getClient().call<MetricQueryResponse>('public:queryMetrics', {
      metric_keys: ['ping.latency_ms', 'ping.loss'],
      entity_id: uuid,
      hours,
      downsample: true,
      max_points: 500,
      aggregation: 'avg',
    }),
    rpc.getClient().call<PingMetricStatsResponse>('public:getPingMetricStats', {
      uuid,
      hours,
      max_points: 500,
    }),
  ])

  const records: PingRecord[] = []
  for (const series of metricResult?.series ?? []) {
    for (const point of series.points ?? []) {
      const taskId = getMetricTaskId(series, point)
      if (taskId === null)
        continue

      if (point.value === null || point.value < 0)
        continue

      records.push({
        client: uuid,
        task_id: taskId,
        time: point.time,
        value: series.metric_key === 'ping.loss' ? point.value * 100 : point.value,
        metric: series.metric_key === 'ping.loss' ? 'loss' : 'latency',
      })
    }
  }

  const metricTasks = (statsResult?.stats ?? []).map(task => ({
    id: Number(task.task_id),
    name: task.name || `Ping ${task.task_id}`,
    interval: task.interval ?? 60,
    loss: task.loss,
    p99: task.p99,
    p50: task.p50,
    p99_p50_ratio: task.p99_p50_ratio,
    min: task.min,
    max: task.max,
    avg: task.avg,
    latest: task.latest,
    total: task.total,
    type: task.type,
  })).filter(task => Number.isInteger(task.id))

  return { records, tasks: metricTasks }
}

async function fetchLegacyRecords(uuid: string, hours: number): Promise<PingChartData> {
  const result = await rpc.getClient().call<PingRecordsResponse>('common:getRecords', {
    type: 'ping',
    uuid,
    hours,
  })

  const records = (result?.records ?? []).flatMap((record): PingRecord[] => [
    ...(record.value >= 0 ? [{ ...record, metric: 'latency' as const }] : []),
    { ...record, value: record.value < 0 ? 100 : 0, metric: 'loss' as const },
  ])

  return {
    records,
    tasks: result?.tasks ?? [],
  }
}

async function fetchRecords(options: { force?: boolean } = {}) {
  if (!props.uuid)
    return

  const requestId = ++fetchRequestId
  const uuid = props.uuid
  const hours = selectedHours.value

  loading.value = true
  error.value = null

  try {
    const result = await loadPingChartData<PingChartData>(
      `${uuid}:${hours}`,
      async () => {
        if (metricRpcSupported === false)
          return fetchLegacyRecords(uuid, hours)

        try {
          const metricResult = await fetchMetricRecords(uuid, hours)
          metricRpcSupported = true
          return metricResult
        }
        catch (err) {
          if (!isMethodNotFoundError(err))
            throw err

          metricRpcSupported = false
          return fetchLegacyRecords(uuid, hours)
        }
      },
      options.force === true,
    )

    if (requestId !== fetchRequestId)
      return

    const records = result.records
    records.sort((a, b) => dayjs(a.time).valueOf() - dayjs(b.time).valueOf())

    remoteData.value = records
    tasks.value = result.tasks

    if (tasks.value.length > 0 && selectedTaskIds.value.length === 0) {
      selectedTaskIds.value = tasks.value.map(t => t.id)
    }
  }
  catch (err) {
    if (requestId !== fetchRequestId)
      return

    error.value = err instanceof Error ? err.message : '获取数据失败'
    remoteData.value = []
    tasks.value = []
  }
  finally {
    if (requestId === fetchRequestId) {
      loading.value = false
    }
  }
}

// ==================== 数据处理 ====================

const mergedData = computed(() => {
  const data = remoteData.value
  if (!data.length)
    return []

  const toleranceMs = mergeToleranceMs.value

  const grouped: Map<number, Record<string, unknown>> = new Map()
  const anchors: number[] = []

  for (const rec of data) {
    const ts = dayjs(rec.time).valueOf()
    let anchor: number | null = null

    for (const a of anchors) {
      if (Math.abs(a - ts) <= toleranceMs) {
        anchor = a
        break
      }
    }

    const useTs = anchor ?? ts
    if (!grouped.has(useTs)) {
      grouped.set(useTs, { time: dayjs(useTs).toISOString() })
      if (anchor === null) {
        anchors.push(useTs)
      }
    }

    const group = grouped.get(useTs)!
    group[`${rec.metric ?? 'latency'}:${rec.task_id}`] = rec.value
  }

  const merged = Array.from(grouped.values()).sort(
    (a, b) => dayjs(a.time as string).valueOf() - dayjs(b.time as string).valueOf(),
  )

  const hours = selectedHours.value
  const lastItem = merged.at(-1)
  const lastTs = lastItem ? dayjs(lastItem.time as string).valueOf() : dayjs().valueOf()
  const fromTs = lastTs - hours * 3600_000

  let startIdx = 0
  for (let i = 0; i < merged.length; i++) {
    const item = merged[i]
    if (!item)
      continue
    const ts = dayjs(item.time as string).valueOf()
    if (ts >= fromTs) {
      startIdx = Math.max(0, i - 1)
      break
    }
  }

  return merged.slice(startIdx)
})

const chartData = computed(() => {
  let data = mergedData.value
  const selectedKeys = selectedTaskIds.value.map(taskId => `latency:${taskId}`)

  if (selectedKeys.length === 0)
    return []

  if (cutPeak.value) {
    data = cutPeakValues(data, selectedKeys)
  }

  if (selectedKeys.length > 0 && data.length > 0) {
    data = interpolateNullsLinear(data, selectedKeys, {
      maxGapMultiplier: 6,
      minCapMs: 2 * 60_000,
      maxCapMs: 30 * 60_000,
    })
  }

  return data
})

// ==================== 工具函数 ====================

function formatTime(time: string, showDate: boolean): string {
  const date = dayjs(time)
  if (showDate) {
    return date.format('M/D HH:mm')
  }
  return date.format('HH:mm')
}

function formatTimeForTooltip(time: string, hours: number): string {
  const date = dayjs(time)
  if (hours < 24) {
    return date.format('HH:mm:ss')
  }
  return date.format('MM/DD HH:mm')
}

const showDateInAxis = computed(() => selectedHours.value >= 24)

// ==================== 任务选择 ====================

// 获取任务颜色（根据任务在完整列表中的索引）
function getTaskColor(taskId: number): string {
  const configured = appStore.themeSettings.pingTaskColors[String(taskId)]
  if (configured)
    return configured
  const taskIndex = tasks.value.findIndex(t => t.id === taskId)
  const safeIndex = Math.max(0, taskIndex % chartColors.length)
  return chartColors[safeIndex]!
}

// 最新值统计（从服务端 tasks 获取，保持颜色顺序）
const latestValues = computed(() => {
  if (!tasks.value.length)
    return []

  const latestMap = new Map<number, number | null>()
  for (const task of tasks.value) {
    for (let i = remoteData.value.length - 1; i >= 0; i--) {
      const rec = remoteData.value[i]
      if (rec && rec.task_id === task.id && rec.metric !== 'loss' && rec.value >= 0) {
        latestMap.set(task.id, rec.value)
        break
      }
    }
  }

  return tasks.value.map((task) => {
    return {
      ...task,
      latestValue: latestMap.get(task.id) ?? null,
      color: getTaskColor(task.id),
      p95: getTaskPercentile(task.id, 0.95),
    }
  })
})

const selectedTasks = computed(() => {
  return tasks.value.filter(t => selectedTaskIds.value.includes(t.id))
})

const analysisTask = computed(() => {
  return latestValues.value.find(task => task.id === analysisTaskId.value)
    ?? latestValues.value[0]
    ?? null
})

watch(latestValues, (values) => {
  if (!values.length) {
    analysisTaskId.value = null
    return
  }

  if (!values.some(task => task.id === analysisTaskId.value))
    analysisTaskId.value = values[0]?.id ?? null
}, { immediate: true })

function getTaskPercentile(taskId: number, percentile: number): number | null {
  const values = remoteData.value
    .filter(record => record.task_id === taskId && record.metric !== 'loss' && record.value >= 0)
    .map(record => record.value)
    .sort((left, right) => left - right)
  if (!values.length)
    return null
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * percentile) - 1))
  return values[index] ?? null
}

// 切换任务选中状态
function toggleTask(taskId: number) {
  if (selectedTaskIds.value.includes(taskId)) {
    selectedTaskIds.value = selectedTaskIds.value.filter(id => id !== taskId)
  }
  else {
    selectedTaskIds.value = [...selectedTaskIds.value, taskId]
  }
}

function showAllTasks() {
  selectedTaskIds.value = tasks.value.map(t => t.id)
}

function hideAllTasks() {
  selectedTaskIds.value = []
}

// ==================== 图表配置 ====================

// 通用 Tooltip 配置
const baseTooltipConfig = computed(() => ({
  trigger: 'axis' as const,
  confine: false,
  backgroundColor: chartThemeColors.value.tooltipBg,
  borderColor: 'transparent',
  borderWidth: 0,
  borderRadius: 6,
  textStyle: {
    color: chartThemeColors.value.text,
    fontSize: 12,
    lineHeight: 20,
  },
  extraCssText: `backdrop-filter: blur(5px);z-index:9;box-shadow:0 0 0 1px ${chartThemeColors.value.tooltipShadow}, 0 0 16px ${chartThemeColors.value.tooltipShadow}`,
  axisPointer: {
    type: 'cross' as const,
    crossStyle: {
      color: chartThemeColors.value.textTertiary,
    },
    lineStyle: {
      color: chartThemeColors.value.crosshairColor,
      width: 1,
      type: 'dashed' as const,
    },
    shadowStyle: {
      color: chartThemeColors.value.crosshairColor,
    },
  },
}))

type ChartMode = 'combined' | 'latency' | 'loss'

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#039;')
}

function buildPingChartOption(mode: ChartMode) {
  const taskList = selectedTasks.value
  const data = chartData.value
  const hours = selectedHours.value
  const includeLatency = mode !== 'loss' && showDelay.value
  const includeLoss = mode !== 'latency' && showLoss.value
  const combined = mode === 'combined'
  const latencyThresholds = [
    { name: '延迟警告', yAxis: appStore.themeSettings.pingLatencyWarning, lineStyle: { color: appStore.themeSettings.pingWarningColor } },
    { name: '延迟严重', yAxis: appStore.themeSettings.pingLatencyCritical, lineStyle: { color: appStore.themeSettings.pingCriticalColor } },
  ]
  const lossThresholds = [
    { name: '丢包警告', yAxis: appStore.themeSettings.pingLossWarning, lineStyle: { color: appStore.themeSettings.pingWarningColor } },
    { name: '丢包严重', yAxis: appStore.themeSettings.pingLossCritical, lineStyle: { color: appStore.themeSettings.pingCriticalColor } },
  ]

  const latencySeries = includeLatency
    ? taskList.map((task, index) => {
        const color = getTaskColor(task.id)
        return {
          id: `latency-${task.id}`,
          name: `${task.name} 延迟`,
          type: 'line' as const,
          yAxisIndex: 0,
          data: data.map(d => d[`latency:${task.id}`] as number | null ?? null),
          smooth: cutPeak.value ? 0.6 : 0.1,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 1.8, color, cap: 'round' as const },
          itemStyle: { color },
          markLine: index === 0
            ? {
                silent: true,
                symbol: ['none', 'none'],
                label: { show: true, position: 'insideEndTop', fontSize: 10 },
                lineStyle: { width: 1, type: 'dashed' as const, opacity: 0.65 },
                data: latencyThresholds,
              }
            : undefined,
          markPoint: {
            symbolSize: 28,
            label: { fontSize: 9, formatter: '峰值' },
            data: [{ type: 'max', name: '峰值' }],
          },
        }
      })
    : []

  const lossSeries = includeLoss
    ? taskList.map((task, index) => {
        const color = getTaskColor(task.id)
        return {
          id: `loss-${task.id}`,
          name: `${task.name} 丢包`,
          type: 'line' as const,
          yAxisIndex: combined ? 1 : 0,
          data: data.map(d => d[`loss:${task.id}`] as number | null ?? null),
          smooth: false,
          step: 'end' as const,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 1.4, color, type: 'dashed' as const, opacity: 0.8 },
          areaStyle: { color, opacity: 0.05 },
          itemStyle: { color },
          markLine: index === 0
            ? {
                silent: true,
                symbol: ['none', 'none'],
                label: { show: true, position: 'insideEndTop', fontSize: 10 },
                lineStyle: { width: 1, type: 'dotted' as const, opacity: 0.65 },
                data: lossThresholds,
              }
            : undefined,
        }
      })
    : []
  const series = [...latencySeries, ...lossSeries]

  const valueAxis = (metric: 'latency' | 'loss', position: 'left' | 'right' = 'left') => ({
    type: 'value' as const,
    name: metric === 'latency' ? '延迟 (ms)' : '丢包 (%)',
    position,
    min: 0,
    max: metric === 'loss' ? 100 : undefined,
    nameTextStyle: { color: chartThemeColors.value.textSecondary },
    axisLabel: {
      fontSize: 11,
      color: chartThemeColors.value.textSecondary,
      formatter: metric === 'loss' ? '{value}%' : '{value}',
    },
    axisLine: { show: false },
    axisTick: { show: false },
    splitLine: {
      show: position === 'left',
      lineStyle: {
        color: chartThemeColors.value.splitLineColor,
        type: 'dashed' as const,
      },
    },
  })

  return {
    animation: false,
    color: taskList.map(task => getTaskColor(task.id)),
    tooltip: {
      ...baseTooltipConfig.value,
      formatter: (params: unknown) => {
        const items = params as Array<{
          seriesId: string
          seriesName: string
          value: number | null
          dataIndex: number
          color: string
        }>
        const first = items[0]
        if (!first)
          return ''
        const row = data[first.dataIndex]
        if (!row)
          return ''

        let html = `<div style="font-weight:600;margin-bottom:6px;color:${chartThemeColors.value.textSecondary}">${formatTimeForTooltip(row.time as string, hours)}</div>`
        html += '<div style="display:flex;flex-direction:column;gap:4px">'
        for (const item of items) {
          if (item.value === null || item.value === undefined)
            continue
          const isLoss = String(item.seriesId).startsWith('loss-')
          const displayValue = isLoss ? `${item.value.toFixed(2)}%` : `${Math.round(item.value)} ms`
          const colorDot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${item.color};margin-right:8px;flex-shrink:0"></span>`
          html += `<div style="display:flex;align-items:center">${colorDot}<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(item.seriesName)}</span><span style="margin-left:16px;font-weight:600;font-variant-numeric:tabular-nums">${displayValue}</span></div>`
        }
        return `${html}</div>`
      },
    },
    legend: {
      type: 'scroll',
      bottom: appStore.themeSettings.pingChartShowZoom ? 24 : 0,
      itemWidth: 12,
      itemHeight: 8,
      itemGap: 14,
      textStyle: { fontSize: 10, color: chartThemeColors.value.textSecondary },
      data: series.map(item => item.name),
    },
    dataZoom: appStore.themeSettings.pingChartShowZoom
      ? [
          { type: 'inside' as const, start: 0, end: 100 },
          {
            type: 'slider' as const,
            height: 14,
            bottom: 0,
            borderColor: 'transparent',
            fillerColor: isDark.value ? 'rgba(52,211,153,.16)' : 'rgba(5,150,105,.12)',
            backgroundColor: chartThemeColors.value.splitLineColor,
            showDetail: false,
          },
        ]
      : [{ type: 'inside' as const, start: 0, end: 100 }],
    grid: chartMargin.value,
    xAxis: {
      type: 'category',
      data: data.map(d => formatTime(d.time as string, showDateInAxis.value)),
      axisLabel: { fontSize: 11, color: chartThemeColors.value.textSecondary, margin: 12 },
      axisLine: { show: true, lineStyle: { color: chartThemeColors.value.borderColor, width: 1 } },
      axisTick: { show: false },
      boundaryGap: false,
    },
    yAxis: combined
      ? [valueAxis('latency', 'left'), valueAxis('loss', 'right')]
      : [valueAxis(mode === 'loss' ? 'loss' : 'latency')],
    series,
  }
}

const pingChartOption = computed(() => buildPingChartOption('combined'))
const latencyChartOption = computed(() => buildPingChartOption('latency'))
const lossChartOption = computed(() => buildPingChartOption('loss'))

function focusTask(taskId: number): void {
  selectedTaskIds.value = [taskId]
  analysisTaskId.value = taskId
}

function downloadBlob(content: BlobPart, mime: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function exportCsv(): void {
  const headers = ['时间']
  for (const task of selectedTasks.value)
    headers.push(`${task.name} 延迟(ms)`, `${task.name} 丢包(%)`)
  const rows = chartData.value.map((row) => {
    const values: Array<string | number> = [row.time as string]
    for (const task of selectedTasks.value) {
      values.push(
        row[`latency:${task.id}`] as number ?? '',
        row[`loss:${task.id}`] as number ?? '',
      )
    }
    return values
  })
  const escapeCsv = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`
  const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\r\n')
  downloadBlob(`\uFEFF${csv}`, 'text/csv;charset=utf-8', `komari-ping-${props.uuid}-${selectedHours.value}h.csv`)
}

function exportPng(): void {
  const target = chartLayout.value === 'combined' ? combinedChartRef.value : latencyChartRef.value
  const instance = target as { getDataURL?: (options?: Record<string, unknown>) => string } | null
  const dataUrl = instance?.getDataURL?.({ type: 'png', pixelRatio: 2, backgroundColor: isDark.value ? '#111827' : '#ffffff' })
  if (!dataUrl) {
    window.$message?.warning('图表尚未准备好，请稍后再试')
    return
  }
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = `komari-ping-${props.uuid}-${selectedHours.value}h.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function resetAutoRefreshTimer(): void {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
    autoRefreshTimer = null
  }
  if (!autoRefresh.value)
    return
  autoRefreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible')
      void fetchRecords({ force: true })
  }, appStore.themeSettings.pingChartRefreshInterval * 1000)
}

// ==================== 生命周期 ====================

watch(selectedView, () => {
  selectedTaskIds.value = []
  fetchRecords()
})

watch(() => props.uuid, () => {
  remoteData.value = []
  tasks.value = []
  selectedTaskIds.value = []
  fetchRecords()
})

watch(autoRefresh, resetAutoRefreshTimer)

onMounted(() => {
  fetchRecords()
  resetAutoRefreshTimer()
})

onUnmounted(() => {
  if (autoRefreshTimer)
    clearInterval(autoRefreshTimer)
})
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- 时间选择器 -->
    <Tabs v-model="selectedView" class="w-full items-center">
      <div class="min-w-0 flex-1 overflow-x-auto pointer-events-auto">
        <TabsList :class="pickSurfaceClass('w-max h-8 bg-background/60 rounded-md', 'w-max h-8 bg-background/50 backdrop-blur-xl rounded-md')">
          <TabsTrigger
            v-for="view in availableViews" :key="view.label" :value="view.label"
            class="h-6.5 flex-none shrink-0 text-xs border-none data-[state=active]:text-emerald-600 shadow-none rounded-sm"
          >
            {{ view.label }}
          </TabsTrigger>
        </TabsList>
      </div>
      <div class="md:flex-1" />
      <div class="flex gap-2 items-center">
        <Button
          variant="ghost" size="xs" class="h-7 rounded-sm border-none bg-background/60 hover:bg-background"
          :class="[selectedTaskIds.length === tasks.length && 'bg-background !text-emerald-600']"
          @click="showAllTasks"
        >
          全选
        </Button>
        <Button
          variant="ghost" size="xs" class="h-7 rounded-sm border-none bg-background/60 hover:bg-background"
          :class="[!selectedTaskIds.length && 'bg-background !text-emerald-600']"
          @click="hideAllTasks"
        >
          全不选
        </Button>
      </div>
    </Tabs>

    <!-- 内容区域 -->
    <Spinner :show="loading" content-class="flex flex-col gap-4">
      <div v-if="error" class="text-red-500 py-8 text-center">
        {{ error }}
      </div>
      <div v-else-if="tasks.length === 0 && !loading" class="py-8">
        <Empty description="暂无延迟数据" />
      </div>

      <template v-else>
        <section v-if="latestValues.length > 0" class="space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h3 class="text-sm font-semibold">
              延迟数据分析
            </h3>
            <label class="flex items-center gap-2 text-xs text-muted-foreground">
              <span>分析任务</span>
              <select
                v-model.number="analysisTaskId"
                class="h-8 max-w-52 rounded-md border border-border bg-background px-2 text-xs text-foreground"
              >
                <option v-for="task in latestValues" :key="task.id" :value="task.id">
                  {{ task.name }}
                </option>
              </select>
            </label>
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div
              v-for="task in latestValues" :key="task.id"
              class="min-w-0 rounded-md border bg-background/60 p-3 transition-colors"
              :class="[
                selectedTaskIds.includes(task.id) ? 'border-emerald-600/25' : 'border-border opacity-60',
                analysisTask?.id === task.id && 'ring-1 ring-emerald-600/40',
              ]"
            >
              <div class="flex min-w-0 items-center gap-2">
                <div class="h-5 w-1 shrink-0 rounded" :style="{ backgroundColor: task.color }" />
                <span class="min-w-0 flex-1 truncate text-sm font-semibold" :title="task.name">{{ task.name }}</span>
                <Button
                  variant="ghost" size="icon-xs" :title="selectedTaskIds.includes(task.id) ? '隐藏曲线' : '显示曲线'"
                  @click="toggleTask(task.id)"
                >
                  <Icon :icon="selectedTaskIds.includes(task.id) ? 'lucide:eye' : 'lucide:eye-off'" :width="14" :height="14" />
                </Button>
                <Button variant="ghost" size="xs" class="h-7 px-2 text-xs" @click="analysisTaskId = task.id">
                  分析
                </Button>
              </div>
              <div class="mt-3 grid grid-cols-3 gap-2">
                <div class="min-w-0">
                  <div class="text-[11px] text-muted-foreground">
                    平均
                  </div>
                  <div class="truncate text-sm font-semibold tabular-nums">
                    {{ task.avg !== undefined ? `${Math.round(task.avg)} ms` : '--' }}
                  </div>
                </div>
                <div class="min-w-0">
                  <div class="text-[11px] text-muted-foreground">
                    丢包
                  </div>
                  <div class="truncate text-sm font-semibold tabular-nums">
                    {{ task.loss.toFixed(2) }}%
                  </div>
                </div>
                <div class="min-w-0">
                  <div class="text-[11px] text-muted-foreground">
                    P95
                  </div>
                  <div class="truncate text-sm font-semibold tabular-nums">
                    {{ task.p95 !== null ? `${Math.round(task.p95)} ms` : '--' }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div
            v-if="analysisTask"
            class="min-w-0 rounded-md border border-emerald-600/20 bg-background/70 p-3 sm:p-4"
          >
            <div class="mb-3 flex min-w-0 flex-wrap items-center gap-2">
              <div class="h-5 w-1 shrink-0 rounded" :style="{ backgroundColor: analysisTask.color }" />
              <h4 class="min-w-0 flex-1 truncate text-sm font-semibold" :title="analysisTask.name">
                {{ analysisTask.name }}
              </h4>
              <Button variant="ghost" size="xs" class="h-7 text-xs" @click="focusTask(analysisTask.id)">
                <Icon icon="lucide:focus" :width="13" :height="13" />
                仅看此任务
              </Button>
            </div>
            <div class="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-4 lg:grid-cols-6">
              <div>
                <div class="text-[11px] text-muted-foreground">
                  最小延迟
                </div>
                <div class="mt-0.5 text-sm font-semibold tabular-nums">
                  {{ analysisTask.min !== undefined ? `${Math.round(analysisTask.min)} ms` : '--' }}
                </div>
              </div>
              <div>
                <div class="text-[11px] text-muted-foreground">
                  平均延迟
                </div>
                <div class="mt-0.5 text-sm font-semibold tabular-nums">
                  {{ analysisTask.avg !== undefined ? `${Math.round(analysisTask.avg)} ms` : '--' }}
                </div>
              </div>
              <div>
                <div class="text-[11px] text-muted-foreground">
                  最大延迟
                </div>
                <div class="mt-0.5 text-sm font-semibold tabular-nums">
                  {{ analysisTask.max !== undefined ? `${Math.round(analysisTask.max)} ms` : '--' }}
                </div>
              </div>
              <div>
                <div class="text-[11px] text-muted-foreground">
                  最新延迟
                </div>
                <div class="mt-0.5 text-sm font-semibold tabular-nums">
                  {{ analysisTask.latest !== undefined ? `${Math.round(analysisTask.latest)} ms` : '--' }}
                </div>
              </div>
              <div>
                <div class="text-[11px] text-muted-foreground">
                  P50
                </div>
                <div class="mt-0.5 text-sm font-semibold tabular-nums">
                  {{ analysisTask.p50 !== undefined ? `${Math.round(analysisTask.p50)} ms` : '--' }}
                </div>
              </div>
              <div>
                <div class="text-[11px] text-muted-foreground">
                  P95
                </div>
                <div class="mt-0.5 text-sm font-semibold tabular-nums">
                  {{ analysisTask.p95 !== null ? `${Math.round(analysisTask.p95)} ms` : '--' }}
                </div>
              </div>
              <div>
                <div class="text-[11px] text-muted-foreground">
                  P99
                </div>
                <div class="mt-0.5 text-sm font-semibold tabular-nums">
                  {{ analysisTask.p99 !== undefined ? `${Math.round(analysisTask.p99)} ms` : '--' }}
                </div>
              </div>
              <div>
                <div class="text-[11px] text-muted-foreground">
                  丢包率
                </div>
                <div class="mt-0.5 text-sm font-semibold tabular-nums">
                  {{ analysisTask.loss.toFixed(2) }}%
                </div>
              </div>
              <div>
                <div class="text-[11px] text-muted-foreground">
                  波动率
                </div>
                <div class="mt-0.5 text-sm font-semibold tabular-nums">
                  {{ analysisTask.p99_p50_ratio !== undefined ? analysisTask.p99_p50_ratio.toFixed(2) : '--' }}
                </div>
              </div>
              <div>
                <div class="text-[11px] text-muted-foreground">
                  样本数
                </div>
                <div class="mt-0.5 text-sm font-semibold tabular-nums">
                  {{ analysisTask.total ?? '--' }}
                </div>
              </div>
              <div>
                <div class="text-[11px] text-muted-foreground">
                  采集间隔
                </div>
                <div class="mt-0.5 text-sm font-semibold tabular-nums">
                  {{ analysisTask.interval !== undefined ? `${analysisTask.interval}s` : '--' }}
                </div>
              </div>
              <div>
                <div class="text-[11px] text-muted-foreground">
                  协议
                </div>
                <div class="mt-0.5 text-sm font-semibold">
                  {{ analysisTask.type?.toUpperCase() || '--' }}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div class="flex flex-wrap gap-2 items-center py-2">
          <!-- 延迟可视化开关 -->
          <Button
            variant="ghost" size="xs" class="h-7 rounded-sm border-none bg-background/60 hover:bg-background"
            :class="[showDelay && 'bg-background !text-emerald-600']" @click="showDelay = !showDelay"
          >
            延迟
          </Button>
          <!-- 丢包可视化开关 -->
          <Button
            variant="ghost" size="xs" class="h-7 rounded-sm border-none bg-background/60 hover:bg-background"
            :class="[showLoss && 'bg-background !text-emerald-600']" @click="showLoss = !showLoss"
          >
            丢包
          </Button>
          <!-- 平滑峰值开关 -->
          <div class="flex gap-2 items-center">
            <Button
              variant="ghost" size="xs" class="h-7 rounded-sm border-none bg-background/60 hover:bg-background"
              :class="[cutPeak && 'bg-background !text-emerald-600']" @click="cutPeak = !cutPeak"
            >
              平滑峰值
            </Button>
            <DataTooltip
              content="使用 EWMA 算法平滑数据并过滤突变值"
              placement="top"
              :content-class="pickSurfaceClass('whitespace-nowrap text-[11px]', 'whitespace-nowrap text-[11px] backdrop-blur-xl')"
            >
              <Button variant="ghost" size="icon-xs" class="text-slate-500">
                <Icon icon="carbon:information" :width="14" :height="14" />
              </Button>
            </DataTooltip>
          </div>
          <div class="flex items-center gap-1 rounded-md bg-background/60 p-0.5">
            <Button
              variant="ghost" size="xs" class="h-6 rounded-sm border-none"
              :class="chartLayout === 'combined' && '!text-emerald-600 bg-background'" @click="chartLayout = 'combined'"
            >
              合图
            </Button>
            <Button
              variant="ghost" size="xs" class="h-6 rounded-sm border-none"
              :class="chartLayout === 'split' && '!text-emerald-600 bg-background'" @click="chartLayout = 'split'"
            >
              分图
            </Button>
          </div>
          <Button
            variant="ghost" size="xs" class="h-7 rounded-sm border-none bg-background/60 hover:bg-background"
            :class="autoRefresh && '!text-emerald-600'" @click="autoRefresh = !autoRefresh"
          >
            <Icon :icon="autoRefresh ? 'lucide:pause' : 'lucide:play'" :width="13" :height="13" />
            {{ autoRefresh ? '暂停刷新' : '自动刷新' }}
          </Button>
          <Button
            variant="ghost" size="icon-xs" class="bg-background/60" title="立即刷新"
            :disabled="loading" @click="fetchRecords({ force: true })"
          >
            <Icon icon="lucide:refresh-cw" :class="loading && 'animate-spin'" :width="14" :height="14" />
          </Button>
          <div class="flex-1" />
          <Button variant="ghost" size="xs" class="h-7 bg-background/60" @click="exportPng">
            <Icon icon="lucide:image-down" :width="13" :height="13" />
            PNG
          </Button>
          <Button variant="ghost" size="xs" class="h-7 bg-background/60" @click="exportCsv">
            <Icon icon="lucide:file-down" :width="13" :height="13" />
            CSV
          </Button>
        </div>

        <!-- 图表 -->
        <div v-if="chartLayout === 'combined'" class="h-88 rounded-md p-3 transition-all md:h-104" :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xl')">
          <VChart ref="combinedChartRef" :option="pingChartOption" autoresize />
        </div>
        <div v-else class="grid gap-3">
          <div class="h-72 rounded-md p-3 md:h-80" :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xl')">
            <VChart ref="latencyChartRef" :option="latencyChartOption" autoresize />
          </div>
          <div class="h-72 rounded-md p-3 md:h-80" :class="pickSurfaceClass('bg-background/60 hover:bg-background', 'bg-background/50 hover:bg-background backdrop-blur-xl')">
            <VChart ref="lossChartRef" :option="lossChartOption" autoresize />
          </div>
        </div>
      </template>
    </Spinner>
  </div>
</template>
