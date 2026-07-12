import type {
  ScreenshotPolicyMetadata,
  ScreenshotPolicyName,
  ScreenshotProcessorName,
  ScreenshotProviderName,
  ScreenshotResult,
  ScreenshotEnv,
  ScreenshotSkipReason,
  ScreenshotSourceStrategy,
  ScreenshotVariant,
} from './types'

const R2_PREFIX = 'screenshots/v7'
const DEFAULT_R2_TTL_DAYS = 180
const DEFAULT_FAILURE_TTL_MINUTES = 6 * 60
const DEFAULT_PREVIEW_WIDTH = 1440
const DEFAULT_PREVIEW_HEIGHT = 4096
const DEFAULT_PREVIEW_QUALITY = 68
const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_MINUTE = 60 * 1000
const SECONDS_PER_DAY = 24 * 60 * 60
const EMPTY_FAILURE_MARKER = new Uint8Array()

type R2ScreenshotMetadata = {
  capturedAt?: string
  contentType?: string
  policy?: ScreenshotPolicyName
  processor?: ScreenshotProcessorName
  provider?: ScreenshotProviderName
  reason?: string
  skipReason?: ScreenshotSkipReason
  sourceUrlHash?: string
  sourceStrategy?: ScreenshotSourceStrategy
  status?: 'ok' | 'failed'
  variant?: ScreenshotVariant
}

export type R2Screenshot = {
  bytes: ArrayBuffer
  contentType: string
  capturedAt: Date | null
  isFresh: boolean
  processor?: ScreenshotProcessorName
  provider?: ScreenshotProviderName
}

export type R2ScreenshotFailure = {
  capturedAt: Date | null
  isFailure: true
  isFresh: boolean
  policy?: ScreenshotPolicyName
  skipReason?: ScreenshotSkipReason
  sourceStrategy?: ScreenshotSourceStrategy
}

const normalizeTtlDays = (value: unknown) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_R2_TTL_DAYS
  }

  return Math.max(1, Math.floor(parsedValue))
}

export const getRemainingR2TtlSeconds = (
  capturedAt: Date | null | undefined,
  ttlDays: unknown,
  maximumSeconds = Number.POSITIVE_INFINITY,
) => {
  const configuredTtlSeconds = Math.min(
    maximumSeconds,
    normalizeTtlDays(ttlDays) * SECONDS_PER_DAY,
  )

  if (!capturedAt) {
    return configuredTtlSeconds
  }

  return Math.max(0, Math.min(
    configuredTtlSeconds,
    Math.floor((capturedAt.getTime() + normalizeTtlDays(ttlDays) * MS_PER_DAY - Date.now()) / 1000),
  ))
}

const normalizeTtlMinutes = (value: unknown) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_FAILURE_TTL_MINUTES
  }

  return Math.max(1, Math.floor(parsedValue))
}

const toHex = (bytes: ArrayBuffer) => {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export const getSourceUrlHash = async (sourceUrl: string) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sourceUrl))

  return toHex(digest)
}

const normalizePositiveInteger = (value: unknown, fallback: number) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return fallback
  }

  return Math.max(1, Math.floor(parsedValue))
}

export const getR2PreviewScreenshotKey = (
  sourceUrlHash: string,
  width: unknown = DEFAULT_PREVIEW_WIDTH,
  height: unknown = DEFAULT_PREVIEW_HEIGHT,
  quality: unknown = DEFAULT_PREVIEW_QUALITY,
) => {
  const normalizedWidth = normalizePositiveInteger(width, DEFAULT_PREVIEW_WIDTH)
  const normalizedHeight = normalizePositiveInteger(height, DEFAULT_PREVIEW_HEIGHT)
  const normalizedQuality = normalizePositiveInteger(quality, DEFAULT_PREVIEW_QUALITY)

  return `${R2_PREFIX}/${sourceUrlHash}/preview-${normalizedWidth}x${normalizedHeight}-q${normalizedQuality}.jpg`
}

export const getR2ScreenshotFailureKey = (screenshotKey: string) => `${screenshotKey}.failure`

const getCapturedAt = (metadata: R2ScreenshotMetadata) => {
  if (!metadata.capturedAt) {
    return null
  }

  const capturedAt = new Date(metadata.capturedAt)

  return Number.isNaN(capturedAt.getTime()) ? null : capturedAt
}

