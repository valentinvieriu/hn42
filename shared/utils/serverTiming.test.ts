import { describe, expect, it } from 'vitest'
import { appendServerTiming, formatServerTiming } from './serverTiming'

describe('server timing helpers', () => {
  it('formats durations and descriptions for the Server-Timing header', () => {
    expect(formatServerTiming([
      {
        name: 'algolia',
        duration: 812.345,
        description: 'Algolia "item" fetch',
      },
    ])).toBe('algolia;dur=812.3;desc="Algolia \\"item\\" fetch"')
  })

  it('appends metrics to an existing header', () => {
    expect(appendServerTiming('algolia;dur=10.0', [
      { name: 'page-ssr', duration: 25 },
    ])).toBe('algolia;dur=10.0, page-ssr;dur=25.0')
  })

  it('keeps metric names and durations valid', () => {
    expect(formatServerTiming([
      { name: 'story data', duration: -1 },
      { name: '', duration: Number.NaN },
    ])).toBe('story-data;dur=0.0, metric;dur=0.0')
  })
})
