<script setup lang="ts">
import type { NetworkComparisonManifest, NetworkComparisonWindow } from '@/utils/networkComparison'
import type { EstimatedUnlockPath } from '@/utils/unlockPathQuality'
import type {
  UnlockQualityPublicTask,
  UnlockQualityRouteSummary,
  UnlockQualitySnapshot,
  UnlockQualitySnapshotNode,
  UnlockQualityStatus,
} from '@/utils/unlockQuality'
import { Icon } from '@iconify/vue'
import dayjs from 'dayjs'
import { computed, onMounted, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import { useRouter } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Empty } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppStore } from '@/stores/app'
import { loadNetworkComparisonManifest, loadNetworkComparisonWindow } from '@/utils/networkComparison'
import { buildEstimatedUnlockPaths } from '@/utils/unlockPathQuality'
import {
  formatUnlockQualityPercent,
  formatUnlockQualityScore,
  loadUnlockQualitySnapshot,
  loadUnlockQualityTasks,
  unlockQualityStatusLabel,
} from '@/utils/unlockQuality'
import '@/utils/echarts'

type ViewSection = 'ranking' | 'distribution' | 'trend' | 'details'
type TrendMetric = 'p50' | 'p95' | 'min' | 'max' | 'failure'
type AnalysisMode = 'direct' | 'path'

interface RouteNodeEntry {
  node: UnlockQualitySnapshotNode
  route: UnlockQualityRouteSummary | null
  rank: number | null
}

const router = useRouter()
const appStore = useAppStore()
const tasks = ref<UnlockQualityPublicTask[]>([])
const snapshot = ref<UnlockQualitySnapshot | null>(null)
const selectedTaskId = ref<number | null>(null)
const selectedHours = ref(appStore.themeSettings.unlockQualityDefaultHours)
const activeSection = ref<ViewSection>('ranking')
const trendMetric = ref<TrendMetric>('p50')
const analysisMode = ref<AnalysisMode>('direct')
const pathManifest = ref<NetworkComparisonManifest | null>(null)
const pathWindow = ref<NetworkComparisonWindow | null>(null)
const selectedEntryUUID = ref('')
const pathLoading = ref(false)
const pathError = ref('')
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
const trendMetricOptions: Array<{ value: TrendMetric, label: string }> = [
  { value: 'p50', label: 'P50' },
  { value: 'p95', label: 'P95' },
  { value: 'min', label: '最小' },
  { value: 'max', label: '最大' },
  { value: 'failure', label: '失败率' },
]
const chartColors = ['#059669', '#2563EB', '#F97316', '#DB2777', '#7C3AED', '#0891B2', '#65A30D', '#DC2626']

