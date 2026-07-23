import { describe, expect, it } from 'vitest'
import { appendEarlyHintLinks, collectEarlyHintLinks } from './earlyHints'

describe('Early Hints helpers', () => {
  it('promotes an SSR image preload to a Link header value', () => {
    expect(collectEarlyHintLinks([
      '<link rel="preload" as="image" href="/api/screenshot/123?profile=v9" fetchpriority="high">',
    ])).toEqual([
      '</api/screenshot/123?profile=v9>; rel=preload; as=image; fetchpriority=high',
    ])
  })

  it('keeps supported preload and preconnect attributes', () => {
    expect(collectEarlyHintLinks([
      '<link crossorigin href="https://cdn.example.com" rel="preconnect">',
      '<link media="(min-width: 1024px)" type="image/webp" rel="preload" href="/hero.webp?x=1&amp;y=2" as="image">',
    ])).toEqual([
      '<https://cdn.example.com>; rel=preconnect; crossorigin',
      '</hero.webp?x=1&y=2>; rel=preload; as=image; type="image/webp"; media="(min-width: 1024px)"',
    ])
  })

  it('ignores hints Cloudflare does not emit and unsafe header targets', () => {
    expect(collectEarlyHintLinks([
      '<link rel="modulepreload" href="/entry.js">',
      '<link rel="prefetch" href="/next.js">',
      '<link rel="stylesheet" href="/app.css">',
      '<link rel="preload" as="image" href="/safe.webp&#10;Injected: value">',
      '<link rel="preload" as="image" href="/invalid-&#9999999999;.webp">',
    ])).toEqual([])
  })

  it('deduplicates and caps the hint budget', () => {
    expect(collectEarlyHintLinks([
      ...Array.from({ length: 6 }, (_, index) => (
        `<link rel="preload" as="image" href="/image-${index}.webp">`
      )),
      '<link rel="preload" as="image" href="/image-0.webp">',
    ])).toHaveLength(4)
  })

  it('appends to an existing Link response header without duplicating hints', () => {
    const existing = '</app.css>; rel=preload; as=style'
    const image = '</hero.webp>; rel=preload; as=image'

    expect(appendEarlyHintLinks(existing, [image, existing])).toBe(
      '</app.css>; rel=preload; as=style, </hero.webp>; rel=preload; as=image',
    )
  })
})
