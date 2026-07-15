import { describe, expect, it } from 'vitest'
import { mergeFeeds } from './index'

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