const selectedTask = computed(() => tasks.value.find(task => task.id === selectedTaskId.value) ?? null)
const routeEntries = computed<RouteNodeEntry[]>(() => {
  const entries = (snapshot.value?.nodes ?? []).map(node => ({
    node,
    route: node.system,
    rank: null as number | null,
  }))
  entries.sort((left, right) => {
    if (left.route?.score !== null && left.route?.score !== undefined && right.route?.score !== null && right.route?.score !== undefined)
      return right.route.score - left.route.score
    if (left.route?.score !== null && left.route?.score !== undefined)
      return -1
    if (right.route?.score !== null && right.route?.score !== undefined)
      return 1
    return left.node.name.localeCompare(right.node.name, 'zh-CN')
  })
  let rank = 0
  for (const entry of entries) {
    if (entry.route?.score === null || entry.route?.score === undefined)
      continue
    rank += 1
    entry.rank = rank
  }
  return entries
})
const sortedNodes = computed(() => routeEntries.value.map(entry => entry.node))
const bestEntry = computed(() => routeEntries.value.find(entry => entry.rank === 1) ?? null)
const bestNode = computed(() => bestEntry.value?.node ?? null)
const validNodes = computed(() => routeEntries.value.filter(entry => entry.route?.score !== null && entry.route?.score !== undefined).length)
const availableNodes = computed(() => routeEntries.value.filter(entry => entry.route?.status === 'available').length)
const entryOptions = computed(() => {
  if (!snapshot.value || !pathWindow.value)
    return []
  const taskIDs = new Set(snapshot.value.path_bindings.map(binding => binding.ping_task_id))
  const entries = new Map<string, { uuid: string, name: string }>()
  for (const task of pathWindow.value.tasks) {
    if (!taskIDs.has(task.id))
      continue
    for (const node of task.nodes) {
      if (node.p50 !== null && !entries.has(node.uuid))
        entries.set(node.uuid, { uuid: node.uuid, name: node.name })
    }
  }
  return [...entries.values()].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'))
})
const estimatedPaths = computed<EstimatedUnlockPath[]>(() => {
  if (!snapshot.value || !pathWindow.value)
    return []
  return buildEstimatedUnlockPaths(selectedEntryUUID.value, snapshot.value, pathWindow.value)
})
const bestEstimatedPath = computed(() => estimatedPaths.value.find(path => path.score !== null) ?? null)
const generatedText = computed(() => snapshot.value?.generated_at ? dayjs(snapshot.value.generated_at).format('MM-DD HH:mm:ss') : '--')
const chartTextColor = computed(() => appStore.isDark ? 'rgba(255,255,255,.68)' : 'rgba(15,23,42,.66)')
const chartSplitColor = computed(() => appStore.isDark ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.08)')

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#039;')
}

function nodeColor(index: number): string {
  return chartColors[index % chartColors.length] ?? '#059669'
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

function statusClass(status: UnlockQualityStatus): string {
  if (status === 'available')
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
  if (status === 'partial')
    return 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
  if (status === 'region_limited' || status === 'unavailable')
    return 'bg-red-500/10 text-red-700 dark:text-red-400'
  return 'bg-muted text-muted-foreground'
}

function exitLabel(route: UnlockQualityRouteSummary | null): string {
  if (!route)
    return '出口信息待检测'
  const values = [
    route.exit_country && `出口 ${route.exit_country}`,
    route.edge_colo && `Cloudflare ${route.edge_colo}`,
  ].filter(Boolean)
  return values.join(' · ') || '出口信息待检测'
}

async function loadData(force = false): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    tasks.value = await loadUnlockQualityTasks(force)
    if (!tasks.value.some(task => task.id === selectedTaskId.value))
      selectedTaskId.value = tasks.value[0]?.id ?? null
    if (selectedTaskId.value !== null)
      snapshot.value = await loadUnlockQualitySnapshot(selectedTaskId.value, selectedHours.value, force)
    else
      snapshot.value = null
    if (analysisMode.value === 'path')
      await loadPathData(force)
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'ChatGPT 解锁质量快照读取失败'
  }
  finally {
    loading.value = false
  }
}

watch([selectedTaskId, selectedHours], async ([taskId], [oldTaskId]) => {
  if (taskId === null)
    return
  if (taskId === oldTaskId && loading.value)
    return
  loading.value = true
  error.value = ''
  try {
    snapshot.value = await loadUnlockQualitySnapshot(taskId, selectedHours.value)
    if (analysisMode.value === 'path')
      await loadPathData()
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'ChatGPT 解锁质量快照读取失败'
  }
  finally {
    loading.value = false
  }
})

async function loadPathData(force = false): Promise<void> {
  if (!snapshot.value)
    return
  pathLoading.value = true
  pathError.value = ''
  try {
    if (!pathManifest.value || force)
      pathManifest.value = await loadNetworkComparisonManifest(force)
    pathWindow.value = await loadNetworkComparisonWindow(pathManifest.value, selectedHours.value, force)
    if (!entryOptions.value.some(entry => entry.uuid === selectedEntryUUID.value))
      selectedEntryUUID.value = entryOptions.value[0]?.uuid ?? ''
  }
  catch (cause) {
    pathError.value = cause instanceof Error ? cause.message : '组合线路快照读取失败'
    pathWindow.value = null
  }
  finally {
    pathLoading.value = false
  }
}

