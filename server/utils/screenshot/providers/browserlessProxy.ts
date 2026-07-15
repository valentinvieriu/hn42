import {
  createConcurrencyLimiter,
  ScreenshotConcurrencyQueueFullError,
  ScreenshotConcurrencyTimeoutError,
} from '../concurrency'
import type {
  ScreenshotEnv,
  ScreenshotResult,
  ScreenshotRuntimeConfig,
} from '../types'
import type { ScreenshotProviderErrorClassification } from './types'

const DEFAULT_CONCURRENCY = 1
const DEFAULT_NAVIGATION_TIMEOUT_MS = 8000
const DEFAULT_QUEUE_DEPTH = 5
const DEFAULT_QUEUE_TIMEOUT_MS = 10000
const DEFAULT_REQUEST_TIMEOUT_MS = 45000
const DEFAULT_SETTLE_MS = 200
const DEFAULT_VIEWPORT_HEIGHT = 900
const DEFAULT_VIEWPORT_WIDTH = 1440
const DEFAULT_QUALITY = 55
const MAX_ERROR_BYTES = 2048
const MAX_PROXY_VIEWPORT_HEIGHT = 2000
const MAX_RENDERED_PIXELS = 16_000_000
const browserlessProxyLimiter = createConcurrencyLimiter(DEFAULT_CONCURRENCY)

type BrowserlessProxyConfig = {
  endpoint: URL
  maxBytes: number
  navigationTimeoutMs: number
  previewHeight: number
  quality: number
  requestTimeoutMs: number
  settleMs: number
  token: string
  viewportHeight: number
  viewportWidth: number
}

export class BrowserlessProxyConfigurationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BrowserlessProxyConfigurationError'
  }
}

export class BrowserlessProxyInvalidOutputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BrowserlessProxyInvalidOutputError'
  }
}

export class BrowserlessProxyUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BrowserlessProxyUnavailableError'
  }
}

export class BrowserlessProxyResponseError extends Error {
  code?: string
  retryAfterMs?: number
  status: number

  constructor(status: number, code?: string, retryAfterMs?: number) {
    super(`Browserless screenshot proxy returned ${status}${code ? ` (${code})` : ''}`)
    this.name = 'BrowserlessProxyResponseError'
    this.code = code
    this.retryAfterMs = retryAfterMs
    this.status = status
  }
}

const normalizeInteger = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return fallback
  }

  return Math.min(maximum, Math.max(minimum, Math.floor(parsedValue)))
}

const getString = (value: unknown) => {
  return typeof value === 'string' ? value.trim() : ''
}

const getToken = (
  env: ScreenshotEnv | undefined,
  runtimeConfig: ScreenshotRuntimeConfig,
) => {
  const bindingToken = getString(env?.SCREENSHOT_API_TOKEN)

  return bindingToken || getString(runtimeConfig.screenshotBrowserlessProxyToken)
}

const getEndpoint = (runtimeConfig: ScreenshotRuntimeConfig) => {
  const configuredEndpoint = getString(runtimeConfig.screenshotBrowserlessProxyUrl)

  if (!configuredEndpoint) {
    throw new BrowserlessProxyConfigurationError('Browserless screenshot proxy URL is not configured')
  }

  let endpoint: URL

  try {
    endpoint = new URL(configuredEndpoint)
  } catch {
    throw new BrowserlessProxyConfigurationError('Browserless screenshot proxy URL is invalid')
  }

  if (
    !['http:', 'https:'].includes(endpoint.protocol)
    || endpoint.username
    || endpoint.password
    || endpoint.searchParams.has('token')
  ) {
    throw new BrowserlessProxyConfigurationError('Browserless screenshot proxy URL is not allowed')
  }

  endpoint.hash = ''

  return endpoint
}

