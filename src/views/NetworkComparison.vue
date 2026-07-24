<script setup lang="ts">
import type {
  NetworkComparisonManifest,
  NetworkComparisonNode,
  NetworkComparisonTask,
  NetworkComparisonWindow,
  NetworkTrendSeries,
} from '@/utils/networkComparison'
import { Icon } from '@iconify/vue'
import { useMediaQuery } from '@vueuse/core'
import dayjs from 'dayjs'
import { computed, onMounted, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import { useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useBackgroundSurface } from '@/composables/useBackgroundSurface'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import {
  formatCoverage,
  formatLossRate,
  loadNetworkComparisonManifest,
  loadNetworkComparisonWindow,
  loadNetworkTrend,
} from '@/utils/networkComparison'
import '@/utils/echarts'

type MobileSection = 'ranking' | 'distribution' | 'trend' | 'details'
type TrendMetric = 'latency' | 'loss'
interface RangeRenderParams {
  dataIndex: number
}
interface RangeRenderApi {
  value: (dimension: number) => unknown
  coord: (data: [number, number]) => [number, number]
}

const router = useRouter()
const appStore = useAppStore()
const nodesStore = useNodesStore()
const { pickSurfaceClass } = useBackgroundSurface()
const isDesktop = useMediaQuery('(min-width: 768px)')

const manifest = ref<NetworkComparisonManifest | null>(null)
const windowData = ref<NetworkComparisonWindow | null>(null)
const selectedHours = ref(appStore.themeSettings.networkCompareDefaultHours)
const selectedTaskId = ref<number | null>(null)
const loading = ref(true)
const error = ref('')
const mobileSection = ref<MobileSection>('ranking')
const trendMetric = ref<TrendMetric>('latency')
const trendLoading = ref(false)
const trendError = ref('')
const trendSeries = ref<NetworkTrendSeries[]>([])
const trendLoadedKey = ref('')
let windowRequestId = 0

const hourLabels = new Map([
  [1, '1 小时'],
  [6, '6 小时'],
  [12, '12 小时'],
  [24, '1 天'],
  [72, '3 天'],
  [168, '7 天'],
])
const chartColors = ['#059669', '#2563EB', '#F97316', '#DB2777', '#7C3AED', '#0891B2', '#65A30D', '#DC2626', '#4F46E5', '#0F766E']

const availableHours = computed(() => {
  if (!manifest.value)
    return []
  return Object.keys(manifest.value.windows)
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right)
})

const selectedTask = computed<NetworkComparisonTask | null>(() => {
  return windowData.value?.tasks.find(task => task.id === selectedTaskId.value) ?? null
})

const sortedNodes = computed(() => {
  const nodes = [...(selectedTask.value?.nodes ?? [])]
  return nodes.sort((left, right) => {
    if (left.rank !== null && right.rank !== null)
      return left.rank - right.rank
    if (left.rank !== null)
      return -1
    if (right.rank !== null)
      return 1
    return left.name.localeCompare(right.name, 'zh-CN')
  })
})

