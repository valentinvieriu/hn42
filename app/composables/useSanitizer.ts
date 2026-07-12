const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  apos: "'",
  colon: ':',
  gt: '>',
  lt: '<',
  nbsp: ' ',
  quot: '"',
};

const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'em',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  'strong',
  'ul',
])

const VOID_TAGS = new Set(['br'])
const HN_BASE_URL = 'https://news.ycombinator.com/'
const BLOCK_LEVEL_PATTERN = /^<(?:blockquote|ol|pre|ul)\b/i
const INLINE_OPENING_TAGS_PATTERN = /^(?:\s*<(?:b|code|em|i|strong)>)+/i
const QUOTE_MARKER_PATTERN = /(^|<br>|\n)(\s*(?:<(?:b|code|em|i|strong)>)*\s*)(?:&gt;|>)\s?/gi
const REFERENCE_LINE_PATTERN = /^\[(\d+)\](?:\s*[-:]\s*|\s+)(?:<a\b|https?:\/\/)/i
const URL_PATTERN = /https?:\/\/[^\s<]+/gi

const decodeHtmlEntities = (value: string) => value.replace(
  /&(#\d+|#x[\da-f]+|[a-z]+);/gi,
  (entity, code: string) => {
    if (code[0] === '#') {
      const radix = code[1]?.toLowerCase() === 'x' ? 16 : 10;
      const offset = radix === 16 ? 2 : 1;
      const parsed = Number.parseInt(code.slice(offset), radix);
      return Number.isFinite(parsed) ? String.fromCodePoint(parsed) : entity;
    }

    return HTML_ENTITIES[code.toLowerCase()] ?? entity;
  },
);

const escapeText = (value: string) => value
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const escapeAttribute = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/"/g, '&quot;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')

const getAttribute = (tag: string, attributeName: string) => {
  const attributePattern = new RegExp(
    `${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>` + '`' + `]+))`,
    'i',
  )
  const match = tag.match(attributePattern)

  return match?.[1] ?? match?.[2] ?? match?.[3] ?? ''
}

const sanitizeHref = (href: string) => {
  const decodedHref = decodeHtmlEntities(href).trim()

  if (!decodedHref) return ''

  try {
    const compactHref = decodedHref.replace(/[\u0000-\u001F\u007F\s]+/g, '')
    const url = new URL(compactHref, HN_BASE_URL)

    if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) {
      return ''
    }

    return url.href
  } catch {
    return ''
  }
}

const sanitizeTag = (tag: string) => {
  const tagMatch = tag.match(/^<\s*(\/)?\s*([a-z0-9]+)/i)
  const tagName = tagMatch?.[2]?.toLowerCase()

  if (!tagName || !ALLOWED_TAGS.has(tagName)) {
    return ''
  }

  const isClosingTag = Boolean(tagMatch?.[1])

  if (isClosingTag) {
    return VOID_TAGS.has(tagName) ? '' : `</${tagName}>`
  }

  if (tagName === 'br') {
    return '<br>'
  }

  if (tagName === 'a') {
    const href = sanitizeHref(getAttribute(tag, 'href'))

    if (!href) return ''

    return `<a href="${escapeAttribute(href)}" target="_blank" rel="nofollow noopener noreferrer">`
  }

  return `<${tagName}>`
}

const sanitizeHtml = (html: string) => {
  const safeHtml = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\s*(script|style|iframe|object|embed)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')

  let sanitized = ''
  let lastIndex = 0
  const tagPattern = /<\/?[^>]+>/g

  for (const match of safeHtml.matchAll(tagPattern)) {
    const tag = match[0]
    const index = match.index ?? 0

    sanitized += escapeText(safeHtml.slice(lastIndex, index))
    sanitized += sanitizeTag(tag)
    lastIndex = index + tag.length
  }

  sanitized += escapeText(safeHtml.slice(lastIndex))

  return sanitized.trim()
}

const sanitizeScopeId = (scopeId?: string | number | null) => {
  const normalizedScope = String(scopeId ?? 'comment')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return normalizedScope || 'comment'
}

const isQuoteBlock = (html: string) => {
  const textStart = html.replace(INLINE_OPENING_TAGS_PATTERN, '').trim()

  return /^(?:&gt;|>)\s?/.test(textStart)
}

const cleanQuoteBlock = (html: string) => {
  return html.replace(QUOTE_MARKER_PATTERN, '$1$2').trim()
}

const getReferenceNumber = (html: string) => {
  return html.trim().match(REFERENCE_LINE_PATTERN)?.[1] ?? ''
}

const getReferenceId = (scopeId: string, referenceNumber: string) => {
  return `${scopeId}-ref-${referenceNumber}`
}

const splitTrailingUrlPunctuation = (url: string) => {
  const trailingPunctuation = url.match(/[.,;:!?]+$/)?.[0] ?? ''

  if (!trailingPunctuation) {
    return { url, trailingPunctuation: '' }
  }

  return {
    url: url.slice(0, -trailingPunctuation.length),
    trailingPunctuation,
  }
}

