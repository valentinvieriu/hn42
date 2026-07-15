import { describe, expect, it } from 'vitest'
import { calculateAdmissionLimit, mergeFeeds } from './index'

describe('mergeFeeds', () => {
  it('preserves feed priority and removes duplicate story IDs', () => {
    expect(mergeFeeds([
      [
        { feed: 'top', rank: 1, storyId: '1' },
        { feed: 'top', rank: 2, storyId: '2' },
      ],
      [
        { feed: 'new', rank: 1, storyId: '2' },
        { feed: 'new', rank: 2, storyId: '3' },
      ],
    ])).toEqual([
      { feed: 'top', rank: 1, storyId: '1' },
      { feed: 'top', rank: 2, storyId: '2' },
      { feed: 'new', rank: 2, storyId: '3' },
    ])
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

  it('stops at the Queue free-tier daily admission ceiling', () => {
    expect(calculateAdmissionLimit({
      admittedToday: 950,
      admittedWithinOneDay: 950,
      storedScreenshotBytes: 1_000_000_000,
    })).toBe(50)
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