const chartNodes = computed(() => sortedNodes.value.filter(node => node.p50 !== null && node.p95 !== null))
const scoredNodes = computed(() => sortedNodes.value.filter(node => node.rank !== null && node.score !== null))
const lossFreeNodeCount = computed(() => sortedNodes.value.filter(node => node.samples > 0 && node.loss_count === 0).length)
const bestNode = computed(() => scoredNodes.value[0] ?? null)
const rangeAxisBounds = computed(() => {
  const minimum = Math.min(...chartNodes.value.map(node => node.p50 ?? 0))
  const maximum = Math.max(...chartNodes.value.map(node => node.p95 ?? 0))
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum))
    return { min: 0, max: 100 }
  const span = Math.max(10, maximum - minimum)
  const min = Math.max(0, Math.floor((minimum - Math.max(5, span * 0.06)) / 10) * 10)
  const max = Math.ceil((maximum + Math.max(35, span * 0.18)) / 10) * 10
  return { min, max: Math.max(min + 10, max) }
})
const generatedAt = computed(() => windowData.value?.generated_at ?? manifest.value?.generated_at ?? '')
const cacheAgeMinutes = computed(() => generatedAt.value ? Math.max(0, dayjs().diff(dayjs(generatedAt.value), 'minute')) : 0)
const isCacheStale = computed(() => {
  const staleAfter = selectedHours.value <= 1 ? 12 : selectedHours.value <= 24 ? 25 : 75
  return cacheAgeMinutes.value > staleAfter
})
const trendKey = computed(() => `${selectedHours.value}:${selectedTaskId.value ?? ''}`)
const isTrendLoaded = computed(() => trendLoadedKey.value === trendKey.value && trendSeries.value.length > 0)
const nodeStateMap = computed(() => new Map(nodesStore.nodes.map(node => [node.uuid, node])))
const isDark = computed(() => appStore.isDark)
const chartTextColor = computed(() => isDark.value ? 'rgba(255,255,255,.68)' : 'rgba(15,23,42,.66)')
const chartSplitColor = computed(() => isDark.value ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.08)')
const rangeEndpointFill = computed(() => isDark.value ? '#090D14' : '#FFFFFF')

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#039;')
}

function nodeColor(uuid: string): string {
  const index = sortedNodes.value.findIndex(node => node.uuid === uuid)
  return chartColors[Math.max(0, index) % chartColors.length] ?? '#059669'
}

function nodePublicRemark(uuid: string): string {
  return nodeStateMap.value.get(uuid)?.public_remark?.trim() ?? ''
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

function scoreText(node: NetworkComparisonNode): string {
  return node.score === null ? '--' : node.score.toFixed(1)
}

function nodeLossText(node: NetworkComparisonNode): string {
  return node.samples > 0 ? formatLossRate(node.loss_percent) : '--'
}

function nodeOnline(uuid: string): boolean | null {
  return nodeStateMap.value.get(uuid)?.online ?? null
}

function ensureSelectedTask(): void {
  const tasks = windowData.value?.tasks ?? []
  if (!tasks.some(task => task.id === selectedTaskId.value))
    selectedTaskId.value = tasks.find(task => task.ranking_available)?.id ?? tasks[0]?.id ?? null
}

async function loadWindow(force = false): Promise<void> {
  if (!manifest.value)
    return
  const requestId = ++windowRequestId
  loading.value = true
  error.value = ''
  try {
    const result = await loadNetworkComparisonWindow(manifest.value, selectedHours.value, force)
    if (requestId !== windowRequestId)
      return
    windowData.value = result
    ensureSelectedTask()
  }
  catch (cause) {
    if (requestId !== windowRequestId)
      return
    error.value = cause instanceof Error ? cause.message : '线路对比缓存读取失败'
  }
  finally {
    if (requestId === windowRequestId)
      loading.value = false
  }
}

async function loadInitialData(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    manifest.value = await loadNetworkComparisonManifest()
    if (!availableHours.value.includes(selectedHours.value))
      selectedHours.value = availableHours.value.includes(24) ? 24 : availableHours.value[0] ?? 24
    await loadWindow()
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : '线路对比缓存读取失败'
    loading.value = false
  }
}

async function refreshData(): Promise<void> {
  try {
    manifest.value = await loadNetworkComparisonManifest(true)
    await loadWindow(true)
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : '线路对比缓存刷新失败'
  }
}

async function fetchTrend(force = false): Promise<void> {
  const task = selectedTask.value
  if (!task)
    return

  trendLoading.value = true
  trendError.value = ''
  try {
    trendSeries.value = await loadNetworkTrend(
      task.id,
      selectedHours.value,
      task.nodes.map(node => node.uuid),
      force,
    )
    trendLoadedKey.value = trendKey.value
  }
  catch (cause) {
    trendError.value = cause instanceof Error ? cause.message : '趋势数据读取失败'
  }
  finally {
    trendLoading.value = false
  }
}

