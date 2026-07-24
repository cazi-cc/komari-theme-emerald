interface CacheEntry {
  cachedAt: number
  value: unknown
}

const CACHE_TTL_MS = 60_000
const MAX_CACHE_ENTRIES = 20
const cache = new Map<string, CacheEntry>()
const pending = new Map<string, Promise<unknown>>()

function pruneCache(): void {
  const now = Date.now()
  for (const [key, entry] of cache) {
    if (now - entry.cachedAt >= CACHE_TTL_MS)
      cache.delete(key)
  }

  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value
    if (typeof oldestKey !== 'string')
      break
    cache.delete(oldestKey)
  }
}

export async function loadPingChartData<T>(
  key: string,
  loader: () => Promise<T>,
  force = false,
): Promise<T> {
  pruneCache()

  const cached = cache.get(key)
  if (!force && cached)
    return cached.value as T

  const activeRequest = pending.get(key)
  if (activeRequest)
    return activeRequest as Promise<T>

  const request = loader()
    .then((value) => {
      cache.delete(key)
      cache.set(key, { cachedAt: Date.now(), value })
      pruneCache()
      return value
    })
    .finally(() => {
      pending.delete(key)
    })

  pending.set(key, request)
  return request
}
