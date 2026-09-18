<script setup lang="ts">
import type { WeightedScoreItem } from '@/utils/scoreBreakdown'
import type {
  TCPQualityModeStats,
  TCPQualityPublicTask,
  TCPQualityScoreImpact,
  TCPQualitySnapshot,
  TCPQualitySnapshotNode,
} from '@/utils/tcpQuality'
import { Icon } from '@iconify/vue'
import { useMediaQuery } from '@vueuse/core'
import dayjs from 'dayjs'
import { computed, onMounted, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import { useRouter } from 'vue-router'
import ScoreBreakdown from '@/components/ScoreBreakdown.vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppStore } from '@/stores/app'
import { buildWeightedScoreItems, scoreDeduction } from '@/utils/scoreBreakdown'
import {
  formatTCPQualityLoss,
  formatTCPQualityScore,
  loadTCPQualitySnapshot,
  loadTCPQualityTasks,
} from '@/utils/tcpQuality'
import '@/utils/echarts'

const viewProps = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })

type ViewSection = 'ranking' | 'distribution' | 'trend' | 'targets'
type TrendMetric = 'min' | 'average' | 'p50' | 'p95' | 'max' | 'loss'
type TrendMode = 'standard' | 'experimental_standard' | 'payload_300' | 'payload_1050'
interface RangeRenderParams {
  dataIndex: number
}
interface RangeRenderApi {
  value: (dimension: number) => unknown
  coord: (data: [number, number]) => [number, number]
}

const router = useRouter()
const appStore = useAppStore()
const isDesktop = useMediaQuery('(min-width: 768px)')
const tasks = ref<TCPQualityPublicTask[]>([])
const snapshot = ref<TCPQualitySnapshot | null>(null)
const selectedTaskId = ref<number | null>(null)
const selectedHours = ref(appStore.themeSettings.tcpQualityDefaultHours)
const activeSection = ref<ViewSection>('ranking')
const trendMetric = ref<TrendMetric>('p50')
const trendMode = ref<TrendMode>('standard')
const loading = ref(true)
const error = ref('')

const hourOptions = [
  { value: 1, label: '1 小时' },
  { value: 6, label: '6 小时' },
  { value: 12, label: '12 小时' },
  { value: 24, label: '1 天' },
  { value: 72, label: '3 天' },
  { value: 168, label: '7 天' },
]
const chartColors = ['#059669', '#2563EB', '#F97316', '#DB2777', '#7C3AED', '#0891B2', '#65A30D', '#DC2626']
const TRAILING_DECIMAL_ZERO_RE = /\.0$/

const selectedTask = computed(() => tasks.value.find(task => task.id === selectedTaskId.value) ?? null)
const sortedNodes = computed(() => [...(snapshot.value?.nodes ?? [])].sort((left, right) => {
  if (left.rank !== null && right.rank !== null)
    return left.rank - right.rank
  if (left.rank !== null)
    return -1
  if (right.rank !== null)
    return 1
  return left.name.localeCompare(right.name, 'zh-CN')
}))
const bestNode = computed(() => sortedNodes.value.find(node => node.rank === 1) ?? null)
const zeroLossNodes = computed(() => sortedNodes.value.filter(node => node.standard.samples_sent > 0 && node.standard.loss_percent === 0).length)
const isDark = computed(() => appStore.isDark)
const chartTextColor = computed(() => isDark.value ? 'rgba(255,255,255,.68)' : 'rgba(15,23,42,.66)')
const chartSplitColor = computed(() => isDark.value ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.08)')
const generatedText = computed(() => snapshot.value?.generated_at ? dayjs(snapshot.value.generated_at).format('MM-DD HH:mm:ss') : '--')
const rangedNodes = computed(() => sortedNodes.value.filter(node => node.standard.samples_received > 0))
const largeImpactNodes = computed(() => sortedNodes.value.filter(node => node.experimental_standard?.rankable && node.payload_1050?.rankable))
const rangeAxisMax = computed(() => {
  const maximum = Math.max(1, ...rangedNodes.value.map(node => node.standard.max_ms))
  return Math.ceil(maximum * 1.12 / 10) * 10
})

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#039;')
}

function gradeClass(grade: string): string {
  if (grade === '优秀')
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
  if (grade === '良好')
    return 'bg-lime-500/10 text-lime-700 dark:text-lime-400'
  if (grade === '一般')
    return 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
  if (grade === '较差')
    return 'bg-red-500/10 text-red-700 dark:text-red-400'
  return 'bg-muted text-muted-foreground'
}

function nodeRankingScore(node: TCPQualitySnapshotNode): number | null {
  return node.overall_score ?? node.tcp_score
}

function nodeColor(index: number): string {
  return chartColors[index % chartColors.length] ?? '#059669'
}

function formatCompactAxisNumber(value: number): string {
  if (Math.abs(value) < 1000)
    return String(Math.round(value))
  const scaled = value / 1000
  return `${scaled >= 10 ? scaled.toFixed(0) : scaled.toFixed(1).replace(TRAILING_DECIMAL_ZERO_RE, '')}k`
}

function formatSampleCount(stats?: TCPQualityModeStats): string {
  return stats ? `${stats.samples_received} / ${stats.samples_sent}` : '--'
}

function statsExtraLoss(standard?: TCPQualityModeStats, large?: TCPQualityModeStats): number | null {
  if (!large?.rankable || !standard?.rankable)
    return null
  return Math.max(0, large.loss_percent - standard.loss_percent)
}

function statsP95Ratio(standard?: TCPQualityModeStats, large?: TCPQualityModeStats): number | null {
  if (!large?.rankable || !standard?.rankable || standard.p95_ms <= 0)
    return null
  return large.p95_ms / standard.p95_ms
}

function largeExtraLoss(node: TCPQualitySnapshotNode): number | null {
  return statsExtraLoss(node.experimental_standard, node.payload_1050 ?? node.large)
}

function largeP95Ratio(node: TCPQualitySnapshotNode): number | null {
  return statsP95Ratio(node.experimental_standard, node.payload_1050 ?? node.large)
}

function formatRatio(value: number | null): string {
  return value === null ? '--' : `${value.toFixed(2)} 倍`
}