const rangeChartOption = computed(() => ({
  animationDuration: appStore.disablePageAnimation ? 0 : 350,
  tooltip: {
    trigger: 'item',
    confine: true,
    formatter: (params: unknown) => {
      const index = Number((params as { dataIndex?: number }).dataIndex ?? -1)
      const node = chartNodes.value[index]
      if (!node)
        return ''
      const remark = nodePublicRemark(node.uuid) || '暂无公开备注'
      const spread = Math.max(0, (node.p95 ?? 0) - (node.p50 ?? 0))
      return `<div style="max-width:260px;white-space:normal"><strong>${escapeHtml(node.name)}</strong><br><span style="opacity:.72">公开备注&nbsp;&nbsp;${escapeHtml(remark)}</span><br>P50&nbsp;&nbsp;${Math.round(node.p50 ?? 0)} ms<br>P95&nbsp;&nbsp;${Math.round(node.p95 ?? 0)} ms<br>区间差&nbsp;&nbsp;${spread.toFixed(1)} ms</div>`
    },
  },
  grid: { top: 12, right: 24, bottom: 30, left: 118, containLabel: false },
  xAxis: {
    type: 'value',
    min: rangeAxisBounds.value.min,
    max: rangeAxisBounds.value.max,
    name: '延迟 (ms)',
    nameTextStyle: { color: chartTextColor.value, fontSize: 11 },
    axisLabel: { color: chartTextColor.value, fontSize: 10 },
    splitLine: { lineStyle: { color: chartSplitColor.value } },
  },
  yAxis: {
    type: 'category',
    inverse: true,
    data: chartNodes.value.map(node => node.name),
    axisLabel: { color: chartTextColor.value, fontSize: 10, width: 96, overflow: 'truncate' },
    axisLine: { show: false },
    axisTick: { show: false },
  },
  series: [{
    name: 'P50-P95 区间',
    type: 'custom',
    renderItem: (_params: RangeRenderParams, api: RangeRenderApi) => {
      const categoryIndex = Number(api.value(0))
      const p50 = Number(api.value(1))
      const p95 = Number(api.value(2))
      const start = api.coord([p50, categoryIndex])
      const end = api.coord([p95, categoryIndex])
      const label = `${Math.round(p50)}–${Math.round(p95)} ms`
      return {
        type: 'group',
        children: [
          {
            type: 'line',
            shape: { x1: start[0], y1: start[1], x2: end[0], y2: end[1] },
            style: { stroke: '#34D399', lineWidth: 4, lineCap: 'round' },
          },
          {
            type: 'circle',
            shape: { cx: start[0], cy: start[1], r: 5 },
            style: { fill: '#5EEAA6', stroke: '#047857', lineWidth: 1 },
          },
          {
            type: 'circle',
            shape: { cx: end[0], cy: end[1], r: 5 },
            style: { fill: rangeEndpointFill.value, stroke: '#34D399', lineWidth: 2 },
          },
          {
            type: 'text',
            style: {
              x: end[0] + 9,
              y: end[1],
              text: label,
              fill: chartTextColor.value,
              fontSize: 10,
              fontWeight: 600,
              verticalAlign: 'middle',
            },
          },
        ],
      }
    },
    encode: { x: [1, 2], y: 0 },
    data: chartNodes.value.map((node, index) => [index, node.p50, node.p95]),
  }],
}))

