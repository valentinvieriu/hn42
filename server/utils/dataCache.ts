type CacheEntry = {
  mtime?: number
  value?: unknown
}

export type DataCacheStatus = 'hit' | 'miss' | 'stale'

export type TimedData<T> = {
  data: T
  generatedAt: number
  upstreamDuration: number
}

export const getDataCacheStatus = (
  requestStartedAt: number,
  generatedAt: number,
  maxAgeSeconds: number,
): DataCacheStatus => {
  if (generatedAt >= requestStartedAt) {
    return 'miss'
  }

  return requestStartedAt - generatedAt > maxAgeSeconds * 1000
    ? 'stale'
    : 'hit'
}

export const isDataCacheEntryValid = (
  entry: CacheEntry,
  maxAgeSeconds: number,
  staleMaxAgeSeconds: number,
) => {
  if (entry.value === undefined || entry.mtime === undefined) {
    return false
  }

  return Date.now() - entry.mtime
    <= (maxAgeSeconds + staleMaxAgeSeconds) * 1000
}
