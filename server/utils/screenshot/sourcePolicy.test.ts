import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createScreenshotSourceDecision,
  normalizeSourceUrl,
  probeCaptureUrlContent,
} from './sourcePolicy'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('screenshot source policy', () => {
  it('rejects trailing-dot local hosts and private IPv4-mapped IPv6 addresses', () => {
    expect(normalizeSourceUrl('http://localhost./private')).toBeNull()
    expect(normalizeSourceUrl('http://[::ffff:127.0.0.1]/private')).toBeNull()
  })

  it('leaves publisher routing to the Browserless service', () => {
    expect(createScreenshotSourceDecision('https://www.reuters.com/article', {})).toEqual({
      captureUrl: 'https://www.reuters.com/article',
      policy: 'capture',
      sourceStrategy: 'direct',
    })
  })

  it.each([
    'https://x.com/example/status/1234567890',
    'https://twitter.com/example/status/1234567890/photo/1',
    'https://mobile.twitter.com/example/status/1234567890',
  ])('captures X/Twitter statuses through XCancel (%s)', (sourceUrl) => {
    expect(createScreenshotSourceDecision(sourceUrl, {})).toEqual({
      captureUrl: 'https://xcancel.com/example/status/1234567890',
      policy: 'capture',
      sourceStrategy: 'xcancel',
    })
  })

  it('supports a configured XCancel base URL', () => {
    expect(createScreenshotSourceDecision('https://x.com/example/status/1234567890', {
      screenshotXCancelBaseUrl: 'https://xcancel.example/private/',
    })).toEqual({
      captureUrl: 'https://xcancel.example/private/example/status/1234567890',
      policy: 'capture',
      sourceStrategy: 'xcancel',
    })
  })

  it('does not rewrite X pages that are not public status URLs', () => {
    expect(createScreenshotSourceDecision('https://x.com/example', {})).toEqual({
      captureUrl: 'https://x.com/example',
      policy: 'capture',
      sourceStrategy: 'direct',
    })
  })

  it('skips obvious PDF URLs before probing', () => {
    expect(createScreenshotSourceDecision('https://example.com/paper.pdf', {})).toMatchObject({
      policy: 'skip',
      skipReason: 'pdf-url',
    })
  })

  it('only sends HTML responses to the screenshot provider chain', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {
      headers: { 'Content-Type': 'image/jpeg' },
    })))

    await expect(probeCaptureUrlContent('https://example.com/image.jpg', {})).resolves.toEqual({
      policy: 'skip',
      skipReason: 'non-html-content',
    })
  })

  it('verifies HTML with a bounded GET', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('<html></html>', {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(probeCaptureUrlContent('https://example.com/article', {})).resolves.toEqual({
      captureUrl: 'https://example.com/article',
      policy: 'capture',
    })
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/article', expect.objectContaining({
      headers: { Range: 'bytes=0-4095' },
      method: 'GET',
      redirect: 'manual',
    }))
  })

  it('returns the verified public redirect target for capture', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        headers: { Location: 'https://www.example.org/final' },
        status: 302,
      }))
      .mockResolvedValueOnce(new Response('<html></html>', {
        headers: { 'Content-Type': 'text/html' },
      }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(probeCaptureUrlContent('https://example.com/redirect', {})).resolves.toEqual({
      captureUrl: 'https://www.example.org/final',
      policy: 'capture',
    })
  })

  it('rejects redirects to private hosts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {
      headers: { Location: 'http://127.0.0.1/private' },
      status: 302,
    })))

    await expect(probeCaptureUrlContent('https://example.com/redirect', {})).resolves.toEqual({
      policy: 'skip',
      skipReason: 'blocked-hostname',
    })
  })

  it('lets Browserless classify blocked origin responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, {
      headers: { 'Content-Type': 'text/html' },
      status: 401,
    })))

    await expect(probeCaptureUrlContent('https://example.com/article', {})).resolves.toEqual({
      captureUrl: 'https://example.com/article',
      policy: 'capture',
    })
  })

  it('lets Browserless classify origins that cannot be probed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')))

    await expect(probeCaptureUrlContent('https://example.com/article', {})).resolves.toEqual({
      captureUrl: 'https://example.com/article',
      policy: 'capture',
    })
  })

  it('captures responses without a declared content type', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null)))

    await expect(probeCaptureUrlContent('https://example.com/article', {})).resolves.toEqual({
      captureUrl: 'https://example.com/article',
      policy: 'capture',
    })
  })
})
