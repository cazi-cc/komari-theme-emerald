export const THEME_SHORT = 'Emerald-Cazi'
export const MAX_HOME_PING_TASKS = 8

export type PingChartLayout = 'combined' | 'split'

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
  homePingTasksByNode: Record<string, number[]>
  homePingRowCount: number
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
  homePingTasksByNode: {},
  homePingRowCount: 2,
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
  networkScoreLossWeight: 40,
  networkScoreP50Weight: 25,
  networkScoreP95Weight: 20,
  networkScoreVolatilityWeight: 10,
  networkScoreCoverageWeight: 5,
  networkScoreMinSamples: 30,
  networkScoreMinCoverage: 20,
  networkScoreExcellentThreshold: 85,
  networkScoreGoodThreshold: 70,
  networkScoreFairThreshold: 55,
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

function readColorMap(value: unknown): Record<string, string> {
  const result: Record<string, string> = {}
  const source = readObject(value)

  for (const [taskId, color] of Object.entries(source)) {
    if (TASK_ID_RE.test(taskId) && typeof color === 'string' && HEX_COLOR_RE.test(color))
      result[taskId] = color.toUpperCase()
  }

  return result
}

export function normalizeThemeSettings(value: unknown): ThemeSettings {
  const source = readObject(value)
  const defaultHours = typeof source.pingChartDefaultHours === 'number' && VALID_CHART_HOURS.has(source.pingChartDefaultHours)
    ? source.pingChartDefaultHours
    : DEFAULT_THEME_SETTINGS.pingChartDefaultHours
  const fairThreshold = clampNumber(source.networkScoreFairThreshold, DEFAULT_THEME_SETTINGS.networkScoreFairThreshold, 0, 100)
  const goodThreshold = Math.max(fairThreshold, clampNumber(source.networkScoreGoodThreshold, DEFAULT_THEME_SETTINGS.networkScoreGoodThreshold, 0, 100))
  const excellentThreshold = Math.max(goodThreshold, clampNumber(source.networkScoreExcellentThreshold, DEFAULT_THEME_SETTINGS.networkScoreExcellentThreshold, 0, 100))

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
    homePingTasksByNode: readTaskMap(source.homePingTasksByNode),
    homePingRowCount: Math.round(clampNumber(source.homePingRowCount, DEFAULT_THEME_SETTINGS.homePingRowCount, 1, MAX_HOME_PING_TASKS)),
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
    networkScoreLossWeight: clampNumber(source.networkScoreLossWeight, DEFAULT_THEME_SETTINGS.networkScoreLossWeight, 0, 100),
    networkScoreP50Weight: clampNumber(source.networkScoreP50Weight, DEFAULT_THEME_SETTINGS.networkScoreP50Weight, 0, 100),
    networkScoreP95Weight: clampNumber(source.networkScoreP95Weight, DEFAULT_THEME_SETTINGS.networkScoreP95Weight, 0, 100),
    networkScoreVolatilityWeight: clampNumber(source.networkScoreVolatilityWeight, DEFAULT_THEME_SETTINGS.networkScoreVolatilityWeight, 0, 100),
    networkScoreCoverageWeight: clampNumber(source.networkScoreCoverageWeight, DEFAULT_THEME_SETTINGS.networkScoreCoverageWeight, 0, 100),
    networkScoreMinSamples: Math.round(clampNumber(source.networkScoreMinSamples, DEFAULT_THEME_SETTINGS.networkScoreMinSamples, 1, 100000)),
    networkScoreMinCoverage: clampNumber(source.networkScoreMinCoverage, DEFAULT_THEME_SETTINGS.networkScoreMinCoverage, 0, 100),
    networkScoreExcellentThreshold: excellentThreshold,
    networkScoreGoodThreshold: goodThreshold,
    networkScoreFairThreshold: fairThreshold,
  }
}
