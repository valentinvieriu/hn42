import { describe, expect, it } from 'vitest'
import {
  getHnItemUrl,
  getHnUserPath,
  normalizeHnItemId,
  normalizeHnUsername,
} from './hn'

describe('HN identifiers and paths', () => {
  it('normalizes route params with one shared validation policy', () => {
    expect(normalizeHnItemId(['123'])).toBe('123')
    expect(normalizeHnItemId('0')).toBeNull()
    expect(normalizeHnUsername(['alice_42'])).toBe('alice_42')
    expect(normalizeHnUsername('../alice')).toBe('')
  })

  it('encodes item and user destinations', () => {
    expect(getHnItemUrl('123')).toBe('https://news.ycombinator.com/item?id=123')
    expect(getHnUserPath('alice 42')).toBe('/user/alice%2042')
  })
})
