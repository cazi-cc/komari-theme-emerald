<script setup lang="ts">
import type {
  TCPQualityPublicTask,
  TCPQualitySnapshot,
  TCPQualitySnapshotNode,
} from '@/utils/tcpQuality'
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
  formatTCPQualityLoss,
  formatTCPQualityScore,
  loadTCPQualitySnapshot,
  loadTCPQualityTasks,
} from '@/utils/tcpQuality'
import '@/utils/echarts'

type ViewSection = 'ranking' | 'distribution' | 'trend' | 'targets'
type TrendMetric = 'p50' | 'p95' | 'loss'

const router = useRouter()
const appStore = useAppStore()
const tasks = ref<TCPQualityPublicTask[]>([])
const snapshot = ref<TCPQualitySnapshot | null>(null)
const selectedTaskId = ref<number | null>(null)
const selectedHours = ref(appStore.themeSettings.tcpQualityDefaultHours)
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
const zeroLossNodes = computed(() => sortedNodes.value.filter(node => node.standard.samples_sent > 0 && node.standard.loss_percent === 0).length)
const isDark = computed(() => appStore.isDark)
const chartTextColor = computed(() => isDark.value ? 'rgba(255,255,255,.68)' : 'rgba(15,23,42,.66)')
const chartSplitColor = computed(() => isDark.value ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.08)')
const generatedText = computed(() => snapshot.value?.generated_at ? dayjs(snapshot.value.generated_at).format('MM-DD HH:mm:ss') : '--')

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

async function loadData(force = false): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    tasks.value = await loadTCPQualityTasks(force)
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
      const data = (params as { data?: { value?: [number, number], name?: string, remark?: string, p95?: number } }).data
      if (!data?.value)
        return ''
      const remark = data.remark ? `<br/><span style="opacity:.72">${escapeHtml(data.remark)}</span>` : ''
      return `<strong>${escapeHtml(data.name ?? '')}</strong>${remark}<br/>P50 ${data.value[0].toFixed(1)} ms<br/>P95 ${Number(data.p95 ?? 0).toFixed(1)} ms<br/>首次响应丢失 ${formatTCPQualityLoss(data.value[1])}`
    },
  },
  grid: { left: 58, right: 22, top: 28, bottom: 48 },
  xAxis: {
    type: 'value',
    name: 'P50 延迟 (ms)',
    nameLocation: 'middle',
    nameGap: 30,
    axisLabel: { color: chartTextColor.value },
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
        p95: node.standard.p95_ms,
        value: [node.standard.p50_ms, node.standard.loss_percent],
        itemStyle: { color: nodeColor(index) },
      })),
  }],
}))

const trendChartOption = computed(() => {
  const metric = trendMetric.value
  const isLoss = metric === 'loss'
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
      data: node.trend.map(point => [
        point.time,
        metric === 'loss' ? point.loss_percent : metric === 'p95' ? point.p95_ms : point.p50_ms,
      ]),
    })),
  }
})