const mapTextOutsideTags = (
  html: string,
  transformText: (text: string) => string,
  ignoredTags = new Set(['a', 'code', 'pre']),
) => {
  let output = ''
  let lastIndex = 0
  const openIgnoredTags: string[] = []
  const tagPattern = /<\/?([a-z0-9]+)\b[^>]*>/gi

  for (const match of html.matchAll(tagPattern)) {
    const tag = match[0]
    const tagName = match[1]?.toLowerCase()

    if (!tagName) {
      continue
    }
    const index = match.index ?? 0
    const text = html.slice(lastIndex, index)

    output += openIgnoredTags.length > 0 ? text : transformText(text)

    if (ignoredTags.has(tagName)) {
      if (/^<\s*\//.test(tag)) {
        const openIndex = openIgnoredTags.lastIndexOf(tagName)
        if (openIndex >= 0) openIgnoredTags.splice(openIndex, 1)
      } else if (!VOID_TAGS.has(tagName)) {
        openIgnoredTags.push(tagName)
      }
    }

    output += tag
    lastIndex = index + tag.length
  }

  const remainingText = html.slice(lastIndex)
  output += openIgnoredTags.length > 0 ? remainingText : transformText(remainingText)

  return output
}

const linkBareUrls = (html: string) => {
  return mapTextOutsideTags(html, (text) => text.replace(URL_PATTERN, (match) => {
    const { url, trailingPunctuation } = splitTrailingUrlPunctuation(match)
    const href = sanitizeHref(url)

    if (!href) return match

    return `<a href="${escapeAttribute(href)}" target="_blank" rel="nofollow noopener noreferrer">${url}</a>${trailingPunctuation}`
  }))
}

const linkFootnoteMarkers = (html: string, referenceNumbers: Set<string>, scopeId: string) => {
  if (referenceNumbers.size === 0) return html

  return mapTextOutsideTags(html, (text) => text.replace(/\[(\d+)\]/g, (match, referenceNumber: string) => {
    if (!referenceNumbers.has(referenceNumber)) return match

    return `<a class="footnote-marker" href="#${escapeAttribute(getReferenceId(scopeId, referenceNumber))}">${match}</a>`
  }))
}

const styleNotePrefix = (html: string) => {
  return html.replace(/^(\s*)(TL;DR|Edit|Update)(\s*:)/i, (_match, leadingSpace: string, label: string, separator: string) => {
    return `${leadingSpace}<span class="note-label">${label}${separator}</span>`
  })
}

const formatInlineConventions = (html: string, referenceNumbers: Set<string>, scopeId: string) => {
  return styleNotePrefix(linkFootnoteMarkers(linkBareUrls(html), referenceNumbers, scopeId))
}

const formatReferenceLine = (html: string, referenceNumber: string, scopeId: string) => {
  const formattedLine = linkBareUrls(html).replace(
    /^\[(\d+)\](\s*[-:]\s*|\s+)/,
    '<span class="reference-label">[$1]</span> ',
  )

  return `<p id="${escapeAttribute(getReferenceId(scopeId, referenceNumber))}" class="reference-line">${formattedLine}</p>`
}

const formatTextConventions = (html: string, rawScopeId?: string | number | null) => {
  const paragraphs = html
    .replace(/<\/p>/gi, '')
    .split(/<p>/i)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)

  if (paragraphs.length === 0) return ''

  const scopeId = sanitizeScopeId(rawScopeId)
  const referenceNumbers = new Set(paragraphs.map(getReferenceNumber).filter(Boolean))
  const formatted: string[] = []
  const quoteBuffer: string[] = []

  const flushQuoteBuffer = () => {
    if (quoteBuffer.length === 0) return

    formatted.push(`<blockquote>${quoteBuffer.map((quote) => `<p>${formatInlineConventions(quote, referenceNumbers, scopeId)}</p>`).join('')}</blockquote>`)
    quoteBuffer.length = 0
  }

  for (const paragraph of paragraphs) {
    if (BLOCK_LEVEL_PATTERN.test(paragraph)) {
      flushQuoteBuffer()
      formatted.push(paragraph)
      continue
    }

    if (isQuoteBlock(paragraph)) {
      quoteBuffer.push(cleanQuoteBlock(paragraph))
      continue
    }

    flushQuoteBuffer()

    const referenceNumber = getReferenceNumber(paragraph)

    if (referenceNumber) {
      formatted.push(formatReferenceLine(paragraph, referenceNumber, scopeId))
      continue
    }

    formatted.push(`<p>${formatInlineConventions(paragraph, referenceNumbers, scopeId)}</p>`)
  }

  flushQuoteBuffer()

  return formatted.join('')
}

const sanitize = (html: string, scopeId?: string | number | null) => {
  const safeHtml = sanitizeHtml(html)

  return formatTextConventions(safeHtml, scopeId)
}

const sanitizer = Object.freeze({ sanitize })

export const useSanitizer = () => sanitizer
