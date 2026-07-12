import {
  createConcurrencyLimiter,
  ScreenshotConcurrencyQueueFullError,
  ScreenshotConcurrencyTimeoutError,
} from './concurrency'
import type { ScreenshotEnv, ScreenshotResult } from './types'

const BROWSER_RUN_RATE_KEY = 'screenshots/v3/_control/browser-run-rate-limit'
const DEFAULT_ACTION_TIMEOUT_MS = 3000
const DEFAULT_CACHE_TTL_SECONDS = 86400
const DEFAULT_CAPTURE_CONCURRENCY = 1
const DEFAULT_DAILY_CAPTURE_LIMIT = 60
const DEFAULT_GOTO_TIMEOUT_MS = 8000
const DEFAULT_HEIGHT = 1440
const DEFAULT_MAX_BYTES = 750_000
const DEFAULT_MIN_INTERVAL_MS = 10_000
const DEFAULT_QUEUE_DEPTH = 5
const DEFAULT_QUEUE_TIMEOUT_MS = 30_000
const DEFAULT_QUALITY = 72
const DEFAULT_WAIT_AFTER_LOAD_MS = 200
const DEFAULT_WIDTH = 720
const MAX_GLOBAL_RATE_ATTEMPTS = 6
const MAX_RATE_WAIT_MS = 30_000
const MIN_SCREENSHOT_BYTES = 1024
const browserRunLimiter = createConcurrencyLimiter(1)
let localNextCaptureAt = 0
let localCaptureDay = ''
let localCaptureCount = 0

export class BrowserRunCapacityError extends Error {
  retryAfterMs?: number

  constructor(message: string, retryAfterMs?: number) {
    super(message)
    this.name = 'BrowserRunCapacityError'
    this.retryAfterMs = retryAfterMs
  }
}

export class BrowserRunResponseError extends Error {
  browserMsUsed?: number
  retryAfterMs?: number
  status: number

  constructor(status: number, message: string, retryAfterMs?: number, browserMsUsed?: number) {
    super(`Browser Run returned ${status}${message ? `: ${message}` : ''}`)
    this.name = 'BrowserRunResponseError'
    this.browserMsUsed = browserMsUsed
    this.retryAfterMs = retryAfterMs
    this.status = status
  }
}

export const isBrowserRunCapacityError = (error: unknown) => {
  return error instanceof BrowserRunCapacityError
    || error instanceof ScreenshotConcurrencyQueueFullError
    || error instanceof ScreenshotConcurrencyTimeoutError
    || (error instanceof BrowserRunResponseError && error.status === 429)
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

const wait = (delayMs: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, delayMs)
})

const isJpeg = (bytes: ArrayBuffer) => {
  const view = new Uint8Array(bytes)

  return view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff
}

const parseBrowserMsUsed = (response: Response) => {
  const parsedValue = Number(response.headers.get('X-Browser-Ms-Used'))

  return Number.isFinite(parsedValue) && parsedValue >= 0
    ? Math.floor(parsedValue)
    : undefined
}

const parseRetryAfterMs = (response: Response) => {
  const value = response.headers.get('Retry-After')

  if (!value) {
    return undefined
  }

  const seconds = Number(value)

  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.floor(seconds * 1000)
  }

  const retryAt = Date.parse(value)

  return Number.isFinite(retryAt) ? Math.max(0, retryAt - Date.now()) : undefined
}

const disposeRpcResult = (result: unknown) => {
  const disposeSymbol = (Symbol as unknown as { dispose?: symbol }).dispose

  if (!disposeSymbol || result === null || (typeof result !== 'object' && typeof result !== 'function')) {
    return
  }

  const dispose = (result as Record<PropertyKey, unknown>)[disposeSymbol]

  if (typeof dispose === 'function') {
    dispose.call(result)
  }
}

const getNextUtcDay = () => {
  const now = new Date()

  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)
}

const getUtcDay = () => new Date().toISOString().slice(0, 10)

const getStoredNextCaptureAt = (object: R2Object | null) => {
  const parsedValue = Number(object?.customMetadata?.nextCaptureAt)

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : 0
}

const waitForLocalRateSlot = async (minIntervalMs: number, dailyCaptureLimit: number) => {
  const captureDay = getUtcDay()

  if (localCaptureDay !== captureDay) {
    localCaptureDay = captureDay
    localCaptureCount = 0
  }

  if (localCaptureCount >= dailyCaptureLimit) {
    throw new BrowserRunCapacityError(
      'Browser Run daily capture budget is exhausted',
      Math.max(0, getNextUtcDay() - Date.now()),
    )
  }

  const delayMs = Math.max(0, localNextCaptureAt - Date.now())

  if (delayMs > MAX_RATE_WAIT_MS) {
    throw new BrowserRunCapacityError('Browser Run local cooldown is active', delayMs)
  }

  if (delayMs > 0) {
    await wait(delayMs)
  }

  localNextCaptureAt = Date.now() + minIntervalMs
  localCaptureCount += 1
}

