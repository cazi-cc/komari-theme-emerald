<script setup lang="ts">
import type { ThemeSettings } from '@/utils/themeSettings'
import { Icon } from '@iconify/vue'
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  DEFAULT_THEME_SETTINGS,
  filterAvailableHomePingTaskIds,
  MAX_HOME_PING_TASKS,
  normalizeThemeSettings,
  THEME_SHORT,
} from '@/utils/themeSettings'

interface AdminNode {
  uuid: string
  name: string
  public_remark?: string
}

interface AdminPingTask {
  id: number
  name?: string
  target?: string
  type?: string
  clients?: string[]
  default_on?: boolean
}

interface VisitorLog {
  id: number
  ip: string
  time: string
  event: string
  path?: string
  route?: string
  user_agent?: string
}

interface VisitorLogResponse {
  visitors: VisitorLog[]
  total: number
}

type SettingsSection = 'home-ping' | 'visitors' | 'comparison' | 'chart' | 'appearance' | 'notice' | 'background' | 'filing'
type StatusColorKey = 'pingExcellentColor' | 'pingGoodColor' | 'pingModerateColor' | 'pingWarningColor' | 'pingCriticalColor'
type ScoreWeightKey = 'networkScoreLossWeight' | 'networkScoreP50Weight' | 'networkScoreP95Weight' | 'networkScoreVolatilityWeight' | 'networkScoreCoverageWeight'

const sections: Array<{ key: SettingsSection, label: string, icon: string }> = [
  { key: 'home-ping', label: '首页延迟任务', icon: 'lucide:list-ordered' },
  { key: 'visitors', label: '最近访客', icon: 'lucide:users' },
  { key: 'comparison', label: '线路对比', icon: 'lucide:route' },
  { key: 'chart', label: '详情图表', icon: 'lucide:chart-no-axes-combined' },
  { key: 'appearance', label: '页面与显示', icon: 'lucide:layout-dashboard' },
  { key: 'notice', label: '公告', icon: 'lucide:megaphone' },
  { key: 'background', label: '背景', icon: 'lucide:image' },
  { key: 'filing', label: '备案', icon: 'lucide:badge-check' },
]
const statusColorItems: Array<{ key: StatusColorKey, label: string }> = [
  { key: 'pingExcellentColor', label: '优秀' },
  { key: 'pingGoodColor', label: '良好' },
  { key: 'pingModerateColor', label: '一般' },
  { key: 'pingWarningColor', label: '警告' },
  { key: 'pingCriticalColor', label: '严重' },
]
const scoreWeightItems: Array<{ key: ScoreWeightKey, label: string, description: string }> = [
  { key: 'networkScoreLossWeight', label: '丢包', description: '偶发或持续丢包的固定惩罚' },
  { key: 'networkScoreP50Weight', label: 'P50 延迟', description: '多数请求的典型延迟' },
  { key: 'networkScoreP95Weight', label: 'P95 延迟', description: '较慢请求的尾部延迟' },
  { key: 'networkScoreVolatilityWeight', label: '波动', description: '按固定尺度评估 P95 相对 P50 的增幅' },
  { key: 'networkScoreCoverageWeight', label: '覆盖率', description: '实际样本数与预期样本数之比' },
]
const taskColorPalette = ['#FF6B6B', '#4ECDC4', '#A78BFA', '#60A5FA', '#FFB347', '#F472B6', '#34D399', '#FB923C']
const EDGE_USER_AGENT_REGEX = /Edg\/[\d.]+/i
const OPERA_USER_AGENT_REGEX = /OPR\/[\d.]+/i
const CHROME_USER_AGENT_REGEX = /Chrome\/[\d.]+/i
const FIREFOX_USER_AGENT_REGEX = /Firefox\/[\d.]+/i
const SAFARI_USER_AGENT_REGEX = /Safari/i
const SAFARI_VERSION_REGEX = /Version\/[\d.]+/i
const IPHONE_USER_AGENT_REGEX = /iphone|ipod/i
const IPAD_USER_AGENT_REGEX = /ipad/i
const ANDROID_USER_AGENT_REGEX = /android/i
const WINDOWS_USER_AGENT_REGEX = /windows/i
const MAC_USER_AGENT_REGEX = /macintosh|mac os/i
const LINUX_USER_AGENT_REGEX = /linux/i

const activeSection = ref<SettingsSection>('home-ping')
const loading = ref(true)
const saving = ref(false)
const error = ref('')
const success = ref('')
const nodes = ref<AdminNode[]>([])
const tasks = ref<AdminPingTask[]>([])
const draggedTask = ref<{ uuid: string, taskId: number } | null>(null)
const visitors = ref<VisitorLog[]>([])
const visitorLoading = ref(false)
const visitorLoaded = ref(false)
const visitorError = ref('')
const visitorPage = ref(1)
const visitorPageSize = 50
const visitorTotal = ref(0)
const settings = reactive<ThemeSettings>({ ...DEFAULT_THEME_SETTINGS })
const buildVersion = __BUILD_VERSION__
const buildGitHash = __BUILD_GIT_HASH__
let visitorRpcRequestId = 0

