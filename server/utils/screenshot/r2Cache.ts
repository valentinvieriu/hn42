import type {
  ScreenshotProcessorName,
  ScreenshotProviderName,
  ScreenshotResult,
  ScreenshotEnv,
  ScreenshotVariant,
} from './types'
import {
  SCREENSHOT_PREVIEW_HEIGHT,
  SCREENSHOT_PREVIEW_QUALITY,
  SCREENSHOT_PREVIEW_WIDTH,
} from '../../../shared/utils/screenshot'

export const R2_SCREENSHOT_PREFIX = 'screenshots/v9/items/'
const DEFAULT_R2_TTL_DAYS = 14
const MS_PER_DAY = 24 * 60 * 60 * 1000
const SECONDS_PER_DAY = 24 * 60 * 60

type R2ScreenshotMetadata = {
  capturedAt?: string
  contentType?: string
  processor?: ScreenshotProcessorName
  provider?: ScreenshotProviderName
  storyId?: string
  variant?: ScreenshotVariant
}

export type R2ScreenshotHead = {
  capturedAt: Date | null
  contentType: string
  isFresh: boolean
  processor?: ScreenshotProcessorName
  provider?: ScreenshotProviderName
}

export type R2Screenshot = R2ScreenshotHead & {
  bytes: ArrayBuffer
}

const normalizeTtlDays = (value: unknown) => {
  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? Math.max(1, Math.floor(parsedValue)) : DEFAULT_R2_TTL_DAYS
}

export const getRemainingR2TtlSeconds = (
  capturedAt: Date | null | undefined,
  ttlDays: unknown,
  maximumSeconds = Number.POSITIVE_INFINITY,
) => {
  const ttlSeconds = normalizeTtlDays(ttlDays) * SECONDS_PER_DAY
  const configuredTtlSeconds = Math.min(maximumSeconds, ttlSeconds)

  if (!capturedAt) {
    return configuredTtlSeconds
  }

  return Math.max(0, Math.min(
    configuredTtlSeconds,
    Math.floor((capturedAt.getTime() + ttlSeconds * 1000 - Date.now()) / 1000),
  ))
}

export const getR2PreviewScreenshotKey = (storyId: string) => {
  return `${R2_SCREENSHOT_PREFIX}${storyId}/preview-${SCREENSHOT_PREVIEW_WIDTH}x${SCREENSHOT_PREVIEW_HEIGHT}-q${SCREENSHOT_PREVIEW_QUALITY}.webp`
}

const getCapturedAt = (metadata: R2ScreenshotMetadata) => {
  if (!metadata.capturedAt) {
    return null
  }

  const capturedAt = new Date(metadata.capturedAt)
  return Number.isNaN(capturedAt.getTime()) ? null : capturedAt
}

const toCustomMetadata = (metadata: R2ScreenshotMetadata) => Object.fromEntries(
  Object.entries(metadata).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
)

const parseR2Object = (
  object: Pick<R2Object, 'customMetadata' | 'httpMetadata'>,
  ttlDays: unknown,
): R2ScreenshotHead => {
  const metadata = object.customMetadata as R2ScreenshotMetadata | undefined ?? {}
  const capturedAt = getCapturedAt(metadata)

  return {
    capturedAt,
    contentType: object.httpMetadata?.contentType ?? metadata.contentType ?? 'image/webp',
    isFresh: Boolean(
      capturedAt && Date.now() - capturedAt.getTime() <= normalizeTtlDays(ttlDays) * MS_PER_DAY,
    ),
    processor: metadata.processor,
    provider: metadata.provider,
  }
}

export const headR2Screenshot = async (
  env: ScreenshotEnv | undefined,
  key: string,
  ttlDays: unknown,
): Promise<R2ScreenshotHead | null> => {
  const object = await env?.SCREENSHOTS_BUCKET?.head(key)
  return object ? parseR2Object(object, ttlDays) : null
}

export const readR2Screenshot = async (
  env: ScreenshotEnv | undefined,
  key: string,
  ttlDays: unknown,
): Promise<R2Screenshot | null> => {
  const object = await env?.SCREENSHOTS_BUCKET?.get(key)

  if (!object) {
    return null
  }

  return {
    ...parseR2Object(object, ttlDays),
    bytes: await object.arrayBuffer(),
  }
}

export const writeR2Screenshot = async (
  env: ScreenshotEnv | undefined,
  key: string,
  storyId: string,
  result: ScreenshotResult,
  variant: ScreenshotVariant,
) => {
  const bucket = env?.SCREENSHOTS_BUCKET

  if (!bucket) {
    return
  }

  await bucket.put(key, result.bytes, {
    httpMetadata: {
      contentType: result.contentType,
      cacheControl: 'public, max-age=1209600, immutable',
    },
    customMetadata: toCustomMetadata({
      capturedAt: new Date().toISOString(),
      contentType: result.contentType,
      processor: result.processor,
      provider: result.provider,
      storyId,
      variant,
    }),
  })
}