const getBrowserlessProxyConfig = (
  env: ScreenshotEnv | undefined,
  runtimeConfig: ScreenshotRuntimeConfig,
): BrowserlessProxyConfig => {
  const token = getToken(env, runtimeConfig)

  if (!token) {
    throw new BrowserlessProxyConfigurationError('Browserless screenshot proxy token is not configured')
  }

  const viewportWidth = normalizeInteger(
    runtimeConfig.screenshotPreviewWidth,
    DEFAULT_VIEWPORT_WIDTH,
    320,
    2560,
  )
  const previewHeight = Math.min(
    Math.floor(MAX_RENDERED_PIXELS / viewportWidth),
    normalizeInteger(
      runtimeConfig.screenshotPreviewHeight,
      11111,
      320,
      12000,
    ),
  )

  return {
    endpoint: getEndpoint(runtimeConfig),
    maxBytes: normalizeInteger(
      runtimeConfig.screenshotPreviewMaxBytes,
      2_000_000,
      1024,
      10_000_000,
    ),
    navigationTimeoutMs: normalizeInteger(
      runtimeConfig.screenshotBrowserlessProxyNavigationTimeoutMs,
      DEFAULT_NAVIGATION_TIMEOUT_MS,
      5000,
      60000,
    ),
    previewHeight,
    quality: normalizeInteger(
      runtimeConfig.screenshotPreviewWebpQuality,
      DEFAULT_QUALITY,
      1,
      100,
    ),
    requestTimeoutMs: normalizeInteger(
      runtimeConfig.screenshotBrowserlessProxyRequestTimeoutMs,
      DEFAULT_REQUEST_TIMEOUT_MS,
      1000,
      120000,
    ),
    settleMs: normalizeInteger(
      runtimeConfig.screenshotBrowserlessProxySettleMs,
      DEFAULT_SETTLE_MS,
      0,
      5000,
    ),
    token,
    viewportHeight: Math.min(
      previewHeight,
      normalizeInteger(
        runtimeConfig.screenshotBrowserlessProxyViewportHeight,
        DEFAULT_VIEWPORT_HEIGHT,
        320,
        MAX_PROXY_VIEWPORT_HEIGHT,
      ),
    ),
    viewportWidth,
  }
}

const cancelResponseBody = async (response: Response) => {
  await response.body?.cancel().catch(() => {})
}

const readBoundedResponseBody = async (
  response: Response,
  maxBytes: number,
  truncate: boolean,
) => {
  const declaredLength = Number(response.headers.get('content-length'))

  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    await cancelResponseBody(response)

    if (!truncate) {
      throw new BrowserlessProxyInvalidOutputError(
        `Browserless screenshot exceeded the ${maxBytes}-byte limit`,
      )
    }
  }

  const reader = response.body?.getReader()

  if (!reader) {
    return new ArrayBuffer(0)
  }

  const chunks: Uint8Array[] = []
  let byteLength = 0

  while (true) {
    const { done, value } = await reader.read()

    if (done) {
      break
    }

    const remainingBytes = maxBytes - byteLength

    if (value.byteLength > remainingBytes) {
      if (truncate && remainingBytes > 0) {
        chunks.push(value.subarray(0, remainingBytes))
        byteLength += remainingBytes
      }

      await reader.cancel().catch(() => {})

      if (!truncate) {
        throw new BrowserlessProxyInvalidOutputError(
          `Browserless screenshot exceeded the ${maxBytes}-byte limit`,
        )
      }

      break
    }

    chunks.push(value)
    byteLength += value.byteLength
  }

  const bytes = new Uint8Array(byteLength)
  let offset = 0

  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  return bytes.buffer
}

const parseRetryAfterMs = (response: Response) => {
  const retryAfter = response.headers.get('retry-after')?.trim()

  if (!retryAfter) {
    return undefined
  }

  const seconds = Number(retryAfter)

  if (Number.isFinite(seconds)) {
    return Math.max(0, Math.floor(seconds * 1000))
  }

  const retryAt = Date.parse(retryAfter)

  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

const parseErrorCode = (bytes: ArrayBuffer) => {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))

    if (!isRecord(parsed) || !isRecord(parsed.error)) {
      return undefined
    }

    return getString(parsed.error.code) || undefined
  } catch {
    return undefined
  }
}

const readDimensionHeader = (
  response: Response,
  name: string,
  maximum: number,
) => {
  const value = Number(response.headers.get(name))

  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new BrowserlessProxyInvalidOutputError(`Browserless proxy returned an invalid ${name}`)
  }

  return value
}

