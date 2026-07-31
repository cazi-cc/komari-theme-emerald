export const THEME_SHORT = 'Emerald-Cazi'
export const MAX_HOME_PING_TASKS = 8
export const NETWORK_SCORE_MODEL_VERSION = 2
export const TCP_QUALITY_SCORE_MODEL_VERSION = 3

export type PingChartLayout = 'combined' | 'split'
export type HomeAnalysisEntry = 'network-comparison' | 'tcp-quality' | 'unlock-quality'

export const HOME_ANALYSIS_ENTRIES: readonly HomeAnalysisEntry[] = [
  'network-comparison',
  'tcp-quality',
  'unlock-quality',
]

export function filterAvailableHomePingTaskIds(
  taskIds: readonly number[],
  availableTaskIds: ReadonlySet<number>,
): number[] {
  return taskIds.filter(taskId => availableTaskIds.has(taskId))
}

export function resolveHomePingTaskId(
  taskId: number | null,
  tasksLoaded: boolean,
  availableTaskIds: ReadonlySet<number>,
): number | null {
  if (taskId === null || !tasksLoaded)
    return taskId
  return availableTaskIds.has(taskId) ? taskId : null
}

export interface ThemeSettings {
  dataUpdateInterval: number
  rpcTransportMode: 'websocket' | 'http'
  defaultViewMode: 'card' | 'list'
  alertEnabled: boolean
  alertTitle: string
  alertContent: string
  earthViewMode: 'earth' | 'earth-stop' | 'maps' | 'cards' | 'hide'
  visitorInfoCardEnabled: boolean
  hideAdminEntryWhenLoggedOut: boolean
  disablePageAnimation: boolean
  icpEnabled: boolean
  icpNumber: string
  icpUrl: string
  policeEnabled: boolean
  policeNumber: string
  policeUrl: string
  backgroundEnabled: boolean
  backgroundType: 'image' | 'video'
  lightBackgroundUrl: string
  darkBackgroundUrl: string
  backgroundBlur: number
  backgroundOverlay: number
  homeAnalysisEntries: HomeAnalysisEntry[]
  homePingTasksByNode: Record<string, number[]>
  homePingRowCount: number
  homePingHistoryHours: number
  pingTaskColors: Record<string, string>
  pingExcellentColor: string
  pingGoodColor: string
  pingModerateColor: string
  pingWarningColor: string
  pingCriticalColor: string
  pingChartDefaultHours: number
  pingChartLayout: PingChartLayout
  pingChartShowZoom: boolean
  pingChartAutoRefresh: boolean
  pingChartRefreshInterval: number
  pingLatencyWarning: number
  pingLatencyCritical: number
  pingLossWarning: number
  pingLossCritical: number
  networkCompareDefaultHours: number
  networkScoreModelVersion: number
  networkScoreLossWeight: number
  networkScoreP50Weight: number
  networkScoreP95Weight: number
  networkScoreVolatilityWeight: number
  networkScoreCoverageWeight: number
  networkScoreMinSamples: number
  networkScoreMinCoverage: number
  networkScoreExcellentThreshold: number
  networkScoreGoodThreshold: number
  networkScoreFairThreshold: number
  tcpQualityDefaultHours: number
  tcpQualityScoreModelVersion: number
  tcpOverallICMPWeight: number
  tcpOverallStandardWeight: number
  tcpOverallLargeWeight: number
  tcpStandardLossWeight: number
  tcpStandardP50Weight: number
  tcpStandardP95Weight: number
  tcpStandardCoverageWeight: number
  tcpLargeLossWeight: number
  tcpLargeExtraLossWeight: number
  tcpLargeP95DegradationWeight: number
  tcpLargeCoverageWeight: number
  tcpProfileMeanWeight: number
  tcpProfileP20Weight: number
  tcpMinimumRuns: number
  tcpMinimumStandardSamples: number
  tcpMinimumLargeSamples: number
  tcpMinimumTargetCoverage: number
  tcpReferenceFailureThreshold: number
  tcpGuardWarningLoss: number
  tcpGuardWarningMaximumScore: number
  tcpGuardCriticalLoss: number
  tcpGuardCriticalMaximumScore: number
  tcpGuardSevereLoss: number
  tcpGuardSevereMaximumScore: number
  tcpExcellentThreshold: number
  tcpGoodThreshold: number
  tcpFairThreshold: number
  unlockQualityDefaultHours: number
}

