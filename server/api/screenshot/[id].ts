import {
  createError,
  defineEventHandler,
  getQuery,
  getRouterParams,
  type H3Event,
} from 'h3'
import { useRuntimeConfig } from '#imports'
import {
  captureWithScreenshotProviders,
  getScreenshotProviderPlanId,
  hasAvailableScreenshotProvider,
} from '../../utils/screenshot/providers/registry'
import { shouldPersistScreenshotProviderFailure } from '../../utils/screenshot/providers/orchestrator'
import { ScreenshotProviderChainError } from '../../utils/screenshot/providers/types'
import {
  deleteR2ScreenshotFailure,
  getR2PreviewScreenshotKey,
  getRemainingR2TtlSeconds,
  getR2ScreenshotFailureKey,
  getSourceUrlHash,
  isR2ScreenshotFailure,
  readR2Screenshot,
  writeR2Screenshot,
  writeR2ScreenshotFailure,
  type R2Screenshot,
  type R2ScreenshotFailure,
} from '../../utils/screenshot/r2Cache'
import {
  createScreenshotSourceDecision,
  isScreenshotPolicySkipError,
  normalizeSourceUrl,
  probeCaptureUrlContent,
  ScreenshotPolicySkipError,
  type ScreenshotCaptureDecision,
} from '../../utils/screenshot/sourcePolicy'
import type {
  ScreenshotEnv,
  ScreenshotPolicyMetadata,
  ScreenshotProcessorName,
  ScreenshotProviderName,
  ScreenshotResult,
  ScreenshotRuntimeConfig,
  ScreenshotVariant,
} from '../../utils/screenshot/types'
import { SCREENSHOT_PROFILE_VERSION } from '#shared/utils/screenshot'
import { isValidHnItemId } from '#shared/utils/hn'

const TRANSPARENT_GIF = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255,
  255, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 1, 76, 0, 59,
])
const pendingCaptures = new Map<string, Promise<ScreenshotResult>>()

const BROWSER_SCREENSHOT_TTL_SECONDS = 30 * 24 * 60 * 60
const MAX_EDGE_SCREENSHOT_TTL_SECONDS = 180 * 24 * 60 * 60

const STALE_SCREENSHOT_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600',
  'CDN-Cache-Control': 'public, max-age=3600, stale-while-revalidate=3600, stale-if-error=86400',
  'Cloudflare-CDN-Cache-Control': 'public, max-age=3600, stale-while-revalidate=3600, stale-if-error=86400',
} as const

const DETERMINISTIC_FALLBACK_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=300',
  'CDN-Cache-Control': 'public, max-age=21600, stale-if-error=86400',
  'Cloudflare-CDN-Cache-Control': 'public, max-age=21600, stale-if-error=86400',
} as const

const TRANSIENT_FALLBACK_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=60',
  'CDN-Cache-Control': 'public, max-age=600, stale-if-error=3600',
  'Cloudflare-CDN-Cache-Control': 'public, max-age=600, stale-if-error=3600',
} as const

type ScreenshotCacheStatus = 'R2' | 'MISS' | 'STALE' | 'FALLBACK'

type HnFirebaseStory = {
  dead?: unknown
  deleted?: unknown
  type?: unknown
  url?: unknown
}

