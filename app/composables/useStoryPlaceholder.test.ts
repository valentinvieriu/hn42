import { describe, expect, it } from 'vitest'
import { buildStoryPlaceholder } from './useStoryPlaceholder'

describe('buildStoryPlaceholder', () => {
  it('is stable for the same website and story', () => {
    const first = buildStoryPlaceholder('www.example.com', '42:An example')
    const second = buildStoryPlaceholder('example.com', '42:An example')

    expect(second).toEqual(first)
  })

  it('keeps a website composition while varying its individual stories', () => {
    const first = buildStoryPlaceholder('example.com', '42:First story')
    const second = buildStoryPlaceholder('example.com', '43:Second story')

    expect(second.composition).toBe(first.composition)
    expect(second.panels).not.toEqual(first.panels)
  })

  it('uses several composition families across websites', () => {
    const compositions = new Set([
      'github.com',
      'nytimes.com',
      'arxiv.org',
      'example.com',
      'developer.mozilla.org',
      'news.ycombinator.com',
      'bbc.co.uk',
      'stripe.com',
    ].map((domain) => buildStoryPlaceholder(domain, '42:Story').composition))

    expect(compositions.size).toBeGreaterThanOrEqual(4)
  })
})