watch(analysisMode, async (mode) => {
  if (mode === 'path')
    await loadPathData()
})

const distributionChartOption = computed(() => ({
  animationDuration: appStore.disablePageAnimation ? 0 : 350,
  tooltip: {
    trigger: 'item',
    confine: true,
    formatter: (params: unknown) => {
      const data = (params as { data?: { value?: [number, number], name?: string, remark?: string, p95?: number, status?: UnlockQualityStatus } }).data
      if (!data?.value)
        return ''
      const remark = data.remark ? `<br/><span style="opacity:.72">${escapeHtml(data.remark)}</span>` : ''
      return `<strong>${escapeHtml(data.name ?? '')}</strong>${remark}<br/>${unlockQualityStatusLabel(data.status ?? 'unknown')}<br/>TTFB P50 ${data.value[0].toFixed(0)} ms<br/>TTFB P95 ${Number(data.p95 ?? 0).toFixed(0)} ms<br/>HTTPS 失败 ${formatUnlockQualityPercent(data.value[1])}`
    },
  },
  grid: { left: 58, right: 22, top: 28, bottom: 50 },
  xAxis: {
    type: 'value',
    name: 'TTFB P50 (ms)',
    nameLocation: 'middle',
    nameGap: 32,
    min: 0,
    axisLabel: { color: chartTextColor.value },
    splitLine: { lineStyle: { color: chartSplitColor.value } },
  },
  yAxis: {
    type: 'value',
    name: 'HTTPS 失败 (%)',
    min: 0,
    axisLabel: { color: chartTextColor.value, formatter: '{value}%' },
    splitLine: { lineStyle: { color: chartSplitColor.value } },
  },
  series: [{
    type: 'scatter',
    symbolSize: 18,
    data: routeEntries.value
      .filter(entry => (entry.route?.samples_sent ?? 0) > 0)
      .map((entry, index) => ({
        name: entry.node.name,
        remark: entry.node.public_remark ?? '',
        p95: entry.route?.ttfb_p95_ms ?? 0,
        status: entry.route?.status ?? 'unknown',
        value: [entry.route?.ttfb_p50_ms ?? 0, entry.route?.failure_percent ?? 0],
        itemStyle: { color: nodeColor(index) },
      })),
  }],
}))

const pathDistributionChartOption = computed(() => ({
  animationDuration: appStore.disablePageAnimation ? 0 : 350,
  tooltip: {
    trigger: 'item',
    confine: true,
    formatter: (params: unknown) => {
      const data = (params as { data?: { value?: [number, number], path?: EstimatedUnlockPath } }).data
      if (!data?.value || !data.path)
        return ''
      const path = data.path
      const remark = path.exit_remark ? `<br/><span style="opacity:.72">${escapeHtml(path.exit_remark)}</span>` : ''
      return `<strong>${escapeHtml(path.exit_name)}</strong>${remark}<br/>经 IPv${path.family} · ${escapeHtml(path.ping_task_name)}<br/>估算 P50 / P95 ${path.estimated_p50_ms.toFixed(0)} / ${path.estimated_p95_ms.toFixed(0)} ms<br/>估算失败 ${formatUnlockQualityPercent(path.estimated_failure_percent)}<br/>组合评分 ${formatUnlockQualityScore(path.score)}`
    },
  },
  grid: { left: 58, right: 22, top: 28, bottom: 50 },
  xAxis: {
    type: 'value',
    name: '估算 P50 (ms)',
    nameLocation: 'middle',
    nameGap: 32,
    min: 0,
    axisLabel: { color: chartTextColor.value },
    splitLine: { lineStyle: { color: chartSplitColor.value } },
  },
  yAxis: {
    type: 'value',
    name: '估算失败 (%)',
    min: 0,
    axisLabel: { color: chartTextColor.value, formatter: '{value}%' },
    splitLine: { lineStyle: { color: chartSplitColor.value } },
  },
  series: [{
    type: 'scatter',
    symbolSize: 18,
    data: estimatedPaths.value.map((path, index) => ({
      value: [path.estimated_p50_ms, path.estimated_failure_percent],
      path,
      itemStyle: { color: nodeColor(index) },
    })),
  }],
}))

