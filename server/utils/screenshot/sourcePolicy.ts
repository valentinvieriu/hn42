import type {
  ScreenshotProviderName,
  ScreenshotSkipReason,
  ScreenshotSourceStrategy,
} from './types'

const DEFAULT_XCANCEL_BASE_URL = 'https://xcancel.com'
const DEFAULT_PROBE_TIMEOUT_MS = 1200
const MAX_PROBE_REDIRECTS = 3
const DEFAULT_BLOCKED_HOSTS = [
  'amazon.com',
  'bestbuy.com',
  'bloomberg.com',
  'careerbuilder.com',
  'cnbc.com',
  'costco.com',
  'deviantart.com',
  'economist.com',
  'ft.com',
  'indeed.com',
  'medium.com',
  'newegg.com',
  'nytimes.com',
  'pinterest.com',
  'politico.com',
  'quora.com',
  'reddit.com',
  'reuters.com',
  'simplyhired.com',
  'temu.com',
  'theguardian.com',
  'thehill.com',
  'wayfair.com',
  'washingtonpost.com',
  'wsj.com',
]
const BINARY_CONTENT_TYPES = new Set([
  'application/epub+zip',
  'application/gzip',
  'application/msword',
  'application/octet-stream',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/x-7z-compressed',
  'application/x-bzip2',
  'application/x-gzip',
  'application/x-rar-compressed',
  'application/x-tar',
  'application/x-zip-compressed',
  'application/zip',
])
const BINARY_FILENAME_PATTERN = /\.(?:7z|avi|bz2|doc|docx|epub|gz|m4a|m4v|mkv|mov|mp3|mp4|ppt|pptx|rar|tar|tgz|wav|webm|xls|xlsx|xz|zip)(?:["']|$|;)/i

type ScreenshotCaptureStrategy = Exclude<ScreenshotSourceStrategy, 'skip-pdf' | 'skip-known-blocked'>

export type ScreenshotCaptureDecision = {
  cacheIdentityUrl: string
  captureProvider: ScreenshotProviderName
  captureUrl: string
  originalUrl: string
  policy: 'capture'
  sourceStrategy: ScreenshotCaptureStrategy
}

export type ScreenshotSkipDecision = {
  originalUrl: string
  policy: 'skip'
  skipReason: ScreenshotSkipReason
  sourceStrategy: Extract<ScreenshotSourceStrategy, 'skip-pdf' | 'skip-known-blocked'>
}

export type ScreenshotSourceDecision = ScreenshotCaptureDecision | ScreenshotSkipDecision

export class ScreenshotPolicySkipError extends Error {
  skipReason: ScreenshotSkipReason
  sourceStrategy: ScreenshotSourceStrategy

  constructor(skipReason: ScreenshotSkipReason, sourceStrategy: ScreenshotSourceStrategy) {
    super(`Screenshot capture skipped by policy: ${skipReason}`)
    this.name = 'ScreenshotPolicySkipError'
    this.skipReason = skipReason
    this.sourceStrategy = sourceStrategy
  }
}

type ContentProbeResult =
  | { captureUrl: string, policy: 'capture' }
  | { policy: 'skip', skipReason: ScreenshotSkipReason }

const normalizePositiveInteger = (value: unknown, fallback: number) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return fallback
  }

  return Math.max(1, Math.floor(parsedValue))
}

const normalizeHostname = (hostname: string) => {
  return hostname
    .toLowerCase()
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/\.+$/, '')
    .replace(/^www\./, '')
}

const parseCommaSeparatedHosts = (value: unknown) => {
  if (typeof value !== 'string') {
    return []
  }

  return value
    .split(',')
    .map((host) => normalizeHostname(host.trim()))
    .filter(Boolean)
}

export const isPrivateIpv4Address = (hostname: string) => {
  const parts = hostname.split('.')

  if (parts.length !== 4) {
    return false
  }

  const octets = parts.map((part) => Number(part))

  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false
  }

  const [first, second = -1] = octets

  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
}

export const isBlockedHostname = (hostname: string) => {
  const normalizedHostname = normalizeHostname(hostname)
  const isIpv6Literal = normalizedHostname.includes(':')
  const ipv4MappedMatch = normalizedHostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
  const mappedIpv4 = ipv4MappedMatch
    ? [
        Number.parseInt(ipv4MappedMatch[1] ?? '0', 16) >> 8,
        Number.parseInt(ipv4MappedMatch[1] ?? '0', 16) & 0xff,
        Number.parseInt(ipv4MappedMatch[2] ?? '0', 16) >> 8,
        Number.parseInt(ipv4MappedMatch[2] ?? '0', 16) & 0xff,
      ].join('.')
    : null

  return normalizedHostname === 'localhost'
    || normalizedHostname.endsWith('.localhost')
    || normalizedHostname.endsWith('.local')
    || (isIpv6Literal && (normalizedHostname === '::' || normalizedHostname === '::1'))
    || (isIpv6Literal && normalizedHostname.startsWith('fc'))
    || (isIpv6Literal && normalizedHostname.startsWith('fd'))
    || (isIpv6Literal && normalizedHostname.startsWith('fe80:'))
    || (mappedIpv4 !== null && isPrivateIpv4Address(mappedIpv4))
    || isPrivateIpv4Address(normalizedHostname)
}