const taskMap = computed(() => new Map(tasks.value.map(task => [task.id, task])))
const sortedNodes = computed(() => [...nodes.value].sort((left, right) => left.name.localeCompare(right.name, 'zh-CN')))
const maximumSelectedTaskCount = computed(() => Math.max(
  1,
  ...nodes.value.map(node => selectedTaskIds(node.uuid).length),
))
const scoreWeightTotal = computed(() => scoreWeightItems.reduce((total, item) => total + settings[item.key], 0))
const visitorPageCount = computed(() => Math.max(1, Math.ceil(visitorTotal.value / visitorPageSize)))
const visitorRangeStart = computed(() => visitorTotal.value ? (visitorPage.value - 1) * visitorPageSize + 1 : 0)
const visitorRangeEnd = computed(() => Math.min(visitorTotal.value, visitorPage.value * visitorPageSize))

function unwrapData<T>(value: unknown): T {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'data' in value)
    return (value as { data: T }).data
  return value as T
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' })
  const data = await response.json().catch(() => null)
  if (!response.ok)
    throw new Error((data as { message?: string } | null)?.message || `请求失败：HTTP ${response.status}`)
  return unwrapData<T>(data)
}

async function rpcCall<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const response = await fetch('/api/rpc2', {
    method: 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: `settings-${++visitorRpcRequestId}`,
      method,
      params,
    }),
  })
  const payload = await response.json().catch(() => null) as {
    result?: T
    error?: { message?: string }
  } | null
  if (!response.ok || payload?.error)
    throw new Error(payload?.error?.message || `请求失败：HTTP ${response.status}`)
  if (!payload || !('result' in payload))
    throw new Error('服务器返回了无效的访客记录响应')
  return payload.result as T
}

function formatVisitorTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime()))
    return value || '未知时间'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

function summarizeUserAgent(value = ''): string {
  const browser = value.match(EDGE_USER_AGENT_REGEX)?.[0]
    || value.match(OPERA_USER_AGENT_REGEX)?.[0]
    || value.match(CHROME_USER_AGENT_REGEX)?.[0]
    || value.match(FIREFOX_USER_AGENT_REGEX)?.[0]
    || (SAFARI_USER_AGENT_REGEX.test(value) ? value.match(SAFARI_VERSION_REGEX)?.[0] : undefined)
    || '未知浏览器'
  const device = IPHONE_USER_AGENT_REGEX.test(value)
    ? 'iPhone'
    : IPAD_USER_AGENT_REGEX.test(value)
      ? 'iPad'
      : ANDROID_USER_AGENT_REGEX.test(value)
        ? 'Android'
        : WINDOWS_USER_AGENT_REGEX.test(value)
          ? 'Windows'
          : MAC_USER_AGENT_REGEX.test(value)
            ? 'macOS'
            : LINUX_USER_AGENT_REGEX.test(value)
              ? 'Linux'
              : '未知设备'
  return `${device} · ${browser.replace('/', ' ')}`
}

async function loadVisitorLogs(page = visitorPage.value): Promise<void> {
  visitorLoading.value = true
  visitorError.value = ''
  try {
    const nextPage = Math.max(1, page)
    const result = await rpcCall<VisitorLogResponse>('admin:getVisitorLogs', {
      page: nextPage,
      limit: visitorPageSize,
    })
    visitors.value = Array.isArray(result.visitors) ? result.visitors : []
    visitorTotal.value = Math.max(0, Number(result.total) || 0)
    visitorPage.value = Math.min(nextPage, Math.max(1, Math.ceil(visitorTotal.value / visitorPageSize)))
    visitorLoaded.value = true
  }
  catch (cause) {
    visitorError.value = cause instanceof Error ? cause.message : '访客记录加载失败'
  }
  finally {
    visitorLoading.value = false
  }
}

function assignedTasksForNode(uuid: string): AdminPingTask[] {
  return tasks.value.filter(task => task.clients?.includes(uuid))
}

function selectedTaskIds(uuid: string): number[] {
  return settings.homePingTasksByNode[uuid] ?? []
}

function selectedTasks(uuid: string): AdminPingTask[] {
  return selectedTaskIds(uuid)
    .map(taskId => taskMap.value.get(taskId))
    .filter((task): task is AdminPingTask => Boolean(task))
}

function unselectedTasks(uuid: string): AdminPingTask[] {
  const selected = new Set(selectedTaskIds(uuid))
  return assignedTasksForNode(uuid).filter(task => !selected.has(task.id))
}

function ensureNodeSelections(): void {
  const next = { ...settings.homePingTasksByNode }
  for (const node of nodes.value) {
    const assignedTasks = assignedTasksForNode(node.uuid)
    const assignedTaskIds = new Set(assignedTasks.map(task => task.id))
    if (!(node.uuid in next)) {
      next[node.uuid] = assignedTasks
        .slice(0, 2)
        .map(task => task.id)
    }
    else {
      next[node.uuid] = filterAvailableHomePingTaskIds(next[node.uuid] ?? [], assignedTaskIds)
    }
  }
  settings.homePingTasksByNode = next
}