const getScreenshotCacheHeaders = (
  image: ScreenshotResult | R2Screenshot,
  ttlDays: unknown,
) => {
  const capturedAt = 'capturedAt' in image ? image.capturedAt : null
  const edgeTtlSeconds = getRemainingR2TtlSeconds(
    capturedAt,
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

const withScreenshotCacheStatus = (
  response: Response,
  status: ScreenshotCacheStatus,
  provider?: ScreenshotProviderName,
  variant?: ScreenshotVariant,
  processor?: ScreenshotProcessorName,
  metadata: ScreenshotPolicyMetadata = {},
  browserMsUsed?: number,
) => {
  const headers = new Headers(response.headers)
  headers.set('X-HN42-Screenshot-Cache', status)

  if (provider) {
    headers.set('X-HN42-Screenshot-Provider', provider)
  }

  if (variant) {
    headers.set('X-HN42-Screenshot-Variant', variant)
  }

  if (processor) {
    headers.set('X-HN42-Screenshot-Processor', processor)
  }

  if (metadata.policy) {
    headers.set('X-HN42-Screenshot-Policy', metadata.policy)
  }

  if (metadata.sourceStrategy) {
    headers.set('X-HN42-Screenshot-Source-Strategy', metadata.sourceStrategy)
  }

  if (metadata.skipReason) {
    headers.set('X-HN42-Screenshot-Skip-Reason', metadata.skipReason)
  }

  if (browserMsUsed !== undefined) {
    headers.set('X-HN42-Browser-Ms-Used', String(browserMsUsed))
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const getFallbackKey = (id: string, variant: ScreenshotVariant) => `${id}:${variant}`

const createFallbackResponse = (
  fallbackKey?: string,
  variant: ScreenshotVariant = 'original',
  metadata: ScreenshotPolicyMetadata = {},
) => {
  const cacheHeaders = metadata.policy === 'skip'
    ? DETERMINISTIC_FALLBACK_CACHE_HEADERS
    : TRANSIENT_FALLBACK_CACHE_HEADERS
  const response = new Response(TRANSPARENT_GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(TRANSPARENT_GIF.byteLength),
      'ETag': fallbackKey ? `W/"hn42-screenshot-fallback-${fallbackKey}"` : 'W/"hn42-screenshot-fallback"',
      'Accept-Ranges': 'bytes',
      'X-HN42-Screenshot-Fallback': '1',
      'X-HN42-Screenshot-Format': 'gif',
      ...cacheHeaders,
    },
  })

  return withScreenshotCacheStatus(response, 'FALLBACK', undefined, variant, undefined, metadata)
}

const createImageResponse = (
  image: ScreenshotResult | R2Screenshot,
  sourceUrlHash: string,
  variant: ScreenshotVariant,
  cacheStatus: ScreenshotCacheStatus,
  metadata: ScreenshotPolicyMetadata,
  ttlDays: unknown,
) => {
  const format = image.contentType.replace(/^image\//, '') || 'unknown'
  const processor = image.processor ?? (image.provider === 'browser-run' ? 'browser-run' : 'original')
  const headers = new Headers({
    'Content-Type': image.contentType,
    'Content-Length': String(image.bytes.byteLength),
    'ETag': `W/"hn42-screenshot-v7-${format}-${processor}-${sourceUrlHash.slice(0, 16)}"`,
    'Accept-Ranges': 'bytes',
    'X-HN42-Screenshot-Format': format,
    ...(cacheStatus === 'STALE'
      ? STALE_SCREENSHOT_CACHE_HEADERS
      : getScreenshotCacheHeaders(image, ttlDays)),
  })

  return withScreenshotCacheStatus(
    new Response(image.bytes, { headers }),
    cacheStatus,
    image.provider,
    variant,
    processor,
    metadata,
    'browserMsUsed' in image ? image.browserMsUsed : undefined,
  )
}

const readR2Cache = async (
  env: ScreenshotEnv | undefined,
  key: string,
  ttlDays: unknown,
  failureTtlMinutes: unknown,
) => {
  return await readR2Screenshot(env, key, ttlDays, failureTtlMinutes).catch((error) => {
    console.warn(JSON.stringify({
      message: 'R2 screenshot read failed',
      key,
      error: error instanceof Error ? error.message : String(error),
    }))
    throw error
  })
}

const getR2Screenshot = (result: R2Screenshot | R2ScreenshotFailure | null) => {
  return result && !isR2ScreenshotFailure(result) ? result : null
}

const getR2Failure = (result: R2Screenshot | R2ScreenshotFailure | null) => {
  return result && isR2ScreenshotFailure(result) ? result : null
}

const getCaptureMetadata = (decision: ScreenshotCaptureDecision): ScreenshotPolicyMetadata => ({
  policy: 'capture',
  sourceStrategy: decision.sourceStrategy,
})

const getFailureMetadata = (
  failure: R2ScreenshotFailure,
  decision: ScreenshotCaptureDecision,
): ScreenshotPolicyMetadata => ({
  policy: failure.policy ?? (failure.skipReason ? 'skip' : 'capture'),
  skipReason: failure.skipReason,
  sourceStrategy: failure.sourceStrategy ?? decision.sourceStrategy,
})

const getSkipErrorMetadata = (error: ScreenshotPolicySkipError): ScreenshotPolicyMetadata => ({
  policy: 'skip',
  skipReason: error.skipReason,
  sourceStrategy: error.sourceStrategy,
})

const captureAndPersistPreview = (
  env: ScreenshotEnv | undefined,
  previewKey: string,
  failureKey: string,
  sourceUrlHash: string,
  sourceDecision: ScreenshotCaptureDecision,
  runtimeConfig: ScreenshotRuntimeConfig,
) => {
  const pendingCapture = pendingCaptures.get(previewKey)

  if (pendingCapture) {
    return pendingCapture
  }

  const capture = probeCaptureUrlContent(sourceDecision.captureUrl, runtimeConfig)
    .then((probeResult) => {
      if (probeResult.policy === 'skip') {
        throw new ScreenshotPolicySkipError(probeResult.skipReason, sourceDecision.sourceStrategy)
      }

      return captureWithScreenshotProviders(
        env,
        probeResult.captureUrl,
        sourceUrlHash,
        runtimeConfig,
      )
    })
    .then(async (preview) => {
      try {
        await writeR2Screenshot(
          env,
          previewKey,
          sourceUrlHash,
          preview,
          'original',
          getCaptureMetadata(sourceDecision),
        )
        await deleteR2ScreenshotFailure(env, failureKey)
      } catch (error) {
        console.warn(JSON.stringify({
          message: 'R2 preview persistence failed',
          error: error instanceof Error ? error.message : String(error),
        }))
      }

      console.info(JSON.stringify({
        message: 'Screenshot captured',
        browserMsUsed: preview.browserMsUsed,
        bytes: preview.bytes.byteLength,
        provider: preview.provider,
        sourceStrategy: sourceDecision.sourceStrategy,
        sourceUrlHash: sourceUrlHash.slice(0, 16),
      }))

      return preview
    })
    .catch(async (error) => {
      if (shouldPersistScreenshotProviderFailure(error) && !isScreenshotPolicySkipError(error)) {
        try {
          await writeR2ScreenshotFailure(
            env,
            failureKey,
            sourceUrlHash,
            error instanceof Error ? error.message : String(error),
            'original',
            getCaptureMetadata(sourceDecision),
            getScreenshotProviderPlanId(runtimeConfig),
          )
        } catch (writeError) {
          console.warn(JSON.stringify({
            message: 'R2 preview failure write failed',
            error: writeError instanceof Error ? writeError.message : String(writeError),
          }))
        }
      }

      throw error
    })
    .finally(() => {
      pendingCaptures.delete(previewKey)
    })

  pendingCaptures.set(previewKey, capture)

  return capture
}

const getRequestedVariant = (event: H3Event): ScreenshotVariant => {
  const query = getQuery(event)
  const queryKeys = Object.keys(query)

  if (queryKeys.some((key) => key !== 'variant' && key !== 'profile')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only screenshot variant and profile query parameters are supported',
    })
  }

  if (
    query.profile !== undefined
    && query.profile !== null
    && query.profile !== SCREENSHOT_PROFILE_VERSION
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: `Screenshot profile must be ${SCREENSHOT_PROFILE_VERSION}`,
    })
  }

  const variant = query.variant

  if (variant === undefined || variant === null || variant === '') {
    return 'original'
  }

  if (variant === 'original' || variant === 'thumbnail') {
    return variant
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'Screenshot variant must be original or thumbnail',
  })
}

