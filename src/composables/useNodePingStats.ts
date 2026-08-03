import type { MaybeRefOrGetter } from 'vue'
import { useThrottleFn } from '@vueuse/core'
import { computed, onScopeDispose, ref, shallowRef, toValue, watch } from 'vue'
import { getSharedRpc } from '@/utils/rpc'

export interface NodePingHistoryPoint {
  time: string
  latency: number | null
  loss: number | null
}

export type NodePingIpFamily = 'ipv4' | 'ipv6' | 'other'

export interface NodePingTaskStats extends NodePingStatsState {
  taskId: number
  taskName: string
  ipFamily: NodePingIpFamily
}

export interface NodePingStatsState {
  avgLatency: number
  avgLoss: number
  avgVolatility: number
  history: NodePingHistoryPoint[]
  hasData: boolean
  taskStats: NodePingTaskStats[]
}

interface PingRecord {
  client: string
  task_id: number
  time: string
  value: number
}

interface SharedPingRecordsResponse {
  records?: PingRecord[]
  tasks?: PingTask[]
  from?: string
  to?: string
}

interface PingMetricPoint {
  time: string
  value: number | null
  count?: number
  tags?: Record<string, string>
}

interface PingLossMetricSeries {
  metric_key: 'ping.loss'
  entity_id: string
  tags?: Record<string, string>
  points?: PingMetricPoint[]
}

interface PingLossMetricResponse {
  series?: PingLossMetricSeries[]
}

interface CanonicalPingTaskStats {
  entity_id: string
  task_id: string
  name?: string
  loss: number
  avg?: number
  p50?: number
  p95?: number
  p99?: number
  p99_p50_ratio?: number
  total: number
}

interface CanonicalPingStatsResponse {
  stats?: CanonicalPingTaskStats[]
}

export interface PingTask {
  id: number
  name: string
}

interface SharedPingRecordsState {
  recordsByClient: Map<string, PingRecord[]>
  canonicalStatsByClient: Map<string, CanonicalPingTaskStats[]>
  lossHistoryByClient: Map<string, Map<number, NodePingHistoryPoint[]>>
  tasks: PingTask[]
  from: string
  to: string
}

interface SharedPingRecordsEntry {
  data: ReturnType<typeof shallowRef<SharedPingRecordsState | null>>
  loading: ReturnType<typeof ref<boolean>>
  error: ReturnType<typeof ref<string | null>>
  promise: Promise<void> | null
  refreshTimer: ReturnType<typeof setInterval> | null
  subscribers: number
  lastFetchedAt: number
}

export const NODE_PING_BAR_COUNT = 10
const CACHE_VERSION = 9
const CACHE_KEY_PREFIX = 'komari-theme-emerald:node-ping-stats'
const FULL_LOSS_EPSILON = 1e-6
const CACHE_WRITE_THROTTLE_MS = 60_000
const NODE_PING_LOSS_TREND_POINTS = 60
const IPV4_TASK_NAME_RE = /(?:^|[^a-z0-9])(?:ipv4|v4)(?:$|[^a-z0-9])/
const IPV6_TASK_NAME_RE = /(?:^|[^a-z0-9])(?:ipv6|v6)(?:$|[^a-z0-9])/
const sharedPingRecordsCache = new Map<number, SharedPingRecordsEntry>()

interface TaskRecordSummary {
  total: number
  success: number
}

function getPingRecordRefreshIntervalMs(hours: number): number {
  if (hours <= 1)
    return 60_000
  if (hours <= 12)
    return 2 * 60_000
  if (hours <= 24)
    return 5 * 60_000
  if (hours <= 72)
    return 10 * 60_000
  return 15 * 60_000
}

function createEmptyStats(): NodePingStatsState {
  return {
    avgLatency: 0,
    avgLoss: 0,
    avgVolatility: 0,
    history: [],
    hasData: false,
    taskStats: [],
  }
}