function scoreWeight(group: string, key: string): number {
  const weights = snapshot.value?.score_model.weights[group]
  if (!weights || typeof weights !== 'object' || Array.isArray(weights))
    return 0
  const value = (weights as Record<string, unknown>)[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function overallScoreItems(node: TCPQualitySnapshotNode) {
  if (node.overall_score_breakdown?.length)
    return backendImpactItems(node.overall_score_breakdown)
  const group = node.large_experimental_score === null ? 'overall_without_large' : 'overall_with_large'
  const enabled = node.overall_score_before_guard !== null
  return buildWeightedScoreItems([
    { key: 'icmp', label: 'ICMP 基础分', score: node.icmp_score, weight: enabled ? scoreWeight(group, 'icmp') : 0 },
    { key: 'tcp_standard', label: '标准 SYN', score: node.tcp_standard_score, weight: enabled ? scoreWeight(group, 'tcp_standard') : 0 },
    { key: 'large_experimental', label: 'SYN 载荷兼容性（实验）', score: node.large_experimental_score, weight: enabled ? scoreWeight(group, 'large_experimental') : 0 },
  ])
}

function tcpScoreItems(node: TCPQualitySnapshotNode) {
  if (node.tcp_score_breakdown?.length)
    return backendImpactItems(node.tcp_score_breakdown)
  const enabled = node.tcp_score_before_guard !== null
  return buildWeightedScoreItems([
    { key: 'tcp_standard', label: '标准 SYN', score: node.tcp_standard_score, weight: enabled ? scoreWeight('overall_with_large', 'tcp_standard') : 0 },
    { key: 'large_experimental', label: 'SYN 载荷兼容性（实验）', score: node.large_experimental_score, weight: enabled ? scoreWeight('overall_with_large', 'large_experimental') : 0 },
  ])
}

function backendImpactItems(impacts: TCPQualityScoreImpact[]): WeightedScoreItem[] {
  return impacts.map(impact => ({
    key: impact.key,
    label: impact.label,
    raw: `${impact.input.toFixed(impact.unit === 'ms' ? 1 : 2)}${impact.unit ? ` ${impact.unit}` : ''}`,
    note: impact.weight === 0 ? '诊断项，不计入本级得分' : undefined,
    score: impact.component_score,
    configuredWeight: impact.weight,
    maxPoints: impact.maximum_points,
    earnedPoints: impact.weight > 0 ? impact.awarded_points : null,
    deductedPoints: impact.weight > 0 ? impact.deducted_points : null,
    counted: impact.weight > 0,
  }))
}

function standardTargetScoreItems(stats?: TCPQualityModeStats) {
  if (stats?.score_breakdown?.length)
    return backendImpactItems(stats.score_breakdown)
  const enabled = stats?.score !== null && stats?.score !== undefined
  return buildWeightedScoreItems([
    {
      key: 'first_response_loss',
      label: '首次响应丢失',
      raw: stats ? formatTCPQualityLoss(stats.loss_percent) : undefined,
      score: stats?.score_components?.first_response_loss,
      weight: enabled ? scoreWeight('tcp_standard', 'first_response_loss') : 0,
    },
    {
      key: 'p50',
      label: 'P50 建连延迟',
      raw: stats ? `${stats.p50_ms.toFixed(1)} ms` : undefined,
      score: stats?.score_components?.p50,
      weight: enabled ? scoreWeight('tcp_standard', 'p50') : 0,
    },
    {
      key: 'p95',
      label: 'P95 建连延迟',
      raw: stats ? `${stats.p95_ms.toFixed(1)} ms` : undefined,
      score: stats?.score_components?.p95,
      weight: enabled ? scoreWeight('tcp_standard', 'p95') : 0,
    },
    {
      key: 'coverage',
      label: '样本覆盖率',
      raw: stats ? `${stats.coverage_percent.toFixed(1)}%` : undefined,
      score: stats?.score_components?.coverage,
      weight: enabled ? scoreWeight('tcp_standard', 'coverage') : 0,
      note: scoreWeight('tcp_standard', 'coverage') === 0 ? '仅决定数据能否参评' : undefined,
    },
  ])
}

function largeTargetScoreItems(standard?: TCPQualityModeStats, large?: TCPQualityModeStats) {
  if (large?.score_breakdown?.length)
    return backendImpactItems(large.score_breakdown)
  const enabled = large?.score !== null && large?.score !== undefined
  return buildWeightedScoreItems([
    {
      key: 'absolute_loss',
      label: '载荷 SYN 绝对丢失',
      raw: large ? formatTCPQualityLoss(large.loss_percent) : undefined,
      score: large?.score_components?.absolute_loss,
      weight: enabled ? scoreWeight('large_experimental', 'loss') : 0,
      note: scoreWeight('large_experimental', 'loss') === 0 ? '保留作诊断，避免和额外丢失重复扣分' : undefined,
    },
    {
      key: 'extra_loss',
      label: '相对配对基准额外丢失',
      raw: large ? `+${(large.score_inputs?.extra_loss_percent ?? statsExtraLoss(standard, large) ?? 0).toFixed(2)} 个百分点` : undefined,
      score: large?.score_components?.extra_loss,
      weight: enabled ? scoreWeight('large_experimental', 'extra_loss') : 0,
    },
    {
      key: 'p95_degradation',
      label: 'P95 劣化倍数',
      raw: large ? formatRatio(large.score_inputs?.p95_degradation_ratio ?? statsP95Ratio(standard, large)) : undefined,
      score: large?.score_components?.p95_degradation,
      weight: enabled ? scoreWeight('large_experimental', 'p95_degradation') : 0,
    },
    {
      key: 'coverage',
      label: '样本覆盖率',
      raw: large ? `${large.coverage_percent.toFixed(1)}%` : undefined,
      score: large?.score_components?.coverage,
      weight: enabled ? scoreWeight('large_experimental', 'coverage') : 0,
      note: scoreWeight('large_experimental', 'coverage') === 0 ? '仅决定数据能否参评' : undefined,
    },
  ])
}

function formatStageScore(score: number | null): string {
  const deduction = scoreDeduction(score)
  return score === null ? '--' : `${score.toFixed(1)} 分 · 扣 ${deduction?.toFixed(1)} 分`
}

function formatExperimentalScore(score: number | null, counted = false): string {
  if (score === null)
    return '未计入'
  return `${score.toFixed(1)} 分 · ${counted ? '计入综合分' : '实验子分'}`
}

function primaryPenaltyText(node: TCPQualitySnapshotNode): string {
  const isOverall = node.overall_score !== null
  const stageItems = isOverall ? overallScoreItems(node) : tcpScoreItems(node)
  const largest = stageItems
    .filter(item => item.counted && item.deductedPoints !== null)
    .sort((left, right) => (right.deductedPoints ?? 0) - (left.deductedPoints ?? 0))[0]
  const guardDeduction = node.overall_score_before_guard !== null && node.overall_score !== null
    ? Math.max(0, node.overall_score_before_guard - node.overall_score)
    : 0

  if (guardDeduction > (largest?.deductedPoints ?? 0))
    return `首次响应丢失触发封顶保护：由 ${node.overall_score_before_guard?.toFixed(1)} 降至 ${node.overall_score?.toFixed(1)}，额外扣 ${guardDeduction.toFixed(1)} 分。`
  if (!largest || (largest.deductedPoints ?? 0) < 0.01)
    return node.reason || `各计分项在${isOverall ? '综合分' : 'TCP 分'}中均未产生明显扣分。`

  const tcpItem = tcpScoreItems(node).find(item => item.key === largest.key)
  const tcpImpact = tcpItem?.counted
    ? `；在 TCP 分中得 ${tcpItem.earnedPoints?.toFixed(2)}/${tcpItem.maxPoints.toFixed(2)}，扣 ${tcpItem.deductedPoints?.toFixed(2)} 分`
    : ''
  return `${largest.label}分项 ${largest.score?.toFixed(1)}，${isOverall ? '综合分' : 'TCP 分'}得 ${largest.earnedPoints?.toFixed(2)}/${largest.maxPoints.toFixed(2)}，扣 ${largest.deductedPoints?.toFixed(2)} 分${isOverall ? tcpImpact : ''}。`
}

async function loadData(force = false): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    tasks.value = await loadTCPQualityTasks(force)
    const requestedTask = Number(router.currentRoute.value.query.task)
    if (Number.isInteger(requestedTask) && tasks.value.some(task => task.id === requestedTask))
      selectedTaskId.value = requestedTask
    if (!tasks.value.some(task => task.id === selectedTaskId.value))
      selectedTaskId.value = tasks.value[0]?.id ?? null
    if (selectedTaskId.value !== null)
      snapshot.value = await loadTCPQualitySnapshot(selectedTaskId.value, selectedHours.value, force)
    else
      snapshot.value = null
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'TCP 质量快照读取失败'
  }
  finally {
    loading.value = false
  }
}