export const normalizeSourceUrl = (input: unknown) => {
  if (typeof input !== 'string' || input.trim() === '') {
    return null
  }

  try {
    const url = new URL(input)

    if (!['http:', 'https:'].includes(url.protocol) || isBlockedHostname(url.hostname)) {
      return null
    }

    return url.toString()
  } catch {
    return null
  }
}

const hostMatches = (hostname: string, matchHostname: string) => {
  const normalizedHostname = normalizeHostname(hostname)
  const normalizedMatchHostname = normalizeHostname(matchHostname)

  return normalizedHostname === normalizedMatchHostname
    || normalizedHostname.endsWith(`.${normalizedMatchHostname}`)
}

const getBlockedHosts = (runtimeConfig: any) => {
  return [
    ...DEFAULT_BLOCKED_HOSTS,
    ...parseCommaSeparatedHosts(runtimeConfig.screenshotPolicyBlockedHosts),
  ]
}

const isKnownBlockedHost = (url: URL, runtimeConfig: any) => {
  return getBlockedHosts(runtimeConfig).some((host) => hostMatches(url.hostname, host))
}

const getXCancelBaseUrl = (runtimeConfig: any) => {
  const configuredBaseUrl = normalizeSourceUrl(runtimeConfig.screenshotXCancelBaseUrl)

  if (!configuredBaseUrl) {
    return DEFAULT_XCANCEL_BASE_URL
  }

  const url = new URL(configuredBaseUrl)
  url.pathname = url.pathname.replace(/\/+$/, '')
  url.search = ''
  url.hash = ''

  return url.toString().replace(/\/+$/, '')
}

const getXCancelStatusUrl = (url: URL, runtimeConfig: any) => {
  if (!['x.com', 'twitter.com', 'mobile.twitter.com'].some((host) => hostMatches(url.hostname, host))) {
    return null
  }

  const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/.*)?$/)

  if (!match || match[1] === 'i') {
    return null
  }

  const [, username, statusId] = match
  const captureUrl = new URL(`${getXCancelBaseUrl(runtimeConfig)}/${username}/status/${statusId}`)

  return captureUrl.toString()
}

const getArxivAbsUrl = (url: URL) => {
  if (!hostMatches(url.hostname, 'arxiv.org')) {
    return null
  }

  const match = url.pathname.match(/^\/pdf\/(.+?)(?:\.pdf)?$/i)

  if (!match) {
    return null
  }

  const arxivId = match[1]?.replace(/^\/+|\/+$/g, '') ?? ''

  if (!arxivId) {
    return null
  }

  const captureUrl = new URL(`https://arxiv.org/abs/${arxivId}`)

  return captureUrl.toString()
}

const hasPdfQueryShape = (url: URL) => {
  for (const [key, value] of url.searchParams.entries()) {
    const normalizedKey = key.toLowerCase()
    const normalizedValue = value.toLowerCase()

    if (['format', 'output', 'type'].includes(normalizedKey) && normalizedValue === 'pdf') {
      return true
    }

    if (['file', 'filename', 'download'].includes(normalizedKey) && normalizedValue.endsWith('.pdf')) {
      return true
    }
  }

  return false
}

const isObviousPdfUrl = (url: URL) => {
  return url.pathname.toLowerCase().endsWith('.pdf') || hasPdfQueryShape(url)
}

const getScopedCacheIdentityUrl = (
  sourceStrategy: ScreenshotCaptureStrategy,
  captureUrl: string,
  originalUrl: string,
) => {
  if (sourceStrategy === 'direct') {
    return originalUrl
  }

  return `hn42:${sourceStrategy}:${captureUrl}`
}

