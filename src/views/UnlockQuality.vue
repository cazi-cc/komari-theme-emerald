<script setup lang="ts">
import type {
  UnlockQualityPublicTask,
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

const router = useRouter()
const appStore = useAppStore()
const tasks = ref<UnlockQualityPublicTask[]>([])
const snapshot = ref<UnlockQualitySnapshot | null>(null)
const selectedTaskId = ref<number | null>(null)
const selectedHours = ref(appStore.themeSettings.unlockQualityDefaultHours)
const activeSection = ref<ViewSection>('ranking')
const trendMetric = ref<TrendMetric>('p50')
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
const validNodes = computed(() => sortedNodes.value.filter(node => node.score !== null).length)
const availableNodes = computed(() => sortedNodes.value.filter(node => node.system.status === 'available').length)
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

function exitLabel(node: UnlockQualitySnapshotNode): string {
  const values = [
    node.system.exit_country && `出口 ${node.system.exit_country}`,
    node.system.edge_colo && `Cloudflare ${node.system.edge_colo}`,
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
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'ChatGPT 解锁质量快照读取失败'
  }
  finally {
    loading.value = false
  }
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
    data: sortedNodes.value
      .filter(node => node.system.samples_sent > 0)
      .map((node, index) => ({
        name: node.name,
        remark: node.public_remark ?? '',
        p95: node.system.ttfb_p95_ms,
        status: node.system.status,
        value: [node.system.ttfb_p50_ms, node.system.failure_percent],
        itemStyle: { color: nodeColor(index) },
      })),
  }],
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
    series: sortedNodes.value.map((node, index) => ({
      name: node.name,
      type: 'line',
      showSymbol: false,
      connectNulls: false,
      sampling: 'lttb',
      lineStyle: { width: 2, color: nodeColor(index) },
      itemStyle: { color: nodeColor(index) },
      data: node.system.trend.map((point) => {
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
            使用节点实际系统 DNS 发起 HTTPS 请求，评估完整解锁链路
          </p>
        </div>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="刷新快照" :disabled="loading" @click="loadData(true)">
        <Icon icon="lucide:refresh-cw" width="18" height="18" :class="{ 'animate-spin': loading }" />
      </Button>
    </div>

    <section class="mb-5 grid gap-4 rounded-md border bg-card/90 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
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
    </section>

    <div v-if="loading" class="flex min-h-[360px] items-center justify-center">
      <Spinner class="size-6" />
    </div>
    <div v-else-if="error" class="rounded-md border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
      {{ error }}
    </div>
    <Empty v-else-if="!selectedTask || !snapshot" title="尚无解锁质量数据" description="请先在后台启用任务，并等待服务端生成第一份快照。" />

    <template v-else>
      <div class="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span class="inline-flex items-center gap-1">
          <Icon icon="lucide:database" width="14" height="14" />
          后台快照 {{ generatedText }}
        </span>
        <span>每 60 秒轻量检测，完整验证按后台任务设置执行</span>
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
            {{ formatUnlockQualityScore(bestNode?.score ?? null) }}
          </p>
        </div>
        <div class="rounded-md border bg-card p-4">
          <p class="text-xs text-muted-foreground">
            当前完整可用
          </p>
          <p class="mt-1 text-2xl font-semibold">
            {{ availableNodes }}
          </p>
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
              解锁 40%、HTTPS 成功 25%、TTFB 20%、连接与 TLS 10%、稳定性 5%。
            </p>
          </div>
          <div class="space-y-2">
            <div
              v-for="node in sortedNodes"
              :key="node.uuid"
              class="grid min-h-[84px] grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-3 rounded-md border px-3 py-2"
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
                  TTFB {{ node.system.ttfb_p50_ms.toFixed(0) }} / {{ node.system.ttfb_p95_ms.toFixed(0) }}ms · 失败 {{ formatUnlockQualityPercent(node.system.failure_percent) }}
                </p>
                <p class="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {{ exitLabel(node) }}
                </p>
              </div>
              <div class="text-right">
                <p class="text-lg font-semibold tabular-nums">
                  {{ formatUnlockQualityScore(node.score) }}
                </p>
                <Badge :class="gradeClass(node.grade)" class="border-0">
                  {{ node.grade }}
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
          <VChart class="h-[410px] w-full" autoresize :option="distributionChartOption" />
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
          <VChart class="h-[420px] w-full" autoresize :option="trendChartOption" />
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
              class="grid gap-3 rounded-md border px-3 py-3 sm:grid-cols-[minmax(160px,1.4fr)_repeat(5,minmax(76px,1fr))]"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">
                  {{ node.name }}
                </p>
                <p v-if="node.public_remark" class="truncate text-xs text-muted-foreground">
                  {{ node.public_remark }}
                </p>
                <span class="mt-1 inline-flex rounded px-2 py-0.5 text-xs" :class="statusClass(node.system.status)">
                  {{ unlockQualityStatusLabel(node.system.status) }}
                </span>
              </div>
              <div>
                <p class="text-[11px] text-muted-foreground">
                  TTFB P50 / P95
                </p>
                <p class="mt-1 text-sm font-medium tabular-nums">
                  {{ node.system.ttfb_p50_ms.toFixed(0) }} / {{ node.system.ttfb_p95_ms.toFixed(0) }} ms
                </p>
              </div>
              <div>
                <p class="text-[11px] text-muted-foreground">
                  DNS / 建连
                </p>
                <p class="mt-1 text-sm font-medium tabular-nums">
                  {{ node.system.dns_ms.toFixed(0) }} / {{ node.system.connect_ms.toFixed(0) }} ms
                </p>
              </div>
              <div>
                <p class="text-[11px] text-muted-foreground">
                  TLS / 总耗时
                </p>
                <p class="mt-1 text-sm font-medium tabular-nums">
                  {{ node.system.tls_ms.toFixed(0) }} / {{ node.system.total_p50_ms.toFixed(0) }} ms
                </p>
              </div>
              <div>
                <p class="text-[11px] text-muted-foreground">
                  失败 / 覆盖
                </p>
                <p class="mt-1 text-sm font-medium tabular-nums">
                  {{ formatUnlockQualityPercent(node.system.failure_percent) }} / {{ formatUnlockQualityPercent(node.system.coverage_percent) }}
                </p>
              </div>
              <div>
                <p class="text-[11px] text-muted-foreground">
                  系统 DNS 相对改善
                </p>
                <p class="mt-1 text-sm font-medium tabular-nums">
                  {{ node.improvement_score === undefined ? '--' : `${node.improvement_score > 0 ? '+' : ''}${node.improvement_score.toFixed(1)}` }}
                </p>
              </div>
            </article>
          </div>
        </section>
      </div>
    </template>
  </main>
</template>