const pathLatencyChartOption = computed(() => ({
  animationDuration: appStore.disablePageAnimation ? 0 : 350,
  tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, confine: true },
  legend: { top: 0, textStyle: { color: chartTextColor.value } },
  grid: { left: 130, right: 24, top: 42, bottom: 34 },
  xAxis: {
    type: 'value',
    name: '估算耗时 (ms)',
    axisLabel: { color: chartTextColor.value },
    splitLine: { lineStyle: { color: chartSplitColor.value } },
  },
  yAxis: {
    type: 'category',
    data: estimatedPaths.value.map(path => path.exit_name),
    axisLabel: { color: chartTextColor.value, width: 110, overflow: 'truncate' },
  },
  series: [
    {
      name: '入口到落地 P50',
      type: 'bar',
      stack: 'latency',
      data: estimatedPaths.value.map(path => path.link.p50 ?? 0),
      itemStyle: { color: '#2563EB' },
    },
    {
      name: '落地到 ChatGPT TTFB',
      type: 'bar',
      stack: 'latency',
      data: estimatedPaths.value.map(path => path.unlock.system.ttfb_p50_ms),
      itemStyle: { color: '#059669' },
    },
  ],
}))

const trendChartOption = computed(() => {
  const metric = trendMetric.value
  const isFailure = metric === 'failure'
  return {
    animationDuration: appStore.disablePageAnimation ? 0 : 350,
    tooltip: { trigger: 'axis', confine: true },
    legend: { top: 0, type: 'scroll', textStyle: { color: chartTextColor.value } },
    grid: { left: 58, right: 20, top: 48, bottom: 46 },
    xAxis: {
      type: 'time',
      axisLabel: { color: chartTextColor.value },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      name: isFailure ? '失败 (%)' : 'TTFB (ms)',
      min: 0,
      axisLabel: { color: chartTextColor.value, formatter: isFailure ? '{value}%' : '{value}' },
      splitLine: { lineStyle: { color: chartSplitColor.value } },
    },
    series: routeEntries.value.filter(entry => entry.route).map((entry, index) => ({
      name: entry.node.name,
      type: 'line',
      showSymbol: false,
      connectNulls: false,
      sampling: 'lttb',
      lineStyle: { width: 2, color: nodeColor(index) },
      itemStyle: { color: nodeColor(index) },
      data: (entry.route?.trend ?? []).map((point) => {
        const value = metric === 'failure'
          ? (point.samples_sent ? point.failure_count * 100 / point.samples_sent : 0)
          : metric === 'p95'
            ? point.ttfb_p95_ms
            : metric === 'min'
              ? point.ttfb_min_ms
              : metric === 'max'
                ? point.ttfb_max_ms
                : point.ttfb_p50_ms
        return [point.time, Number(value.toFixed(2))]
      }),
    })),
  }
})

onMounted(() => loadData())
</script>