const acquireBrowserRunRateSlot = async (
  bucket: R2Bucket | undefined,
  minIntervalMs: number,
  dailyCaptureLimit: number,
) => {
  if (!bucket) {
    await waitForLocalRateSlot(minIntervalMs, dailyCaptureLimit)
    return
  }

  try {
    for (let attempt = 0; attempt < MAX_GLOBAL_RATE_ATTEMPTS; attempt += 1) {
      const current = await bucket.head(BROWSER_RUN_RATE_KEY)
      const captureDay = getUtcDay()
      const currentCaptureCount = current?.customMetadata?.captureDay === captureDay
        ? Number(current.customMetadata.captureCount)
        : 0
      const captureCount = Number.isFinite(currentCaptureCount) && currentCaptureCount >= 0
        ? Math.floor(currentCaptureCount)
        : 0

      if (captureCount >= dailyCaptureLimit) {
        throw new BrowserRunCapacityError(
          'Browser Run daily capture budget is exhausted',
          Math.max(0, getNextUtcDay() - Date.now()),
        )
      }

      const delayMs = Math.max(0, getStoredNextCaptureAt(current) - Date.now())

      if (delayMs > MAX_RATE_WAIT_MS) {
        throw new BrowserRunCapacityError('Browser Run account cooldown is active', delayMs)
      }

      if (delayMs > 0) {
        await wait(delayMs)
      }

      const nextCaptureAt = Date.now() + minIntervalMs
      const result = await bucket.put(BROWSER_RUN_RATE_KEY, null, {
        onlyIf: current
          ? { etagMatches: current.etag }
          : { etagDoesNotMatch: '*' },
        httpMetadata: {
          cacheControl: 'no-store',
          contentType: 'application/vnd.hn42.browser-run-rate-limit',
        },
        customMetadata: {
          captureCount: String(captureCount + 1),
          captureDay,
          nextCaptureAt: String(nextCaptureAt),
        },
      })

      if (result) {
        localNextCaptureAt = Math.max(localNextCaptureAt, nextCaptureAt)
        localCaptureDay = captureDay
        localCaptureCount = Math.max(localCaptureCount, captureCount + 1)
        return
      }
    }

    throw new BrowserRunCapacityError('Browser Run rate-limit queue is saturated')
  } catch (error) {
    if (error instanceof BrowserRunCapacityError) {
      throw error
    }

    console.warn(JSON.stringify({
      message: 'R2 Browser Run rate coordination failed; capture rejected',
      error: error instanceof Error ? error.message : String(error),
    }))
    throw new BrowserRunCapacityError('Browser Run rate coordination is unavailable')
  }
}

const recordBrowserRunCooldown = async (
  bucket: R2Bucket | undefined,
  retryAfterMs: number,
) => {
  if (!bucket || retryAfterMs <= 0) {
    return
  }

  try {
    const current = await bucket.head(BROWSER_RUN_RATE_KEY)
    const nextCaptureAt = Math.max(
      getStoredNextCaptureAt(current),
      Date.now() + retryAfterMs,
    )

    await bucket.put(BROWSER_RUN_RATE_KEY, null, {
      onlyIf: current
        ? { etagMatches: current.etag }
        : { etagDoesNotMatch: '*' },
      httpMetadata: {
        cacheControl: 'no-store',
        contentType: 'application/vnd.hn42.browser-run-rate-limit',
      },
      customMetadata: {
        captureCount: current?.customMetadata?.captureCount ?? '0',
        captureDay: current?.customMetadata?.captureDay ?? getUtcDay(),
        nextCaptureAt: String(nextCaptureAt),
      },
    })
    localNextCaptureAt = Math.max(localNextCaptureAt, nextCaptureAt)
  } catch (error) {
    console.warn(JSON.stringify({
      message: 'Could not persist Browser Run cooldown',
      error: error instanceof Error ? error.message : String(error),
    }))
  }
}