watch([selectedTaskId, selectedHours], async ([taskId], [oldTaskId]) => {
  if (taskId === null)
    return
  if (Number(router.currentRoute.value.query.task) !== taskId) {
    void router.replace({ query: { ...router.currentRoute.value.query, task: String(taskId), pingTask: undefined } })
  }
  if (taskId === oldTaskId && loading.value)
    return
  loading.value = true
  error.value = ''
  try {
    snapshot.value = await loadTCPQualitySnapshot(taskId, selectedHours.value)
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'TCP 质量快照读取失败'
  }
  finally {
    loading.value = false
  }
})

const scoreChartOption = computed(() => ({
  animationDuration: appStore.disablePageAnimation ? 0 : 350,
  tooltip: {
    trigger: 'axis',
    confine: true,
    axisPointer: { type: 'shadow' },
  },
  legend: { top: 0, textStyle: { color: chartTextColor.value } },
  grid: { left: 42, right: 16, top: 42, bottom: 72 },
  xAxis: {
    type: 'category',
    data: sortedNodes.value.map(node => node.name),
    axisLabel: { color: chartTextColor.value, rotate: 24, overflow: 'truncate', width: 88 },
    axisLine: { lineStyle: { color: chartSplitColor.value } },
  },
  yAxis: {
    type: 'value',
    min: 0,
    max: 100,
    axisLabel: { color: chartTextColor.value },
    splitLine: { lineStyle: { color: chartSplitColor.value } },
  },
  series: [
    {
      name: '综合网络分',
      type: 'bar',
      barMaxWidth: 20,
      data: sortedNodes.value.map(node => node.overall_score),
      itemStyle: { color: '#059669' },
    },
    {
      name: 'TCP 质量分',
      type: 'bar',
      barMaxWidth: 20,
      data: sortedNodes.value.map(node => node.tcp_score),
      itemStyle: { color: '#2563EB' },
    },
    {
      name: 'ICMP 基础分',
      type: 'bar',
      barMaxWidth: 20,
      data: sortedNodes.value.map(node => node.icmp_score),
      itemStyle: { color: '#F97316' },
    },
  ],
}))

const distributionChartOption = computed(() => ({
  animationDuration: appStore.disablePageAnimation ? 0 : 350,
  tooltip: {
    trigger: 'item',
    confine: true,
    formatter: (params: unknown) => {
      const data = (params as { data?: { value?: [number, number], name?: string, remark?: string, p50?: number, sent?: number, received?: number, score?: number | null } }).data
      if (!data?.value)
        return ''
      const remark = data.remark ? `<br/><span style="opacity:.72">${escapeHtml(data.remark)}</span>` : ''
      return `<strong>${escapeHtml(data.name ?? '')}</strong>${remark}<br/>P50 / P95 ${Number(data.p50 ?? 0).toFixed(1)} / ${data.value[0].toFixed(1)} ms<br/>首次响应 ${Number(data.received ?? 0)} / ${Number(data.sent ?? 0)}<br/>首次响应丢失 ${formatTCPQualityLoss(data.value[1])}<br/>标准 SYN 分 ${formatTCPQualityScore(data.score ?? null)}`
    },
  },
  grid: { left: 58, right: 22, top: 28, bottom: 48 },
  xAxis: {
    type: 'value',
    name: 'P95 延迟 (ms)',
    nameLocation: 'middle',
    nameGap: 30,
    splitNumber: 4,
    axisLabel: { color: chartTextColor.value, hideOverlap: true, formatter: formatCompactAxisNumber },
    splitLine: { lineStyle: { color: chartSplitColor.value } },
  },
  yAxis: {
    type: 'value',
    name: '首包丢失 (%)',
    min: 0,
    axisLabel: { color: chartTextColor.value, formatter: '{value}%' },
    splitLine: { lineStyle: { color: chartSplitColor.value } },
  },
  series: [{
    type: 'scatter',
    symbolSize: 18,
    data: sortedNodes.value
      .filter(node => node.standard.samples_sent > 0)
      .map((node, index) => ({
        name: node.name,
        remark: node.public_remark ?? '',
        p50: node.standard.p50_ms,
        sent: node.standard.samples_sent,
        received: node.standard.samples_received,
        score: node.tcp_standard_score,
        value: [node.standard.p95_ms, node.standard.loss_percent],
        itemStyle: { color: nodeColor(index) },
      })),
  }],
}))