const resolveStorySourceUrl = async (id: string) => {
  const story = await $fetch<HnFirebaseStory>(
    `https://hacker-news.firebaseio.com/v0/item/${id}.json`,
    { timeout: 3000 },
  )

  if (story?.type !== 'story' || story.dead === true || story.deleted === true) {
    return null
  }

  return normalizeSourceUrl(story.url)
}

const isCaptureEnabled = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof value === 'string') {
    return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase())
  }

  return true
}

const servePreview = async (
  options: {
    captureEnabled: boolean
    env: ScreenshotEnv | undefined
    failureKey: string
    fallbackKey: string
    previewKey: string
    runtimeConfig: ScreenshotRuntimeConfig
    sourceDecision: ScreenshotCaptureDecision
    sourceUrlHash: string
    variant: ScreenshotVariant
  },
) => {
  const captureMetadata = getCaptureMetadata(options.sourceDecision)
  const previewResult = await readR2Cache(
    options.env,
    options.previewKey,
    options.runtimeConfig.screenshotR2TtlDays,
    options.runtimeConfig.screenshotFailureTtlMinutes,
  )
  const legacyFailure = getR2Failure(previewResult)

  if (legacyFailure?.isFresh) {
    return createFallbackResponse(
      options.fallbackKey,
      options.variant,
      getFailureMetadata(legacyFailure, options.sourceDecision),
    )
  }

  const previewScreenshot = getR2Screenshot(previewResult)

  if (previewScreenshot?.isFresh) {
    return createImageResponse(
      previewScreenshot,
      options.sourceUrlHash,
      options.variant,
      'R2',
      captureMetadata,
      options.runtimeConfig.screenshotR2TtlDays,
    )
  }

  const failureResult = await readR2Cache(
    options.env,
    options.failureKey,
    options.runtimeConfig.screenshotR2TtlDays,
    options.runtimeConfig.screenshotFailureTtlMinutes,
  )
  const failure = getR2Failure(failureResult)
  const providerPlan = getScreenshotProviderPlanId(options.runtimeConfig)

  if (failure?.isFresh && failure.providerPlan === providerPlan) {
    if (previewScreenshot) {
      return createImageResponse(
        previewScreenshot,
        options.sourceUrlHash,
        options.variant,
        'STALE',
        getFailureMetadata(failure, options.sourceDecision),
        options.runtimeConfig.screenshotR2TtlDays,
      )
    }

    return createFallbackResponse(
      options.fallbackKey,
      options.variant,
      getFailureMetadata(failure, options.sourceDecision),
    )
  }

  if (
    !options.captureEnabled
    || !options.env?.SCREENSHOTS_BUCKET
    || !hasAvailableScreenshotProvider(
      options.env,
      options.sourceDecision.captureUrl,
      options.runtimeConfig,
    )
  ) {
    if (previewScreenshot) {
      return createImageResponse(
        previewScreenshot,
        options.sourceUrlHash,
        options.variant,
        'STALE',
        captureMetadata,
        options.runtimeConfig.screenshotR2TtlDays,
      )
    }

    return createFallbackResponse(options.fallbackKey, options.variant, captureMetadata)
  }

  try {
    const preview = await captureAndPersistPreview(
      options.env,
      options.previewKey,
      options.failureKey,
      options.sourceUrlHash,
      options.sourceDecision,
      options.runtimeConfig,
    )

    return createImageResponse(
      preview,
      options.sourceUrlHash,
      options.variant,
      'MISS',
      captureMetadata,
      options.runtimeConfig.screenshotR2TtlDays,
    )
  } catch (error) {
    if (isScreenshotPolicySkipError(error)) {
      if (previewScreenshot) {
        return createImageResponse(
          previewScreenshot,
          options.sourceUrlHash,
          options.variant,
          'STALE',
          getSkipErrorMetadata(error),
          options.runtimeConfig.screenshotR2TtlDays,
        )
      }

      return createFallbackResponse(options.fallbackKey, options.variant, getSkipErrorMetadata(error))
    }

    console.warn(JSON.stringify({
      message: 'Screenshot capture failed',
      attempts: error instanceof ScreenshotProviderChainError ? error.attempts : undefined,
      error: error instanceof Error ? error.message : String(error),
    }))
  }

  if (previewScreenshot) {
    return createImageResponse(
      previewScreenshot,
      options.sourceUrlHash,
      options.variant,
      'STALE',
      captureMetadata,
      options.runtimeConfig.screenshotR2TtlDays,
    )
  }

  return createFallbackResponse(options.fallbackKey, options.variant, captureMetadata)
}

