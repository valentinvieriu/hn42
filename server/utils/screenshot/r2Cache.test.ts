import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getR2PreviewScreenshotKey,
  getRemainingR2TtlSeconds,
  headR2Screenshot,
  readR2Screenshot,
  writeR2Screenshot,
} from './r2Cache'
import type { ScreenshotEnv } from './types'

afterEach(() => {
  vi.useRealTimers()
})

describe('screenshot R2 storage', () => {
  it('uses the HN item ID as the v9 object identity', () => {
    const previewKey = getR2PreviewScreenshotKey('42424242')

    expect(previewKey).toBe('screenshots/v9/items/42424242/preview-1440x11111-q55.webp')
  })

  it('checks object metadata without reading the screenshot body', async () => {
    const arrayBuffer = vi.fn()
    const head = vi.fn().mockResolvedValue({
      customMetadata: {
        capturedAt: new Date().toISOString(),
        status: 'ok',
        storyId: '42424242',
      },
      httpMetadata: { contentType: 'image/webp' },
    })
    const env = { SCREENSHOTS_BUCKET: { head } } as unknown as ScreenshotEnv

    await expect(headR2Screenshot(env, 'preview', 14)).resolves.toMatchObject({
      contentType: 'image/webp',
      isFresh: true,
    })
    expect(arrayBuffer).not.toHaveBeenCalled()
  })

  it('stores successful screenshot metadata with the story ID', async () => {
    const put = vi.fn().mockResolvedValue(undefined)
    const env = { SCREENSHOTS_BUCKET: { put } } as unknown as ScreenshotEnv

    await writeR2Screenshot(env, 'preview', '42424242', {
      bytes: new Uint8Array([1, 2, 3]).buffer,
      contentType: 'image/webp',
      processor: 'browserless-proxy',
      provider: 'browserless-agent',
    }, 'original')

    const [, , options] = put.mock.calls[0] ?? []
    expect(options.customMetadata).toMatchObject({
      processor: 'browserless-proxy',
      provider: 'browserless-agent',
      storyId: '42424242',
      variant: 'original',
    })
    expect(options.httpMetadata.cacheControl).toBe('public, max-age=1209600, immutable')
  })

  it('propagates storage errors so callers fail closed', async () => {
    const env = {
      SCREENSHOTS_BUCKET: {
        get: vi.fn().mockRejectedValue(new Error('R2 unavailable')),
      },
    } as unknown as ScreenshotEnv

    await expect(readR2Screenshot(env, 'preview', 14)).rejects.toThrow('R2 unavailable')
  })

  it('limits edge freshness to the remaining R2 lifetime', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T00:00:00Z'))
    const capturedAt = new Date('2026-07-02T00:00:00Z')

    expect(getRemainingR2TtlSeconds(capturedAt, 14)).toBe(24 * 60 * 60)
    expect(getRemainingR2TtlSeconds(null, 14, 1000)).toBe(1000)
  })
})