function average(values: number[]): number {
  if (!values.length)
    return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function summarizeTaskRecords(records: PingRecord[]): Map<number, TaskRecordSummary> {
  const summaries = new Map<number, TaskRecordSummary>()

  for (const record of records) {
    const summary = summaries.get(record.task_id) ?? { total: 0, success: 0 }
    summary.total += 1
    if (record.value >= 0) {
      summary.success += 1
    }
    summaries.set(record.task_id, summary)
  }

  return summaries
}

function getIncludedTaskIds(records: PingRecord[]): Set<number> {
  const recordSummaries = summarizeTaskRecords(records)

  return new Set(
    [...recordSummaries.entries()]
      .filter(([, summary]) => summary.total > 0)
      .map(([taskId]) => taskId),
  )
}

function getCacheKey(uuid: string, hours: number): string {
  return `${CACHE_KEY_PREFIX}:${uuid}:${hours}`
}

function isValidHistoryPoint(value: unknown): value is NodePingHistoryPoint {
  if (!value || typeof value !== 'object')
    return false

  const point = value as Record<string, unknown>
  const latency = point.latency
  const loss = point.loss

  return typeof point.time === 'string'
    && (latency === null || typeof latency === 'number')
    && (loss === null || typeof loss === 'number')
}

function isValidStatsState(value: unknown): value is NodePingStatsState {
  if (!value || typeof value !== 'object')
    return false

  const state = value as Record<string, unknown>
  return typeof state.avgLatency === 'number'
    && typeof state.avgLoss === 'number'
    && typeof state.avgVolatility === 'number'
    && typeof state.hasData === 'boolean'
    && Array.isArray(state.history)
    && state.history.every(isValidHistoryPoint)
    && Array.isArray(state.taskStats)
    && state.taskStats.every(isValidTaskStats)
}

function isValidTaskStats(value: unknown): value is NodePingTaskStats {
  if (!value || typeof value !== 'object')
    return false

  const task = value as Record<string, unknown>
  return typeof task.taskId === 'number'
    && typeof task.taskName === 'string'
    && (task.ipFamily === 'ipv4' || task.ipFamily === 'ipv6' || task.ipFamily === 'other')
    && typeof task.avgLatency === 'number'
    && typeof task.avgLoss === 'number'
    && typeof task.avgVolatility === 'number'
    && typeof task.hasData === 'boolean'
    && Array.isArray(task.history)
    && task.history.every(isValidHistoryPoint)
    && Array.isArray(task.taskStats)
}

function readStatsCache(uuid: string, hours: number): NodePingStatsState | null {
  if (typeof window === 'undefined')
    return null

  try {
    const raw = window.localStorage.getItem(getCacheKey(uuid, hours))
    if (!raw)
      return null

    const parsed = JSON.parse(raw) as { version?: number, stats?: unknown }
    if (parsed.version !== CACHE_VERSION || !isValidStatsState(parsed.stats))
      return null

    return parsed.stats
  }
  catch {
    return null
  }
}

function writeStatsCache(uuid: string, hours: number, value: NodePingStatsState): void {
  if (typeof window === 'undefined')
    return

  try {
    window.localStorage.setItem(
      getCacheKey(uuid, hours),
      JSON.stringify({
        version: CACHE_VERSION,
        updatedAt: new Date().toISOString(),
        stats: value,
      }),
    )
  }
  catch {
  }
}

function createSharedPingRecordsEntry(): SharedPingRecordsEntry {
  return {
    data: shallowRef<SharedPingRecordsState | null>(null),
    loading: ref(false),
    error: ref<string | null>(null),
    promise: null,
    refreshTimer: null,
    subscribers: 0,
    lastFetchedAt: 0,
  }
}

function getSharedPingRecordsEntry(hours: number): SharedPingRecordsEntry {
  const cachedEntry = sharedPingRecordsCache.get(hours)
  if (cachedEntry)
    return cachedEntry

  const nextEntry = createSharedPingRecordsEntry()
  sharedPingRecordsCache.set(hours, nextEntry)
  return nextEntry
}

function buildRecordsByClient(records: PingRecord[]): Map<string, PingRecord[]> {
  const grouped = new Map<string, PingRecord[]>()

  for (const record of records) {
    if (!record.client)
      continue

    const clientRecords = grouped.get(record.client) ?? []
    clientRecords.push(record)
    grouped.set(record.client, clientRecords)
  }

  for (const clientRecords of grouped.values()) {
    clientRecords.sort(
      (left, right) => new Date(left.time).getTime() - new Date(right.time).getTime(),
    )
  }

  return grouped
}

function buildCanonicalStatsByClient(
  stats: CanonicalPingTaskStats[],
): Map<string, CanonicalPingTaskStats[]> {
  const grouped = new Map<string, CanonicalPingTaskStats[]>()
  for (const stat of stats) {
    const clientStats = grouped.get(stat.entity_id) ?? []
    clientStats.push(stat)
    grouped.set(stat.entity_id, clientStats)
  }
  return grouped
}

function buildLossHistory(
  points: PingMetricPoint[],
  rangeStart: string,
  rangeEnd: string,
): NodePingHistoryPoint[] {
  const firstTime = new Date(rangeStart).getTime()
  const lastTime = new Date(rangeEnd).getTime()
  const range = Math.max(1, lastTime - firstTime)
  const buckets: Array<{ weightedLoss: number, count: number }> = []
  for (let index = 0; index < NODE_PING_BAR_COUNT; index++) {
    buckets.push({ weightedLoss: 0, count: 0 })
  }

  for (const point of points) {
    if (!isFiniteNumber(point.value))
      continue
    const timestamp = new Date(point.time).getTime()
    if (!Number.isFinite(timestamp))
      continue
    const rawIndex = Math.floor((timestamp - firstTime) / range * NODE_PING_BAR_COUNT)
    const index = Math.min(NODE_PING_BAR_COUNT - 1, Math.max(0, rawIndex))
    const count = isFiniteNumber(point.count) && point.count > 0 ? point.count : 1
    const bucket = buckets[index]
    if (!bucket)
      continue
    bucket.weightedLoss += Math.max(0, Math.min(1, point.value)) * count
    bucket.count += count
  }

  return buckets.map((bucket, index) => ({
    time: new Date(firstTime + range * index / NODE_PING_BAR_COUNT).toISOString(),
    latency: null,
    loss: bucket.count > 0 ? bucket.weightedLoss / bucket.count * 100 : null,
  }))
}

function buildLossHistoryByClient(
  seriesList: PingLossMetricSeries[],
  rangeStart: string,
  rangeEnd: string,
): Map<string, Map<number, NodePingHistoryPoint[]>> {
  const grouped = new Map<string, Map<number, NodePingHistoryPoint[]>>()

  for (const series of seriesList) {
    const taskId = Number(
      series.tags?.task_id
      ?? series.points?.find(point => point.tags?.task_id)?.tags?.task_id,
    )
    if (!series.entity_id || !Number.isInteger(taskId))
      continue

    const clientHistory = grouped.get(series.entity_id) ?? new Map<number, NodePingHistoryPoint[]>()
    clientHistory.set(taskId, buildLossHistory(series.points ?? [], rangeStart, rangeEnd))
    grouped.set(series.entity_id, clientHistory)
  }

  return grouped
}

async function loadSharedPingRecords(entry: SharedPingRecordsEntry, hours: number): Promise<void> {
  if (entry.promise)
    return entry.promise

  const rpc = getSharedRpc()
  entry.loading.value = true
  entry.error.value = null

  entry.promise = (async () => {
    try {
      const end = new Date()
      const start = new Date(end.getTime() - hours * 60 * 60 * 1000)
      const timeWindow = {
        start: start.toISOString(),
        end: end.toISOString(),
      }
      const recordsPromise = rpc.getClient().call<SharedPingRecordsResponse>('common:getRecords', {
        type: 'ping',
        ...timeWindow,
      })
      const canonicalPromise = Promise.all([
        rpc.getClient().call<CanonicalPingStatsResponse>('public:getPingMetricWindowStats', timeWindow),
        rpc.getClient().call<PingLossMetricResponse>('public:queryMetrics', {
          metric_keys: ['ping.loss'],
          ...timeWindow,
          downsample: true,
          max_points: NODE_PING_LOSS_TREND_POINTS,
          aggregation: 'avg',
        }),
      ]).catch(() => null)
      const [result, canonicalResult] = await Promise.all([recordsPromise, canonicalPromise])
      const rangeStart = result?.from ?? timeWindow.start
      const rangeEnd = result?.to ?? timeWindow.end
      const [statsResult, lossResult] = canonicalResult ?? [{ stats: [] }, { series: [] }]

      entry.data.value = {
        recordsByClient: buildRecordsByClient(result?.records ?? []),
        canonicalStatsByClient: buildCanonicalStatsByClient(statsResult?.stats ?? []),
        lossHistoryByClient: buildLossHistoryByClient(lossResult?.series ?? [], rangeStart, rangeEnd),
        tasks: result?.tasks ?? [],
        from: rangeStart,
        to: rangeEnd,
      }
      entry.lastFetchedAt = Date.now()
    }
    catch (err) {
      entry.error.value = err instanceof Error ? err.message : '获取 Ping 历史失败'
      throw err
    }
    finally {
      entry.loading.value = false
      entry.promise = null
    }
  })()

  return entry.promise
}

function startSharedPingRecordsRefresh(entry: SharedPingRecordsEntry, hours: number): void {
  if (entry.refreshTimer)
    return

  entry.refreshTimer = setInterval(() => {
    void loadSharedPingRecords(entry, hours).catch(() => {})
  }, getPingRecordRefreshIntervalMs(hours))
}

function stopSharedPingRecordsRefresh(entry: SharedPingRecordsEntry): void {
  if (!entry.refreshTimer)
    return

  clearInterval(entry.refreshTimer)
  entry.refreshTimer = null
}

function retainSharedPingRecordsEntry(hours: number): () => void {
  const entry = getSharedPingRecordsEntry(hours)
  entry.subscribers += 1
  startSharedPingRecordsRefresh(entry, hours)

  let released = false
  return () => {
    if (released)
      return

    released = true
    entry.subscribers = Math.max(0, entry.subscribers - 1)
    if (entry.subscribers === 0)
      stopSharedPingRecordsRefresh(entry)
  }
}

function buildPingHistory(
  records: PingRecord[],
  rangeStart: string,
  rangeEnd: string,
): NodePingHistoryPoint[] {
  const sortedRecords = records
    .map((record) => {
      const timestamp = new Date(record.time).getTime()
      return { ...record, timestamp }
    })
    .filter(record => Number.isFinite(record.timestamp))
    .sort((left, right) => left.timestamp - right.timestamp)

  if (!sortedRecords.length)
    return []

  const parsedStart = new Date(rangeStart).getTime()
  const parsedEnd = new Date(rangeEnd).getTime()
  const firstRecordTime = sortedRecords[0]?.timestamp ?? 0
  const lastRecordTime = sortedRecords.at(-1)?.timestamp ?? firstRecordTime
  const firstTime = Number.isFinite(parsedStart) ? parsedStart : firstRecordTime
  const lastTime = Number.isFinite(parsedEnd) && parsedEnd > firstTime ? parsedEnd : lastRecordTime
  const bucketSize = Math.max(1, (lastTime - firstTime) / NODE_PING_BAR_COUNT)

  return Array.from({ length: NODE_PING_BAR_COUNT }, (_, index) => {
    const startTime = firstTime + bucketSize * index
    const endTime = index === NODE_PING_BAR_COUNT - 1 ? lastTime + 1 : startTime + bucketSize
    const bucketRecords = sortedRecords.filter(
      record => record.timestamp >= startTime && record.timestamp < endTime,
    )
    const validLatencyRecords = bucketRecords.filter(record => record.value >= 0)
    const lostCount = bucketRecords.length - validLatencyRecords.length
    const latency = validLatencyRecords.length
      ? average(validLatencyRecords.map(record => record.value))
      : null
    const loss = bucketRecords.length
      ? lostCount / bucketRecords.length * 100
      : null

    return {
      time: new Date(startTime).toISOString(),
      latency,
      loss,
    }
  })
}

function getPercentile(values: number[], percentile: number): number | null {
  if (!values.length)
    return null

  const sorted = [...values].sort((left, right) => left - right)
  const position = Math.min(sorted.length - 1, Math.max(0, (sorted.length - 1) * percentile))
  const lowerIndex = Math.floor(position)
  const upperIndex = Math.ceil(position)
  const lowerValue = sorted[lowerIndex]
  const upperValue = sorted[upperIndex]

  if (lowerValue === undefined || upperValue === undefined)
    return null
  if (lowerIndex === upperIndex)
    return lowerValue

  return lowerValue + (upperValue - lowerValue) * (position - lowerIndex)
}

function buildBaseStats(
  records: PingRecord[],
  rangeStart: string,
  rangeEnd: string,
): NodePingStatsState {
  const includedTaskIds = getIncludedTaskIds(records)

  if (!includedTaskIds.size)
    return createEmptyStats()

  const filteredRecords = records.filter(record => includedTaskIds.has(record.task_id))
  const history = buildPingHistory(filteredRecords, rangeStart, rangeEnd)
  const taskRecords = new Map<number, PingRecord[]>()

  for (const record of filteredRecords) {
    const currentRecords = taskRecords.get(record.task_id) ?? []
    currentRecords.push(record)
    taskRecords.set(record.task_id, currentRecords)
  }

  const latencyValues: number[] = []
  const taskLossValues: number[] = []
  const volatilityValues: number[] = []

  for (const recordsByTask of taskRecords.values()) {
    const validValues = recordsByTask
      .map(record => record.value)
      .filter(value => value >= 0)

    taskLossValues.push((recordsByTask.length - validValues.length) / recordsByTask.length * 100)

    if (!validValues.length)
      continue

    latencyValues.push(average(validValues))

    if (validValues.length > 1) {
      const p50 = getPercentile(validValues, 0.5)
      const p99 = getPercentile(validValues, 0.99)
      if (isFiniteNumber(p50) && isFiniteNumber(p99) && p50 > FULL_LOSS_EPSILON) {
        volatilityValues.push(p99 / p50)
      }
    }
  }

  const historyLatencyValues = history
    .map(point => point.latency)
    .filter(isFiniteNumber)
  const historyLossValues = history
    .map(point => point.loss)
    .filter(isFiniteNumber)

  const avgLatency = latencyValues.length ? average(latencyValues) : average(historyLatencyValues)
  const avgLoss = taskLossValues.length ? average(taskLossValues) : average(historyLossValues)
  const avgVolatility = average(volatilityValues)
  const hasData = history.length > 0 || latencyValues.length > 0 || taskLossValues.length > 0

  return {
    avgLatency,
    avgLoss,
    avgVolatility,
    history,
    hasData,
    taskStats: [],
  }
}

function detectIpFamily(taskName: string): NodePingIpFamily {
  const normalizedName = taskName.trim().toLowerCase()
  if (IPV6_TASK_NAME_RE.test(normalizedName))
    return 'ipv6'
  if (IPV4_TASK_NAME_RE.test(normalizedName))
    return 'ipv4'
  return 'other'
}

function getIpFamilySortOrder(family: NodePingIpFamily): number {
  if (family === 'ipv4')
    return 0
  if (family === 'ipv6')
    return 1
  return 2
}

function mergePingHistory(
  latencyHistory: NodePingHistoryPoint[],
  lossHistory?: NodePingHistoryPoint[],
): NodePingHistoryPoint[] {
  if (!lossHistory?.length)
    return latencyHistory

  return Array.from({ length: NODE_PING_BAR_COUNT }, (_, index) => {
    const latencyPoint = latencyHistory[index]
    const lossPoint = lossHistory[index]
    return {
      time: lossPoint?.time ?? latencyPoint?.time ?? '',
      latency: latencyPoint?.latency ?? null,
      loss: lossPoint?.loss ?? null,
    }
  })
}

function buildStats(
  records: PingRecord[],
  tasks: PingTask[],
  rangeStart: string,
  rangeEnd: string,
  canonicalStats: CanonicalPingTaskStats[] = [],
  lossHistoryByTask: Map<number, NodePingHistoryPoint[]> = new Map(),
): NodePingStatsState {
  const tasksById = new Map(tasks.map(task => [task.id, task]))
  const recordsByTask = new Map<number, PingRecord[]>()
  const canonicalByTask = new Map(
    canonicalStats
      .map(stat => [Number(stat.task_id), stat] as const)
      .filter(([taskId]) => Number.isInteger(taskId)),
  )

  for (const record of records) {
    const taskRecords = recordsByTask.get(record.task_id) ?? []
    taskRecords.push(record)
    recordsByTask.set(record.task_id, taskRecords)
  }

  const taskIds = new Set(
    [...recordsByTask.keys(), ...canonicalByTask.keys()]
      .filter(taskId => tasksById.has(taskId)),
  )
  const taskStats = Array.from(taskIds, (taskId): NodePingTaskStats => {
    const baseStats = buildBaseStats(recordsByTask.get(taskId) ?? [], rangeStart, rangeEnd)
    const canonical = canonicalByTask.get(taskId)
    const taskName = canonical?.name || tasksById.get(taskId)?.name || `Ping ${taskId}`
    const history = mergePingHistory(baseStats.history, lossHistoryByTask.get(taskId))
    const avgLatency = isFiniteNumber(canonical?.avg) ? canonical.avg : baseStats.avgLatency
    const avgLoss = isFiniteNumber(canonical?.loss) ? canonical.loss : baseStats.avgLoss
    const avgVolatility = isFiniteNumber(canonical?.p99_p50_ratio)
      ? canonical.p99_p50_ratio
      : baseStats.avgVolatility

    return {
      avgLatency,
      avgLoss,
      avgVolatility,
      history,
      hasData: Boolean(canonical?.total) || baseStats.hasData,
      taskStats: [],
      taskId,
      taskName,
      ipFamily: detectIpFamily(taskName),
    }
  })
    .sort((left, right) => {
      const familyOrder = getIpFamilySortOrder(left.ipFamily) - getIpFamilySortOrder(right.ipFamily)
      return familyOrder || left.taskId - right.taskId
    })

  const populatedTasks = taskStats.filter(task => task.hasData)
  return {
    avgLatency: average(populatedTasks.map(task => task.avgLatency)),
    avgLoss: average(populatedTasks.map(task => task.avgLoss)),
    avgVolatility: average(populatedTasks.map(task => task.avgVolatility)),
    history: [],
    hasData: populatedTasks.length > 0,
    taskStats,
  }
}

export function useNodePingStats(
  uuid: MaybeRefOrGetter<string>,
  options?: {
    hours?: MaybeRefOrGetter<number>
    enabled?: MaybeRefOrGetter<boolean>
  },
) {
  const loading = ref(false)
  const error = ref<string | null>(null)

  const resolved = computed(() => ({
    uuid: toValue(uuid),
    hours: Math.max(1, Math.floor(toValue(options?.hours) ?? 24)),
    enabled: toValue(options?.enabled) ?? true,
  }))

  let activeHours: number | null = null
  let releaseSharedRecords: (() => void) | null = null

  function syncSharedRecordsSubscription(hours: number | null): void {
    if (activeHours === hours)
      return

    releaseSharedRecords?.()
    releaseSharedRecords = null
    activeHours = null

    if (hours === null)
      return

    releaseSharedRecords = retainSharedPingRecordsEntry(hours)
    activeHours = hours
  }

  onScopeDispose(() => {
    syncSharedRecordsSubscription(null)
  })

  // stats 由共享 getRecords 的近期样本派生，不将结果视为完整的 hours 时段数据。
  const stats = computed<NodePingStatsState>(() => {
    const { uuid: nodeUuid, hours, enabled } = resolved.value
    if (!enabled || !nodeUuid.trim())
      return createEmptyStats()

    // 通过 getSharedPingRecordsEntry 读取（不存在则创建），确保 computed 始终对
    // entry.data 这个 shallowRef 建立响应式依赖——即便首次加载尚未返回。
    const entry = getSharedPingRecordsEntry(hours)
    const state = entry.data.value
    if (!state)
      return readStatsCache(nodeUuid, hours) ?? createEmptyStats()

    const records = state.recordsByClient.get(nodeUuid) ?? []
    const canonicalStats = state.canonicalStatsByClient?.get(nodeUuid) ?? []
    if (!records.length && !canonicalStats.length)
      return createEmptyStats()
    return buildStats(
      records,
      state.tasks,
      state.from,
      state.to,
      canonicalStats,
      state.lossHistoryByClient?.get(nodeUuid),
    )
  })

  // 副作用：按需触发首次共享加载并维护 loading/error，不再命令式写入 stats。
  watch(
    resolved,
    async (next, _previous, onCleanup) => {
      let cancelled = false
      onCleanup(() => {
        cancelled = true
      })

      const { uuid: nodeUuid, hours, enabled } = next
      if (!enabled || !nodeUuid.trim()) {
        syncSharedRecordsSubscription(null)
        loading.value = false
        error.value = null
        return
      }

      syncSharedRecordsSubscription(hours)
      const entry = getSharedPingRecordsEntry(hours)
      const refreshInterval = getPingRecordRefreshIntervalMs(hours)
      const shouldLoadRecords = !entry.data.value
        || Date.now() - entry.lastFetchedAt >= refreshInterval

      if (!shouldLoadRecords) {
        loading.value = false
        error.value = null
        return
      }

      const shouldShowLoading = !entry.data.value
      loading.value = shouldShowLoading
      error.value = null

      try {
        await loadSharedPingRecords(entry, hours)
      }
      catch (err) {
        if (!cancelled && shouldShowLoading)
          error.value = err instanceof Error ? err.message : '获取 Ping 历史失败'
      }
      finally {
        if (!cancelled)
          loading.value = false
      }
    },
    { immediate: true },
  )

  // 共享记录会定时刷新，节流回写 localStorage，避免多节点同时重算时密集写盘。
  const persistStats = useThrottleFn(
    (nodeUuid: string, hours: number, value: NodePingStatsState) => {
      writeStatsCache(nodeUuid, hours, value)
    },
    CACHE_WRITE_THROTTLE_MS,
    true,
    true,
  )

  watch(stats, (value) => {
    if (!value.hasData)
      return
    const { uuid: nodeUuid, hours, enabled } = resolved.value
    if (enabled && nodeUuid.trim())
      persistStats(nodeUuid, hours, value)
  })

  return {
    stats,
    loading,
    error,
    tasksLoaded: computed(() => {
      const { hours, enabled } = resolved.value
      return enabled && getSharedPingRecordsEntry(hours).data.value !== null
    }),
    tasks: computed(() => {
      const { hours, enabled } = resolved.value
      if (!enabled)
        return []
      return getSharedPingRecordsEntry(hours).data.value?.tasks ?? []
    }),
    history: computed(() => stats.value.history),
    avgLatency: computed(() => stats.value.avgLatency),
    avgLoss: computed(() => stats.value.avgLoss),
    avgVolatility: computed(() => stats.value.avgVolatility),
    hasData: computed(() => stats.value.hasData),
  }
}