export default defineEventHandler(async (event) => {
  const id = getRouterParams(event).id

  if (!isValidHnItemId(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid story ID is required',
    })
  }

  const variant = getRequestedVariant(event)
  const fallbackKey = getFallbackKey(id, variant)

  try {
    const runtimeConfig = useRuntimeConfig(event) as ScreenshotRuntimeConfig
    const env = event.context.cloudflare?.env as ScreenshotEnv | undefined

    const sourceUrl = await resolveStorySourceUrl(id)

    if (!sourceUrl) {
      return createFallbackResponse(fallbackKey, variant, {
        policy: 'skip',
        skipReason: 'invalid-url',
      })
    }

    const sourceDecision = createScreenshotSourceDecision(sourceUrl, runtimeConfig)

    if (sourceDecision.policy === 'skip') {
      return createFallbackResponse(fallbackKey, variant, {
        policy: 'skip',
        skipReason: sourceDecision.skipReason,
        sourceStrategy: sourceDecision.sourceStrategy,
      })
    }

    const sourceUrlHash = await getSourceUrlHash(sourceDecision.cacheIdentityUrl)
    const previewKey = getR2PreviewScreenshotKey(
      sourceUrlHash,
      runtimeConfig.screenshotPreviewWidth,
      runtimeConfig.screenshotPreviewHeight,
      runtimeConfig.screenshotPreviewJpegQuality,
    )

    return await servePreview({
      captureEnabled: isCaptureEnabled(runtimeConfig.screenshotCaptureEnabled),
      env,
      failureKey: getR2ScreenshotFailureKey(previewKey),
      fallbackKey,
      previewKey,
      runtimeConfig,
      sourceDecision,
      sourceUrlHash,
      variant,
    })
  } catch (error) {
    console.warn(JSON.stringify({
      message: 'Screenshot route failed',
      id,
      error: error instanceof Error ? error.message : String(error),
    }))
    return createFallbackResponse(fallbackKey, variant)
  }
})
