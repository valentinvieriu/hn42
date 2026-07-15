import { describe, expect, it, vi } from 'vitest'
import {
  BrowserRunCapacityError,
  BrowserRunResponseError,
  captureWithBrowserRun,
} from './browserRun'
import type { ScreenshotEnv } from '../types'

const createWebpResponse = () => {
  const bytes = new Uint8Array(1200)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0)
  bytes.set([0x57, 0x45, 0x42, 0x50], 8)

  return new Response(bytes, {
    headers: {
      'Content-Type': 'image/webp',
      'X-Browser-Ms-Used': '4321',
    },
  })
}

const createRateLimitBucket = () => {
  let stored: { customMetadata: Record<string, string>, etag: string } | null = null
  let version = 0

  return {
    head: vi.fn().mockImplementation(async () => stored),
    put: vi.fn().mockImplementation(async (
      _key: string,
      _body: null,
      options: { customMetadata: Record<string, string> },
    ) => {
      version += 1
      stored = {
        customMetadata: options.customMetadata,
        etag: `etag-${version}`,
      }
      return stored
    }),
  }
}

describe('Browser Run screenshot provider', () => {
  it('uses the bounded full-page WebP profile', async () => {
    const quickAction = vi.fn().mockResolvedValue(createWebpResponse())
    const env = { BROWSER: { quickAction } } as unknown as ScreenshotEnv

    const result = await captureWithBrowserRun(env, 'https://example.com/article', {
      screenshotBrowserMinIntervalMs: 0,
    })

    expect(result).toMatchObject({
      browserMsUsed: 4321,
      contentType: 'image/webp',
      processor: 'browser-run',
      provider: 'browser-run',
    })
    expect(quickAction).toHaveBeenCalledWith('screenshot', expect.objectContaining({
      actionTimeout: 5000,
      cacheTTL: 0,
      gotoOptions: {
        timeout: 8000,
        waitUntil: 'domcontentloaded',
      },
      scrollPage: false,
      screenshotOptions: {
        captureBeyondViewport: true,
        fullPage: true,
        optimizeForSpeed: true,
        quality: 55,
        type: 'webp',
      },
      url: 'https://example.com/article',
      viewport: {
        deviceScaleFactor: 1,
        height: 900,
        width: 1440,
      },
      waitForTimeout: 200,
    }))
    expect(quickAction.mock.calls[0]?.[1]?.addScriptTag?.[0]?.content)
      .toContain('Math.min(\n              11111')
    expect(quickAction.mock.calls[0]?.[1]?.addScriptTag?.[0]?.content)
      .toContain('Math.max(900, naturalHeight)')
    expect(quickAction.mock.calls[0]?.[1]?.addScriptTag?.[0]?.content)
      .toContain("element.style.setProperty('overflow', 'clip', 'important')")
  })

  it('never lets the browser viewport exceed the preview height ceiling', async () => {
    const quickAction = vi.fn().mockResolvedValue(createWebpResponse())
    const env = { BROWSER: { quickAction } } as unknown as ScreenshotEnv

    await captureWithBrowserRun(env, 'https://example.com/article', {
      screenshotBrowserMinIntervalMs: 0,
      screenshotBrowserViewportHeight: 1200,
      screenshotPreviewHeight: 800,
    })

    expect(quickAction.mock.calls[0]?.[1]?.viewport).toMatchObject({
      height: 800,
      width: 1440,
    })
  })

  it('caps configured full-page geometry at 16 megapixels', async () => {
    const quickAction = vi.fn().mockResolvedValue(createWebpResponse())
    const env = { BROWSER: { quickAction } } as unknown as ScreenshotEnv

    await captureWithBrowserRun(env, 'https://example.com/article', {
      screenshotBrowserMinIntervalMs: 0,
      screenshotPreviewHeight: 12000,
      screenshotPreviewWidth: 2000,
    })

    expect(quickAction.mock.calls[0]?.[1]?.viewport).toMatchObject({
      height: 900,
      width: 2000,
    })
    expect(quickAction.mock.calls[0]?.[1]?.addScriptTag?.[0]?.content)
      .toContain('Math.min(\n              8000')
  })

  it('disposes remote Quick Action response stubs after reading them', async () => {
    const response = createWebpResponse()
    const dispose = vi.fn()
    const disposeSymbol = (Symbol as unknown as { dispose: symbol }).dispose
    Object.defineProperty(response, disposeSymbol, { value: dispose })
    const env = {
      BROWSER: { quickAction: vi.fn().mockResolvedValue(response) },
    } as unknown as ScreenshotEnv

    await captureWithBrowserRun(env, 'https://example.com/article', {
      screenshotBrowserMinIntervalMs: 0,
    })

    expect(dispose).toHaveBeenCalledOnce()
  })

  it('fails closed when the Browser Run binding is absent', async () => {
    await expect(captureWithBrowserRun(undefined, 'https://example.com', {}))
      .rejects.toThrow('Browser Run binding is not configured')
  })

  it('stops reading screenshots that exceed the configured byte limit', async () => {
    const env = {
      BROWSER: { quickAction: vi.fn().mockResolvedValue(createWebpResponse()) },
    } as unknown as ScreenshotEnv

    await expect(captureWithBrowserRun(env, 'https://example.com/article', {
      screenshotBrowserMinIntervalMs: 0,
      screenshotPreviewMaxBytes: 1024,
    })).rejects.toThrow('exceeded the 1024-byte limit')
  })

  it('preserves Browser Run rate-limit metadata', async () => {
    const quickAction = vi.fn().mockResolvedValue(new Response('slow down', {
      headers: { 'Retry-After': '10' },
      status: 429,
    }))
    const env = { BROWSER: { quickAction } } as unknown as ScreenshotEnv

    await expect(captureWithBrowserRun(env, 'https://example.com/article', {
      screenshotBrowserMinIntervalMs: 0,
    })).rejects.toMatchObject({
      retryAfterMs: 10000,
      status: 429,
    } satisfies Partial<BrowserRunResponseError>)
  })

  it('enforces the shared daily capture budget before Browser Run', async () => {
    const quickAction = vi.fn().mockResolvedValue(createWebpResponse())
    const bucket = createRateLimitBucket()
    const env = {
      BROWSER: { quickAction },
      SCREENSHOTS_BUCKET: bucket,
    } as unknown as ScreenshotEnv
    const config = {
      screenshotBrowserMinIntervalMs: 1,
      screenshotCaptureDailyLimit: 1,
    }

    await captureWithBrowserRun(env, 'https://example.com/one', config)

    await expect(captureWithBrowserRun(env, 'https://example.com/two', config))
      .rejects.toBeInstanceOf(BrowserRunCapacityError)
    expect(quickAction).toHaveBeenCalledTimes(1)
  })

  it('still enforces the daily budget when spacing is disabled', async () => {
    const quickAction = vi.fn().mockResolvedValue(createWebpResponse())
    const env = {
      BROWSER: { quickAction },
      SCREENSHOTS_BUCKET: createRateLimitBucket(),
    } as unknown as ScreenshotEnv
    const config = {
      screenshotBrowserMinIntervalMs: 0,
      screenshotCaptureDailyLimit: 1,
    }

    await captureWithBrowserRun(env, 'https://example.com/one', config)

    await expect(captureWithBrowserRun(env, 'https://example.com/two', config))
      .rejects.toBeInstanceOf(BrowserRunCapacityError)
    expect(quickAction).toHaveBeenCalledTimes(1)
  })

  it('fails closed when shared rate coordination is unavailable', async () => {
    const quickAction = vi.fn().mockResolvedValue(createWebpResponse())
    const env = {
      BROWSER: { quickAction },
      SCREENSHOTS_BUCKET: {
        head: vi.fn().mockRejectedValue(new Error('R2 unavailable')),
      },
    } as unknown as ScreenshotEnv

    await expect(captureWithBrowserRun(env, 'https://example.com/article', {}))
      .rejects.toBeInstanceOf(BrowserRunCapacityError)
    expect(quickAction).not.toHaveBeenCalled()
  })
})
