import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getR2PreviewScreenshotKey,
  getRemainingR2TtlSeconds,
  getR2ScreenshotFailureKey,
  readR2Screenshot,
  writeR2Screenshot,
  writeR2ScreenshotFailure,
} from './r2Cache'
import type { ScreenshotEnv } from './types'

afterEach(() => {
  vi.useRealTimers()
})

describe('screenshot R2 failure markers', () => {
  it('stores failures as empty, non-image, no-store markers', async () => {
    const put = vi.fn().mockResolvedValue(undefined)
    const env = { SCREENSHOTS_BUCKET: { put } } as unknown as ScreenshotEnv

    const previewKey = getR2PreviewScreenshotKey('hash')

    await writeR2ScreenshotFailure(
      env,
      getR2ScreenshotFailureKey(previewKey),
      'hash',
      'provider down',
      'original',
      { policy: 'capture', sourceStrategy: 'direct' },
      'ordered:browser-run',
    )

    const [, body, options] = put.mock.calls[0] ?? []
    expect(body).toHaveLength(0)
    expect(options.httpMetadata).toEqual({
      cacheControl: 'no-store',
      contentType: 'application/vnd.hn42.screenshot-failure',
    })
    expect(options.customMetadata).toMatchObject({
      policy: 'capture',
      providerPlan: 'ordered:browser-run',
      reason: 'provider down',
      sourceStrategy: 'direct',
      sourceUrlHash: 'hash',
      status: 'failed',
      variant: 'original',
    })
  })

  it('reads a failure marker without treating its body as a screenshot', async () => {
    const arrayBuffer = vi.fn()
    const env = {
      SCREENSHOTS_BUCKET: {
        get: vi.fn().mockResolvedValue({
          arrayBuffer,
          customMetadata: {
            capturedAt: new Date().toISOString(),
            providerPlan: 'balanced:provider-a,provider-b',
            status: 'failed',
            variant: 'thumbnail',
          },
          httpMetadata: { contentType: 'application/vnd.hn42.screenshot-failure' },
        }),
      },
    } as unknown as ScreenshotEnv

    const result = await readR2Screenshot(env, 'marker', 30, 360)

    expect(result).toMatchObject({
      isFailure: true,
      isFresh: true,
      providerPlan: 'balanced:provider-a,provider-b',
    })
    expect(result).not.toHaveProperty('variant')
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('retains successful screenshot custom metadata when writing R2', async () => {
    const put = vi.fn().mockResolvedValue(undefined)
    const env = { SCREENSHOTS_BUCKET: { put } } as unknown as ScreenshotEnv

    await writeR2Screenshot(env, 'preview', 'hash', {
      bytes: new Uint8Array([1, 2, 3]).buffer,
      contentType: 'image/webp',
      processor: 'browser-run',
      provider: 'browser-run',
    }, 'original', {
      policy: 'capture',
      sourceStrategy: 'xcancel',
    })

    const [, , options] = put.mock.calls[0] ?? []
    expect(options.customMetadata).toMatchObject({
      contentType: 'image/webp',
      policy: 'capture',
      processor: 'browser-run',
      provider: 'browser-run',
      sourceStrategy: 'xcancel',
      sourceUrlHash: 'hash',
      status: 'ok',
      variant: 'original',
    })
  })

  it('propagates storage errors so callers can fail closed', async () => {
    const env = {
      SCREENSHOTS_BUCKET: {
        get: vi.fn().mockRejectedValue(new Error('R2 unavailable')),
      },
    } as unknown as ScreenshotEnv

    await expect(readR2Screenshot(env, 'preview', 180, 360))
      .rejects.toThrow('R2 unavailable')
  })

  it('uses one bounded preview key and a separate failure key', () => {
    const previewKey = getR2PreviewScreenshotKey('hash')

    expect(previewKey).toBe('screenshots/v8/hash/preview-1440x11111-q55.webp')
    expect(getR2ScreenshotFailureKey(previewKey))
      .toBe('screenshots/v8/hash/preview-1440x11111-q55.webp.failure')
  })

  it('limits edge freshness to the remaining R2 lifetime', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-12T00:00:00Z'))
    const capturedAt = new Date('2026-01-14T00:00:00Z')

    expect(getRemainingR2TtlSeconds(capturedAt, 180)).toBe(24 * 60 * 60)
    expect(getRemainingR2TtlSeconds(null, 180, 1000)).toBe(1000)
  })
})
