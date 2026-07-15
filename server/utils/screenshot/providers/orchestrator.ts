import type { ScreenshotResult, ScreenshotRuntimeConfig } from '../types'
import { validateWebpScreenshot } from '../validation'
import {
  ScreenshotProviderChainError,
  type ScreenshotProvider,
  type ScreenshotProviderAttempt,
  type ScreenshotProviderContext,
  type ScreenshotProviderErrorClassification,
} from './types'

export type ScreenshotProviderStrategy = 'balanced' | 'ordered'

const DEFAULT_MAX_BYTES = 2_000_000
const MIN_SCREENSHOT_BYTES = 1024

class InvalidScreenshotProviderResultError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidScreenshotProviderResultError'
  }
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

const validateProviderResult = (
  provider: ScreenshotProvider,
  result: ScreenshotResult,
  runtimeConfig: ScreenshotRuntimeConfig,
) => {
  const contentType = result.contentType.split(';')[0]?.trim().toLowerCase()
  const maxBytes = normalizeInteger(
    runtimeConfig.screenshotPreviewMaxBytes,
    DEFAULT_MAX_BYTES,
    MIN_SCREENSHOT_BYTES,
    10_000_000,
  )

  if (result.provider !== provider.name) {
    throw new InvalidScreenshotProviderResultError(
      `Provider ${provider.name} returned a mismatched provider identifier`,
    )
  }

  if (contentType !== 'image/webp' || !(result.bytes instanceof ArrayBuffer)) {
    throw new InvalidScreenshotProviderResultError(
      `Provider ${provider.name} returned an invalid WebP screenshot`,
    )
  }

  try {
    validateWebpScreenshot(result.bytes, maxBytes)
  } catch {
    throw new InvalidScreenshotProviderResultError(
      `Provider ${provider.name} returned an invalid WebP screenshot`,
    )
  }

  return {
    ...result,
    contentType,
  }
}

const getStableHash = (value: string) => {
  let hash = 0x811c9dc5

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }

  return hash >>> 0
}

export const orderScreenshotProviders = (
  providers: ScreenshotProvider[],
  strategy: ScreenshotProviderStrategy,
  balanceKey: string,
) => {
  if (strategy !== 'balanced' || providers.length < 2) {
    return [...providers]
  }

  const startIndex = getStableHash(balanceKey) % providers.length

  return [
    ...providers.slice(startIndex),
    ...providers.slice(0, startIndex),
  ]
}

const getErrorMessage = (error: unknown) => {
  return (error instanceof Error ? error.message : String(error)).slice(0, 200)
}

const classifyProviderError = (
  provider: ScreenshotProvider,
  error: unknown,
): ScreenshotProviderErrorClassification => {
  if (error instanceof InvalidScreenshotProviderResultError) {
    return { kind: 'invalid-output' }
  }

  try {
    return provider.classifyError?.(error) ?? { kind: 'transient' }
  } catch {
    return { kind: 'transient' }
  }
}

export const captureWithProviderChain = async (
  providers: ScreenshotProvider[],
  context: ScreenshotProviderContext,
  options: {
    balanceKey: string
    strategy: ScreenshotProviderStrategy
  },
) => {
  const attempts: ScreenshotProviderAttempt[] = []
  const availableProviders: ScreenshotProvider[] = []

  for (const provider of providers) {
    try {
      if (provider.isAvailable(context)) {
        availableProviders.push(provider)
        continue
      }

      attempts.push({
        kind: 'unavailable',
        provider: provider.name,
        status: 'unavailable',
      })
    } catch (error) {
      attempts.push({
        kind: 'unavailable',
        message: getErrorMessage(error),
        provider: provider.name,
        status: 'unavailable',
      })
    }
  }

  const providerPlan = orderScreenshotProviders(
    availableProviders,
    options.strategy,
    options.balanceKey,
  )

  for (const provider of providerPlan) {
    try {
      const result = validateProviderResult(
        provider,
        await provider.capture(context),
        context.runtimeConfig,
      )
      attempts.push({ provider: provider.name, status: 'succeeded' })

      if (attempts.length > 1) {
        console.info(JSON.stringify({
          message: 'Screenshot provider fallback succeeded',
          attempts,
          provider: provider.name,
        }))
      }

      return result
    } catch (error) {
      const classification = classifyProviderError(provider, error)
      attempts.push({
        kind: classification.kind,
        message: getErrorMessage(error),
        provider: provider.name,
        retryAfterMs: classification.retryAfterMs,
        status: 'failed',
      })

      if (classification.stopChain) {
        break
      }
    }
  }

  throw new ScreenshotProviderChainError(attempts)
}

export const shouldPersistScreenshotProviderFailure = (error: unknown) => {
  if (!(error instanceof ScreenshotProviderChainError) || error.attempts.length === 0) {
    return false
  }

  return error.attempts.every((attempt) => {
    return attempt.status === 'failed'
      && attempt.kind !== 'capacity'
      && attempt.kind !== 'unavailable'
  })
}