const largeImpactChartOption = computed(() => ({
  animationDuration: appStore.disablePageAnimation ? 0 : 350,
  tooltip: {
    trigger: 'item',
    confine: true,
    formatter: (params: unknown) => {
      const data = (params as { data?: { value?: [number, number], name?: string, remark?: string, standardLoss?: number, largeLoss?: number, standardP95?: number, largeP95?: number, sent?: number, received?: number, score?: number | null } }).data
      if (!data?.value)
        return ''
      const remark = data.remark ? `<br/><span style="opacity:.72">${escapeHtml(data.remark)}</span>` : ''
      return `<strong>${escapeHtml(data.name ?? '')}</strong>${remark}<br/>1050 字节载荷额外首次响应丢失 +${data.value[1].toFixed(2)} 个百分点<br/>P95 劣化 ${data.value[0].toFixed(2)} 倍<br/>配对基准 / 1050 字节丢失 ${formatTCPQualityLoss(Number(data.standardLoss ?? 0))} / ${formatTCPQualityLoss(Number(data.largeLoss ?? 0))}<br/>配对基准 / 1050 字节 P95 ${Number(data.standardP95 ?? 0).toFixed(1)} / ${Number(data.largeP95 ?? 0).toFixed(1)} ms<br/>1050 字节首次响应 ${Number(data.received ?? 0)} / ${Number(data.sent ?? 0)}<br/>兼容性诊断指数 ${formatTCPQualityScore(data.score ?? null)}`
    },
  },
  grid: { left: 62, right: 22, top: 28, bottom: 48 },
  xAxis: {
    type: 'value',
    name: 'P95 劣化倍数',
    nameLocation: 'middle',
    nameGap: 30,
    min: 0,
    axisLabel: { color: chartTextColor.value, formatter: '{value}×' },
    splitLine: { lineStyle: { color: chartSplitColor.value } },
  },
  yAxis: {
    type: 'value',
    name: '额外丢失 (百分点)',
    min: 0,
    axisLabel: { color: chartTextColor.value },
    splitLine: { lineStyle: { color: chartSplitColor.value } },
  },
  series: [{
    type: 'scatter',
    symbolSize: 18,
    markLine: {
      silent: true,
      symbol: 'none',
      lineStyle: { color: chartTextColor.value, type: 'dashed', opacity: 0.35 },
      data: [{ xAxis: 1 }, { yAxis: 0 }],
    },
    data: largeImpactNodes.value.map((node, index) => ({
      name: node.name,
      remark: node.public_remark ?? '',
      standardLoss: node.experimental_standard?.loss_percent ?? 0,
      largeLoss: node.payload_1050?.loss_percent ?? node.large?.loss_percent ?? 0,
      standardP95: node.experimental_standard?.p95_ms ?? 0,
      largeP95: node.payload_1050?.p95_ms ?? node.large?.p95_ms ?? 0,
      sent: node.payload_1050?.samples_sent ?? node.large?.samples_sent ?? 0,
      received: node.payload_1050?.samples_received ?? node.large?.samples_received ?? 0,
      score: node.large_experimental_score,
      value: [largeP95Ratio(node) ?? 0, largeExtraLoss(node) ?? 0],
      itemStyle: { color: nodeColor(index) },
    })),
  }],
}))

const rangeChartOption = computed(() => ({
  animationDuration: appStore.disablePageAnimation ? 0 : 350,
  tooltip: {
    trigger: 'item',
    confine: true,
    formatter: (params: unknown) => {
      const index = Number((params as { dataIndex?: number }).dataIndex ?? -1)
      const node = rangedNodes.value[index]
      if (!node)
        return ''
      const remark = node.public_remark ? `<br/><span style="opacity:.72">${escapeHtml(node.public_remark)}</span>` : ''
      return `<strong>${escapeHtml(node.name)}</strong>${remark}<br/>典型最小 ${node.standard.min_ms.toFixed(1)} ms<br/>平均 ${node.standard.average_ms.toFixed(1)} ms<br/>P50 / P95 ${node.standard.p50_ms.toFixed(1)} / ${node.standard.p95_ms.toFixed(1)} ms<br/>典型最大 ${node.standard.max_ms.toFixed(1)} ms`
    },
  },
  grid: { top: 12, right: 62, bottom: 34, left: 118 },
  xAxis: {
    type: 'value',
    min: 0,
    max: rangeAxisMax.value,
    name: '延迟 (ms)',
    splitNumber: 4,
    axisLabel: { color: chartTextColor.value, hideOverlap: true, formatter: formatCompactAxisNumber },
    splitLine: { lineStyle: { color: chartSplitColor.value } },
  },
  yAxis: {
    type: 'category',
    inverse: true,
    data: rangedNodes.value.map(node => node.name),
    axisLabel: { color: chartTextColor.value, width: 96, overflow: 'truncate' },
    axisLine: { show: false },
    axisTick: { show: false },
  },
  series: [{
    name: '典型最小至最大延迟',
    type: 'custom',
    renderItem: (_params: RangeRenderParams, api: RangeRenderApi) => {
      const category = Number(api.value(0))
      const minimum = Number(api.value(1))
      const p50 = Number(api.value(2))
      const p95 = Number(api.value(3))
      const maximum = Number(api.value(4))
      const minPoint = api.coord([minimum, category])
      const p50Point = api.coord([p50, category])
      const p95Point = api.coord([p95, category])
      const maxPoint = api.coord([maximum, category])
      return {
        type: 'group',
        children: [
          { type: 'line', shape: { x1: minPoint[0], y1: minPoint[1], x2: maxPoint[0], y2: maxPoint[1] }, style: { stroke: chartTextColor.value, opacity: 0.42, lineWidth: 3, lineCap: 'round' } },
          { type: 'line', shape: { x1: p50Point[0], y1: p50Point[1], x2: p95Point[0], y2: p95Point[1] }, style: { stroke: '#34D399', lineWidth: 5, lineCap: 'round' } },
          { type: 'circle', shape: { cx: minPoint[0], cy: minPoint[1], r: 3 }, style: { fill: chartTextColor.value } },
          { type: 'circle', shape: { cx: maxPoint[0], cy: maxPoint[1], r: 3 }, style: { fill: chartTextColor.value } },
          { type: 'circle', shape: { cx: p50Point[0], cy: p50Point[1], r: 5 }, style: { fill: '#5EEAA6', stroke: '#047857', lineWidth: 1 } },
          { type: 'circle', shape: { cx: p95Point[0], cy: p95Point[1], r: 5 }, style: { fill: isDark.value ? '#111827' : '#FFFFFF', stroke: '#34D399', lineWidth: 2 } },
          { type: 'text', style: { x: maxPoint[0] + 9, y: maxPoint[1], text: `${Math.round(minimum)}–${Math.round(maximum)}`, fill: chartTextColor.value, fontSize: 10, fontWeight: 600, verticalAlign: 'middle' } },
        ],
      }
    },
    encode: { x: [1, 2, 3, 4], y: 0 },
    data: rangedNodes.value.map((node, index) => [index, node.standard.min_ms, node.standard.p50_ms, node.standard.p95_ms, node.standard.max_ms]),
  }],
}))

