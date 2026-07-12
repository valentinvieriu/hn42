import { describe, expect, it } from 'vitest'
import { formatCalendarDate, formatCompactTimeAgo, formatTimeAgo } from './date'

const NOW = new Date('2026-07-12T12:00:00Z').getTime()

describe('date formatting', () => {
  it('formats compact feed ages without allocating a formatter per story', () => {
    expect(formatCompactTimeAgo('2026-07-12T11:59:30Z', NOW)).toBe('now')
    expect(formatCompactTimeAgo('2026-07-12T10:00:00Z', NOW)).toBe('2h ago')
  })

  it('formats readable relative and calendar dates', () => {
    expect(formatTimeAgo('2026-07-10T12:00:00Z', NOW)).toBe('2 days ago')
    expect(formatCalendarDate('2026-07-10T12:00:00Z')).toBe('Jul 10, 2026')
  })

  it('returns an empty string for invalid dates', () => {
    expect(formatCompactTimeAgo('invalid', NOW)).toBe('')
    expect(formatTimeAgo('invalid', NOW)).toBe('')
    expect(formatCalendarDate('invalid')).toBe('')
  })
})
