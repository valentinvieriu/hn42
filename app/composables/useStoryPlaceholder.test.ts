import { describe, expect, it } from 'vitest'
import {
  buildStoryPlaceholder,
  type StoryPlaceholderLayout,
} from './useStoryPlaceholder'

const ALL_LAYOUTS: StoryPlaceholderLayout[] = [
  'layout-01',
  'layout-02',
  'layout-03',
  'layout-04',
  'layout-05',
  'layout-06',
]

describe('buildStoryPlaceholder', () => {
  it('is stable for the same normalized website and story ID', () => {
    const first = buildStoryPlaceholder(' www.Example.com ', '48870001')
    const second = buildStoryPlaceholder('example.com', '48870001')

    expect(second).toEqual(first)
    expect(first.version).toBe(2)
    expect(first.initials).toBe('EX')
  })

  it('balances every six consecutive story IDs from the same source', () => {
    for (const domain of ['example.com', 'github.com', 'news.ycombinator.com']) {
      for (let start = 48870000; start < 48870030; start += 6) {
        const layouts = new Set(Array.from({ length: 6 }, (_, index) => {
          return buildStoryPlaceholder(domain, String(start + index)).layout
        }))

        expect([...layouts].sort()).toEqual([...ALL_LAYOUTS].sort())
      }
    }
  })

  it('creates high story-level variation on one website', () => {
    const placeholders = Array.from({ length: 60 }, (_, index) => {
      return buildStoryPlaceholder('github.com', String(48870000 + index))
    })
    const layouts = new Set(placeholders.map((placeholder) => placeholder.layout))
    const variants = new Set(placeholders.map((placeholder) => placeholder.variant))
    const signatures = new Set(placeholders.map((placeholder) => {
      return JSON.stringify({
        layout: placeholder.layout,
        mirror: placeholder.mirror,
        motif: placeholder.motif,
        primitives: placeholder.primitives,
        variant: placeholder.variant,
      })
    }))

    expect(layouts).toEqual(new Set(ALL_LAYOUTS))
    expect(variants).toEqual(new Set([0, 1, 2]))
    expect(signatures.size).toBeGreaterThanOrEqual(55)
  })

  it('keeps generated geometry bounded and inexpensive', () => {
    const domains = [
      '',
      'github.com',
      'arxiv.org',
      'example.com',
      'developer.mozilla.org',
      'news.ycombinator.com',
      'bbc.co.uk',
      'stripe.com',
      'münchen.example',
    ]

    for (const domain of domains) {
      for (let index = 0; index < 120; index += 1) {
        const placeholder = buildStoryPlaceholder(domain, String(48800000 + index))
        const keys = new Set(placeholder.primitives.map((primitive) => primitive.key))

        expect(placeholder.primitives.length).toBeGreaterThanOrEqual(5)
        expect(placeholder.primitives.length).toBeLessThanOrEqual(8)
        expect(keys.size).toBe(placeholder.primitives.length)

        for (const primitive of placeholder.primitives) {
          const { x, y, width, height } = primitive.rect

          expect(Number.isInteger(x)).toBe(true)
          expect(Number.isInteger(y)).toBe(true)
          expect(Number.isInteger(width)).toBe(true)
          expect(Number.isInteger(height)).toBe(true)
          expect(x).toBeGreaterThanOrEqual(0)
          expect(y).toBeGreaterThanOrEqual(0)
          expect(width).toBeGreaterThan(0)
          expect(height).toBeGreaterThan(0)
          expect(x + width).toBeLessThanOrEqual(1000)
          expect(y + height).toBeLessThanOrEqual(1000)
          expect(primitive.opacity).toBeGreaterThanOrEqual(62)
          expect(primitive.opacity).toBeLessThanOrEqual(92)
        }

        expect(JSON.stringify(placeholder)).not.toMatch(/NaN|Infinity|undefined/)
      }
    }
  })

  it('handles empty and non-numeric seeds deterministically', () => {
    const emptySeed = buildStoryPlaceholder('', '')
    const unicodeSeed = buildStoryPlaceholder('example.com', '故事-42')

    expect(emptySeed).toEqual(buildStoryPlaceholder('', ''))
    expect(unicodeSeed).toEqual(buildStoryPlaceholder('example.com', '故事-42'))
    expect(emptySeed.initials).toBe('NE')
  })
})
