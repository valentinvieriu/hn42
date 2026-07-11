import { describe, expect, it, vi } from 'vitest'
import { readR2Screenshot, writeR2ScreenshotFailure } from './r2Cache'
import type { ScreenshotEnv } from './types'

describe('screenshot R2 failure markers', () => {
  it('stores failures as empty, non-image, no-store markers', async () => {
    const put = vi.fn().mockResolvedValue(undefined)
    const env = { SCREENSHOTS_BUCKET: { put } } as unknown as ScreenshotEnv

    await writeR2ScreenshotFailure(env, 'screenshots/v2/hash/original.jpg', 'hash', 'provider down', 'original')

    const [, body, options] = put.mock.calls[0] ?? []
    expect(body).toHaveLength(0)
    expect(options.httpMetadata).toEqual({
      cacheControl: 'no-store',
      contentType: 'application/vnd.hn42.screenshot-failure',
    })
    expect(options.customMetadata.status).toBe('failed')
  })

  it('reads a failure marker without treating its body as a screenshot', async () => {
    const arrayBuffer = vi.fn()
    const env = {
      SCREENSHOTS_BUCKET: {
        get: vi.fn().mockResolvedValue({
          arrayBuffer,
          customMetadata: {
            capturedAt: new Date().toISOString(),
            status: 'failed',
            variant: 'thumbnail',
          },
          httpMetadata: { contentType: 'application/vnd.hn42.screenshot-failure' },
        }),
      },
    } as unknown as ScreenshotEnv

    const result = await readR2Screenshot(env, 'marker', 30, 360)

    expect(result).toMatchObject({ isFailure: true, isFresh: true, variant: 'thumbnail' })
    expect(arrayBuffer).not.toHaveBeenCalled()
  })
})