const scatterChartOption = computed(() => ({
  animationDuration: appStore.disablePageAnimation ? 0 : 350,
  tooltip: {
    trigger: 'item',
    confine: true,
    formatter: (params: unknown) => {
      const data = (params as { value?: unknown[] }).value
      if (!Array.isArray(data))
        return ''
      const name = String(data[2] ?? '')
      const score = typeof data[3] === 'number' ? data[3].toFixed(1) : '--'
      const uuid = String(data[4] ?? '')
      const p95 = Number(data[5])
      const lossCount = Number(data[6])
      const grade = String(data[7] ?? '未评级')
      const remark = nodePublicRemark(uuid) || '暂无公开备注'
      return `<div style="max-width:280px;white-space:normal"><strong>${escapeHtml(name)}</strong><br><span style="opacity:.72">公开备注&nbsp;&nbsp;${escapeHtml(remark)}</span><br>P50 / P95&nbsp;&nbsp;${Math.round(Number(data[0]))} / ${Math.round(p95)} ms<br>丢包&nbsp;&nbsp;${formatLossRate(Number(data[1]))}（${lossCount.toLocaleString()} 次）<br>评分&nbsp;&nbsp;${score} · ${escapeHtml(grade)}</div>`
    },
  },
  grid: { top: 18, right: 24, bottom: 42, left: 54 },
  xAxis: {
    type: 'value',
    name: 'P50 延迟 (ms)',
    nameLocation: 'middle',
    nameGap: 28,
    nameTextStyle: { color: chartTextColor.value, fontSize: 11 },
    axisLabel: { color: chartTextColor.value, fontSize: 10 },
    splitLine: { lineStyle: { color: chartSplitColor.value } },
  },
  yAxis: {
    type: 'value',
    name: '丢包 (%)',
    nameTextStyle: { color: chartTextColor.value, fontSize: 11 },
    axisLabel: { color: chartTextColor.value, fontSize: 10, formatter: '{value}%' },
    splitLine: { lineStyle: { color: chartSplitColor.value } },
  },
  series: [{
    type: 'scatter',
    symbolSize: 13,
    data: chartNodes.value.map((node, index) => ({
      value: [node.p50, node.loss_percent, node.name, node.score, node.uuid, node.p95, node.loss_count, node.grade],
      itemStyle: { color: chartColors[index % chartColors.length] },
    })),
  }],
}))

const trendChartOption = computed(() => {
  const series = trendSeries.value
    .filter(item => item.metric === trendMetric.value)
    .map((item) => {
      const node = sortedNodes.value.find(candidate => candidate.uuid === item.uuid)
      return {
        id: `${item.metric}:${item.uuid}`,
        name: node?.name ?? item.uuid,
        type: 'line',
        showSymbol: trendMetric.value === 'loss',
        symbol: 'circle',
        symbolSize: (value: unknown) => {
          if (trendMetric.value !== 'loss' || !Array.isArray(value))
            return 0
          return Number(value[1]) > 0 ? 6 : 0
        },
        connectNulls: false,
        smooth: false,
        lineStyle: { width: 1.5, color: nodeColor(item.uuid) },
        itemStyle: { color: nodeColor(item.uuid) },
        emphasis: { focus: 'series' },
        data: item.points,
      }
    })

  return {
    animationDuration: appStore.disablePageAnimation ? 0 : 300,
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) => {
        const numeric = Number(value)
        return trendMetric.value === 'loss' ? formatLossRate(numeric) : `${Math.round(numeric)} ms`
      },
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      textStyle: { color: chartTextColor.value, fontSize: 10 },
    },
    grid: { top: 24, right: 24, bottom: 62, left: 52 },
    dataZoom: [{ type: 'inside', start: 0, end: 100 }],
    xAxis: {
      type: 'time',
      axisLabel: { color: chartTextColor.value, fontSize: 10 },
      axisLine: { lineStyle: { color: chartSplitColor.value } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: trendMetric.value === 'loss' ? '丢包 (%)' : '延迟 (ms)',
      nameTextStyle: { color: chartTextColor.value, fontSize: 11 },
      axisLabel: {
        color: chartTextColor.value,
        fontSize: 10,
        formatter: trendMetric.value === 'loss' ? '{value}%' : '{value}',
      },
      min: trendMetric.value === 'loss' ? 0 : undefined,
      splitLine: { lineStyle: { color: chartSplitColor.value } },
    },
    series,
  }
})

