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

const R2_PREFIX = 'screenshots/v2'
const DEFAULT_R2_TTL_DAYS = 30
const DEFAULT_FAILURE_TTL_MINUTES = 6 * 60
const DEFAULT_THUMBNAIL_WIDTH = 720
const DEFAULT_THUMBNAIL_HEIGHT = 1440
const DEFAULT_THUMBNAIL_QUALITY = 78
const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_MINUTE = 60 * 1000
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
  key: string
  policy?: ScreenshotPolicyName
  processor?: ScreenshotProcessorName
  provider?: ScreenshotProviderName
  skipReason?: ScreenshotSkipReason
  sourceStrategy?: ScreenshotSourceStrategy
  variant?: ScreenshotVariant
}

export type R2ScreenshotFailure = {
  capturedAt: Date | null
  isFailure: true
  isFresh: boolean
  key: string
  policy?: ScreenshotPolicyName
  reason?: string
  skipReason?: ScreenshotSkipReason
  sourceStrategy?: ScreenshotSourceStrategy
  variant?: ScreenshotVariant
}

const normalizeTtlDays = (value: unknown) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_R2_TTL_DAYS
  }

  return Math.max(1, Math.floor(parsedValue))
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

export const getR2OriginalScreenshotKey = (sourceUrlHash: string) => {
  return `${R2_PREFIX}/${sourceUrlHash}/original.jpg`
}

export const getR2ThumbnailScreenshotKey = (
  sourceUrlHash: string,
  width: unknown = DEFAULT_THUMBNAIL_WIDTH,
  height: unknown = DEFAULT_THUMBNAIL_HEIGHT,
  quality: unknown = DEFAULT_THUMBNAIL_QUALITY,
  format: 'jpg' | 'webp' = 'jpg',
) => {
  const normalizedWidth = normalizePositiveInteger(width, DEFAULT_THUMBNAIL_WIDTH)
  const normalizedHeight = normalizePositiveInteger(height, DEFAULT_THUMBNAIL_HEIGHT)
  const normalizedQuality = normalizePositiveInteger(quality, DEFAULT_THUMBNAIL_QUALITY)

  return `${R2_PREFIX}/${sourceUrlHash}/thumbnail-${normalizedWidth}x${normalizedHeight}-q${normalizedQuality}.${format}`
}

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
      key,
      policy: metadata.policy,
      reason: metadata.reason,
      skipReason: metadata.skipReason,
      sourceStrategy: metadata.sourceStrategy,
      variant: metadata.variant,
    }
  }

  const contentType = object.httpMetadata?.contentType ?? metadata.contentType ?? 'image/jpeg'

  return {
    bytes: await object.arrayBuffer(),
    contentType,
    capturedAt,
    isFresh: isFresh(capturedAt, ttlDays),
    key,
    policy: metadata.policy,
    processor: metadata.processor,
    provider: metadata.provider,
    skipReason: metadata.skipReason,
    sourceStrategy: metadata.sourceStrategy,
    variant: metadata.variant,
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
    sourceStrategy: metadata.sourceStrategy ?? result.sourceStrategy,
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
      cacheControl: 'public, max-age=86400',
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
