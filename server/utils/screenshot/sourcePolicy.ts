import type {
  ScreenshotRuntimeConfig,
  ScreenshotSkipReason,
  ScreenshotSourceStrategy,
} from './types'

const DEFAULT_XCANCEL_BASE_URL = 'https://xcancel.com'
const DEFAULT_PROBE_TIMEOUT_MS = 1200
const MAX_PROBE_REDIRECTS = 3
const PDF_CONTENT_TYPES = new Set([
  'application/acrobat',
  'application/pdf',
  'application/x-pdf',
  'text/pdf',
  'text/x-pdf',
])
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

export type ScreenshotCaptureDecision = {
  captureUrl: string
  policy: 'capture'
  sourceStrategy: ScreenshotSourceStrategy
}

export type ScreenshotSourceDecision = ScreenshotCaptureDecision

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

const getXCancelBaseUrl = (runtimeConfig: ScreenshotRuntimeConfig) => {
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

const getXCancelStatusUrl = (url: URL, runtimeConfig: ScreenshotRuntimeConfig) => {
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

export const createScreenshotSourceDecision = (
  sourceUrl: string,
  runtimeConfig: ScreenshotRuntimeConfig,
): ScreenshotSourceDecision => {
  const url = new URL(sourceUrl)
  const xcancelUrl = getXCancelStatusUrl(url, runtimeConfig)

  if (xcancelUrl) {
    return {
      captureUrl: xcancelUrl,
      policy: 'capture',
      sourceStrategy: 'xcancel',
    }
  }

  return {
    captureUrl: sourceUrl,
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

  return PDF_CONTENT_TYPES.has(contentType ?? '')
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
  runtimeConfig: ScreenshotRuntimeConfig,
): Promise<ContentProbeResult> => {
  const timeoutMs = normalizePositiveInteger(
    runtimeConfig.screenshotPolicyProbeTimeoutMs,
    DEFAULT_PROBE_TIMEOUT_MS,
  )

  // The probe may follow redirects to validate their destinations, but the
  // resulting redirect URL must not replace the requested screenshot URL.
  //
  // Explicit transformations such as XCancel remain intact because their
  // transformed URL is passed into this function as captureUrl.
  const requestedCaptureUrl = captureUrl
  let currentUrl = captureUrl

  for (let redirectCount = 0; redirectCount <= MAX_PROBE_REDIRECTS; redirectCount += 1) {
    try {
      const response = await fetchGetHeadersWithTimeout(currentUrl, timeoutMs)

      const isPdf = isObviousPdfUrl(new URL(currentUrl)) || isPdfResponse(response.headers)

      if (!isPdf && isNonHtmlBinaryResponse(response.headers)) {
        return {
          policy: 'skip',
          skipReason: 'non-html-content',
        }
      }

      if (response.status >= 400) {
        return {
          captureUrl: requestedCaptureUrl,
          policy: 'capture',
        }
      }

      if (!isRedirectStatus(response.status)) {
        return !getContentType(response.headers) || isHtmlResponse(response.headers) || isPdf
          ? {
              captureUrl: requestedCaptureUrl,
              policy: 'capture',
            }
          : {
              policy: 'skip',
              skipReason: 'non-html-content',
            }
      }

      const location = response.headers.get('Location')

      if (!location) {
        return {
          policy: 'skip',
          skipReason: 'unverified-content',
        }
      }

      let nextUrl: string | null

      try {
        nextUrl = normalizeSourceUrl(new URL(location, currentUrl).toString())
      } catch {
        return {
          policy: 'skip',
          skipReason: 'unverified-content',
        }
      }

      if (!nextUrl) {
        return {
          policy: 'skip',
          skipReason: 'blocked-hostname',
        }
      }

      currentUrl = nextUrl
    } catch {
      // A failed probe should not prevent Browserless from trying the original
      // capture target.
      return {
        captureUrl: requestedCaptureUrl,
        policy: 'capture',
      }
    }
  }

  return {
    captureUrl: requestedCaptureUrl,
    policy: 'capture',
  }
}