function targetLabel(key: string): string {
  const target = snapshot.value?.targets.find(item => item.key === key)
  return target ? `${target.province} ${target.isp} IPv${target.ip_version}` : key
}

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
            TCP 连接质量
          </h1>
          <p class="text-sm text-muted-foreground">
            以国内省份与运营商任务为视角，对比各节点 TCP SYN 首包响应
          </p>
        </div>
      </div>
      <Button variant="ghost" size="icon-sm" aria-label="刷新快照" :disabled="loading" @click="loadData(true)">
        <Icon icon="lucide:refresh-cw" width="18" height="18" :class="{ 'animate-spin': loading }" />
      </Button>
    </div>

    <section class="mb-5 grid gap-4 rounded-md border bg-card/90 p-4 md:grid-cols-[minmax(0,1fr)_auto]">
      <label class="min-w-0">
        <span class="mb-1.5 block text-xs text-muted-foreground">TCP 质量任务</span>
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

        <section class="rounded-md border bg-card p-4 md:block" :class="[activeSection === 'ranking' ? 'block' : 'hidden']">
          <h2 class="font-semibold">
            评分构成
          </h2>
          <p class="mb-2 text-xs text-muted-foreground">
            综合网络分、TCP 质量分与 ICMP 基础分并列展示。
          </p>
          <div class="quality-chart quality-chart--score">
            <VChart class="size-full" :option="scoreChartOption" autoresize />
          </div>
        </section>

        <section class="rounded-md border bg-card p-4 md:col-span-2 md:block" :class="[activeSection === 'distribution' ? 'block' : 'hidden']">
          <h2 class="font-semibold">
            延迟 / 首包丢失分布
          </h2>
          <p class="mb-2 text-xs text-muted-foreground">
            越靠左下角越好。悬停可查看节点名称与公开备注。
          </p>
          <div class="quality-chart">
            <VChart class="size-full" :option="distributionChartOption" autoresize />
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
            <Tabs v-model="trendMetric">
              <TabsList>
                <TabsTrigger value="p50">
                  P50
                </TabsTrigger>
                <TabsTrigger value="p95">
                  P95
                </TabsTrigger>
                <TabsTrigger value="loss">
                  首包丢失
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div class="quality-chart">
            <VChart class="size-full" :option="trendChartOption" autoresize />
          </div>
        </section>

        <section class="overflow-hidden rounded-md border bg-card md:col-span-2 md:block" :class="[activeSection === 'targets' ? 'block' : 'hidden']">
          <div class="p-4">
            <h2 class="font-semibold">
              目标明细
            </h2>
            <p class="text-xs text-muted-foreground">
              “首次响应丢失率”是 TcpQuality 所称的“重传率”，不等于系统 TCP 栈真实重传次数。目标 IP、域名和端口不会显示。
            </p>
          </div>
          <div class="overflow-x-auto">
            <table class="w-full min-w-[760px] text-sm">
              <thead class="border-y bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th class="px-4 py-2.5">
                    节点
                  </th>
                  <th class="px-4 py-2.5">
                    测试目标
                  </th>
                  <th class="px-4 py-2.5">
                    P50
                  </th>
                  <th class="px-4 py-2.5">
                    P95
                  </th>
                  <th class="px-4 py-2.5">
                    首次响应丢失
                  </th>
                  <th class="px-4 py-2.5">
                    覆盖率
                  </th>
                  <th class="px-4 py-2.5">
                    标准分
                  </th>
                  <th v-if="selectedTask.large_enabled" class="px-4 py-2.5">
                    大小包实验分
                  </th>
                </tr>
              </thead>
              <tbody>
                <template v-for="node in sortedNodes" :key="node.uuid">
                  <tr v-for="(target, index) in node.targets" :key="`${node.uuid}:${target.target_key}`" class="border-b last:border-b-0">
                    <td class="px-4 py-2.5 font-medium">
                      {{ index === 0 ? node.name : '' }}
                    </td>
                    <td class="px-4 py-2.5">
                      {{ targetLabel(target.target_key) }}
                    </td>
                    <td class="px-4 py-2.5">
                      {{ target.standard ? `${target.standard.p50_ms.toFixed(1)} ms` : '--' }}
                    </td>
                    <td class="px-4 py-2.5">
                      {{ target.standard ? `${target.standard.p95_ms.toFixed(1)} ms` : '--' }}
                    </td>
                    <td class="px-4 py-2.5">
                      {{ target.standard ? formatTCPQualityLoss(target.standard.loss_percent) : '--' }}
                    </td>
                    <td class="px-4 py-2.5">
                      {{ target.standard ? `${target.standard.coverage_percent.toFixed(0)}%` : '--' }}
                    </td>
                    <td class="px-4 py-2.5">
                      {{ formatTCPQualityScore(target.standard?.score ?? null) }}
                    </td>
                    <td v-if="selectedTask.large_enabled" class="px-4 py-2.5">
                      {{ formatTCPQualityScore(target.large?.score ?? null) }}
                    </td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </template>
  </main>
</template>