watch(selectedHours, () => {
  trendSeries.value = []
  trendLoadedKey.value = ''
  void loadWindow()
})

watch(selectedTaskId, () => {
  trendSeries.value = []
  trendLoadedKey.value = ''
  trendError.value = ''
})

watch(mobileSection, (section) => {
  if (section === 'trend' && !isTrendLoaded.value)
    void fetchTrend()
})

onMounted(() => {
  window.scrollTo({ top: 0, behavior: 'instant' })
  void loadInitialData()
})
</script>

<template>
  <div class="space-y-4 px-4 pb-4">
    <header class="flex min-w-0 items-center gap-3">
      <Button variant="ghost" size="icon-sm" class="shrink-0 bg-background/60" aria-label="返回首页" @click="router.push('/')">
        <Icon icon="lucide:arrow-left" :width="16" :height="16" />
      </Button>
      <div class="min-w-0 flex-1">
        <h1 class="truncate text-lg font-bold">
          线路对比
        </h1>
        <p class="mt-0.5 truncate text-xs text-muted-foreground">
          同一延迟任务下的节点网络质量横向分析
        </p>
      </div>
      <Button variant="ghost" size="icon-sm" class="shrink-0 bg-background/60" title="刷新静态缓存" :disabled="loading" @click="refreshData">
        <Icon icon="lucide:refresh-cw" :width="15" :height="15" :class="loading && 'animate-spin'" />
      </Button>
    </header>

    <div
      class="grid gap-3 rounded-md p-3 md:grid-cols-[minmax(260px,1fr)_auto] md:items-end"
      :class="pickSurfaceClass('bg-background/75', 'bg-background/55 backdrop-blur-xl')"
    >
      <label class="min-w-0 space-y-1.5">
        <span class="text-xs font-medium text-muted-foreground">延迟监测任务</span>
        <select v-model.number="selectedTaskId" class="h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-medium">
          <option v-for="task in windowData?.tasks ?? []" :key="task.id" :value="task.id">
            {{ task.name }} · {{ task.target }}
          </option>
        </select>
      </label>
      <div class="min-w-0 space-y-1.5">
        <span class="text-xs font-medium text-muted-foreground">统计范围</span>
        <div class="flex max-w-full gap-1 overflow-x-auto rounded-md bg-muted/70 p-1">
          <button
            v-for="hours in availableHours" :key="hours" type="button"
            class="h-8 shrink-0 rounded px-2.5 text-xs font-medium transition-colors"
            :class="selectedHours === hours ? 'bg-background text-emerald-700 shadow-sm dark:text-emerald-400' : 'text-muted-foreground hover:text-foreground'"
            @click="selectedHours = hours"
          >
            {{ hourLabels.get(hours) ?? `${hours}h` }}
          </button>
        </div>
      </div>
    </div>

    <div v-if="generatedAt" class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span class="inline-flex items-center gap-1">
        <Icon icon="lucide:database" :width="13" :height="13" />
        后台缓存 {{ dayjs(generatedAt).format('MM-DD HH:mm:ss') }}
      </span>
      <Badge v-if="isCacheStale" variant="outline" class="rounded text-amber-700 dark:text-amber-400">
        缓存可能已过期
      </Badge>
      <span>访客读取缓存，不重复执行全量统计</span>
    </div>

    <Spinner :show="loading" content-class="min-h-72">
      <div v-if="error" class="rounded-md border border-red-500/25 bg-red-500/10 px-4 py-8 text-center text-sm text-red-600">
        {{ error }}
      </div>
      <div v-else-if="!selectedTask" class="py-16">
        <Empty description="暂无可对比的延迟监测任务" />
      </div>

      <template v-else>
        <div class="space-y-4">
          <div class="grid gap-2 md:grid-cols-2 md:gap-4">
            <div class="grid grid-cols-2 gap-2">
              <div class="min-w-0 rounded-md bg-background/70 p-3">
                <div class="text-[11px] text-muted-foreground">
                  有效节点
                </div>
                <div class="mt-1 text-xl font-bold tabular-nums">
                  {{ selectedTask.rankable_node_count }}<span class="ml-1 text-xs font-normal text-muted-foreground">/ {{ selectedTask.node_count }}</span>
                </div>
              </div>
              <div class="min-w-0 rounded-md bg-background/70 p-3">
                <div class="text-[11px] text-muted-foreground">
                  当前最佳
                </div>
                <div class="mt-1 truncate text-sm font-bold" :title="bestNode?.name">
                  {{ bestNode?.name ?? '样本不足' }}
                </div>
              </div>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div class="min-w-0 rounded-md bg-background/70 p-3">
                <div class="text-[11px] text-muted-foreground">
                  最佳评分
                </div>
                <div class="mt-1 text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                  {{ bestNode ? scoreText(bestNode) : '--' }}
                </div>
              </div>
              <div class="min-w-0 rounded-md bg-background/70 p-3">
                <div class="text-[11px] text-muted-foreground">
                  零丢包节点
                </div>
                <div class="mt-1 text-xl font-bold tabular-nums">
                  {{ lossFreeNodeCount }}
                </div>
              </div>
            </div>
          </div>

          <div v-if="!selectedTask.ranking_available" class="rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
            当前有效节点少于 3 个，只展示原始指标，不生成名次和评分结论。
          </div>

          <Tabs v-model="mobileSection" class="md:hidden">
            <TabsList class="grid h-9 w-full grid-cols-4">
              <TabsTrigger value="ranking" class="text-xs">
                排名
              </TabsTrigger>
              <TabsTrigger value="distribution" class="text-xs">
                分布
              </TabsTrigger>
              <TabsTrigger value="trend" class="text-xs">
                趋势
              </TabsTrigger>
              <TabsTrigger value="details" class="text-xs">
                明细
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div class="grid min-w-0 gap-4 md:grid-cols-2 md:items-start">
            <section
              class="min-w-0 flex-col rounded-md bg-background/70 p-3 md:flex"
              :class="mobileSection === 'ranking' ? 'flex' : 'hidden'"
            >
              <div class="mb-3 flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold">
                  节点排名
                </h2>
                <span class="text-[11px] text-muted-foreground">分数仅限当前任务内比较</span>
              </div>
              <div class="space-y-2">
                <div
                  v-for="node in sortedNodes" :key="node.uuid"
                  class="grid min-h-14 grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border/70 px-2.5 py-2"
                >
                  <div class="text-center text-sm font-bold tabular-nums" :class="node.rank !== null ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'">
                    {{ node.rank ?? '–' }}
                  </div>
                  <div class="min-w-0">
                    <div class="flex min-w-0 items-center gap-1.5">
                      <span
                        v-if="nodeOnline(node.uuid) !== null"
                        class="size-1.5 shrink-0 rounded-full"
                        :class="nodeOnline(node.uuid) ? 'bg-emerald-500' : 'bg-red-500'"
                      />
                      <span class="truncate text-sm font-medium" :title="node.name">{{ node.name }}</span>
                    </div>
                    <div class="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                      <span>P50 {{ node.p50 === null ? '--' : `${Math.round(node.p50)}ms` }}</span>
                      <span>P95 {{ node.p95 === null ? '--' : `${Math.round(node.p95)}ms` }}</span>
                      <span>丢包 {{ nodeLossText(node) }}</span>
                    </div>
                  </div>
                  <div class="text-right">
                    <div class="text-base font-bold tabular-nums">
                      {{ scoreText(node) }}
                    </div>
                    <span class="mt-0.5 inline-block rounded px-1.5 py-0.5 text-[10px]" :class="gradeClass(node.grade)">
                      {{ node.grade }}
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <div class="min-w-0 space-y-4">
              <section
                class="min-w-0 flex-col rounded-md bg-background/70 p-3 md:flex"
                :class="mobileSection === 'distribution' ? 'flex' : 'hidden'"
              >
                <div>
                  <h2 class="text-sm font-semibold">
                    P50-P95 延迟区间
                  </h2>
                  <p class="mt-1 text-[11px] text-muted-foreground">
                    实心点为 P50，环形点为 P95；连线越短且整体越靠左越稳定。
                  </p>
                </div>
                <div class="mt-2 h-76 min-w-0">
                  <VChart v-if="isDesktop || mobileSection === 'distribution'" :option="rangeChartOption" autoresize />
                </div>
              </section>

              <section
                class="min-w-0 flex-col rounded-md bg-background/70 p-3 md:flex"
                :class="mobileSection === 'distribution' ? 'flex' : 'hidden'"
              >
                <div>
                  <h2 class="text-sm font-semibold">
                    延迟 / 丢包分布
                  </h2>
                  <p class="mt-1 text-[11px] text-muted-foreground">
                    越靠左下角，典型延迟和丢包越低；悬停或轻触彩球查看节点与公开备注。
                  </p>
                </div>
                <div class="mt-2 h-76 min-w-0">
                  <VChart v-if="isDesktop || mobileSection === 'distribution'" :option="scatterChartOption" autoresize />
                </div>
              </section>
            </div>
          </div>

          <section
            class="min-w-0 flex-col rounded-md bg-background/70 p-3 md:flex"
            :class="mobileSection === 'trend' ? 'flex' : 'hidden'"
          >
            <div class="flex flex-wrap items-center gap-2">
              <div class="min-w-0 flex-1">
                <h2 class="text-sm font-semibold">
                  多节点趋势
                </h2>
                <p class="mt-1 text-[11px] text-muted-foreground">
                  趋势按需读取；丢包图中每个非零桶都会显示圆点。
                </p>
              </div>
              <div class="flex rounded-md bg-muted/70 p-0.5">
                <button type="button" class="h-7 rounded px-2 text-xs" :class="trendMetric === 'latency' && 'bg-background text-emerald-700 shadow-sm dark:text-emerald-400'" @click="trendMetric = 'latency'">
                  延迟
                </button>
                <button type="button" class="h-7 rounded px-2 text-xs" :class="trendMetric === 'loss' && 'bg-background text-emerald-700 shadow-sm dark:text-emerald-400'" @click="trendMetric = 'loss'">
                  丢包
                </button>
              </div>
              <Button variant="outline" size="sm" :disabled="trendLoading" @click="fetchTrend(isTrendLoaded)">
                <Icon :icon="isTrendLoaded ? 'lucide:refresh-cw' : 'lucide:chart-spline'" :class="trendLoading && 'animate-spin'" />
                {{ isTrendLoaded ? '刷新趋势' : '加载趋势' }}
              </Button>
            </div>
            <div v-if="trendError" class="mt-4 rounded-md bg-red-500/10 px-3 py-4 text-center text-xs text-red-600">
              {{ trendError }}
            </div>
            <div v-else-if="!isTrendLoaded && !trendLoading" class="mt-4 flex h-72 flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <Icon icon="lucide:chart-no-axes-combined" :width="28" :height="28" class="mb-2 opacity-40" />
              点击“加载趋势”后才会请求当前任务的图表数据
            </div>
            <div v-else class="mt-2 h-88 min-w-0">
              <VChart :option="trendChartOption" autoresize />
            </div>
          </section>

          <section
            class="min-w-0 flex-col rounded-md bg-background/70 p-3 md:flex"
            :class="mobileSection === 'details' ? 'flex' : 'hidden'"
          >
            <div class="mb-3">
              <h2 class="text-sm font-semibold">
                指标明细
              </h2>
              <p class="mt-1 text-[11px] text-muted-foreground">
                丢包次数来自完整聚合计数，不是从图表采样点推算。
              </p>
            </div>
            <div class="overflow-x-auto">
              <table class="w-full min-w-[780px] border-collapse text-left text-xs">
                <thead>
                  <tr class="border-b border-border text-muted-foreground">
                    <th class="px-2 py-2 font-medium">
                      节点
                    </th>
                    <th class="px-2 py-2 font-medium">
                      评分
                    </th>
                    <th class="px-2 py-2 font-medium">
                      P50
                    </th>
                    <th class="px-2 py-2 font-medium">
                      P95
                    </th>
                    <th class="px-2 py-2 font-medium">
                      波动率
                    </th>
                    <th class="px-2 py-2 font-medium">
                      丢包
                    </th>
                    <th class="px-2 py-2 font-medium">
                      丢包次数
                    </th>
                    <th class="px-2 py-2 font-medium">
                      覆盖率
                    </th>
                    <th class="px-2 py-2 font-medium">
                      样本数
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="node in sortedNodes" :key="node.uuid" class="border-b border-border/60 last:border-0">
                    <td class="max-w-56 px-2 py-2.5">
                      <div class="truncate font-medium" :title="node.name">
                        {{ node.name }}
                      </div>
                      <div v-if="node.unranked_reason" class="mt-0.5 truncate text-[10px] text-amber-700 dark:text-amber-400" :title="node.unranked_reason">
                        {{ node.unranked_reason }}
                      </div>
                    </td>
                    <td class="px-2 py-2.5 font-semibold tabular-nums">
                      {{ scoreText(node) }}
                    </td>
                    <td class="px-2 py-2.5 tabular-nums">
                      {{ node.p50 === null ? '--' : `${node.p50.toFixed(1)} ms` }}
                    </td>
                    <td class="px-2 py-2.5 tabular-nums">
                      {{ node.p95 === null ? '--' : `${node.p95.toFixed(1)} ms` }}
                    </td>
                    <td class="px-2 py-2.5 tabular-nums">
                      {{ node.volatility === null ? '--' : node.volatility.toFixed(3) }}
                    </td>
                    <td class="px-2 py-2.5 tabular-nums">
                      {{ nodeLossText(node) }}
                    </td>
                    <td class="px-2 py-2.5 tabular-nums">
                      {{ node.loss_count.toLocaleString() }}
                    </td>
                    <td class="px-2 py-2.5 tabular-nums">
                      {{ formatCoverage(node.coverage_percent) }}
                    </td>
                    <td class="px-2 py-2.5 tabular-nums">
                      {{ node.samples.toLocaleString() }} / {{ node.expected_samples.toLocaleString() }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section class="rounded-md border border-border/70 bg-background/55 p-3 text-xs leading-6 text-muted-foreground">
          <h2 class="text-sm font-semibold text-foreground">
            评分怎么理解
          </h2>
          <p class="mt-1">
            “同任务网络质量对比指数”由丢包、P50、P95、波动和数据覆盖率组成。延迟采用当前任务内的稳健相对比较，波动按固定比例尺度评分，丢包使用固定惩罚；不同目标、不同运营商或不同协议之间的分数不能直接横向比较。
          </p>
          <p class="mt-1">
            当前权重：丢包 {{ windowData?.scoring.weights.loss }}%、P50 {{ windowData?.scoring.weights.p50 }}%、P95 {{ windowData?.scoring.weights.p95 }}%、波动 {{ windowData?.scoring.weights.volatility }}%、覆盖率 {{ windowData?.scoring.weights.coverage }}%。
          </p>
        </section>
      </template>
    </Spinner>
  </div>
</template>
