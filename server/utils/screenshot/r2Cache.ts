import type { ScreenshotProviderName, ScreenshotResult, ScreenshotEnv } from './types'

const R2_PREFIX = 'screenshots/v1'
const DEFAULT_R2_TTL_DAYS = 30
const MS_PER_DAY = 24 * 60 * 60 * 1000

type R2ScreenshotMetadata = {
  capturedAt?: string
  contentType?: string
  provider?: ScreenshotProviderName
  sourceUrlHash?: string
}

export type R2Screenshot = {
  bytes: ArrayBuffer
  contentType: string
  capturedAt: Date | null
  isFresh: boolean
  key: string
  provider?: ScreenshotProviderName
}

const normalizeTtlDays = (value: unknown) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_R2_TTL_DAYS
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

export const getR2ScreenshotKey = (storyId: string, sourceUrlHash: string) => {
  return `${R2_PREFIX}/story-${storyId}/${sourceUrlHash}.jpg`
}

const getCapturedAt = (metadata: R2ScreenshotMetadata) => {
  if (!metadata.capturedAt) {
    return null
  }

  const capturedAt = new Date(metadata.capturedAt)

  return Number.isNaN(capturedAt.getTime()) ? null : capturedAt
}

const isFresh = (capturedAt: Date | null, ttlDays: unknown) => {
  if (!capturedAt) {
    return false
  }

  return Date.now() - capturedAt.getTime() <= normalizeTtlDays(ttlDays) * MS_PER_DAY
}

export const readR2Screenshot = async (
  env: ScreenshotEnv | undefined,
  key: string,
  ttlDays: unknown,
): Promise<R2Screenshot | null> => {
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
  const contentType = object.httpMetadata?.contentType ?? metadata.contentType ?? 'image/jpeg'

  return {
    bytes: await object.arrayBuffer(),
    contentType,
    capturedAt,
    isFresh: isFresh(capturedAt, ttlDays),
    key,
    provider: metadata.provider,
  }
}

export const writeR2Screenshot = async (
  env: ScreenshotEnv | undefined,
  key: string,
  sourceUrlHash: string,
  result: ScreenshotResult,
) => {
  const bucket = env?.SCREENSHOTS_BUCKET

  if (!bucket) {
    return
  }

  await bucket.put(key, result.bytes, {
    httpMetadata: {
      contentType: result.contentType,
      cacheControl: 'public, max-age=86400',
    },
    customMetadata: {
      capturedAt: new Date().toISOString(),
      contentType: result.contentType,
      provider: result.provider,
      sourceUrlHash,
    },
  })
}