function addTask(uuid: string, taskId: number): void {
  const current = selectedTaskIds(uuid)
  if (current.includes(taskId) || current.length >= MAX_HOME_PING_TASKS)
    return
  settings.homePingTasksByNode = { ...settings.homePingTasksByNode, [uuid]: [...current, taskId] }
}

function removeTask(uuid: string, taskId: number): void {
  settings.homePingTasksByNode = {
    ...settings.homePingTasksByNode,
    [uuid]: selectedTaskIds(uuid).filter(id => id !== taskId),
  }
}

function moveTask(uuid: string, taskId: number, offset: number): void {
  const current = [...selectedTaskIds(uuid)]
  const index = current.indexOf(taskId)
  const nextIndex = index + offset
  if (index < 0 || nextIndex < 0 || nextIndex >= current.length)
    return
  const [moved] = current.splice(index, 1)
  if (moved === undefined)
    return
  current.splice(nextIndex, 0, moved)
  settings.homePingTasksByNode = { ...settings.homePingTasksByNode, [uuid]: current }
}

function startDrag(uuid: string, taskId: number): void {
  draggedTask.value = { uuid, taskId }
}

function dropBefore(uuid: string, targetTaskId: number): void {
  const dragged = draggedTask.value
  draggedTask.value = null
  if (!dragged || dragged.uuid !== uuid || dragged.taskId === targetTaskId)
    return

  const current = [...selectedTaskIds(uuid)]
  const from = current.indexOf(dragged.taskId)
  if (from < 0 || !current.includes(targetTaskId))
    return
  const [moved] = current.splice(from, 1)
  if (moved === undefined)
    return
  const insertAt = current.indexOf(targetTaskId)
  current.splice(insertAt < 0 ? current.length : insertAt, 0, moved)
  settings.homePingTasksByNode = { ...settings.homePingTasksByNode, [uuid]: current }
}

function taskLabel(task: AdminPingTask): string {
  return task.name?.trim() || `任务 ${task.id}`
}

function taskColor(taskId: number): string {
  const configured = settings.pingTaskColors[String(taskId)]
  if (configured)
    return configured
  const index = Math.max(0, tasks.value.findIndex(task => task.id === taskId))
  return taskColorPalette[index % taskColorPalette.length] ?? '#34D399'
}

function setTaskColor(taskId: number, event: Event): void {
  const value = (event.target as HTMLInputElement).value
  settings.pingTaskColors = { ...settings.pingTaskColors, [String(taskId)]: value }
}

function setStatusColor(key: StatusColorKey, event: Event): void {
  settings[key] = (event.target as HTMLInputElement).value
}

async function loadSettings(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const me = await fetchJson<{ logged_in: boolean }>('/api/me')
    if (!me.logged_in)
      throw new Error('管理员登录已失效，请重新登录 Komari 后台。')

    const [publicInfo, nodeList, taskList] = await Promise.all([
      fetchJson<{ theme_settings?: Record<string, unknown> }>('/api/public'),
      fetchJson<AdminNode[]>('/api/admin/client/list'),
      fetchJson<AdminPingTask[]>('/api/admin/ping'),
    ])

    Object.assign(settings, normalizeThemeSettings(publicInfo.theme_settings))
    nodes.value = Array.isArray(nodeList) ? nodeList : []
    tasks.value = Array.isArray(taskList) ? taskList.filter(task => Number.isInteger(task.id)) : []
    ensureNodeSelections()
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : '设置加载失败'
  }
  finally {
    loading.value = false
  }
}

async function saveSettings(): Promise<void> {
  saving.value = true
  error.value = ''
  success.value = ''
  try {
    ensureNodeSelections()
    const normalized = normalizeThemeSettings(settings)
    Object.assign(settings, normalized)

    const response = await fetch(`/api/admin/theme/settings?theme=${encodeURIComponent(THEME_SHORT)}`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(normalized),
    })
    const result = await response.json().catch(() => null)
    if (!response.ok || (result as { status?: string } | null)?.status === 'error')
      throw new Error((result as { message?: string } | null)?.message || `保存失败：HTTP ${response.status}`)

    success.value = '设置已保存，刷新监控首页后生效。'
  }
  catch (cause) {
    error.value = cause instanceof Error ? cause.message : '设置保存失败'
  }
  finally {
    saving.value = false
  }
}

watch(activeSection, (section) => {
  if (section === 'visitors' && !visitorLoaded.value)
    void loadVisitorLogs(1)
})

onMounted(loadSettings)
</script>

