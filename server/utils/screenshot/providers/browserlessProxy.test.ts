import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BrowserlessProxyInvalidOutputError,
  captureWithBrowserlessProxy,
  classifyBrowserlessProxyError,
  isBrowserlessProxyAvailable,
} from './browserlessProxy'

const createWebp = (byteLength = 1200) => {
  const bytes = new Uint8Array(byteLength)
  bytes.set([0x52, 0x49, 0x46, 0x46], 0)
  bytes.set([0x57, 0x45, 0x42, 0x50], 8)

  return bytes
}

const createSuccessResponse = (
  options: {
    height?: number
    outcome?: string
    route?: string
    width?: number
  } = {},
) => {
  const bytes = createWebp()

  return new Response(bytes, {
    headers: {
      'Content-Length': String(bytes.byteLength),
      'Content-Type': 'image/webp',
      'X-Screenshot-Height': String(options.height ?? 11111),
      'X-Screenshot-Outcome': options.outcome ?? 'ok',
      'X-Screenshot-Source-Route': options.route ?? 'direct',
      'X-Screenshot-Width': String(options.width ?? 1440),
    },
  })
}

const runtimeConfig = {
  screenshotBrowserlessProxyToken: 'proxy-secret',
  screenshotBrowserlessProxyUrl: 'https://screenshots.dev.localhost/v1/screenshots',
  screenshotPreviewHeight: '11111',
  screenshotPreviewWebpQuality: '55',
  screenshotPreviewMaxBytes: '2000000',
  screenshotPreviewWidth: '1440',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Browserless screenshot proxy provider', () => {
  it('uses the proxy-compatible bounded full-page WebP request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createSuccessResponse())
    vi.stubGlobal('fetch', fetchMock)

    const result = await captureWithBrowserlessProxy(
      undefined,
      'https://example.com/article',
      runtimeConfig,
    )

    expect(result).toMatchObject({
      contentType: 'image/webp',
      processor: 'browserless-proxy',
      provider: 'browserless-proxy',
    })
    expect(result.bytes.byteLength).toBe(1200)
    expect(fetchMock).toHaveBeenCalledOnce()

    const [input, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    const headers = new Headers(init.headers)

    expect(input.href).toBe('https://screenshots.dev.localhost/v1/screenshots')
    expect(input.searchParams.has('token')).toBe(false)
    expect(init.method).toBe('POST')
    expect(headers.get('authorization')).toBe('Bearer proxy-secret')
    expect(headers.get('accept')).toBe('image/webp')
    expect(JSON.parse(String(init.body))).toEqual({
      url: 'https://example.com/article',
      profile: 'fullPage',
      cleanup: 'nuisances',
      format: 'webp',
      quality: 55,
      viewport: {
        width: 1440,
        height: 900,
        deviceScaleFactor: 1,
        isMobile: false,
      },
      timeoutMs: 8000,
      settleMs: 200,
      waitUntil: 'domcontentloaded',
      response: 'binary',
    })
  })

  it('prefers the provider-specific Worker secret binding', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createSuccessResponse())
    vi.stubGlobal('fetch', fetchMock)

    await captureWithBrowserlessProxy(
      { SCREENSHOT_API_TOKEN: 'binding-secret' },
      'https://example.com/article',
      runtimeConfig,
    )

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit]

    expect(new Headers(init.headers).get('authorization'))
      .toBe('Bearer binding-secret')
  })

  it('accepts access gates as useful article context', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createSuccessResponse({
      outcome: 'access_gate',
    })))

    await expect(captureWithBrowserlessProxy(
      undefined,
      'https://example.com/gated',
      runtimeConfig,
    )).resolves.toMatchObject({ provider: 'browserless-proxy' })
  })

  it.each(['challenge', 'http_error', 'navigation_error']) (
    'rejects the %s outcome',
    async (outcome) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createSuccessResponse({ outcome })))

      const error = await captureWithBrowserlessProxy(
        undefined,
        'https://example.com/article',
        runtimeConfig,
      ).catch((caughtError) => caughtError)

      expect(error).toBeInstanceOf(BrowserlessProxyInvalidOutputError)
      expect(classifyBrowserlessProxyError(error)).toEqual({ kind: 'invalid-output' })
    },
  )

  it('rejects transparent Ladder routing before it can enter the direct R2 key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createSuccessResponse({ route: 'ladder' })))

    await expect(captureWithBrowserlessProxy(
      undefined,
      'https://www.theguardian.com/article',
      runtimeConfig,
    )).rejects.toBeInstanceOf(BrowserlessProxyInvalidOutputError)
  })

  it('rejects dimensions outside the configured preview bound', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createSuccessResponse({ height: 11112 })))

    await expect(captureWithBrowserlessProxy(
      undefined,
      'https://example.com/article',
      runtimeConfig,
    )).rejects.toBeInstanceOf(BrowserlessProxyInvalidOutputError)
  })

  it('keeps wider captures inside the shared 16-megapixel budget', async () => {
    const fetchMock = vi.fn().mockResolvedValue(createSuccessResponse({
      height: 8000,
      width: 2000,
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(captureWithBrowserlessProxy(
      undefined,
      'https://example.com/article',
      {
        ...runtimeConfig,
        screenshotPreviewHeight: '12000',
        screenshotPreviewWidth: '2000',
      },
    )).resolves.toMatchObject({ contentType: 'image/webp' })

    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit]
    expect(JSON.parse(String(init.body)).viewport).toMatchObject({
      height: 900,
      width: 2000,
    })
  })

  it('classifies proxy queue pressure as provider capacity', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { code: 'queue_full' },
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '1',
      },
    })))

    const error = await captureWithBrowserlessProxy(
      undefined,
      'https://example.com/article',
      runtimeConfig,
    ).catch((caughtError) => caughtError)

    expect(classifyBrowserlessProxyError(error)).toEqual({
      kind: 'capacity',
      retryAfterMs: 1000,
    })
  })

  it.each([
    [401, 'unauthorized', 'unavailable'],
    [502, 'browserless_unavailable', 'unavailable'],
    [400, 'invalid_request', 'fatal'],
    [504, 'browserless_timeout', 'transient'],
  ] as const)(
    'classifies HTTP %s (%s) as %s',
    async (status, code, kind) => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: { code },
      }), {
        status,
        headers: { 'Content-Type': 'application/json' },
      })))

      const error = await captureWithBrowserlessProxy(
        undefined,
        'https://example.com/article',
        runtimeConfig,
      ).catch((caughtError) => caughtError)

      expect(classifyBrowserlessProxyError(error)).toMatchObject({ kind })
    },
  )

  it('bounds the streamed screenshot response before common WebP validation', async () => {
    let wasCancelled = false
    const body = new ReadableStream<Uint8Array>({
      cancel: () => {
        wasCancelled = true
      },
      start: (controller) => {
        controller.enqueue(createWebp(800))
        controller.enqueue(new Uint8Array(800))
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, {
      headers: {
        'Content-Type': 'image/webp',
        'X-Screenshot-Height': '11111',
        'X-Screenshot-Outcome': 'ok',
        'X-Screenshot-Source-Route': 'direct',
        'X-Screenshot-Width': '1440',
      },
    })))

    await expect(captureWithBrowserlessProxy(
      undefined,
      'https://example.com/article',
      {
        ...runtimeConfig,
        screenshotPreviewMaxBytes: '1200',
      },
    )).rejects.toBeInstanceOf(BrowserlessProxyInvalidOutputError)
    expect(wasCancelled).toBe(true)
  })

  it('treats connection failures as provider unavailability without leaking the token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')))

    const error = await captureWithBrowserlessProxy(
      undefined,
      'https://example.com/article',
      runtimeConfig,
    ).catch((caughtError) => caughtError)

    expect(classifyBrowserlessProxyError(error)).toEqual({ kind: 'unavailable' })
    expect(String(error)).not.toContain('proxy-secret')
  })

  it('requires both the private endpoint and token before becoming available', () => {
    expect(isBrowserlessProxyAvailable(undefined, runtimeConfig)).toBe(true)
    expect(isBrowserlessProxyAvailable(undefined, {
      ...runtimeConfig,
      screenshotBrowserlessProxyToken: '',
    })).toBe(false)
    expect(isBrowserlessProxyAvailable(undefined, {
      ...runtimeConfig,
      screenshotBrowserlessProxyUrl: '',
    })).toBe(false)
  })
})