export const DEFAULT_THEME_SETTINGS: ThemeSettings = {
  dataUpdateInterval: 3,
  rpcTransportMode: 'websocket',
  defaultViewMode: 'card',
  alertEnabled: false,
  alertTitle: '',
  alertContent: '',
  earthViewMode: 'earth',
  visitorInfoCardEnabled: true,
  hideAdminEntryWhenLoggedOut: false,
  disablePageAnimation: false,
  icpEnabled: false,
  icpNumber: '',
  icpUrl: 'https://beian.miit.gov.cn/',
  policeEnabled: false,
  policeNumber: '',
  policeUrl: '',
  backgroundEnabled: false,
  backgroundType: 'image',
  lightBackgroundUrl: '',
  darkBackgroundUrl: '',
  backgroundBlur: 0,
  backgroundOverlay: 0,
  homeAnalysisEntries: [...HOME_ANALYSIS_ENTRIES],
  homePingTasksByNode: {},
  homePingRowCount: 2,
  homePingHistoryHours: 1,
  pingTaskColors: {},
  pingExcellentColor: '#5EEAA6',
  pingGoodColor: '#47B592',
  pingModerateColor: '#A3E635',
  pingWarningColor: '#FACC15',
  pingCriticalColor: '#F43F5E',
  pingChartDefaultHours: 1,
  pingChartLayout: 'combined',
  pingChartShowZoom: true,
  pingChartAutoRefresh: true,
  pingChartRefreshInterval: 60,
  pingLatencyWarning: 160,
  pingLatencyCritical: 300,
  pingLossWarning: 3,
  pingLossCritical: 10,
  networkCompareDefaultHours: 24,
  networkScoreModelVersion: NETWORK_SCORE_MODEL_VERSION,
  networkScoreLossWeight: 40,
  networkScoreP50Weight: 30,
  networkScoreP95Weight: 25,
  networkScoreVolatilityWeight: 3,
  networkScoreCoverageWeight: 2,
  networkScoreMinSamples: 30,
  networkScoreMinCoverage: 20,
  networkScoreExcellentThreshold: 95,
  networkScoreGoodThreshold: 85,
  networkScoreFairThreshold: 70,
  tcpQualityDefaultHours: 24,
  tcpQualityScoreModelVersion: TCP_QUALITY_SCORE_MODEL_VERSION,
  tcpOverallICMPWeight: 35,
  tcpOverallStandardWeight: 55,
  tcpOverallLargeWeight: 10,
  tcpStandardLossWeight: 55,
  tcpStandardP50Weight: 15,
  tcpStandardP95Weight: 25,
  tcpStandardCoverageWeight: 5,
  tcpLargeLossWeight: 55,
  tcpLargeExtraLossWeight: 25,
  tcpLargeP95DegradationWeight: 15,
  tcpLargeCoverageWeight: 5,
  tcpProfileMeanWeight: 70,
  tcpProfileP20Weight: 30,
  tcpMinimumRuns: 3,
  tcpMinimumStandardSamples: 90,
  tcpMinimumLargeSamples: 30,
  tcpMinimumTargetCoverage: 80,
  tcpReferenceFailureThreshold: 70,
  tcpGuardWarningLoss: 3,
  tcpGuardWarningMaximumScore: 84.9,
  tcpGuardCriticalLoss: 5,
  tcpGuardCriticalMaximumScore: 69.9,
  tcpGuardSevereLoss: 10,
  tcpGuardSevereMaximumScore: 49.9,
  tcpExcellentThreshold: 95,
  tcpGoodThreshold: 85,
  tcpFairThreshold: 70,
  unlockQualityDefaultHours: 24,
}

