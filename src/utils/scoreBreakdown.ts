export interface WeightedScoreSource {
  key: string
  label: string
  score: number | null | undefined
  weight: number | null | undefined
  raw?: string
  note?: string
}

export interface WeightedScoreItem {
  key: string
  label: string
  raw?: string
  note?: string
  score: number | null
  configuredWeight: number
  maxPoints: number
  earnedPoints: number | null
  deductedPoints: number | null
  counted: boolean
}

function finiteNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function clampScore(value: number): number {
  return Math.min(100, Math.max(0, value))
}

export function buildWeightedScoreItems(sources: WeightedScoreSource[]): WeightedScoreItem[] {
  const normalizedSources = sources.map(source => ({
    ...source,
    score: finiteNumber(source.score),
    weight: Math.max(0, finiteNumber(source.weight) ?? 0),
  }))
  const activeWeight = normalizedSources.reduce((total, source) => {
    return total + (source.score !== null && source.weight > 0 ? source.weight : 0)
  }, 0)

  return normalizedSources.map((source) => {
    const counted = source.score !== null && source.weight > 0 && activeWeight > 0
    const maxPoints = counted ? source.weight * 100 / activeWeight : 0
    const earnedPoints = counted ? clampScore(source.score ?? 0) * maxPoints / 100 : null

    return {
      key: source.key,
      label: source.label,
      raw: source.raw,
      note: source.note,
      score: source.score,
      configuredWeight: source.weight,
      maxPoints,
      earnedPoints,
      deductedPoints: earnedPoints === null ? null : Math.max(0, maxPoints - earnedPoints),
      counted,
    }
  })
}

export function scoreDeduction(value: number | null | undefined): number | null {
  const score = finiteNumber(value)
  return score === null ? null : Math.max(0, 100 - score)
}
