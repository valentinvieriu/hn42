import type {
  ScreenshotEnv,
  ScreenshotProviderName,
  ScreenshotResult,
  ScreenshotRuntimeConfig,
} from '../types'

export type ScreenshotProviderFailureKind =
  | 'capacity'
  | 'fatal'
  | 'invalid-output'
  | 'transient'
  | 'unavailable'

export type ScreenshotProviderContext = {
  env: ScreenshotEnv | undefined
  runtimeConfig: ScreenshotRuntimeConfig
  sourceUrl: string
}

export type ScreenshotProviderErrorClassification = {
  kind: ScreenshotProviderFailureKind
  retryAfterMs?: number
  stopChain?: boolean
}

export type ScreenshotProvider = {
  capture: (context: ScreenshotProviderContext) => Promise<ScreenshotResult>
  classifyError?: (error: unknown) => ScreenshotProviderErrorClassification
  isAvailable: (context: ScreenshotProviderContext) => boolean
  name: ScreenshotProviderName
}

export type ScreenshotProviderAttempt = {
  kind?: ScreenshotProviderFailureKind
  message?: string
  provider: ScreenshotProviderName
  retryAfterMs?: number
  status: 'failed' | 'succeeded' | 'unavailable'
}

export class ScreenshotProviderChainError extends Error {
  attempts: ScreenshotProviderAttempt[]

  constructor(attempts: ScreenshotProviderAttempt[]) {
    const summary = attempts.length > 0
      ? attempts.map((attempt) => `${attempt.provider}:${attempt.kind ?? attempt.status}`).join(', ')
      : 'no configured providers'

    super(`Screenshot provider chain exhausted (${summary})`)
    this.name = 'ScreenshotProviderChainError'
    this.attempts = attempts
  }
}
