import {
  createError,
  defineEventHandler,
  getQuery,
  getRouterParams,
  type H3Event,
} from 'h3'
import { useRuntimeConfig } from '#imports'
import { isValidHnItemId } from '#shared/utils/hn'
import {
  SCREENSHOT_PROFILE_VERSION,
  SCREENSHOT_RETENTION_SECONDS,
} from '#shared/utils/screenshot'
import {
  getR2PreviewScreenshotKey,
  getRemainingR2TtlSeconds,
  readR2Screenshot,
  type R2Screenshot,
} from '../../utils/screenshot/r2Cache'
import { resolveScreenshotRuntimeConfig } from '../../utils/screenshot/runtimeConfig'
import type {
  ScreenshotEnv,
  ScreenshotRuntimeConfig,
  ScreenshotVariant,
} from '../../utils/screenshot/types'

const TRANSPARENT_GIF = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255,
  255, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 1, 76, 0, 59,
])
const BROWSER_SCREENSHOT_TTL_SECONDS = SCREENSHOT_RETENTION_SECONDS
const MAX_EDGE_SCREENSHOT_TTL_SECONDS = SCREENSHOT_RETENTION_SECONDS

const STALE_SCREENSHOT_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600',
  'CDN-Cache-Control': 'public, max-age=3600, stale-while-revalidate=3600, stale-if-error=86400',
  'Cloudflare-CDN-Cache-Control': 'public, max-age=3600, stale-while-revalidate=3600, stale-if-error=86400',
} as const

const TRANSIENT_FALLBACK_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=5',
  'CDN-Cache-Control': 'public, max-age=15, stale-if-error=60',
  'Cloudflare-CDN-Cache-Control': 'public, max-age=15, stale-if-error=60',
} as const

const getRequestedVariant = (event: H3Event): ScreenshotVariant => {
  const query = getQuery(event)

  if (Object.keys(query).some((key) => key !== 'variant' && key !== 'profile')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only screenshot variant and profile query parameters are supported',
    })
  }

  if (query.profile != null && query.profile !== SCREENSHOT_PROFILE_VERSION) {
    throw createError({
      statusCode: 400,
      statusMessage: `Screenshot profile must be ${SCREENSHOT_PROFILE_VERSION}`,
    })
  }

  if (query.variant == null || query.variant === '') {
    return 'original'
  }

  if (query.variant === 'original' || query.variant === 'thumbnail') {
    return query.variant
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'Screenshot variant must be original or thumbnail',
  })
}

const getScreenshotCacheHeaders = (image: R2Screenshot, ttlDays: unknown) => {
  const edgeTtlSeconds = getRemainingR2TtlSeconds(
    image.capturedAt,
    ttlDays,
    MAX_EDGE_SCREENSHOT_TTL_SECONDS,
  )
  const browserTtlSeconds = Math.min(BROWSER_SCREENSHOT_TTL_SECONDS, edgeTtlSeconds)

  return {
    'Cache-Control': `public, max-age=${browserTtlSeconds}, immutable`,
    'CDN-Cache-Control': `public, max-age=${edgeTtlSeconds}, stale-while-revalidate=86400, stale-if-error=86400`,
    'Cloudflare-CDN-Cache-Control': `public, max-age=${edgeTtlSeconds}, stale-while-revalidate=86400, stale-if-error=86400`,
  }
}

const createImageResponse = (
  image: R2Screenshot,
  storyId: string,
  variant: ScreenshotVariant,
  ttlDays: unknown,
) => {
  const format = image.contentType.replace(/^image\//, '') || 'unknown'
  const processor = image.processor ?? 'original'
  const cacheStatus = image.isFresh ? 'R2' : 'STALE'
  const headers = new Headers({
    'Content-Type': image.contentType,
    'Content-Length': String(image.bytes.byteLength),
    'ETag': `W/"hn-screenshot-${SCREENSHOT_PROFILE_VERSION}-${storyId}-${processor}"`,
    'Accept-Ranges': 'bytes',
    'X-HN-Screenshot-Cache': cacheStatus,
    'X-HN-Screenshot-Format': format,
    'X-HN-Screenshot-Variant': variant,
    ...(image.isFresh ? getScreenshotCacheHeaders(image, ttlDays) : STALE_SCREENSHOT_CACHE_HEADERS),
  })

  if (image.provider) {
    headers.set('X-HN-Screenshot-Provider', image.provider)
  }

  if (image.processor) {
    headers.set('X-HN-Screenshot-Processor', image.processor)
  }

  if (image.sourceRoute) {
    headers.set('X-HN-Screenshot-Source-Route', image.sourceRoute)
  }

  return new Response(image.bytes, { headers })
}

const createFallbackResponse = (
  storyId: string,
  variant: ScreenshotVariant,
) => {
  const headers = new Headers({
    'Content-Type': 'image/gif',
    'Content-Length': String(TRANSPARENT_GIF.byteLength),
    'ETag': `W/"hn-screenshot-fallback-${SCREENSHOT_PROFILE_VERSION}-${storyId}-${variant}"`,
    'Accept-Ranges': 'bytes',
    'X-HN-Screenshot-Cache': 'FALLBACK',
    'X-HN-Screenshot-Fallback': '1',
    'X-HN-Screenshot-Format': 'gif',
    'X-HN-Screenshot-Variant': variant,
    ...TRANSIENT_FALLBACK_CACHE_HEADERS,
  })

  return new Response(TRANSPARENT_GIF, { headers })
}

export default defineEventHandler(async (event) => {
  const storyId = getRouterParams(event).id

  if (!isValidHnItemId(storyId)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid story ID is required' })
  }

  const variant = getRequestedVariant(event)

  try {
    const env = event.context.cloudflare?.env as ScreenshotEnv | undefined
    const runtimeConfig = resolveScreenshotRuntimeConfig(
      useRuntimeConfig(event) as ScreenshotRuntimeConfig,
      env,
    )
    const previewKey = getR2PreviewScreenshotKey(storyId)
    const preview = await readR2Screenshot(
      env,
      previewKey,
      runtimeConfig.screenshotR2TtlDays,
    )

    if (preview) {
      return createImageResponse(preview, storyId, variant, runtimeConfig.screenshotR2TtlDays)
    }

    return createFallbackResponse(storyId, variant)
  } catch (error) {
    console.warn(JSON.stringify({
      message: 'Screenshot route failed',
      storyId,
      error: error instanceof Error ? error.message : String(error),
    }))
    return createFallbackResponse(storyId, variant)
  }
})