const trendChartOption = computed(() => {
  const metric = trendMetric.value
  const isLoss = metric === 'loss'
  const mode = trendMode.value
  return {
    animationDuration: appStore.disablePageAnimation ? 0 : 350,
    tooltip: { trigger: 'axis', confine: true },
    legend: { top: 0, type: 'scroll', textStyle: { color: chartTextColor.value } },
    grid: { left: 56, right: 20, top: 48, bottom: 44 },
    xAxis: {
      type: 'time',
      axisLabel: { color: chartTextColor.value },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: isLoss ? '丢失 (%)' : '延迟 (ms)',
      min: 0,
      axisLabel: { color: chartTextColor.value, formatter: isLoss ? '{value}%' : '{value}' },
      splitLine: { lineStyle: { color: chartSplitColor.value } },
    },
    series: sortedNodes.value.map((node, index) => ({
      name: node.name,
      type: 'line',
      showSymbol: false,
      connectNulls: false,
      lineStyle: { width: 2, color: nodeColor(index) },
      itemStyle: { color: nodeColor(index) },
      data: (mode === 'experimental_standard'
        ? (node.experimental_standard_trend ?? [])
        : mode === 'payload_300'
          ? (node.payload_300_trend ?? [])
          : mode === 'payload_1050'
            ? (node.payload_1050_trend ?? node.large_trend ?? [])
            : node.trend).map(point => [
        point.time,
        metric === 'loss'
          ? point.loss_percent
          : metric === 'min'
            ? point.min_ms
            : metric === 'average'
              ? point.average_ms
              : metric === 'p95'
                ? point.p95_ms
                : metric === 'max'
                  ? point.max_ms
                  : point.p50_ms,
      ]),
    })),
  }
})

function targetLabel(key: string): string {
  const target = snapshot.value?.targets.find(item => item.key === key)
  return target ? `${target.province} ${target.isp} IPv${target.ip_version}` : key
}

function nodeLabel(uuid: string): string {
  return snapshot.value?.nodes.find(node => node.uuid === uuid)?.name ?? uuid
}

watch(selectedTask, (task) => {
  if (!task?.large_enabled)
    trendMode.value = 'standard'
})

onMounted(() => loadData())
</script>