<template>
  <main class="min-h-screen bg-background text-foreground">
    <div class="mx-auto grid max-w-7xl gap-5 p-4 lg:grid-cols-[210px_minmax(0,1fr)] lg:p-6">
      <aside class="min-w-0">
        <div class="mb-4">
          <h1 class="text-lg font-semibold">
            Emerald 设置
          </h1>
          <p class="mt-1 text-xs text-muted-foreground">
            首页任务、详情图表与主题外观
          </p>
          <p class="mt-1 text-[11px] text-muted-foreground">
            v{{ buildVersion }} · {{ buildGitHash }}
          </p>
        </div>
        <nav class="flex gap-1 overflow-x-auto pb-1 lg:flex-col">
          <button
            v-for="section in sections" :key="section.key" type="button"
            class="flex h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm transition-colors"
            :class="activeSection === section.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'"
            @click="activeSection = section.key"
          >
            <Icon :icon="section.icon" width="16" height="16" />
            {{ section.label }}
          </button>
        </nav>
      </aside>

      <section class="min-w-0">
        <div v-if="loading" class="flex min-h-80 items-center justify-center text-sm text-muted-foreground">
          <Icon icon="lucide:loader-circle" class="mr-2 animate-spin" width="18" height="18" />
          正在读取节点和任务
        </div>

        <div v-else class="space-y-4">
          <div v-if="error" class="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
            {{ error }}
          </div>
          <div v-if="success" class="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
            {{ success }}
          </div>

          <template v-if="activeSection === 'home-ping'">
            <header>
              <h2 class="text-base font-semibold">
                每节点首页延迟任务
              </h2>
              <p class="mt-1 text-sm text-muted-foreground">
                每个节点最多选择 {{ MAX_HOME_PING_TASKS }} 项。
              </p>
            </header>

            <div class="rounded-md border border-border bg-card p-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 class="text-sm font-semibold">
                    首页卡片统一行数
                  </h3>
                  <p class="mt-1 text-xs text-muted-foreground">
                    当前任务最多的节点已选择 {{ maximumSelectedTaskCount }} 项
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    type="button" class="size-8 rounded-md border border-border bg-background text-lg disabled:opacity-30"
                    title="减少一行" :disabled="settings.homePingRowCount <= 1"
                    @click="settings.homePingRowCount = Math.max(1, settings.homePingRowCount - 1)"
                  >
                    −
                  </button>
                  <input
                    v-model.number="settings.homePingRowCount" type="number" min="1" :max="MAX_HOME_PING_TASKS"
                    class="h-8 w-16 rounded-md border border-border bg-background px-2 text-center text-sm font-semibold"
                    aria-label="首页卡片统一行数"
                  >
                  <button
                    type="button" class="size-8 rounded-md border border-border bg-background text-lg disabled:opacity-30"
                    title="增加一行" :disabled="settings.homePingRowCount >= MAX_HOME_PING_TASKS"
                    @click="settings.homePingRowCount = Math.min(MAX_HOME_PING_TASKS, settings.homePingRowCount + 1)"
                  >
                    +
                  </button>
                </div>
              </div>
              <input
                v-model.number="settings.homePingRowCount" type="range" min="1" :max="MAX_HOME_PING_TASKS" step="1"
                class="mt-4 h-2 w-full cursor-pointer accent-primary" aria-label="调整首页卡片统一行数"
              >
              <div class="mt-2 px-2 text-[11px] text-muted-foreground">
                <div class="flex justify-between">
                  <span v-for="row in MAX_HOME_PING_TASKS" :key="row" class="flex w-0 justify-center">{{ row }}</span>
                </div>
              </div>
            </div>

            <div v-for="node in sortedNodes" :key="node.uuid" class="rounded-md border border-border bg-card p-4">
              <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div class="min-w-0">
                  <h3 class="truncate text-sm font-semibold" :title="node.name">
                    {{ node.name }}
                  </h3>
                  <p class="mt-0.5 truncate text-xs text-muted-foreground">
                    {{ node.public_remark || node.uuid }}
                  </p>
                </div>
                <span class="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                  已选 {{ selectedTaskIds(node.uuid).length }}/{{ MAX_HOME_PING_TASKS }}
                </span>
              </div>

              <div v-if="selectedTasks(node.uuid).length" class="space-y-2">
                <div
                  v-for="(task, index) in selectedTasks(node.uuid)" :key="task.id" draggable="true"
                  class="grid min-h-10 grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-md border border-border/70 bg-background px-2"
                  @dragstart="startDrag(node.uuid, task.id)" @dragover.prevent @drop.prevent="dropBefore(node.uuid, task.id)"
                >
                  <Icon icon="lucide:grip-vertical" class="cursor-grab text-muted-foreground" width="16" height="16" />
                  <div class="min-w-0">
                    <div class="truncate text-sm" :title="taskLabel(task)">
                      {{ taskLabel(task) }}
                    </div>
                    <div class="truncate text-[11px] text-muted-foreground">
                      {{ task.target || `任务 ID ${task.id}` }}
                    </div>
                  </div>
                  <div class="flex items-center gap-1">
                    <button type="button" class="size-7 rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" title="上移" :disabled="index === 0" @click="moveTask(node.uuid, task.id, -1)">
                      <Icon icon="lucide:chevron-up" class="mx-auto" width="15" height="15" />
                    </button>
                    <button type="button" class="size-7 rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" title="下移" :disabled="index === selectedTasks(node.uuid).length - 1" @click="moveTask(node.uuid, task.id, 1)">
                      <Icon icon="lucide:chevron-down" class="mx-auto" width="15" height="15" />
                    </button>
                    <button type="button" class="size-7 rounded text-muted-foreground hover:bg-red-500/10 hover:text-red-600" title="移除" @click="removeTask(node.uuid, task.id)">
                      <Icon icon="lucide:x" class="mx-auto" width="15" height="15" />
                    </button>
                  </div>
                </div>
              </div>
              <p v-else class="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                尚未选择首页任务
              </p>

              <div v-if="unselectedTasks(node.uuid).length" class="mt-3 flex flex-wrap gap-2">
                <button
                  v-for="task in unselectedTasks(node.uuid)" :key="task.id" type="button"
                  class="inline-flex h-8 max-w-full items-center gap-1 rounded-md border border-border bg-background px-2 text-xs hover:border-primary hover:text-primary disabled:opacity-40"
                  :disabled="selectedTaskIds(node.uuid).length >= MAX_HOME_PING_TASKS" @click="addTask(node.uuid, task.id)"
                >
                  <Icon icon="lucide:plus" width="13" height="13" />
                  <span class="truncate">{{ taskLabel(task) }}</span>
                </button>
              </div>
              <p v-else-if="assignedTasksForNode(node.uuid).length === 0" class="mt-3 text-xs text-amber-600">
                Komari 尚未给此节点分配延迟监测任务。
              </p>
            </div>

            <div class="rounded-md border border-border bg-card p-4">
              <h3 class="mb-3 text-sm font-semibold">
                任务折线颜色
              </h3>
              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <label v-for="task in tasks" :key="task.id" class="flex items-center gap-3 text-sm">
                  <input
                    type="color" class="h-8 w-10 cursor-pointer rounded border border-border bg-transparent"
                    :value="taskColor(task.id)" :aria-label="`${taskLabel(task)}颜色`" @input="setTaskColor(task.id, $event)"
                  >
                  <span class="min-w-0 truncate" :title="taskLabel(task)">{{ taskLabel(task) }}</span>
                </label>
              </div>
            </div>
          </template>

          <template v-else-if="activeSection === 'visitors'">
            <header class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold">
                  最近访客
                </h2>
                <p class="mt-1 text-sm text-muted-foreground">
                  仅管理员可见。记录由服务器生成，保留 30 天；页面不会查询第三方 IP 服务。
                </p>
              </div>
              <button
                type="button"
                class="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-background px-3 text-sm hover:bg-muted disabled:opacity-50"
                :disabled="visitorLoading"
                @click="loadVisitorLogs(visitorPage)"
              >
                <Icon icon="lucide:refresh-cw" :class="visitorLoading && 'animate-spin'" width="15" height="15" />
                刷新
              </button>
            </header>

            <div v-if="visitorError" class="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              {{ visitorError }}
            </div>

            <div class="overflow-hidden rounded-md border border-border bg-card">
              <div class="flex min-h-12 items-center justify-between gap-3 border-b border-border px-4 text-sm">
                <span class="font-medium">访问记录</span>
                <span class="text-xs text-muted-foreground">
                  共 {{ visitorTotal }} 条
                </span>
              </div>

              <div v-if="visitorLoading && !visitorLoaded" class="flex min-h-56 items-center justify-center text-sm text-muted-foreground">
                <Icon icon="lucide:loader-circle" class="mr-2 animate-spin" width="18" height="18" />
                正在读取访客记录
              </div>
              <div v-else-if="!visitors.length" class="flex min-h-56 flex-col items-center justify-center px-4 text-center text-sm text-muted-foreground">
                <Icon icon="lucide:user-round-search" class="mb-2" width="24" height="24" />
                暂无访客记录
              </div>
              <template v-else>
                <div class="hidden grid-cols-[170px_150px_minmax(170px,1fr)_minmax(180px,1.2fr)] gap-3 border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground md:grid">
                  <span>访问时间</span>
                  <span>来源 IP</span>
                  <span>访问页面</span>
                  <span>设备与浏览器</span>
                </div>
                <div
                  v-for="visitor in visitors"
                  :key="visitor.id"
                  class="grid gap-2 border-b border-border/70 px-4 py-3 text-sm last:border-b-0 md:grid-cols-[170px_150px_minmax(170px,1fr)_minmax(180px,1.2fr)] md:items-center md:gap-3"
                >
                  <div class="tabular-nums">
                    <span class="mr-2 text-xs text-muted-foreground md:hidden">时间</span>
                    {{ formatVisitorTime(visitor.time) }}
                  </div>
                  <div class="min-w-0 truncate font-mono text-xs" :title="visitor.ip">
                    <span class="mr-2 font-sans text-xs text-muted-foreground md:hidden">IP</span>
                    {{ visitor.ip || '未知' }}
                  </div>
                  <div class="min-w-0">
                    <div class="truncate" :title="visitor.path || visitor.route || visitor.event">
                      {{ visitor.path || visitor.route || visitor.event || '未知页面' }}
                    </div>
                    <div v-if="visitor.route && visitor.route !== visitor.path" class="mt-0.5 truncate text-xs text-muted-foreground">
                      {{ visitor.route }}
                    </div>
                  </div>
                  <div class="min-w-0 truncate text-muted-foreground" :title="visitor.user_agent || '无 User-Agent'">
                    {{ summarizeUserAgent(visitor.user_agent) }}
                  </div>
                </div>
              </template>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span class="text-xs text-muted-foreground">
                显示 {{ visitorRangeStart }}–{{ visitorRangeEnd }} / {{ visitorTotal }}
              </span>
              <div class="flex items-center gap-2">
                <button
                  type="button" class="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background disabled:opacity-30"
                  title="上一页" :disabled="visitorLoading || visitorPage <= 1"
                  @click="loadVisitorLogs(visitorPage - 1)"
                >
                  <Icon icon="lucide:chevron-left" width="16" height="16" />
                </button>
                <span class="min-w-16 text-center tabular-nums">
                  {{ visitorPage }} / {{ visitorPageCount }}
                </span>
                <button
                  type="button" class="inline-flex size-8 items-center justify-center rounded-md border border-border bg-background disabled:opacity-30"
                  title="下一页" :disabled="visitorLoading || visitorPage >= visitorPageCount"
                  @click="loadVisitorLogs(visitorPage + 1)"
                >
                  <Icon icon="lucide:chevron-right" width="16" height="16" />
                </button>
              </div>
            </div>
          </template>

          <template v-else-if="activeSection === 'comparison'">
            <header>
              <h2 class="text-base font-semibold">
                线路对比与评分
              </h2>
              <p class="mt-1 text-sm text-muted-foreground">
                评分模型 v2 以延迟和丢包为主，波动率使用固定尺度，避免放大组内很小的差异。
              </p>
            </header>

            <div class="grid gap-4 rounded-md border border-border bg-card p-4 sm:grid-cols-2">
              <label class="space-y-1 text-sm">
                <span>默认时间范围</span>
                <select v-model.number="settings.networkCompareDefaultHours" class="h-9 w-full rounded-md border border-border bg-background px-3">
                  <option :value="1">1 小时</option><option :value="6">6 小时</option><option :value="12">12 小时</option>
                  <option :value="24">1 天</option><option :value="72">3 天</option><option :value="168">7 天</option>
                </select>
              </label>
              <label class="space-y-1 text-sm">
                <span>最低样本数</span>
                <input v-model.number="settings.networkScoreMinSamples" type="number" min="1" max="100000" class="h-9 w-full rounded-md border border-border bg-background px-3">
              </label>
              <label class="space-y-1 text-sm">
                <span>最低数据覆盖率（%）</span>
                <input v-model.number="settings.networkScoreMinCoverage" type="number" min="0" max="100" step="1" class="h-9 w-full rounded-md border border-border bg-background px-3">
              </label>
              <div class="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                少于 3 个有效节点时仍展示指标，但不生成排名，避免样本过少造成误导。
              </div>
            </div>

            <div class="rounded-md border border-border bg-card p-4">
              <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 class="text-sm font-semibold">
                    指标权重
                  </h3>
                  <p class="mt-1 text-xs text-muted-foreground">
                    服务端会按当前比例归一化后计算；默认推荐值为 40 / 30 / 25 / 3 / 2。
                  </p>
                </div>
                <span
                  class="rounded px-2 py-1 text-xs font-semibold tabular-nums"
                  :class="scoreWeightTotal === 100 ? 'bg-primary/10 text-primary' : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'"
                >
                  合计 {{ scoreWeightTotal }}%
                </span>
              </div>
              <div class="grid gap-3 sm:grid-cols-2">
                <label v-for="item in scoreWeightItems" :key="item.key" class="grid grid-cols-[minmax(0,1fr)_76px] items-center gap-3 rounded-md border border-border/70 bg-background px-3 py-2">
                  <span class="min-w-0">
                    <span class="block text-sm font-medium">{{ item.label }}</span>
                    <span class="mt-0.5 block text-[11px] text-muted-foreground">{{ item.description }}</span>
                  </span>
                  <span class="relative">
                    <input v-model.number="settings[item.key]" type="number" min="0" max="100" step="1" class="h-8 w-full rounded-md border border-border bg-background px-2 pr-6 text-right text-sm tabular-nums">
                    <span class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>
                  </span>
                </label>
              </div>
            </div>

            <div class="rounded-md border border-border bg-card p-4">
              <h3 class="mb-3 text-sm font-semibold">
                评级阈值
              </h3>
              <div class="grid gap-3 sm:grid-cols-3">
                <label class="space-y-1 text-sm"><span>优秀起始分</span><input v-model.number="settings.networkScoreExcellentThreshold" type="number" min="0" max="100" class="h-9 w-full rounded-md border border-border bg-background px-3"></label>
                <label class="space-y-1 text-sm"><span>良好起始分</span><input v-model.number="settings.networkScoreGoodThreshold" type="number" min="0" max="100" class="h-9 w-full rounded-md border border-border bg-background px-3"></label>
                <label class="space-y-1 text-sm"><span>一般起始分</span><input v-model.number="settings.networkScoreFairThreshold" type="number" min="0" max="100" class="h-9 w-full rounded-md border border-border bg-background px-3"></label>
              </div>
            </div>

            <div class="rounded-md border border-border bg-card p-4 text-xs leading-6 text-muted-foreground">
              排名数据由服务器后台定期计算并缓存。1 小时每 5 分钟更新，6 小时、12 小时和 1 天每 10 分钟更新，3 天和 7 天每 30 分钟更新；访客打开页面只读取缓存，不会重复执行全量统计。
            </div>
          </template>

          <template v-else-if="activeSection === 'chart'">
            <header>
              <h2 class="text-base font-semibold">
                节点详情图表
              </h2>
              <p class="mt-1 text-sm text-muted-foreground">
                控制默认时间范围、图表布局、缩放和异常阈值。
              </p>
            </header>
            <div class="grid gap-4 rounded-md border border-border bg-card p-4 sm:grid-cols-2">
              <label class="space-y-1 text-sm">
                <span>默认时间范围</span>
                <select v-model.number="settings.pingChartDefaultHours" class="h-9 w-full rounded-md border border-border bg-background px-3">
                  <option :value="1">1 小时</option><option :value="6">6 小时</option><option :value="12">12 小时</option>
                  <option :value="24">1 天</option><option :value="72">3 天</option><option :value="168">7 天</option>
                </select>
              </label>
              <label class="space-y-1 text-sm">
                <span>默认图表布局</span>
                <select v-model="settings.pingChartLayout" class="h-9 w-full rounded-md border border-border bg-background px-3">
                  <option value="combined">延迟与丢包合图</option><option value="split">延迟与丢包分图</option>
                </select>
              </label>
              <label class="space-y-1 text-sm">
                <span>自动刷新间隔（秒）</span>
                <input v-model.number="settings.pingChartRefreshInterval" type="number" min="10" max="300" class="h-9 w-full rounded-md border border-border bg-background px-3">
              </label>
              <div class="flex flex-col justify-end gap-3 pb-1 text-sm">
                <label class="flex items-center gap-2"><input v-model="settings.pingChartShowZoom" type="checkbox" class="size-4 accent-primary">显示拖动缩放条</label>
                <label class="flex items-center gap-2"><input v-model="settings.pingChartAutoRefresh" type="checkbox" class="size-4 accent-primary">默认自动刷新</label>
              </div>
            </div>
            <div class="grid gap-4 rounded-md border border-border bg-card p-4 sm:grid-cols-2">
              <label class="space-y-1 text-sm"><span>延迟警告阈值（ms）</span><input v-model.number="settings.pingLatencyWarning" type="number" min="1" max="5000" class="h-9 w-full rounded-md border border-border bg-background px-3"></label>
              <label class="space-y-1 text-sm"><span>延迟严重阈值（ms）</span><input v-model.number="settings.pingLatencyCritical" type="number" min="1" max="5000" class="h-9 w-full rounded-md border border-border bg-background px-3"></label>
              <label class="space-y-1 text-sm"><span>丢包警告阈值（%）</span><input v-model.number="settings.pingLossWarning" type="number" min="0" max="100" step="0.1" class="h-9 w-full rounded-md border border-border bg-background px-3"></label>
              <label class="space-y-1 text-sm"><span>丢包严重阈值（%）</span><input v-model.number="settings.pingLossCritical" type="number" min="0" max="100" step="0.1" class="h-9 w-full rounded-md border border-border bg-background px-3"></label>
            </div>
            <div class="rounded-md border border-border bg-card p-4">
              <h3 class="mb-3 text-sm font-semibold">
                首页延迟条颜色
              </h3>
              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <label v-for="item in statusColorItems" :key="item.key" class="flex items-center gap-2 text-sm">
                  <input type="color" class="h-8 w-10 cursor-pointer rounded border border-border bg-transparent" :value="settings[item.key]" @input="setStatusColor(item.key, $event)">
                  {{ item.label }}
                </label>
              </div>
            </div>
          </template>

          <template v-else-if="activeSection === 'appearance'">
            <header>
              <h2 class="text-base font-semibold">
                页面与显示
              </h2>
            </header>
            <div class="grid gap-4 rounded-md border border-border bg-card p-4 sm:grid-cols-2">
              <label class="space-y-1 text-sm"><span>数据刷新间隔（秒）</span><input v-model.number="settings.dataUpdateInterval" type="number" min="1" max="60" class="h-9 w-full rounded-md border border-border bg-background px-3"></label>
              <label class="space-y-1 text-sm"><span>RPC 连接模式</span><select v-model="settings.rpcTransportMode" class="h-9 w-full rounded-md border border-border bg-background px-3"><option value="websocket">WebSocket</option><option value="http">HTTP</option></select></label>
              <label class="space-y-1 text-sm"><span>默认节点视图</span><select v-model="settings.defaultViewMode" class="h-9 w-full rounded-md border border-border bg-background px-3"><option value="card">卡片</option><option value="list">列表</option></select></label>
              <label class="space-y-1 text-sm"><span>头部展示模式</span><select v-model="settings.earthViewMode" class="h-9 w-full rounded-md border border-border bg-background px-3"><option value="earth">旋转地球</option><option value="earth-stop">静止地球</option><option value="maps">点状地图</option><option value="cards">仅汇总卡片</option><option value="hide">隐藏头部</option></select></label>
              <label class="flex items-center gap-2 text-sm"><input v-model="settings.visitorInfoCardEnabled" type="checkbox" class="size-4 accent-primary">显示本次访问设备信息</label>
              <label class="flex items-center gap-2 text-sm"><input v-model="settings.hideAdminEntryWhenLoggedOut" type="checkbox" class="size-4 accent-primary">未登录时隐藏后台入口</label>
              <label class="flex items-center gap-2 text-sm"><input v-model="settings.disablePageAnimation" type="checkbox" class="size-4 accent-primary">减少页面动画</label>
            </div>
          </template>

          <template v-else-if="activeSection === 'notice'">
            <header>
              <h2 class="text-base font-semibold">
                首页公告
              </h2>
            </header>
            <div class="space-y-4 rounded-md border border-border bg-card p-4">
              <label class="flex items-center gap-2 text-sm"><input v-model="settings.alertEnabled" type="checkbox" class="size-4 accent-primary">启用公告</label>
              <label class="block space-y-1 text-sm"><span>公告标题</span><input v-model="settings.alertTitle" type="text" class="h-9 w-full rounded-md border border-border bg-background px-3"></label>
              <label class="block space-y-1 text-sm"><span>公告内容</span><textarea v-model="settings.alertContent" rows="8" class="w-full rounded-md border border-border bg-background p-3" /></label>
            </div>
          </template>

          <template v-else-if="activeSection === 'background'">
            <header>
              <h2 class="text-base font-semibold">
                自定义背景
              </h2>
            </header>
            <div class="grid gap-4 rounded-md border border-border bg-card p-4 sm:grid-cols-2">
              <label class="flex items-center gap-2 text-sm sm:col-span-2"><input v-model="settings.backgroundEnabled" type="checkbox" class="size-4 accent-primary">启用自定义背景</label>
              <label class="space-y-1 text-sm"><span>背景类型</span><select v-model="settings.backgroundType" class="h-9 w-full rounded-md border border-border bg-background px-3"><option value="image">图片</option><option value="video">视频</option></select></label>
              <label class="space-y-1 text-sm"><span>模糊半径（px）</span><input v-model.number="settings.backgroundBlur" type="number" min="0" max="50" class="h-9 w-full rounded-md border border-border bg-background px-3"></label>
              <label class="space-y-1 text-sm sm:col-span-2"><span>亮色模式背景 URL</span><input v-model="settings.lightBackgroundUrl" type="url" class="h-9 w-full rounded-md border border-border bg-background px-3"></label>
              <label class="space-y-1 text-sm sm:col-span-2"><span>暗色模式背景 URL</span><input v-model="settings.darkBackgroundUrl" type="url" class="h-9 w-full rounded-md border border-border bg-background px-3"></label>
              <label class="space-y-1 text-sm sm:col-span-2"><span>遮罩强度（-100 到 100）</span><input v-model.number="settings.backgroundOverlay" type="range" min="-100" max="100" class="w-full accent-primary"><span class="text-xs text-muted-foreground">{{ settings.backgroundOverlay }}</span></label>
            </div>
          </template>

          <template v-else>
            <header>
              <h2 class="text-base font-semibold">
                备案信息
              </h2>
            </header>
            <div class="grid gap-4 rounded-md border border-border bg-card p-4 sm:grid-cols-2">
              <label class="flex items-center gap-2 text-sm sm:col-span-2"><input v-model="settings.icpEnabled" type="checkbox" class="size-4 accent-primary">显示 ICP 备案</label>
              <label class="space-y-1 text-sm"><span>ICP备案号</span><input v-model="settings.icpNumber" type="text" class="h-9 w-full rounded-md border border-border bg-background px-3"></label>
              <label class="space-y-1 text-sm"><span>ICP备案链接</span><input v-model="settings.icpUrl" type="url" class="h-9 w-full rounded-md border border-border bg-background px-3"></label>
              <label class="flex items-center gap-2 text-sm sm:col-span-2"><input v-model="settings.policeEnabled" type="checkbox" class="size-4 accent-primary">显示公安备案</label>
              <label class="space-y-1 text-sm"><span>公安备案号</span><input v-model="settings.policeNumber" type="text" class="h-9 w-full rounded-md border border-border bg-background px-3"></label>
              <label class="space-y-1 text-sm"><span>公安备案链接</span><input v-model="settings.policeUrl" type="url" class="h-9 w-full rounded-md border border-border bg-background px-3"></label>
            </div>
          </template>

          <div v-if="activeSection !== 'visitors'" class="sticky bottom-0 flex justify-end border-t border-border bg-background/95 py-3 backdrop-blur">
            <button
              type="button" class="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              :disabled="saving" @click="saveSettings"
            >
              <Icon :icon="saving ? 'lucide:loader-circle' : 'lucide:save'" :class="saving && 'animate-spin'" width="16" height="16" />
              {{ saving ? '正在保存' : '保存设置' }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>