const toCustomMetadata = (metadata: R2ScreenshotMetadata) => {
  return Object.fromEntries(
    Object.entries(metadata).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

const isFresh = (capturedAt: Date | null, ttlDays: unknown) => {
  if (!capturedAt) {
    return false
  }

  return Date.now() - capturedAt.getTime() <= normalizeTtlDays(ttlDays) * MS_PER_DAY
}

const isFreshFailure = (capturedAt: Date | null, ttlMinutes: unknown) => {
  if (!capturedAt) {
    return false
  }

  return Date.now() - capturedAt.getTime() <= normalizeTtlMinutes(ttlMinutes) * MS_PER_MINUTE
}

export const readR2Screenshot = async (
  env: ScreenshotEnv | undefined,
  key: string,
  ttlDays: unknown,
  failureTtlMinutes?: unknown,
): Promise<R2Screenshot | R2ScreenshotFailure | null> => {
  const bucket = env?.SCREENSHOTS_BUCKET

  if (!bucket) {
    return null
  }

  const object = await bucket.get(key)

  if (!object) {
    return null
  }

  const metadata = object.customMetadata as R2ScreenshotMetadata | undefined ?? {}
  const capturedAt = getCapturedAt(metadata)

  if (metadata.status === 'failed') {
    return {
      capturedAt,
      isFailure: true,
      isFresh: isFreshFailure(capturedAt, failureTtlMinutes),
      policy: metadata.policy,
      skipReason: metadata.skipReason,
      sourceStrategy: metadata.sourceStrategy,
    }
  }

  const contentType = object.httpMetadata?.contentType ?? metadata.contentType ?? 'image/jpeg'

  return {
    bytes: await object.arrayBuffer(),
    contentType,
    capturedAt,
    isFresh: isFresh(capturedAt, ttlDays),
    processor: metadata.processor,
    provider: metadata.provider,
  }
}

export const isR2ScreenshotFailure = (
  result: R2Screenshot | R2ScreenshotFailure,
): result is R2ScreenshotFailure => {
  return 'isFailure' in result && result.isFailure
}

export const writeR2Screenshot = async (
  env: ScreenshotEnv | undefined,
  key: string,
  sourceUrlHash: string,
  result: ScreenshotResult,
  variant: ScreenshotVariant,
  metadata: ScreenshotPolicyMetadata = {},
) => {
  const bucket = env?.SCREENSHOTS_BUCKET

  if (!bucket) {
    return
  }

  const customMetadata: R2ScreenshotMetadata = {
    capturedAt: new Date().toISOString(),
    contentType: result.contentType,
    policy: metadata.policy ?? 'capture',
    provider: result.provider,
    sourceUrlHash,
    sourceStrategy: metadata.sourceStrategy,
    status: 'ok',
    variant,
  }

  if (result.processor) {
    customMetadata.processor = result.processor
  }

  if (metadata.skipReason) {
    customMetadata.skipReason = metadata.skipReason
  }

  await bucket.put(key, result.bytes, {
    httpMetadata: {
      contentType: result.contentType,
      cacheControl: 'public, max-age=15552000, immutable',
    },
    customMetadata: toCustomMetadata(customMetadata),
  })
}

export const writeR2ScreenshotFailure = async (
  env: ScreenshotEnv | undefined,
  key: string,
  sourceUrlHash: string,
  reason: string,
  variant: ScreenshotVariant,
  metadata: ScreenshotPolicyMetadata = {},
) => {
  const bucket = env?.SCREENSHOTS_BUCKET

  if (!bucket) {
    return
  }

  // Failure markers only throttle retries. Keep them non-image and empty so a
  // storage or metadata mistake can never turn one into a cached placeholder.
  await bucket.put(key, EMPTY_FAILURE_MARKER, {
    httpMetadata: {
      contentType: 'application/vnd.hn42.screenshot-failure',
      cacheControl: 'no-store',
    },
    customMetadata: toCustomMetadata({
      capturedAt: new Date().toISOString(),
      contentType: 'application/vnd.hn42.screenshot-failure',
      policy: metadata.policy ?? 'capture',
      reason: reason.slice(0, 200),
      skipReason: metadata.skipReason,
      sourceUrlHash,
      sourceStrategy: metadata.sourceStrategy,
      status: 'failed',
      variant,
    }),
  })
}

export const deleteR2ScreenshotFailure = async (
  env: ScreenshotEnv | undefined,
  key: string,
) => {
  await env?.SCREENSHOTS_BUCKET?.delete(key)
}
