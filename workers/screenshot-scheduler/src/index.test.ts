import { describe, expect, it, vi } from 'vitest'
import {
  calculateAdmissionLimit,
  filterUnadmittedStories,
  MAX_ADMISSIONS_PER_UTC_DAY,
  mergeFeeds,
  reserveSchedulerCapacity,
  SCHEDULER_FEEDS,
  summarizeAdmissionBuckets,
} from './index'

describe('scheduler feed priority', () => {
  it('deprioritizes New behind Top, Best, and Show', () => {
    expect(SCHEDULER_FEEDS).toEqual(['top', 'best', 'show', 'new'])
  })
})

describe('mergeFeeds', () => {
  it('preserves feed priority and removes duplicate story IDs', () => {
    expect(mergeFeeds([
      [
        { feed: 'top', rank: 1, storyId: '1' },
        { feed: 'top', rank: 2, storyId: '2' },
      ],
      [
        { feed: 'best', rank: 1, storyId: '2' },
        { feed: 'best', rank: 2, storyId: '3' },
      ],
      [
        { feed: 'show', rank: 1, storyId: '4' },
      ],
      [
        { feed: 'new', rank: 1, storyId: '5' },
      ],
    ])).toEqual([
      { feed: 'top', rank: 1, storyId: '1' },
      { feed: 'top', rank: 2, storyId: '2' },
      { feed: 'best', rank: 2, storyId: '3' },
      { feed: 'show', rank: 1, storyId: '4' },
      { feed: 'new', rank: 1, storyId: '5' },
    ])
  })
})

describe('Class B admission checks', () => {
  it('heads candidate markers with bounded concurrency and preserves priority', async () => {
    let active = 0
    let maximumActive = 0
    const head = vi.fn(async (key: string) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 1))
      active -= 1
      return key.endsWith('/2') || key.endsWith('/8') ? { key } : null
    })
    const bucket = { head } as unknown as R2Bucket
    const stories = Array.from({ length: 12 }, (_, index) => ({
      feed: 'top' as const,
      rank: index + 1,
      storyId: String(index + 1),
    }))

    await expect(filterUnadmittedStories(bucket, stories)).resolves.toEqual({
      previouslyAdmitted: 2,
      unadmitted: stories.filter((story) => story.storyId !== '2' && story.storyId !== '8'),
    })
    expect(head).toHaveBeenCalledTimes(12)
    expect(maximumActive).toBeLessThanOrEqual(6)
    expect(maximumActive).toBeGreaterThan(1)
  })
})

describe('compact scheduler state', () => {
  it('tracks the UTC day and a conservative rolling 24-hour window', () => {
    const now = new Date('2026-07-18T18:45:00Z')

    expect(summarizeAdmissionBuckets([
      { count: 9, startedAt: '2026-07-17T17:00:00Z' },
      { count: 3, startedAt: '2026-07-17T18:00:00Z' },
      { count: 4, startedAt: '2026-07-18T00:00:00Z' },
      { count: 2, startedAt: '2026-07-18T18:00:00Z' },
    ], now)).toMatchObject({
      admittedToday: 6,
      admittedWithinOneDay: 9,
    })
  })

  it('claims capacity with a conditional state write', async () => {
    const now = new Date('2026-07-18T18:45:00Z')
    const put = vi.fn().mockResolvedValue({ etag: 'next' })
    const get = vi.fn().mockResolvedValue({
      etag: 'current',
      json: vi.fn().mockResolvedValue({
        admissionBuckets: [{ count: 10, startedAt: '2026-07-18T18:00:00Z' }],
        storageCalculatedAt: '2026-07-18T18:30:00Z',
        storedScreenshotBytes: 1_000_000_000,
        version: 1,
      }),
    })
    const bucket = { get, put } as unknown as R2Bucket

    await expect(reserveSchedulerCapacity(bucket, 5, now)).resolves.toMatchObject({
      admittedToday: 15,
      admittedWithinOneDay: 15,
      reservedCount: 5,
      storedScreenshotBytes: 1_000_000_000,
    })
    expect(put).toHaveBeenCalledTimes(1)
    const [key, body, options] = put.mock.calls[0] ?? []
    expect(key).toBe('screenshot-scheduler/v1/v9/state.json')
    expect(JSON.parse(body)).toMatchObject({
      admissionBuckets: [{ count: 15, startedAt: '2026-07-18T18:00:00.000Z' }],
      version: 1,
    })
    expect(options.onlyIf).toEqual({ etagMatches: 'current' })
  })

  it('rebuilds missing state once from admission and screenshot listings', async () => {
    const now = new Date('2026-07-18T18:45:00Z')
    const put = vi.fn().mockResolvedValue({ etag: 'created' })
    const list = vi.fn(async (options: R2ListOptions) => {
      if (options.prefix === 'screenshot-jobs/v1/v9/') {
        return {
          cursor: undefined,
          delimitedPrefixes: [],
          objects: [{
            customMetadata: { discoveredAt: '2026-07-18T18:10:00Z' },
            key: 'screenshot-jobs/v1/v9/42',
          }],
          truncated: false,
        }
      }

      return {
        cursor: undefined,
        delimitedPrefixes: [],
        objects: [{ key: 'one', size: 10 }, { key: 'two', size: 20 }],
        truncated: false,
      }
    })
    const bucket = {
      get: vi.fn().mockResolvedValue(null),
      list,
      put,
    } as unknown as R2Bucket

    await expect(reserveSchedulerCapacity(bucket, 2, now)).resolves.toMatchObject({
      admittedToday: 3,
      admittedWithinOneDay: 3,
      reservedCount: 2,
      storedScreenshotBytes: 30,
    })
    expect(list).toHaveBeenCalledTimes(2)
    expect(put.mock.calls[0]?.[2].onlyIf).toEqual({ etagDoesNotMatch: '*' })
  })
})

describe('scheduler emergency ceiling', () => {
  it('keeps base Queue usage within the Workers Paid monthly allowance', () => {
    expect(MAX_ADMISSIONS_PER_UTC_DAY).toBe(8_000)
    expect(MAX_ADMISSIONS_PER_UTC_DAY * 31 * 3).toBeLessThan(1_000_000)
  })
})

describe('calculateAdmissionLimit', () => {
  it('keeps a per-run batch when daily and storage capacity are available', () => {
    expect(calculateAdmissionLimit({
      admittedToday: 100,
      admittedWithinOneDay: 100,
      storedScreenshotBytes: 1_000_000_000,
    })).toBe(200)
  })

  it('stops at the Paid-plan emergency daily ceiling', () => {
    expect(calculateAdmissionLimit({
      admittedToday: 7_900,
      admittedWithinOneDay: 100,
      storedScreenshotBytes: 1_000_000_000,
    })).toBe(100)
    expect(calculateAdmissionLimit({
      admittedToday: 8_000,
      admittedWithinOneDay: 100,
      storedScreenshotBytes: 1_000_000_000,
    })).toBe(0)
  })

  it('reserves worst-case storage for recently admitted jobs', () => {
    expect(calculateAdmissionLimit({
      admittedToday: 400,
      admittedWithinOneDay: 400,
      storedScreenshotBytes: 9_100_000_000,
    })).toBe(50)
    expect(calculateAdmissionLimit({
      admittedToday: 500,
      admittedWithinOneDay: 500,
      storedScreenshotBytes: 9_000_000_000,
    })).toBe(0)
  })
})
