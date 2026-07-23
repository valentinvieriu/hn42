import { describe, expect, it, vi } from 'vitest'
import { getDataCacheStatus, isDataCacheEntryValid } from './dataCache'

describe('data cache helpers', () => {
  it('distinguishes misses, fresh hits, and stale hits', () => {
    expect(getDataCacheStatus(1_000, 1_001, 120)).toBe('miss')
    expect(getDataCacheStatus(121_000, 1_000, 120)).toBe('hit')
    expect(getDataCacheStatus(121_001, 1_000, 120)).toBe('stale')
  })

  it('rejects entries beyond the bounded stale window', () => {
    vi.useFakeTimers()
    vi.setSystemTime(721_001)

    expect(isDataCacheEntryValid({
      mtime: 1_000,
      value: { id: 1 },
    }, 120, 600)).toBe(false)
    expect(isDataCacheEntryValid({
      mtime: 1_001,
      value: { id: 1 },
    }, 120, 600)).toBe(true)
    expect(isDataCacheEntryValid({}, 120, 600)).toBe(false)

    vi.useRealTimers()
  })
})