<template>
  <main class="mx-auto w-full max-w-[1280px] px-4 pb-10">
    <div class="mb-4 flex items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <Button variant="ghost" size="icon-sm" aria-label="返回首页" @click="router.push('/')">
          <Icon icon="lucide:arrow-left" width="18" height="18" />
        </Button>
        <div class="min-w-0">
          <h1 class="text-xl font-semibold">
            ChatGPT 解锁线路
          </h1>
          <p class="text-sm text-muted-foreground">
            查看节点直连质量，并估算不同入口与落地节点组合后的链式代理体验
          </p>
        </div>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="刷新快照" :disabled="loading" @click="loadData(true)">
        <Icon icon="lucide:refresh-cw" width="18" height="18" :class="{ 'animate-spin': loading }" />
      </Button>
    </div>

    <section class="mb-5 grid gap-4 rounded-md border bg-card/90 p-4 md:grid-cols-[minmax(0,1fr)_auto_auto]">
      <label class="min-w-0">
        <span class="mb-1.5 block text-xs text-muted-foreground">解锁质量任务</span>
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
      <div>
        <span class="mb-1.5 block text-xs text-muted-foreground">分析方式</span>
        <Tabs v-model="analysisMode">
          <TabsList>
            <TabsTrigger value="direct">
              节点直连
            </TabsTrigger>
            <TabsTrigger value="path">
              链式代理估算
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
    <Empty v-else-if="!selectedTask || !snapshot" title="尚无解锁质量数据" description="请先在后台启用任务，并等待服务端生成第一份快照。" />

    <template v-else-if="analysisMode === 'path'">
      <div v-if="pathLoading" class="flex min-h-[360px] items-center justify-center">
        <Spinner class="size-6" />
      </div>
      <div v-else-if="pathError" class="rounded-md border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
        {{ pathError }}
      </div>
      <Empty
        v-else-if="entryOptions.length === 0 || estimatedPaths.length === 0"
        title="尚无可组合线路"
        description="需要至少一个指向落地节点的现有 ICMP 延迟任务，以及该落地节点的 ChatGPT 检测数据。"
      />
      <template v-else>
        <section class="mb-4 grid gap-4 border-y bg-muted/25 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label class="min-w-0">
            <span class="mb-1.5 block text-xs text-muted-foreground">入口节点</span>
            <select
              v-model="selectedEntryUUID"
              class="h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            >
              <option v-for="entry in entryOptions" :key="entry.uuid" :value="entry.uuid">
                {{ entry.name }}
              </option>
            </select>
          </label>
          <p class="text-xs leading-5 text-muted-foreground md:max-w-[520px]">
            入口节点是用户流量首先连接的服务器；落地节点是最终连接 ChatGPT 的出口服务器。这里只复用既有快照进行估算，不会让 Agent 增加探测。
          </p>
        </section>

        <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span class="inline-flex items-center gap-1">
            <Icon icon="lucide:database" width="14" height="14" />
            后台快照 {{ generatedText }}
          </span>
          <span>估算链路：入口节点 → 落地节点（出口节点）→ ChatGPT</span>
          <span>访问本页不会发起探测</span>
        </div>

        <section class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div class="rounded-md border bg-card p-4">
            <p class="text-xs text-muted-foreground">
              可比较落地节点
            </p>
            <p class="mt-1 text-2xl font-semibold">
              {{ estimatedPaths.length }}
            </p>
          </div>
          <div class="rounded-md border bg-card p-4">
            <p class="text-xs text-muted-foreground">
              当前最佳落地
            </p>
            <p class="mt-1 truncate text-base font-semibold">
              {{ bestEstimatedPath?.exit_name ?? '--' }}
            </p>
          </div>
          <div class="rounded-md border bg-card p-4">
            <p class="text-xs text-muted-foreground">
              最佳组合评分
            </p>
            <p class="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
              {{ formatUnlockQualityScore(bestEstimatedPath?.score ?? null) }}
            </p>
          </div>
          <div class="rounded-md border bg-card p-4">
            <p class="text-xs text-muted-foreground">
              最佳估算 P50
            </p>
            <p class="mt-1 text-2xl font-semibold">
              {{ bestEstimatedPath ? `${bestEstimatedPath.estimated_p50_ms.toFixed(0)} ms` : '--' }}
            </p>
          </div>
        </section>

        <section class="mb-5 border-y bg-muted/25 px-4 py-3">
          <div class="mb-2 flex items-center gap-2">
            <Icon icon="lucide:calculator" width="16" height="16" class="text-emerald-600 dark:text-emerald-400" />
            <h2 class="text-sm font-semibold">
              估算方法
            </h2>
          </div>
          <div class="grid gap-x-6 gap-y-2 text-xs leading-5 text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
            <p><strong class="text-foreground">估算延迟：</strong>入口到落地的 P50/P95，加上落地访问 ChatGPT 的 TTFB。</p>
            <p><strong class="text-foreground">估算失败：</strong>按两段链路任意一段失败的联合概率计算，不直接相加百分比。</p>
            <p><strong class="text-foreground">组合评分：</strong>入口到落地占 35%，落地到 ChatGPT 占 65%，并限制不能掩盖明显短板。</p>
            <p><strong class="text-foreground">协议选择：</strong>同一落地节点同时有 IPv4/IPv6 时，自动采用当前质量更好的有效线路。</p>
            <p><strong class="text-foreground">适用范围：</strong>用于快速比较落地节点，不等同于真实代理软件的完整会话测试。</p>
            <p><strong class="text-foreground">资源影响：</strong>只读取服务器定期生成的固定快照，Agent CPU、内存和请求数均不增加。</p>
          </div>
        </section>

        <div class="grid gap-5 md:grid-cols-2">
          <section class="rounded-md border bg-card p-4">
            <div class="mb-3">
              <h2 class="font-semibold">
                落地节点排名
              </h2>
              <p class="text-xs text-muted-foreground">
                比较同一个入口节点搭配不同落地节点后的估算体验。
              </p>
            </div>
            <div class="space-y-2">
              <div
                v-for="(path, index) in estimatedPaths"
                :key="path.exit_uuid"
                class="grid min-h-[92px] grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2"
              >
                <span class="text-center font-semibold text-emerald-600 dark:text-emerald-400">{{ index + 1 }}</span>
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">
                    {{ path.exit_name }}
                  </p>
                  <p v-if="path.exit_remark" class="truncate text-xs text-muted-foreground">
                    {{ path.exit_remark }}
                  </p>
                  <p class="mt-1 text-xs text-muted-foreground">
                    估算 P50 {{ path.estimated_p50_ms.toFixed(0) }}ms · P95 {{ path.estimated_p95_ms.toFixed(0) }}ms · 失败 {{ formatUnlockQualityPercent(path.estimated_failure_percent) }}
                  </p>
                  <p class="mt-0.5 truncate text-[11px] text-muted-foreground">
                    经 IPv{{ path.family }} · {{ path.ping_task_name }} · {{ exitLabel(path.unlock.system) }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="text-lg font-semibold tabular-nums">
                    {{ formatUnlockQualityScore(path.score) }}
                  </p>
                  <Badge :class="gradeClass(path.grade)" class="border-0">
                    {{ path.grade }}
                  </Badge>
                </div>
              </div>
            </div>
          </section>

          <section class="rounded-md border bg-card p-4">
            <div class="mb-3">
              <h2 class="font-semibold">
                估算延迟 / 失败分布
              </h2>
              <p class="text-xs text-muted-foreground">
                越靠左下角越好；悬停可查看采用的协议和任务。
              </p>
            </div>
            <div class="quality-chart">
              <VChart class="size-full" autoresize :option="pathDistributionChartOption" />
            </div>
          </section>

          <section class="rounded-md border bg-card p-4 md:col-span-2">
            <div class="mb-3">
              <h2 class="font-semibold">
                P50 延迟构成
              </h2>
              <p class="text-xs text-muted-foreground">
                蓝色是入口到落地，绿色是落地到 ChatGPT；堆叠长度为估算总耗时。
              </p>
            </div>
            <div class="quality-chart">
              <VChart class="size-full" autoresize :option="pathLatencyChartOption" />
            </div>
          </section>
        </div>
      </template>
    </template>

    <template v-else>
      <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span class="inline-flex items-center gap-1">
          <Icon icon="lucide:database" width="14" height="14" />
          后台快照 {{ generatedText }}
        </span>
        <span>使用节点系统网络与系统 DNS 发起真实 HTTPS 请求</span>
        <span>访问本页不会发起探测</span>
      </div>

      <section class="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div class="rounded-md border bg-card p-4">
          <p class="text-xs text-muted-foreground">
            有效评分节点
          </p>
          <p class="mt-1 text-2xl font-semibold">
            {{ validNodes }}<span class="text-sm text-muted-foreground"> / {{ snapshot.nodes.length }}</span>
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
            最佳评分
          </p>
          <p class="mt-1 text-2xl font-semibold text-emerald-600 dark:text-emerald-400">
            {{ formatUnlockQualityScore(bestEntry?.route?.score ?? null) }}
          </p>
        </div>
        <div class="rounded-md border bg-card p-4">
          <p class="text-xs text-muted-foreground">
            系统线路可用
          </p>
          <p class="mt-1 text-2xl font-semibold">
            {{ availableNodes }}
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
          <p><strong class="text-foreground">地区可用：</strong>服务确认该出口地区没有被限制；不代表已经登录账号。</p>
          <p><strong class="text-foreground">TTFB：</strong>发出请求到收到第一个字节的时间，越低越快。</p>
          <p><strong class="text-foreground">P50 / P95：</strong>一半请求不超过 P50；95% 请求不超过 P95，P95 更能反映偶发卡顿。</p>
          <p><strong class="text-foreground">HTTPS 失败：</strong>超时、断线或 TLS 失败；正常返回的 401、403、404 不算网络失败。</p>
          <p><strong class="text-foreground">DNS / 建连 / TLS：</strong>分别是查地址、建立 TCP 连接和完成加密握手的耗时。</p>
          <p><strong class="text-foreground">覆盖率：</strong>实际采样占应采样的比例；低于 80% 时暂不评分，避免数据太少误导。</p>
          <p><strong class="text-foreground">链式代理：</strong>切换到“链式代理估算”，可选择入口节点并比较不同落地节点。</p>
        </div>
      </section>

      <Tabs v-model="activeSection" class="mb-4 md:hidden">
        <TabsList class="grid w-full grid-cols-4">
          <TabsTrigger value="ranking">
            排名
          </TabsTrigger>
          <TabsTrigger value="distribution">
            分布
          </TabsTrigger>
          <TabsTrigger value="trend">
            趋势
          </TabsTrigger>
          <TabsTrigger value="details">
            明细
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div class="grid gap-5 md:grid-cols-2">
        <section class="rounded-md border bg-card p-4 md:block" :class="[activeSection === 'ranking' ? 'block' : 'hidden']">
          <div class="mb-3">
            <h2 class="font-semibold">
              节点排名
            </h2>
            <p class="text-xs text-muted-foreground">
              地区可用 40%、请求成功 25%、TTFB 20%、连接与 TLS 10%、稳定性 5%。
            </p>
          </div>
          <div class="space-y-2">
            <div
              v-for="entry in routeEntries"
              :key="entry.node.uuid"
              class="grid min-h-[84px] grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2"
            >
              <span class="text-center font-semibold" :class="entry.rank ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'">
                {{ entry.rank ?? '–' }}
              </span>
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">
                  {{ entry.node.name }}
                </p>
                <p v-if="entry.node.public_remark" class="truncate text-xs text-muted-foreground">
                  {{ entry.node.public_remark }}
                </p>
                <p v-if="entry.route" class="mt-1 text-xs text-muted-foreground">
                  {{ unlockQualityStatusLabel(entry.route.status) }} · TTFB {{ entry.route.ttfb_p50_ms.toFixed(0) }} / {{ entry.route.ttfb_p95_ms.toFixed(0) }}ms · 失败 {{ formatUnlockQualityPercent(entry.route.failure_percent) }}
                </p>
                <p class="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {{ exitLabel(entry.route) }}
                </p>
              </div>
              <div class="text-right">
                <p class="text-lg font-semibold tabular-nums">
                  {{ formatUnlockQualityScore(entry.route?.score ?? null) }}
                </p>
                <Badge :class="gradeClass(entry.route?.grade ?? '未评级')" class="border-0">
                  {{ entry.route?.grade ?? '未评级' }}
                </Badge>
              </div>
            </div>
          </div>
        </section>

        <section class="rounded-md border bg-card p-4 md:block" :class="[activeSection === 'distribution' ? 'block' : 'hidden']">
          <div class="mb-3">
            <h2 class="font-semibold">
              TTFB / HTTPS 失败分布
            </h2>
            <p class="text-xs text-muted-foreground">
              越靠左下角越好；悬停可查看节点名称与公开备注。
            </p>
          </div>
          <div class="quality-chart">
            <VChart class="size-full" autoresize :option="distributionChartOption" />
          </div>
        </section>

        <section class="rounded-md border bg-card p-4 md:col-span-2 md:block" :class="[activeSection === 'trend' ? 'block' : 'hidden']">
          <div class="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 class="font-semibold">
                节点趋势
              </h2>
              <p class="text-xs text-muted-foreground">
                每个时间桶保留最小值、最大值、P50、P95 和失败次数，极端波动不会被平均值抹掉。
              </p>
            </div>
            <Tabs v-model="trendMetric">
              <TabsList class="max-w-full overflow-x-auto">
                <TabsTrigger v-for="option in trendMetricOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div class="quality-chart">
            <VChart class="size-full" autoresize :option="trendChartOption" />
          </div>
        </section>

        <section class="rounded-md border bg-card p-4 md:col-span-2 md:block" :class="[activeSection === 'details' ? 'block' : 'hidden']">
          <div class="mb-3">
            <h2 class="font-semibold">
              指标明细
            </h2>
            <p class="text-xs text-muted-foreground">
              仅展示公开统计结果，不包含监测域名、目标地址、系统 DNS 或内部入口。
            </p>
          </div>
          <div class="space-y-2">
            <article
              v-for="node in sortedNodes"
              :key="node.uuid"
              class="grid gap-3 rounded-md border px-3 py-3 sm:grid-cols-[minmax(160px,1.1fr)_minmax(220px,1.6fr)_minmax(180px,1fr)]"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">
                  {{ node.name }}
                </p>
                <p v-if="node.public_remark" class="truncate text-xs text-muted-foreground">
                  {{ node.public_remark }}
                </p>
                <p class="mt-1 text-[11px] text-muted-foreground">
                  {{ exitLabel(node.system) }}
                </p>
              </div>
              <div class="rounded bg-muted/35 px-3 py-2">
                <div class="flex items-center justify-between gap-2">
                  <p class="text-xs font-medium">
                    系统线路
                  </p>
                  <span class="rounded px-1.5 py-0.5 text-[11px]" :class="statusClass(node.system.status)">{{ unlockQualityStatusLabel(node.system.status) }}</span>
                </div>
                <p class="mt-1 text-xs tabular-nums">
                  TTFB {{ node.system.ttfb_p50_ms.toFixed(0) }} / {{ node.system.ttfb_p95_ms.toFixed(0) }} ms
                </p>
                <p class="mt-1 text-[11px] text-muted-foreground tabular-nums">
                  失败 {{ formatUnlockQualityPercent(node.system.failure_percent) }} · 总耗时 {{ node.system.total_p50_ms.toFixed(0) }} ms · 得分 {{ formatUnlockQualityScore(node.system.score) }}
                </p>
              </div>
              <div>
                <p class="text-[11px] text-muted-foreground">
                  请求阶段
                </p>
                <p class="mt-1 text-xs tabular-nums">
                  DNS {{ node.system.dns_ms.toFixed(0) }} · 连接 {{ node.system.connect_ms.toFixed(0) }} · TLS {{ node.system.tls_ms.toFixed(0) }} ms
                </p>
                <p class="mt-1 text-[11px] text-muted-foreground tabular-nums">
                  覆盖率 {{ formatUnlockQualityPercent(node.system.coverage_percent) }} · 样本 {{ node.system.samples_received }} / {{ node.system.samples_sent }}
                </p>
              </div>
            </article>
          </div>
        </section>
      </div>
    </template>
  </main>
</template>
