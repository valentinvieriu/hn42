import { describe, expect, it, vi } from 'vitest'
import {
  captureWithProviderChain,
  orderScreenshotProviders,
  shouldPersistScreenshotProviderFailure,
} from './orchestrator'
import {
  ScreenshotProviderChainError,
  type ScreenshotProvider,
} from './types'

const createJpegResult = (provider: string) => {
  const bytes = new Uint8Array(1200)
  bytes.set([0xff, 0xd8, 0xff])

  return {
    bytes: bytes.buffer,
    contentType: 'image/jpeg',
    provider,
  }
}

const createProvider = (
  name: string,
  capture: ScreenshotProvider['capture'],
  options: Partial<Pick<ScreenshotProvider, 'classifyError' | 'isAvailable'>> = {},
): ScreenshotProvider => ({
  capture,
  isAvailable: options.isAvailable ?? (() => true),
  name,
  ...options,
})

const context = {
  env: undefined,
  runtimeConfig: {},
  sourceUrl: 'https://example.com/article',
}

const capture = (
  providers: ScreenshotProvider[],
  strategy: 'balanced' | 'ordered' = 'ordered',
  balanceKey = 'source-hash',
) => captureWithProviderChain(providers, context, { balanceKey, strategy })

describe('screenshot provider orchestration', () => {
  it('stops after the first provider succeeds', async () => {
    const firstCapture = vi.fn().mockResolvedValue(createJpegResult('first'))
    const secondCapture = vi.fn().mockResolvedValue(createJpegResult('second'))

    await expect(capture([
      createProvider('first', firstCapture),
      createProvider('second', secondCapture),
    ])).resolves.toMatchObject({ provider: 'first' })

    expect(firstCapture).toHaveBeenCalledOnce()
    expect(secondCapture).not.toHaveBeenCalled()
  })

  it('falls through when a provider has exhausted its capacity', async () => {
    const capacityError = new Error('credits exhausted')
    const fallbackCapture = vi.fn().mockResolvedValue(createJpegResult('fallback'))

    await expect(capture([
      createProvider('primary', vi.fn().mockRejectedValue(capacityError), {
        classifyError: () => ({ kind: 'capacity', retryAfterMs: 60_000 }),
      }),
      createProvider('fallback', fallbackCapture),
    ])).resolves.toMatchObject({ provider: 'fallback' })

    expect(fallbackCapture).toHaveBeenCalledOnce()
  })

  it('falls through when a provider returns invalid canonical output', async () => {
    const invalidCapture = vi.fn().mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]).buffer,
      contentType: 'image/png',
      provider: 'invalid',
    })

    await expect(capture([
      createProvider('invalid', invalidCapture),
      createProvider('valid', vi.fn().mockResolvedValue(createJpegResult('valid'))),
    ])).resolves.toMatchObject({ provider: 'valid' })
  })

  it('falls through when a provider error classifier throws', async () => {
    await expect(capture([
      createProvider('broken-classifier', vi.fn().mockRejectedValue(new Error('failed')), {
        classifyError: () => {
          throw new Error('classifier failed')
        },
      }),
      createProvider('fallback', vi.fn().mockResolvedValue(createJpegResult('fallback'))),
    ])).resolves.toMatchObject({ provider: 'fallback' })
  })

  it('skips unavailable providers without calling them', async () => {
    const unavailableCapture = vi.fn()

    await expect(capture([
      createProvider('unavailable', unavailableCapture, { isAvailable: () => false }),
      createProvider('available', vi.fn().mockResolvedValue(createJpegResult('available'))),
    ])).resolves.toMatchObject({ provider: 'available' })

    expect(unavailableCapture).not.toHaveBeenCalled()
  })

  it('uses stable source-based rotation for balanced plans', () => {
    const providers = ['a', 'b', 'c'].map((name) => {
      return createProvider(name, vi.fn().mockResolvedValue(createJpegResult(name)))
    })
    const stableOrder = orderScreenshotProviders(providers, 'balanced', 'same-source')
      .map((provider) => provider.name)
    const repeatedOrder = orderScreenshotProviders(providers, 'balanced', 'same-source')
      .map((provider) => provider.name)
    const primaryProviders = new Set(
      Array.from({ length: 30 }, (_, index) => {
        return orderScreenshotProviders(providers, 'balanced', `source-${index}`)[0]?.name
      }),
    )

    expect(repeatedOrder).toEqual(stableOrder)
    expect(primaryProviders.size).toBeGreaterThan(1)
    expect(new Set(stableOrder)).toEqual(new Set(['a', 'b', 'c']))
  })

  it('balances only across providers that are currently available', async () => {
    const unavailableCapture = vi.fn()
    const captures = {
      availableA: vi.fn().mockImplementation(async () => createJpegResult('available-a')),
      availableB: vi.fn().mockImplementation(async () => createJpegResult('available-b')),
    }
    const providers = [
      createProvider('unavailable', unavailableCapture, { isAvailable: () => false }),
      createProvider('available-a', captures.availableA),
      createProvider('available-b', captures.availableB),
    ]

    for (let index = 0; index < 20; index += 1) {
      await capture(providers, 'balanced', `source-${index}`)
    }

    expect(unavailableCapture).not.toHaveBeenCalled()
    expect(captures.availableA).toHaveBeenCalled()
    expect(captures.availableB).toHaveBeenCalled()
  })

  it('does not persist a chain failure while any provider is capacity-limited', async () => {
    const providers = [
      createProvider('failed', vi.fn().mockRejectedValue(new Error('failed'))),
      createProvider('capacity', vi.fn().mockRejectedValue(new Error('limited')), {
        classifyError: () => ({ kind: 'capacity' }),
      }),
    ]

    const error = await capture(providers).catch((caughtError) => caughtError)

    expect(error).toBeInstanceOf(ScreenshotProviderChainError)
    expect(shouldPersistScreenshotProviderFailure(error)).toBe(false)
  })

  it('persists one terminal marker when every configured provider hard-fails', async () => {
    const providers = [
      createProvider('first', vi.fn().mockRejectedValue(new Error('failed one'))),
      createProvider('second', vi.fn().mockRejectedValue(new Error('failed two'))),
    ]

    const error = await capture(providers).catch((caughtError) => caughtError)

    expect(error).toBeInstanceOf(ScreenshotProviderChainError)
    expect(shouldPersistScreenshotProviderFailure(error)).toBe(true)
    expect(error.attempts).toHaveLength(2)
  })
})