export const captureWithBrowserRun = async (
  env: ScreenshotEnv | undefined,
  sourceUrl: string,
  runtimeConfig: any,
): Promise<ScreenshotResult> => {
  const browser = env?.BROWSER

  if (!browser) {
    throw new Error('Browser Run binding is not configured')
  }

  const concurrency = normalizeInteger(
    runtimeConfig.screenshotCaptureConcurrency,
    DEFAULT_CAPTURE_CONCURRENCY,
    1,
    10,
  )
  const release = await browserRunLimiter.acquire(concurrency, {
    label: 'Browser Run screenshot capture',
    maxQueueDepth: normalizeInteger(
      runtimeConfig.screenshotCaptureQueueDepth,
      DEFAULT_QUEUE_DEPTH,
      0,
      100,
    ),
    maxQueueWaitMs: normalizeInteger(
      runtimeConfig.screenshotCaptureQueueTimeoutMs,
      DEFAULT_QUEUE_TIMEOUT_MS,
      1,
      120000,
    ),
  })

  try {
    await acquireBrowserRunRateSlot(
      env?.SCREENSHOTS_BUCKET,
      normalizeInteger(
        runtimeConfig.screenshotBrowserMinIntervalMs,
        DEFAULT_MIN_INTERVAL_MS,
        0,
        60000,
      ),
      normalizeInteger(
        runtimeConfig.screenshotCaptureDailyLimit,
        DEFAULT_DAILY_CAPTURE_LIMIT,
        1,
        10000,
      ),
    )

    const response = await browser.quickAction('screenshot', {
      actionTimeout: normalizeInteger(
        runtimeConfig.screenshotBrowserActionTimeoutMs,
        DEFAULT_ACTION_TIMEOUT_MS,
        1,
        120000,
      ),
      addStyleTag: [{
        content: `
          *, *::before, *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            caret-color: transparent !important;
          }
        `,
      }],
      cacheTTL: normalizeInteger(
        runtimeConfig.screenshotBrowserCacheTtlSeconds,
        DEFAULT_CACHE_TTL_SECONDS,
        0,
        86400,
      ),
      gotoOptions: {
        timeout: normalizeInteger(
          runtimeConfig.screenshotBrowserGotoTimeoutMs,
          DEFAULT_GOTO_TIMEOUT_MS,
          1,
          60000,
        ),
        waitUntil: 'domcontentloaded',
      },
      rejectResourceTypes: [
        'media',
        'websocket',
        'eventsource',
        'prefetch',
        'ping',
      ],
      screenshotOptions: {
        fullPage: false,
        optimizeForSpeed: true,
        quality: normalizeInteger(
          runtimeConfig.screenshotPreviewJpegQuality,
          DEFAULT_QUALITY,
          1,
          100,
        ),
        type: 'jpeg',
      },
      scrollPage: false,
      url: sourceUrl,
      viewport: {
        deviceScaleFactor: 1,
        height: normalizeInteger(
          runtimeConfig.screenshotPreviewHeight,
          DEFAULT_HEIGHT,
          1,
          10000,
        ),
        width: normalizeInteger(
          runtimeConfig.screenshotPreviewWidth,
          DEFAULT_WIDTH,
          1,
          10000,
        ),
      },
      waitForTimeout: normalizeInteger(
        runtimeConfig.screenshotBrowserWaitAfterLoadMs,
        DEFAULT_WAIT_AFTER_LOAD_MS,
        0,
        120000,
      ),
    })
    try {
      const browserMsUsed = parseBrowserMsUsed(response)

      if (!response.ok) {
        const message = (await response.text()).slice(0, 200)
        const retryAfterMs = message.toLowerCase().includes('time limit exceeded for today')
          ? Math.max(0, getNextUtcDay() - Date.now())
          : (parseRetryAfterMs(response) ?? (response.status === 429 ? DEFAULT_MIN_INTERVAL_MS : undefined))

        if (response.status === 429 && retryAfterMs) {
          await recordBrowserRunCooldown(env?.SCREENSHOTS_BUCKET, retryAfterMs)
        }

        throw new BrowserRunResponseError(response.status, message, retryAfterMs, browserMsUsed)
      }

      const contentType = response.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase()
      const bytes = await response.arrayBuffer()
      const maxBytes = normalizeInteger(
        runtimeConfig.screenshotPreviewMaxBytes,
        DEFAULT_MAX_BYTES,
        MIN_SCREENSHOT_BYTES,
        10_000_000,
      )

      if (
        contentType !== 'image/jpeg'
        || bytes.byteLength < MIN_SCREENSHOT_BYTES
        || bytes.byteLength > maxBytes
        || !isJpeg(bytes)
      ) {
        throw new Error('Browser Run returned an invalid JPEG screenshot')
      }

      return {
        browserMsUsed,
        bytes,
        contentType,
        processor: 'browser-run',
        provider: 'browser-run',
      }
    } finally {
      disposeRpcResult(response)
    }
  } finally {
    release()
  }
}