const HEX_COLOR_RE = /^#[0-9a-f]{6}$/i
const TASK_ID_RE = /^\d+$/
const VALID_CHART_HOURS = new Set([1, 6, 12, 24, 72, 168])

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    return fallback
  return Math.min(max, Math.max(min, value))
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function readColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR_RE.test(value) ? value.toUpperCase() : fallback
}

function readObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return value as Record<string, unknown>

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
        return parsed as Record<string, unknown>
    }
    catch {
    }
  }

  return {}
}

function readTaskMap(value: unknown): Record<string, number[]> {
  const result: Record<string, number[]> = {}
  const source = readObject(value)

  for (const [uuid, taskIds] of Object.entries(source)) {
    if (!Array.isArray(taskIds))
      continue

    result[uuid] = [...new Set(taskIds
      .filter((taskId): taskId is number => typeof taskId === 'number' && Number.isInteger(taskId) && taskId >= 0))]
      .slice(0, MAX_HOME_PING_TASKS)
  }

  return result
}

function readHomeAnalysisEntries(value: unknown): HomeAnalysisEntry[] {
  if (value === undefined)
    return [...DEFAULT_THEME_SETTINGS.homeAnalysisEntries]
  if (!Array.isArray(value))
    return [...DEFAULT_THEME_SETTINGS.homeAnalysisEntries]

  const validEntries = new Set<HomeAnalysisEntry>(HOME_ANALYSIS_ENTRIES)
  return [...new Set(value.filter(
    (entry): entry is HomeAnalysisEntry => typeof entry === 'string' && validEntries.has(entry as HomeAnalysisEntry),
  ))]
}

function readColorMap(value: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  const source = readObject(value)

  for (const [taskId, color] of Object.entries(source)) {
    if (TASK_ID_RE.test(taskId) && typeof color === 'string' && HEX_COLOR_RE.test(color))
      result[taskId] = color.toUpperCase()
  }

  return result
}

function ensureNonZeroWeights(values: number[], fallback: number[]): number[] {
  return values.every(weight => weight === 0) ? fallback : values
}

