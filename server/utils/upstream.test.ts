import { afterEach, describe, expect, it, vi } from 'vitest'
import { isUpstreamUnavailable, logUpstreamFailure } from './upstream'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('upstream failure handling', () => {
  it('classifies rate limits and fetch failures as temporary unavailability', () => {
    expect(isUpstreamUnavailable({ response: { status: 403 } })).toBe(true)
    expect(isUpstreamUnavailable({ response: { status: 429 } })).toBe(true)
    expect(isUpstreamUnavailable({ name: 'FetchError' })).toBe(true)
    expect(isUpstreamUnavailable(new TypeError('bad mapping'))).toBe(false)
  })

  it('logs expected upstream rejection once as a structured warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    logUpstreamFailure(
      'user-comments',
      {
        message: 'Forbidden',
        response: { status: 403 },
      },
      { username: 'alice' },
    )

    expect(warn).toHaveBeenCalledOnce()
    expect(error).not.toHaveBeenCalled()
    expect(JSON.parse(warn.mock.calls[0]?.[0] as string)).toEqual({
      error: 'Forbidden',
      event: 'upstream_fetch_failed',
      operation: 'user-comments',
      statusCode: 403,
      upstream: 'hn-algolia',
      username: 'alice',
    })
  })
})