const validateResponseMetadata = async (
  response: Response,
  config: BrowserlessProxyConfig,
) => {
  const outcome = getString(response.headers.get('x-screenshot-outcome')).toLowerCase()
  const sourceRoute = getString(response.headers.get('x-screenshot-source-route')).toLowerCase()

  if (!['ok', 'access_gate'].includes(outcome)) {
    await cancelResponseBody(response)
    throw new BrowserlessProxyInvalidOutputError(
      `Browserless proxy returned an unusable ${outcome || 'unknown'} outcome`,
    )
  }

  if (sourceRoute !== 'direct') {
    await cancelResponseBody(response)
    throw new BrowserlessProxyInvalidOutputError(
      `Browserless proxy returned an unsupported ${sourceRoute || 'unknown'} source route`,
    )
  }

  readDimensionHeader(response, 'x-screenshot-width', config.viewportWidth)
  readDimensionHeader(response, 'x-screenshot-height', config.previewHeight)
}

export const isBrowserlessProxyAvailable = (
  env: ScreenshotEnv | undefined,
  runtimeConfig: ScreenshotRuntimeConfig,
) => {
  try {
    getBrowserlessProxyConfig(env, runtimeConfig)
    return true
  } catch {
    return false
  }
}

export const classifyBrowserlessProxyError = (
  error: unknown,
): ScreenshotProviderErrorClassification => {
  if (
    error instanceof ScreenshotConcurrencyQueueFullError
    || error instanceof ScreenshotConcurrencyTimeoutError
    || (error instanceof BrowserlessProxyResponseError && error.status === 429)
  ) {
    return {
      kind: 'capacity',
      retryAfterMs: error instanceof BrowserlessProxyResponseError
        ? error.retryAfterMs
        : undefined,
    }
  }

  if (error instanceof BrowserlessProxyInvalidOutputError) {
    return { kind: 'invalid-output' }
  }

  if (
    error instanceof BrowserlessProxyConfigurationError
    || error instanceof BrowserlessProxyUnavailableError
    || (
      error instanceof BrowserlessProxyResponseError
      && (
        [401, 403, 404].includes(error.status)
        || error.code === 'browserless_unavailable'
      )
    )
  ) {
    return { kind: 'unavailable' }
  }

  if (
    error instanceof BrowserlessProxyResponseError
    && [400, 405, 413, 415, 422].includes(error.status)
  ) {
    return { kind: 'fatal' }
  }

  return { kind: 'transient' }
}

export const captureWithBrowserlessProxy = async (
  env: ScreenshotEnv | undefined,
  sourceUrl: string,
  runtimeConfig: ScreenshotRuntimeConfig,
): Promise<ScreenshotResult> => {
  const config = getBrowserlessProxyConfig(env, runtimeConfig)
  const release = await browserlessProxyLimiter.acquire(
    runtimeConfig.screenshotBrowserlessProxyConcurrency,
    {
      label: 'Browserless screenshot proxy',
      maxQueueDepth: runtimeConfig.screenshotBrowserlessProxyQueueDepth ?? DEFAULT_QUEUE_DEPTH,
      maxQueueWaitMs: runtimeConfig.screenshotBrowserlessProxyQueueTimeoutMs ?? DEFAULT_QUEUE_TIMEOUT_MS,
    },
  )

  try {
    let response: Response

    try {
      response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Accept': 'image/webp',
          'Authorization': `Bearer ${config.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: sourceUrl,
          profile: 'fullPage',
          cleanup: 'nuisances',
          format: 'webp',
          quality: config.quality,
          viewport: {
            width: config.viewportWidth,
            height: config.viewportHeight,
            deviceScaleFactor: 1,
            isMobile: false,
          },
          timeoutMs: config.navigationTimeoutMs,
          settleMs: config.settleMs,
          waitUntil: 'domcontentloaded',
          response: 'binary',
        }),
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      })
    } catch (error) {
      if (
        error instanceof DOMException
        && ['AbortError', 'TimeoutError'].includes(error.name)
      ) {
        throw new BrowserlessProxyResponseError(504, 'request_timeout')
      }

      throw new BrowserlessProxyUnavailableError('Browserless screenshot proxy is unavailable')
    }

    if (!response.ok) {
      const errorBytes = await readBoundedResponseBody(response, MAX_ERROR_BYTES, true)

      throw new BrowserlessProxyResponseError(
        response.status,
        parseErrorCode(errorBytes),
        parseRetryAfterMs(response),
      )
    }

    await validateResponseMetadata(response, config)

    return {
      bytes: await readBoundedResponseBody(response, config.maxBytes, false),
      contentType: response.headers.get('content-type') ?? '',
      processor: 'browserless-proxy',
      provider: 'browserless-proxy',
    }
  } finally {
    release()
  }
}