export const createScreenshotSourceDecision = (
  sourceUrl: string,
  runtimeConfig: any,
): ScreenshotSourceDecision => {
  const url = new URL(sourceUrl)
  const arxivAbsUrl = getArxivAbsUrl(url)

  if (arxivAbsUrl) {
    return {
      cacheIdentityUrl: getScopedCacheIdentityUrl('arxiv-abs', arxivAbsUrl, sourceUrl),
      captureProvider: 'browser-run',
      captureUrl: arxivAbsUrl,
      originalUrl: sourceUrl,
      policy: 'capture',
      sourceStrategy: 'arxiv-abs',
    }
  }

  if (isObviousPdfUrl(url)) {
    return {
      originalUrl: sourceUrl,
      policy: 'skip',
      skipReason: 'pdf-url',
      sourceStrategy: 'skip-pdf',
    }
  }

  if (isKnownBlockedHost(url, runtimeConfig)) {
    return {
      originalUrl: sourceUrl,
      policy: 'skip',
      skipReason: 'known-blocked-host',
      sourceStrategy: 'skip-known-blocked',
    }
  }

  const xcancelUrl = getXCancelStatusUrl(url, runtimeConfig)

  if (xcancelUrl) {
    return {
      cacheIdentityUrl: getScopedCacheIdentityUrl('xcancel', xcancelUrl, sourceUrl),
      captureProvider: 'browser-run',
      captureUrl: xcancelUrl,
      originalUrl: sourceUrl,
      policy: 'capture',
      sourceStrategy: 'xcancel',
    }
  }

  return {
    cacheIdentityUrl: sourceUrl,
    captureProvider: 'browser-run',
    captureUrl: sourceUrl,
    originalUrl: sourceUrl,
    policy: 'capture',
    sourceStrategy: 'direct',
  }
}

const isRedirectStatus = (status: number) => {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308
}

const isPdfResponse = (headers: Headers) => {
  const contentType = headers.get('Content-Type')?.toLowerCase().split(';')[0]?.trim()
  const contentDisposition = headers.get('Content-Disposition')?.toLowerCase() ?? ''

  return contentType === 'application/pdf'
    || /filename\*?=[^;]*\.pdf(?:["']|$|;)/i.test(contentDisposition)
}

const getContentType = (headers: Headers) => {
  return headers.get('Content-Type')?.toLowerCase().split(';')[0]?.trim() ?? ''
}

const isHtmlResponse = (headers: Headers) => {
  const contentType = getContentType(headers)

  return contentType === 'text/html' || contentType === 'application/xhtml+xml'
}

const isNonHtmlBinaryResponse = (headers: Headers) => {
  const contentType = headers.get('Content-Type')?.toLowerCase().split(';')[0]?.trim()
  const contentDisposition = headers.get('Content-Disposition')?.toLowerCase() ?? ''

  if (!contentType) {
    return BINARY_FILENAME_PATTERN.test(contentDisposition)
  }

  return contentType.startsWith('audio/')
    || contentType.startsWith('font/')
    || contentType.startsWith('video/')
    || BINARY_CONTENT_TYPES.has(contentType)
    || BINARY_FILENAME_PATTERN.test(contentDisposition)
}

const fetchGetHeadersWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      headers: {
        Range: 'bytes=0-4095',
      },
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
    })

    await response.body?.cancel().catch(() => {})

    return response
  } finally {
    clearTimeout(timeout)
  }
}

export const probeCaptureUrlContent = async (
  captureUrl: string,
  runtimeConfig: any,
): Promise<ContentProbeResult> => {
  const timeoutMs = normalizePositiveInteger(
    runtimeConfig.screenshotPolicyProbeTimeoutMs
      ?? runtimeConfig.screenshotPolicyHeadProbeTimeoutMs,
    DEFAULT_PROBE_TIMEOUT_MS,
  )
  let currentUrl = captureUrl

  for (let redirectCount = 0; redirectCount <= MAX_PROBE_REDIRECTS; redirectCount += 1) {
    try {
      const response = await fetchGetHeadersWithTimeout(currentUrl, timeoutMs)

      if (isPdfResponse(response.headers)) {
        return { policy: 'skip', skipReason: 'pdf-content' }
      }

      if (isNonHtmlBinaryResponse(response.headers)) {
        return { policy: 'skip', skipReason: 'non-html-content' }
      }

      if (response.status >= 400) {
        return { policy: 'skip', skipReason: 'unavailable-content' }
      }

      if (!isRedirectStatus(response.status)) {
        return isHtmlResponse(response.headers)
          ? { captureUrl: currentUrl, policy: 'capture' }
          : { policy: 'skip', skipReason: 'non-html-content' }
      }

      const location = response.headers.get('Location')

      if (!location) {
        return { policy: 'skip', skipReason: 'unverified-content' }
      }

      let nextUrl: string | null = null

      try {
        nextUrl = normalizeSourceUrl(new URL(location, currentUrl).toString())
      } catch {
        return { policy: 'skip', skipReason: 'unverified-content' }
      }

      if (!nextUrl) {
        return { policy: 'skip', skipReason: 'blocked-hostname' }
      }

      currentUrl = nextUrl
    } catch {
      return { policy: 'skip', skipReason: 'unverified-content' }
    }
  }

  return { policy: 'skip', skipReason: 'unverified-content' }
}

export const isScreenshotPolicySkipError = (error: unknown): error is ScreenshotPolicySkipError => {
  return error instanceof ScreenshotPolicySkipError
}
