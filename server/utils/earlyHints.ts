const LINK_TAG_PATTERN = /<link\b[^>]*>/gi
const LINK_ATTRIBUTE_PATTERN = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
const LINK_PARAMETER_TOKEN_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const MAX_EARLY_HINT_LINKS = 4

const EARLY_HINT_RELATIONS = new Set(['preconnect', 'preload'])
const EARLY_HINT_PARAMETERS = [
  'as',
  'crossorigin',
  'type',
  'media',
  'fetchpriority',
  'imagesrcset',
  'imagesizes',
  'integrity',
  'referrerpolicy',
] as const

const decodeCodePoint = (value: string, radix: number) => {
  const codePoint = Number.parseInt(value, radix)

  return Number.isSafeInteger(codePoint)
    && codePoint <= 0x10ffff
    && !(codePoint >= 0xd800 && codePoint <= 0xdfff)
    ? String.fromCodePoint(codePoint)
    : '\u0000'
}

const decodeHtmlAttribute = (value: string) => {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, codePoint: string) => {
      return decodeCodePoint(codePoint, 16)
    })
    .replace(/&#(\d+);/g, (_match, codePoint: string) => {
      return decodeCodePoint(codePoint, 10)
    })
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
}

const parseLinkAttributes = (tag: string) => {
  const attributes = new Map<string, string>()

  for (const match of tag.matchAll(LINK_ATTRIBUTE_PATTERN)) {
    const name = match[1]?.toLowerCase()

    if (!name || name === 'link') {
      continue
    }

    const value = match[2] ?? match[3] ?? match[4] ?? ''
    attributes.set(name, decodeHtmlAttribute(value))
  }

  return attributes
}

const formatLinkParameter = (name: string, value: string) => {
  if (name === 'crossorigin' && value === '') {
    return name
  }

  if (LINK_PARAMETER_TOKEN_PATTERN.test(value)) {
    return `${name}=${value}`
  }

  return `${name}="${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

const createEarlyHintLink = (tag: string) => {
  const attributes = parseLinkAttributes(tag)
  const href = attributes.get('href')
  const relation = attributes
    .get('rel')
    ?.toLowerCase()
    .split(/\s+/)
    .find((value) => EARLY_HINT_RELATIONS.has(value))

  if (!href || !relation || /[\u0000-\u001f\u007f<>]/.test(href)) {
    return null
  }

  const parameters = [`rel=${relation}`]

  for (const name of EARLY_HINT_PARAMETERS) {
    const value = attributes.get(name)

    if (value !== undefined) {
      parameters.push(formatLinkParameter(name, value))
    }
  }

  return `<${href}>; ${parameters.join('; ')}`
}

export const collectEarlyHintLinks = (headChunks: string[]) => {
  const links = new Set<string>()

  for (const chunk of headChunks) {
    for (const match of chunk.matchAll(LINK_TAG_PATTERN)) {
      const link = createEarlyHintLink(match[0])

      if (link) {
        links.add(link)
      }

      if (links.size >= MAX_EARLY_HINT_LINKS) {
        return [...links]
      }
    }
  }

  return [...links]
}

export const appendEarlyHintLinks = (
  currentHeader: string | undefined,
  earlyHintLinks: string[],
) => {
  const currentValue = currentHeader?.trim()
  const additions = earlyHintLinks.filter((link) => !currentValue?.includes(link))

  return [currentValue, ...additions].filter(Boolean).join(', ')
}