export function normalizeThemeSettings(value: unknown): ThemeSettings {
  const source = readObject(value)
  const usesCurrentScoreModel = source.networkScoreModelVersion === NETWORK_SCORE_MODEL_VERSION
  const scoreSource = usesCurrentScoreModel ? source : {}
  const usesCurrentTCPScoreModel = source.tcpQualityScoreModelVersion === TCP_QUALITY_SCORE_MODEL_VERSION
  const tcpScoreSource = usesCurrentTCPScoreModel ? source : {}
  const defaultHours = typeof source.pingChartDefaultHours === 'number' && VALID_CHART_HOURS.has(source.pingChartDefaultHours)
    ? source.pingChartDefaultHours
    : DEFAULT_THEME_SETTINGS.pingChartDefaultHours
  const fairThreshold = clampNumber(scoreSource.networkScoreFairThreshold, DEFAULT_THEME_SETTINGS.networkScoreFairThreshold, 0, 100)
  const goodThreshold = Math.max(fairThreshold, clampNumber(scoreSource.networkScoreGoodThreshold, DEFAULT_THEME_SETTINGS.networkScoreGoodThreshold, 0, 100))
  const excellentThreshold = Math.max(goodThreshold, clampNumber(scoreSource.networkScoreExcellentThreshold, DEFAULT_THEME_SETTINGS.networkScoreExcellentThreshold, 0, 100))
  const tcpFairThreshold = clampNumber(tcpScoreSource.tcpFairThreshold, DEFAULT_THEME_SETTINGS.tcpFairThreshold, 0, 100)
  const tcpGoodThreshold = Math.max(tcpFairThreshold, clampNumber(tcpScoreSource.tcpGoodThreshold, DEFAULT_THEME_SETTINGS.tcpGoodThreshold, 0, 100))
  const tcpExcellentThreshold = Math.max(tcpGoodThreshold, clampNumber(tcpScoreSource.tcpExcellentThreshold, DEFAULT_THEME_SETTINGS.tcpExcellentThreshold, 0, 100))
  const tcpGuardWarningLoss = clampNumber(tcpScoreSource.tcpGuardWarningLoss, DEFAULT_THEME_SETTINGS.tcpGuardWarningLoss, 0, 100)
  const tcpGuardCriticalLoss = Math.max(tcpGuardWarningLoss, clampNumber(tcpScoreSource.tcpGuardCriticalLoss, DEFAULT_THEME_SETTINGS.tcpGuardCriticalLoss, 0, 100))
  const tcpGuardSevereLoss = Math.max(tcpGuardCriticalLoss, clampNumber(tcpScoreSource.tcpGuardSevereLoss, DEFAULT_THEME_SETTINGS.tcpGuardSevereLoss, 0, 100))
  const tcpGuardWarningMaximumScore = clampNumber(tcpScoreSource.tcpGuardWarningMaximumScore, DEFAULT_THEME_SETTINGS.tcpGuardWarningMaximumScore, 0, 100)
  const tcpGuardCriticalMaximumScore = Math.min(tcpGuardWarningMaximumScore, clampNumber(tcpScoreSource.tcpGuardCriticalMaximumScore, DEFAULT_THEME_SETTINGS.tcpGuardCriticalMaximumScore, 0, 100))
  const tcpGuardSevereMaximumScore = Math.min(tcpGuardCriticalMaximumScore, clampNumber(tcpScoreSource.tcpGuardSevereMaximumScore, DEFAULT_THEME_SETTINGS.tcpGuardSevereMaximumScore, 0, 100))
  const tcpOverallWeights = ensureNonZeroWeights([
    clampNumber(tcpScoreSource.tcpOverallICMPWeight, DEFAULT_THEME_SETTINGS.tcpOverallICMPWeight, 0, 100),
    clampNumber(tcpScoreSource.tcpOverallStandardWeight, DEFAULT_THEME_SETTINGS.tcpOverallStandardWeight, 0, 100),
    clampNumber(tcpScoreSource.tcpOverallLargeWeight, DEFAULT_THEME_SETTINGS.tcpOverallLargeWeight, 0, 100),
  ], [DEFAULT_THEME_SETTINGS.tcpOverallICMPWeight, DEFAULT_THEME_SETTINGS.tcpOverallStandardWeight, DEFAULT_THEME_SETTINGS.tcpOverallLargeWeight])
  const tcpStandardWeights = ensureNonZeroWeights([
    clampNumber(tcpScoreSource.tcpStandardLossWeight, DEFAULT_THEME_SETTINGS.tcpStandardLossWeight, 0, 100),
    clampNumber(tcpScoreSource.tcpStandardP50Weight, DEFAULT_THEME_SETTINGS.tcpStandardP50Weight, 0, 100),
    clampNumber(tcpScoreSource.tcpStandardP95Weight, DEFAULT_THEME_SETTINGS.tcpStandardP95Weight, 0, 100),
    clampNumber(tcpScoreSource.tcpStandardCoverageWeight, DEFAULT_THEME_SETTINGS.tcpStandardCoverageWeight, 0, 100),
  ], [DEFAULT_THEME_SETTINGS.tcpStandardLossWeight, DEFAULT_THEME_SETTINGS.tcpStandardP50Weight, DEFAULT_THEME_SETTINGS.tcpStandardP95Weight, DEFAULT_THEME_SETTINGS.tcpStandardCoverageWeight])
  const tcpLargeWeights = ensureNonZeroWeights([
    clampNumber(tcpScoreSource.tcpLargeLossWeight, DEFAULT_THEME_SETTINGS.tcpLargeLossWeight, 0, 100),
    clampNumber(tcpScoreSource.tcpLargeExtraLossWeight, DEFAULT_THEME_SETTINGS.tcpLargeExtraLossWeight, 0, 100),
    clampNumber(tcpScoreSource.tcpLargeP95DegradationWeight, DEFAULT_THEME_SETTINGS.tcpLargeP95DegradationWeight, 0, 100),
    clampNumber(tcpScoreSource.tcpLargeCoverageWeight, DEFAULT_THEME_SETTINGS.tcpLargeCoverageWeight, 0, 100),
  ], [DEFAULT_THEME_SETTINGS.tcpLargeLossWeight, DEFAULT_THEME_SETTINGS.tcpLargeExtraLossWeight, DEFAULT_THEME_SETTINGS.tcpLargeP95DegradationWeight, DEFAULT_THEME_SETTINGS.tcpLargeCoverageWeight])
  const tcpProfileWeights = ensureNonZeroWeights([
    clampNumber(tcpScoreSource.tcpProfileMeanWeight, DEFAULT_THEME_SETTINGS.tcpProfileMeanWeight, 0, 100),
    clampNumber(tcpScoreSource.tcpProfileP20Weight, DEFAULT_THEME_SETTINGS.tcpProfileP20Weight, 0, 100),
  ], [DEFAULT_THEME_SETTINGS.tcpProfileMeanWeight, DEFAULT_THEME_SETTINGS.tcpProfileP20Weight])

  return {
    dataUpdateInterval: clampNumber(source.dataUpdateInterval, DEFAULT_THEME_SETTINGS.dataUpdateInterval, 1, 60),
    rpcTransportMode: source.rpcTransportMode === 'http' ? 'http' : 'websocket',
    defaultViewMode: source.defaultViewMode === 'list' ? 'list' : 'card',
    alertEnabled: readBoolean(source.alertEnabled, DEFAULT_THEME_SETTINGS.alertEnabled),
    alertTitle: readString(source.alertTitle, DEFAULT_THEME_SETTINGS.alertTitle),
    alertContent: readString(source.alertContent, DEFAULT_THEME_SETTINGS.alertContent),
    earthViewMode: ['earth', 'earth-stop', 'maps', 'cards', 'hide'].includes(String(source.earthViewMode))
      ? source.earthViewMode as ThemeSettings['earthViewMode']
      : DEFAULT_THEME_SETTINGS.earthViewMode,
    visitorInfoCardEnabled: readBoolean(source.visitorInfoCardEnabled, DEFAULT_THEME_SETTINGS.visitorInfoCardEnabled),
    hideAdminEntryWhenLoggedOut: readBoolean(source.hideAdminEntryWhenLoggedOut, DEFAULT_THEME_SETTINGS.hideAdminEntryWhenLoggedOut),
    disablePageAnimation: readBoolean(source.disablePageAnimation, DEFAULT_THEME_SETTINGS.disablePageAnimation),
    icpEnabled: readBoolean(source.icpEnabled, DEFAULT_THEME_SETTINGS.icpEnabled),
    icpNumber: readString(source.icpNumber, DEFAULT_THEME_SETTINGS.icpNumber),
    icpUrl: readString(source.icpUrl, DEFAULT_THEME_SETTINGS.icpUrl),
    policeEnabled: readBoolean(source.policeEnabled, DEFAULT_THEME_SETTINGS.policeEnabled),
    policeNumber: readString(source.policeNumber, DEFAULT_THEME_SETTINGS.policeNumber),
    policeUrl: readString(source.policeUrl, DEFAULT_THEME_SETTINGS.policeUrl),
    backgroundEnabled: readBoolean(source.backgroundEnabled, DEFAULT_THEME_SETTINGS.backgroundEnabled),
    backgroundType: source.backgroundType === 'video' ? 'video' : 'image',
    lightBackgroundUrl: readString(source.lightBackgroundUrl, DEFAULT_THEME_SETTINGS.lightBackgroundUrl),
    darkBackgroundUrl: readString(source.darkBackgroundUrl, DEFAULT_THEME_SETTINGS.darkBackgroundUrl),
    backgroundBlur: clampNumber(source.backgroundBlur, DEFAULT_THEME_SETTINGS.backgroundBlur, 0, 50),
    backgroundOverlay: clampNumber(source.backgroundOverlay, DEFAULT_THEME_SETTINGS.backgroundOverlay, -100, 100),
    homeAnalysisEntries: readHomeAnalysisEntries(source.homeAnalysisEntries),
    homePingTasksByNode: readTaskMap(source.homePingTasksByNode),
    homePingRowCount: Math.round(clampNumber(source.homePingRowCount, DEFAULT_THEME_SETTINGS.homePingRowCount, 1, MAX_HOME_PING_TASKS)),
    homePingHistoryHours: Math.round(clampNumber(source.homePingHistoryHours, DEFAULT_THEME_SETTINGS.homePingHistoryHours, 1, 168)),
    pingTaskColors: readColorMap(source.pingTaskColors),
    pingExcellentColor: readColor(source.pingExcellentColor, DEFAULT_THEME_SETTINGS.pingExcellentColor),
    pingGoodColor: readColor(source.pingGoodColor, DEFAULT_THEME_SETTINGS.pingGoodColor),
    pingModerateColor: readColor(source.pingModerateColor, DEFAULT_THEME_SETTINGS.pingModerateColor),
    pingWarningColor: readColor(source.pingWarningColor, DEFAULT_THEME_SETTINGS.pingWarningColor),
    pingCriticalColor: readColor(source.pingCriticalColor, DEFAULT_THEME_SETTINGS.pingCriticalColor),
    pingChartDefaultHours: defaultHours,
    pingChartLayout: source.pingChartLayout === 'split' ? 'split' : 'combined',
    pingChartShowZoom: readBoolean(source.pingChartShowZoom, DEFAULT_THEME_SETTINGS.pingChartShowZoom),
    pingChartAutoRefresh: readBoolean(source.pingChartAutoRefresh, DEFAULT_THEME_SETTINGS.pingChartAutoRefresh),
    pingChartRefreshInterval: Math.round(clampNumber(
      source.pingChartRefreshInterval,
      DEFAULT_THEME_SETTINGS.pingChartRefreshInterval,
      10,
      300,
    )),
    pingLatencyWarning: clampNumber(source.pingLatencyWarning, DEFAULT_THEME_SETTINGS.pingLatencyWarning, 1, 5000),
    pingLatencyCritical: clampNumber(source.pingLatencyCritical, DEFAULT_THEME_SETTINGS.pingLatencyCritical, 1, 5000),
    pingLossWarning: clampNumber(source.pingLossWarning, DEFAULT_THEME_SETTINGS.pingLossWarning, 0, 100),
    pingLossCritical: clampNumber(source.pingLossCritical, DEFAULT_THEME_SETTINGS.pingLossCritical, 0, 100),
    networkCompareDefaultHours: typeof source.networkCompareDefaultHours === 'number' && VALID_CHART_HOURS.has(source.networkCompareDefaultHours)
      ? source.networkCompareDefaultHours
      : DEFAULT_THEME_SETTINGS.networkCompareDefaultHours,
    networkScoreModelVersion: NETWORK_SCORE_MODEL_VERSION,
    networkScoreLossWeight: clampNumber(scoreSource.networkScoreLossWeight, DEFAULT_THEME_SETTINGS.networkScoreLossWeight, 0, 100),
    networkScoreP50Weight: clampNumber(scoreSource.networkScoreP50Weight, DEFAULT_THEME_SETTINGS.networkScoreP50Weight, 0, 100),
    networkScoreP95Weight: clampNumber(scoreSource.networkScoreP95Weight, DEFAULT_THEME_SETTINGS.networkScoreP95Weight, 0, 100),
    networkScoreVolatilityWeight: clampNumber(scoreSource.networkScoreVolatilityWeight, DEFAULT_THEME_SETTINGS.networkScoreVolatilityWeight, 0, 100),
    networkScoreCoverageWeight: clampNumber(scoreSource.networkScoreCoverageWeight, DEFAULT_THEME_SETTINGS.networkScoreCoverageWeight, 0, 100),
    networkScoreMinSamples: Math.round(clampNumber(source.networkScoreMinSamples, DEFAULT_THEME_SETTINGS.networkScoreMinSamples, 1, 100000)),
    networkScoreMinCoverage: clampNumber(source.networkScoreMinCoverage, DEFAULT_THEME_SETTINGS.networkScoreMinCoverage, 0, 100),
    networkScoreExcellentThreshold: excellentThreshold,
    networkScoreGoodThreshold: goodThreshold,
    networkScoreFairThreshold: fairThreshold,
    tcpQualityDefaultHours: typeof source.tcpQualityDefaultHours === 'number' && VALID_CHART_HOURS.has(source.tcpQualityDefaultHours)
      ? source.tcpQualityDefaultHours
      : DEFAULT_THEME_SETTINGS.tcpQualityDefaultHours,
    tcpQualityScoreModelVersion: TCP_QUALITY_SCORE_MODEL_VERSION,
    tcpOverallICMPWeight: tcpOverallWeights[0]!,
    tcpOverallStandardWeight: tcpOverallWeights[1]!,
    tcpOverallLargeWeight: tcpOverallWeights[2]!,
    tcpStandardLossWeight: tcpStandardWeights[0]!,
    tcpStandardP50Weight: tcpStandardWeights[1]!,
    tcpStandardP95Weight: tcpStandardWeights[2]!,
    tcpStandardCoverageWeight: tcpStandardWeights[3]!,
    tcpLargeLossWeight: tcpLargeWeights[0]!,
    tcpLargeExtraLossWeight: tcpLargeWeights[1]!,
    tcpLargeP95DegradationWeight: tcpLargeWeights[2]!,
    tcpLargeCoverageWeight: tcpLargeWeights[3]!,
    tcpProfileMeanWeight: tcpProfileWeights[0]!,
    tcpProfileP20Weight: tcpProfileWeights[1]!,
    tcpMinimumRuns: Math.round(clampNumber(tcpScoreSource.tcpMinimumRuns, DEFAULT_THEME_SETTINGS.tcpMinimumRuns, 1, 20)),
    tcpMinimumStandardSamples: Math.round(clampNumber(tcpScoreSource.tcpMinimumStandardSamples, DEFAULT_THEME_SETTINGS.tcpMinimumStandardSamples, 10, 10000)),
    tcpMinimumLargeSamples: Math.round(clampNumber(tcpScoreSource.tcpMinimumLargeSamples, DEFAULT_THEME_SETTINGS.tcpMinimumLargeSamples, 10, 10000)),
    tcpMinimumTargetCoverage: clampNumber(tcpScoreSource.tcpMinimumTargetCoverage, DEFAULT_THEME_SETTINGS.tcpMinimumTargetCoverage, 1, 100),
    tcpReferenceFailureThreshold: clampNumber(tcpScoreSource.tcpReferenceFailureThreshold, DEFAULT_THEME_SETTINGS.tcpReferenceFailureThreshold, 50, 100),
    tcpGuardWarningLoss,
    tcpGuardWarningMaximumScore,
    tcpGuardCriticalLoss,
    tcpGuardCriticalMaximumScore,
    tcpGuardSevereLoss,
    tcpGuardSevereMaximumScore,
    tcpExcellentThreshold,
    tcpGoodThreshold,
    tcpFairThreshold,
    unlockQualityDefaultHours: typeof source.unlockQualityDefaultHours === 'number' && VALID_CHART_HOURS.has(source.unlockQualityDefaultHours)
      ? source.unlockQualityDefaultHours
      : DEFAULT_THEME_SETTINGS.unlockQualityDefaultHours,
  }
}
