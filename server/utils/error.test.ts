import { describe, expect, it } from 'vitest'
import { getErrorStatusCode } from './error'

describe('error status extraction', () => {
  it('supports H3 and fetch-style errors', () => {
    expect(getErrorStatusCode({ statusCode: 404 })).toBe(404)
    expect(getErrorStatusCode({ response: { status: 429 } })).toBe(429)
    expect(getErrorStatusCode(new Error('unknown'))).toBeNull()
  })
})