<template>
  <main class="mx-auto w-full max-w-[1280px] px-4 pb-10">
    <div v-if="!viewProps.embedded" class="mb-4 flex items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="icon-sm" aria-label="返回首页" @click="router.push('/')">
          <Icon icon="lucide:arrow-left" width="18" height="18" />
        </Button>
        <div class="min-w-0">
          <h1 class="text-xl font-semibold">
            综合网络质量
          </h1>
          <p class="text-sm text-muted-foreground">
            综合 ICMP 延迟、丢包与 TCP SYN 首次响应，对比各节点真实线路体验
          </p>
        </div>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="刷新快照" :disabled="loading" @click="loadData(true)">
        <Icon icon="lucide:refresh-cw" width="18" height="18" :class="{ 'animate-spin': loading }" />
      </Button>
    </div>

    <section class="mb-5 grid gap-4 rounded-md border bg-card/90 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <label class="min-w-0">
        <span class="mb-1.5 block text-xs text-muted-foreground">网络质量任务</span>
        <select
          v-model.number="selectedTaskId"
          class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
        >
          <option v-for="task in tasks" :key="task.id" :value="task.id">
            {{ task.name }}
          </option>
        </select>
      </label>
      <div>
        <span class="mb-1.5 block text-xs text-muted-foreground">统计范围</span>
        <Tabs v-model="selectedHours">
          <TabsList class="max-w-full overflow-x-auto">
            <TabsTrigger v-for="option in hourOptions" :key="option.value" :value="option.value">
              {{ option.label }}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </section>

    <div v-if="loading" class="flex min-h-[360px] items-center justify-center">
      <Spinner class="size-6" />
    </div>
    <div v-else-if="error" class="rounded-md border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
      {{ error }}
    </div>
    <Empty v-else-if="!selectedTask || !snapshot" title="尚无 TCP 质量数据" description="请先在后台创建任务并等待至少三次检测。" />

    <template v-else>
      <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span class="inline-flex items-center gap-1">
          <Icon icon="lucide:database" width="14" height="14" />
          后台快照 {{ generatedText }}
        </span>
        <span>目录 {{ snapshot.catalog_revision }}</span>
        <span v-if="snapshot.excluded_target_keys.length">
          已剔除 {{ snapshot.excluded_target_keys.length }} 个目标的同时故障时段
        </span>
        <span>访问本页不会重新执行探测</span>
      </div>

      <section class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="rounded-md border bg-card p-4">
          <p class="text-xs text-muted-foreground">
            有效节点
          </p>
          <p class="mt-1 text-2xl font-semibold">
            {{ snapshot.valid_nodes }}<span class="text-sm text-muted-foreground"> / {{ snapshot.nodes.length }}</span>
          </p>
        </div>
        <div class="rounded-md border bg-card p-4">
          <p class="text-xs text-muted-foreground">
            当前最佳
          </p>
          <p class="mt-1 truncate text-base font-semibold">
            {{ bestNode?.name ?? '--' }}
          </p>
        </div>
        <div class="rounded-md border bg-card p-4">
          <p class="text-xs text-muted-foreground">
            最佳综合分
          </p>
          <p class="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {{ formatTCPQualityScore(bestNode ? nodeRankingScore(bestNode) : null) }}
          </p>
        </div>
        <div class="rounded-md border bg-card p-4">
          <p class="text-xs text-muted-foreground">
            零首包丢失节点
          </p>
          <p class="mt-1 text-2xl font-semibold">
            {{ zeroLossNodes }}
          </p>
        </div>
      </section>

      <section class="mb-5 border-y bg-muted/25 px-4 py-3">
        <div class="mb-2 flex items-center gap-2">
          <Icon icon="lucide:info" width="16" height="16" class="text-emerald-600 dark:text-emerald-400" />
          <h2 class="text-sm font-semibold">
            指标怎么理解
          </h2>
        </div>
        <div class="grid gap-x-6 gap-y-2 text-xs leading-5 text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
          <p><strong class="text-foreground">综合网络分：</strong>ICMP {{ scoreWeight('overall_with_large', 'icmp') }}%、标准 SYN {{ scoreWeight('overall_with_large', 'tcp_standard') }}%、SYN 载荷兼容性 {{ scoreWeight('overall_with_large', 'large_experimental') }}%。载荷实验最多影响综合分 10 个百分点。</p>
          <p><strong class="text-foreground">首次响应丢失：</strong>发出的 TCP SYN 没有按时收到首次响应，越低越稳定；它不是系统统计的真实重传次数。</p>
          <p><strong class="text-foreground">标准 SYN 分：</strong>首次响应丢失 {{ scoreWeight('tcp_standard', 'first_response_loss') }}%、P50 {{ scoreWeight('tcp_standard', 'p50') }}%、P95 {{ scoreWeight('tcp_standard', 'p95') }}%、覆盖率 {{ scoreWeight('tcp_standard', 'coverage') }}%；覆盖率为 0% 时只决定能否参评。</p>
          <p><strong class="text-foreground">SYN 载荷兼容性：</strong>同一轮交错比较无载荷、300 与 1050 字节 SYN；关注相对配对基准多丢多少、P95 变慢多少，用于发现中间设备区别处理。</p>
          <p><strong class="text-foreground">典型最小–最大：</strong>综合多轮检测的稳健边界，保留大范围波动，同时降低单次极端误差的干扰。</p>
          <p><strong class="text-foreground">P50 / P95：</strong>P50 代表日常水平，P95 更接近偶发卡顿时的体验。</p>
          <p><strong class="text-foreground">覆盖率：</strong>有效样本达到计划样本的比例；数据不足时不会强行参与排名。</p>
          <p><strong class="text-foreground">同时故障剔除：</strong>多个节点同一时段都失败时，优先判断为公共测试目标异常，避免错误处罚节点。</p>
          <p><strong class="text-foreground">为何默认不计分：</strong>载荷 SYN 不是完整网页下载，也不是路径 MTU 或操作系统 TCP 重传测试；公共预检或多节点同步异常会单独标记，不归责于节点。</p>
        </div>
      </section>

      <section v-if="snapshot.excluded_reference_events?.length" class="mb-5 rounded-md border border-amber-500/35 bg-amber-500/5 px-4 py-3">
        <div class="flex items-start gap-2">
          <Icon icon="lucide:shield-alert" width="17" height="17" class="mt-0.5 shrink-0 text-amber-700 dark:text-amber-400" />
          <div class="min-w-0">
            <h2 class="text-sm font-semibold">
              已排除 {{ snapshot.excluded_reference_events.length }} 次共同探测异常
            </h2>
            <p class="mt-1 text-xs leading-5 text-muted-foreground">
              多数节点在同一目标、同一时段同步异常，系统将其视为目标或探测机制共同事件，不计入节点得分。
            </p>
            <div class="mt-2 space-y-1 text-[11px] text-muted-foreground">
              <p v-for="event in snapshot.excluded_reference_events.slice(-3)" :key="`${event.target_key}:${event.mode}:${event.time}`">
                {{ dayjs(event.time).format('MM-DD HH:mm') }} · {{ targetLabel(event.target_key) }} · {{ event.affected_nodes }}/{{ event.reported_nodes }} 节点异常
                <template v-if="event.resilient_nodes?.length">
                  ；保持正常：{{ event.resilient_nodes.map(nodeLabel).join('、') }}
                </template>
              </p>
            </div>
          </div>
        </div>
      </section>

      <Tabs v-model="activeSection" class="mb-4 md:hidden">
        <TabsList class="grid w-full grid-cols-4">
          <TabsTrigger value="ranking">
            排名
          </TabsTrigger>
          <TabsTrigger value="distribution">
            诊断
          </TabsTrigger>
          <TabsTrigger value="trend">
            趋势
          </TabsTrigger>
          <TabsTrigger value="targets">
            目标
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div class="grid gap-5 md:grid-cols-2">
        <section class="rounded-md border bg-card p-4 md:block" :class="[activeSection === 'ranking' ? 'block' : 'hidden']">
          <div class="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold">
                节点排名
              </h2>
              <p class="text-xs text-muted-foreground">
                有 ICMP 参考时按综合分，否则按 TCP 质量分。
              </p>
            </div>
            <Badge variant="secondary">
              {{ snapshot.score_model.version }}
            </Badge>
          </div>
          <div class="space-y-2">
            <div
              v-for="node in sortedNodes" :key="node.uuid"
              class="grid min-h-[74px] grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2"
            >
              <span class="text-center font-semibold" :class="node.rank ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'">
                {{ node.rank ?? '–' }}
              </span>
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">
                  {{ node.name }}
                </p>
                <p v-if="node.public_remark" class="truncate text-xs text-muted-foreground">
                  {{ node.public_remark }}
                </p>
                <p class="mt-1 text-xs text-muted-foreground">
                  P50 {{ node.standard.p50_ms.toFixed(0) }}ms · P95 {{ node.standard.p95_ms.toFixed(0) }}ms · 丢失 {{ formatTCPQualityLoss(node.standard.loss_percent) }}
                </p>
              </div>
              <div class="text-right">
                <p class="text-lg font-semibold">
                  {{ formatTCPQualityScore(nodeRankingScore(node)) }}
                </p>
                <span class="rounded px-1.5 py-0.5 text-[11px]" :class="gradeClass(node.grade)">{{ node.grade }}</span>
              </div>
            </div>
          </div>
        </section>

        <div class="space-y-5 md:block" :class="[activeSection === 'ranking' || activeSection === 'distribution' ? 'block' : 'hidden']">
          <section class="rounded-md border bg-card p-4 md:block" :class="[activeSection === 'ranking' ? 'block' : 'hidden']">
            <h2 class="font-semibold">
              评分构成
            </h2>
            <p class="mb-2 text-xs text-muted-foreground">
              综合网络分、TCP 质量分与 ICMP 基础分并列展示。
            </p>
            <div class="quality-chart quality-chart--score">
              <VChart v-if="isDesktop || activeSection === 'ranking'" class="size-full" :option="scoreChartOption" autoresize />
            </div>
          </section>

          <section class="rounded-md border bg-card p-4 md:block" :class="[activeSection === 'distribution' ? 'block' : 'hidden']">
            <h2 class="font-semibold">
              典型最小至最大延迟
            </h2>
            <p class="mb-2 text-xs text-muted-foreground">
              灰线为多轮检测的典型最小至最大范围，绿色段为 P50–P95；兼顾大范围波动并抑制单次极端误差。
            </p>
            <div class="quality-chart">
              <VChart v-if="isDesktop || activeSection === 'distribution'" class="size-full" :option="rangeChartOption" autoresize />
            </div>
          </section>
        </div>

        <section class="overflow-hidden rounded-md border bg-card md:col-span-2 md:block" :class="[activeSection === 'distribution' ? 'block' : 'hidden']">
          <div class="p-4 pb-2">
            <h2 class="font-semibold">
              TCP 原始质量与扣分依据
            </h2>
            <p class="text-xs text-muted-foreground">
              图表越靠左下角越好；下方按“分项分 × 本级权重 = 实得分”逐层核对，每一级满分均为 100 分。
            </p>
          </div>

          <div class="grid lg:grid-cols-2 lg:divide-x">
            <div class="min-w-0 px-4 pb-4">
              <h3 class="text-sm font-semibold">
                TCP 标准 SYN
              </h3>
              <p class="text-xs text-muted-foreground">
                P95 反映较慢的 5% 建连体验，首次响应丢失反映未按时收到 SYN 首次响应的比例。
              </p>
              <div class="quality-chart quality-chart--diagnostic">
                <VChart v-if="isDesktop || activeSection === 'distribution'" class="size-full" :option="distributionChartOption" autoresize />
              </div>
            </div>

            <div v-if="selectedTask.large_enabled" class="min-w-0 border-t px-4 pb-4 pt-4 lg:border-t-0 lg:pt-0">
              <h3 class="text-sm font-semibold">
                SYN 载荷兼容性（实验）
              </h3>
              <p class="text-xs text-muted-foreground">
                以同一轮无载荷 SYN 为配对基准，图中展示 1050 字节载荷多丢多少、P95 变慢几倍；完整样本通过校验后参与综合评分，最高影响 10 个百分点。
              </p>
              <div class="quality-chart quality-chart--diagnostic">
                <VChart v-if="isDesktop || activeSection === 'distribution'" class="size-full" :option="largeImpactChartOption" autoresize />
              </div>
            </div>
          </div>

          <div class="border-t">
            <div
              v-for="node in sortedNodes" :key="`diagnostic:${node.uuid}`"
              class="border-b last:border-b-0"
            >
              <div class="flex flex-col gap-3 bg-muted/20 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold">
                    {{ node.name }}
                  </p>
                  <p v-if="node.public_remark" class="truncate text-xs text-muted-foreground">
                    {{ node.public_remark }}
                  </p>
                  <p class="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                    主要扣分：{{ primaryPenaltyText(node) }}
                  </p>
                </div>
                <div class="grid shrink-0 grid-cols-2 gap-x-5 text-right text-xs">
                  <div>
                    <p class="text-muted-foreground">
                      综合网络分
                    </p>
                    <p class="text-lg font-semibold tabular-nums">
                      {{ formatTCPQualityScore(node.overall_score) }}
                    </p>
                  </div>
                  <div>
                    <p class="text-muted-foreground">
                      TCP 质量分
                    </p>
                    <p class="text-lg font-semibold tabular-nums">
                      {{ formatTCPQualityScore(node.tcp_score) }}
                    </p>
                  </div>
                </div>
              </div>

              <div class="grid divide-y lg:grid-cols-2 lg:divide-x lg:divide-y-0">
                <div class="min-w-0 px-4 py-3">
                  <div class="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold">
                        综合分怎么算
                      </p>
                      <p class="text-[10px] text-muted-foreground">
                        三项在综合分中的直接贡献与扣分
                      </p>
                    </div>
                    <span class="shrink-0 text-xs font-semibold tabular-nums">{{ formatStageScore(node.overall_score) }}</span>
                  </div>
                  <ScoreBreakdown :items="overallScoreItems(node)" />
                  <p v-if="node.loss_guard_cap != null" class="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                    封顶保护：加权原始分 {{ formatTCPQualityScore(node.overall_score_before_guard) }}，因标准 SYN 首次响应丢失，最终最高 {{ node.loss_guard_cap.toFixed(1) }} 分。
                  </p>
                </div>
                <div class="min-w-0 px-4 py-3">
                  <div class="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p class="text-sm font-semibold">
                        TCP 分怎么算
                      </p>
                      <p class="text-[10px] text-muted-foreground">
                        标准 SYN 为主体；两档载荷实验数据完整时按 10% 纳入，否则只保留诊断数据
                      </p>
                    </div>
                    <span class="shrink-0 text-xs font-semibold tabular-nums">{{ formatStageScore(node.tcp_score) }}</span>
                  </div>
                  <ScoreBreakdown :items="tcpScoreItems(node)" />
                  <p v-if="node.loss_guard_cap != null" class="mt-2 text-xs font-medium text-amber-700 dark:text-amber-400">
                    封顶保护前 {{ formatTCPQualityScore(node.tcp_score_before_guard) }} 分，最终最高 {{ node.loss_guard_cap.toFixed(1) }} 分。
                  </p>
                </div>
              </div>

              <div class="grid border-t bg-muted/10 lg:grid-cols-2 lg:divide-x">
                <div class="min-w-0 px-4 py-3">
                  <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <p class="text-sm font-semibold">
                      标准 SYN 节点子分
                    </p>
                    <span class="text-xs tabular-nums">{{ formatStageScore(node.tcp_standard_score) }}</span>
                  </div>
                  <ScoreBreakdown :items="standardTargetScoreItems(node.standard)" compact />
                  <p class="mt-2 text-[10px] text-muted-foreground">
                    原始汇总：响应 {{ formatSampleCount(node.standard) }} · 丢失 {{ formatTCPQualityLoss(node.standard.loss_percent) }} · P50/P95 {{ node.standard.p50_ms.toFixed(1) }}/{{ node.standard.p95_ms.toFixed(1) }} ms
                  </p>
                </div>
                <div v-if="selectedTask.large_enabled" class="min-w-0 border-t px-4 py-3 lg:border-t-0">
                  <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                    <p class="text-sm font-semibold">
                      SYN 载荷兼容性（实验）
                    </p>
                    <span class="text-xs tabular-nums">{{ formatExperimentalScore(node.large_experimental_score, node.large_experimental_score !== null && scoreWeight('overall_with_large', 'large_experimental') > 0) }}</span>
                  </div>
                  <p v-if="node.large_experimental_score === null && (node.payload_300 || node.payload_1050)" class="mb-3 text-[10px] text-amber-700 dark:text-amber-400">
                    300 与 1050 字节两档实验数据未同时达到有效门槛，本次未计入综合分。
                  </p>
                  <p v-if="node.experimental_standard" class="mb-3 text-[10px] text-muted-foreground">
                    同轮配对基准：响应 {{ formatSampleCount(node.experimental_standard) }} · 丢失 {{ formatTCPQualityLoss(node.experimental_standard.loss_percent) }} · P50/P95 {{ node.experimental_standard.p50_ms.toFixed(1) }}/{{ node.experimental_standard.p95_ms.toFixed(1) }} ms
                  </p>
                  <div class="grid gap-3 xl:grid-cols-2">
                    <div class="min-w-0 rounded-md border bg-background/60 p-2">
                      <p class="mb-1 text-xs font-semibold">
                        300 字节载荷
                      </p>
                      <ScoreBreakdown :items="largeTargetScoreItems(node.experimental_standard, node.payload_300)" compact />
                      <p class="mt-2 text-[10px] text-muted-foreground">
                        响应 {{ formatSampleCount(node.payload_300) }} · 丢失 {{ node.payload_300 ? formatTCPQualityLoss(node.payload_300.loss_percent) : '--' }}
                      </p>
                    </div>
                    <div class="min-w-0 rounded-md border bg-background/60 p-2">
                      <p class="mb-1 text-xs font-semibold">
                        1050 字节载荷
                      </p>
                      <ScoreBreakdown :items="largeTargetScoreItems(node.experimental_standard, node.payload_1050 ?? node.large)" compact />
                      <p class="mt-2 text-[10px] text-muted-foreground">
                        响应 {{ formatSampleCount(node.payload_1050 ?? node.large) }} · 丢失 {{ node.payload_1050 || node.large ? formatTCPQualityLoss(node.payload_1050?.loss_percent ?? node.large?.loss_percent ?? 0) : '--' }}
                      </p>
                    </div>
                  </div>
                </div>
                <div v-else class="px-4 py-3 text-xs text-muted-foreground">
                  此任务未启用 SYN 载荷兼容性实验
                </div>
              </div>

              <div v-if="node.diagnostics?.length" class="border-t px-4 py-2 text-[10px] leading-5 text-muted-foreground">
                <span class="font-medium text-foreground">诊断提示：</span>
                {{ node.diagnostics.join('；') }}
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-md border bg-card p-4 md:col-span-2 md:block" :class="[activeSection === 'trend' ? 'block' : 'hidden']">
          <div class="mb-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold">
                节点趋势
              </h2>
              <p class="text-xs text-muted-foreground">
                来自服务器定期生成的固定快照，最多 120 个时间桶。
              </p>
            </div>
            <div class="flex max-w-full flex-wrap gap-2">
              <Tabs v-if="selectedTask.large_enabled" v-model="trendMode">
                <TabsList>
                  <TabsTrigger value="standard">
                    标准 SYN
                  </TabsTrigger>
                  <TabsTrigger value="experimental_standard">
                    实验基准
                  </TabsTrigger>
                  <TabsTrigger value="payload_300">
                    300B 载荷
                  </TabsTrigger>
                  <TabsTrigger value="payload_1050">
                    1050B 载荷
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              <Tabs v-model="trendMetric">
                <TabsList class="max-w-full overflow-x-auto">
                  <TabsTrigger value="min">
                    最小
                  </TabsTrigger>
                  <TabsTrigger value="average">
                    平均
                  </TabsTrigger>
                  <TabsTrigger value="p50">
                    P50
                  </TabsTrigger>
                  <TabsTrigger value="p95">
                    P95
                  </TabsTrigger>
                  <TabsTrigger value="max">
                    最大
                  </TabsTrigger>
                  <TabsTrigger value="loss">
                    首包丢失
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>
          <div class="quality-chart">
            <VChart v-if="isDesktop || activeSection === 'trend'" class="size-full" :option="trendChartOption" autoresize />
          </div>
        </section>

        <section class="overflow-hidden rounded-md border bg-card md:col-span-2 md:block" :class="[activeSection === 'targets' ? 'block' : 'hidden']">
          <div class="p-4">
            <h2 class="font-semibold">
              目标明细
            </h2>
            <p class="text-xs text-muted-foreground">
              每个得分格直接列出各指标的原始值、分项分、权重、实际贡献和扣分。“首次响应丢失率”不等于系统 TCP 栈真实重传次数。目标 IP、域名和端口不会显示。
            </p>
          </div>
          <div class="border-t">
            <template v-for="node in sortedNodes" :key="node.uuid">
              <article v-for="target in node.targets" :key="`${node.uuid}:${target.target_key}`" class="border-b last:border-b-0">
                <header class="flex flex-col gap-1 bg-muted/25 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-semibold">
                      {{ node.name }}
                    </p>
                    <p v-if="node.public_remark" class="truncate text-xs text-muted-foreground">
                      {{ node.public_remark }}
                    </p>
                  </div>
                  <Badge variant="secondary">
                    {{ targetLabel(target.target_key) }}
                  </Badge>
                </header>
                <div class="grid divide-y lg:grid-cols-3 lg:divide-x lg:divide-y-0">
                  <div class="min-w-0 px-4 py-3">
                    <div class="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p class="text-sm font-semibold">
                          标准 SYN
                        </p><p class="text-[10px] text-muted-foreground">
                          用于综合评分
                        </p>
                      </div>
                      <span class="text-xs font-semibold tabular-nums">{{ formatStageScore(target.standard?.score ?? null) }}</span>
                    </div>
                    <p class="mb-2 text-[10px] text-muted-foreground">
                      响应 {{ formatSampleCount(target.standard) }} · 丢失 {{ target.standard ? formatTCPQualityLoss(target.standard.loss_percent) : '--' }} · P50/P95 {{ target.standard ? `${target.standard.p50_ms.toFixed(1)}/${target.standard.p95_ms.toFixed(1)} ms` : '--' }}
                    </p>
                    <ScoreBreakdown :items="standardTargetScoreItems(target.standard)" compact />
                  </div>
                  <div v-if="selectedTask.large_enabled" class="min-w-0 px-4 py-3">
                    <div class="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p class="text-sm font-semibold">
                          300 字节载荷 SYN
                        </p><p class="text-[10px] text-muted-foreground">
                          相对同轮无载荷基准
                        </p>
                      </div>
                      <span class="text-xs font-semibold tabular-nums">{{ formatExperimentalScore(target.payload_300?.score ?? null) }}</span>
                    </div>
                    <p class="mb-2 text-[10px] text-muted-foreground">
                      响应 {{ formatSampleCount(target.payload_300) }} · 丢失 {{ target.payload_300 ? formatTCPQualityLoss(target.payload_300.loss_percent) : '--' }} · 额外 {{ statsExtraLoss(target.experimental_standard, target.payload_300)?.toFixed(2) ?? '--' }} 个百分点
                    </p>
                    <ScoreBreakdown :items="largeTargetScoreItems(target.experimental_standard, target.payload_300)" compact />
                  </div>
                  <div v-if="selectedTask.large_enabled" class="min-w-0 px-4 py-3">
                    <div class="mb-2 flex items-start justify-between gap-2">
                      <div>
                        <p class="text-sm font-semibold">
                          1050 字节载荷 SYN
                        </p><p class="text-[10px] text-muted-foreground">
                          相对同轮无载荷基准
                        </p>
                      </div>
                      <span class="text-xs font-semibold tabular-nums">{{ formatExperimentalScore((target.payload_1050 ?? target.large)?.score ?? null) }}</span>
                    </div>
                    <p class="mb-2 text-[10px] text-muted-foreground">
                      响应 {{ formatSampleCount(target.payload_1050 ?? target.large) }} · 丢失 {{ target.payload_1050 || target.large ? formatTCPQualityLoss(target.payload_1050?.loss_percent ?? target.large?.loss_percent ?? 0) : '--' }} · 额外 {{ statsExtraLoss(target.experimental_standard ?? target.standard, target.payload_1050 ?? target.large)?.toFixed(2) ?? '--' }} 个百分点
                    </p>
                    <ScoreBreakdown :items="largeTargetScoreItems(target.experimental_standard ?? target.standard, target.payload_1050 ?? target.large)" compact />
                  </div>
                </div>
              </article>
            </template>
          </div>
        </section>
      </div>
    </template>
  </main>
</template>
