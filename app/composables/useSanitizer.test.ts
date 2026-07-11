import { describe, expect, it } from 'vitest'
import { useSanitizer } from './useSanitizer'

describe('useSanitizer', () => {
  const { sanitize } = useSanitizer()

  it('keeps the supported HN markup and hardens external links', () => {
    const result = sanitize('<p>Hello <strong>world</strong> <a href="https://example.com/path">source</a></p>')

    expect(result).toContain('<strong>world</strong>')
    expect(result).toContain('href="https://example.com/path"')
    expect(result).toContain('target="_blank"')
    expect(result).toContain('rel="nofollow noopener noreferrer"')
  })

  it.each([
    'javascript:alert(1)',
    'java&#x73;cript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
  ])('rejects unsafe link protocol %s', (href) => {
    const result = sanitize(`<p><a href="${href}">unsafe</a></p>`)

    expect(result).not.toContain('href=')
    expect(result).not.toContain('javascript:')
    expect(result).not.toContain('data:text/html')
    expect(result).toContain('unsafe')
  })

  it('removes executable and embedded content', () => {
    const result = sanitize('<script>alert(1)</script><iframe src="https://example.com"></iframe><p>Safe</p>')

    expect(result).toBe('<p>Safe</p>')
  })

  it('does not autolink URLs inside code or existing links', () => {
    const result = sanitize('<p><code>https://example.com/code</code> <a href="https://example.com">https://example.com</a></p>')

    expect(result.match(/<a\b/g)).toHaveLength(1)
    expect(result).toContain('<code>https://example.com/code</code>')
  })

  it('formats quote blocks and links matching footnote references', () => {
    const result = sanitize(
      '<p>&gt; quoted text</p><p>See [1]</p><p>[1] - https://example.com/reference</p>',
      'comment-42',
    )

    expect(result).toContain('<blockquote><p>quoted text</p></blockquote>')
    expect(result).toContain('href="#comment-42-ref-1"')
    expect(result).toContain('id="comment-42-ref-1"')
  })
})
