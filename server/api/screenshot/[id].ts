import {
  defineEventHandler,
  getQuery,
  getRequestURL,
  getRouterParams,
  createError,
  useRuntimeConfig,
} from '#imports'
import { captureScreenshotWithProvider } from '../../utils/screenshot/providers'
import {
  getR2OriginalScreenshotKey,
  getR2ThumbnailScreenshotKey,
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
import { createAndPersistThumbnailWithPipeline } from '../../utils/screenshot/thumbnailPipeline'
import type {
  ScreenshotEnv,
  ScreenshotPolicyMetadata,
  ScreenshotProcessorName,
  ScreenshotProviderName,
  ScreenshotResult,
  ScreenshotVariant,
  ThumbnailRuntimeConfig,
} from '../../utils/screenshot/types'

const FALLBACK_MEMORY_TTL_MS = 15 * 60 * 1000
const R2_MISS_MEMORY_TTL_MS = 2 * 60 * 1000
const TRANSPARENT_GIF = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255,
  255, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 1, 76, 0, 59,
])
const fallbackExpirations = new Map<string, { expiresAt: number, metadata: ScreenshotPolicyMetadata }>()
const r2MissExpirations = new Map<string, number>()
const pendingOriginalCaptures = new Map<string, Promise<ScreenshotResult>>()

const SCREENSHOT_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=604800',
  'CDN-Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400, stale-if-error=86400',
  'Cloudflare-CDN-Cache-Control': 'public, max-age=604800, stale-while-revalidate=86400, stale-if-error=86400',
} as const

const STALE_SCREENSHOT_CACHE_HEADERS = {
  'Cache-Control': 'public, max-age=3600',
  'CDN-Cache-Control': 'public, max-age=3600, stale-while-revalidate=3600, stale-if-error=3600',
  'Cloudflare-CDN-Cache-Control': 'public, max-age=3600, stale-while-revalidate=3600, stale-if-error=3600',
} as const

const FALLBACK_CACHE_HEADERS = {
  'Cache-Control': 'no-store',
  'CDN-Cache-Control': 'no-store',
  'Cloudflare-CDN-Cache-Control': 'no-store',
} as const

type ScreenshotCacheStatus = 'HIT' | 'R2' | 'MISS' | 'STALE' | 'FALLBACK'
const R2_READ_FAILED = Symbol('R2_READ_FAILED')

type HnFirebaseStory = {
  url?: unknown
}

type R2ReadResult = R2Screenshot | R2ScreenshotFailure | null | typeof R2_READ_FAILED

const getWaitUntil = (event: any) => {
  const cloudflareContext = event.context.cloudflare?.context

  return cloudflareContext?.waitUntil?.bind(cloudflareContext)
    ?? event.waitUntil?.bind(event)
}

const runInBackground = (event: any, task: Promise<unknown>) => {
  const waitUntil = getWaitUntil(event)

  if (waitUntil) {
    waitUntil(task)
    return
  }

  task.catch(() => {})
}

const putCacheResponse = (
  event: any,
  cache: Cache | undefined,
  cacheKey: Request | undefined,
  response: Response,
) => {
  if (!cache || !cacheKey) {
    return
  }

  runInBackground(event, cache.put(cacheKey, response.clone()))
}

const withScreenshotCacheStatus = (
  response: Response,
  status: ScreenshotCacheStatus,
  provider?: ScreenshotProviderName,
  variant?: ScreenshotVariant,
  processor?: ScreenshotProcessorName,
  metadata: ScreenshotPolicyMetadata = {},
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

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const getFallbackKey = (id: string, variant: ScreenshotVariant) => `${id}:${variant}`

const getFreshFallbackMetadata = (fallbackKey: string) => {
  const fallback = fallbackExpirations.get(fallbackKey)

  if (!fallback) {
    return null
  }

  if (fallback.expiresAt <= Date.now()) {
    fallbackExpirations.delete(fallbackKey)
    return null
  }

  return fallback.metadata
}

const hasFreshR2Miss = (key: string) => {
  const expiresAt = r2MissExpirations.get(key)

  if (!expiresAt) {
    return false
  }

  if (expiresAt <= Date.now()) {
    r2MissExpirations.delete(key)
    return false
  }

  return true
}

const noteR2Miss = (key: string) => {
  r2MissExpirations.set(key, Date.now() + R2_MISS_MEMORY_TTL_MS)
}

const forgetR2Miss = (key: string) => {
  r2MissExpirations.delete(key)
}

const createFallbackResponse = (
  fallbackKey?: string,
  variant: ScreenshotVariant = 'original',
  metadata: ScreenshotPolicyMetadata = {},
) => {
  if (fallbackKey) {
    fallbackExpirations.set(fallbackKey, {
      expiresAt: Date.now() + FALLBACK_MEMORY_TTL_MS,
      metadata,
    })
  }

  const response = new Response(TRANSPARENT_GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(TRANSPARENT_GIF.byteLength),
      'ETag': fallbackKey ? `W/"hn42-screenshot-fallback-${fallbackKey}"` : 'W/"hn42-screenshot-fallback"',
      'Accept-Ranges': 'bytes',
      'X-HN42-Screenshot-Fallback': '1',
      'X-HN42-Screenshot-Format': 'gif',
      ...FALLBACK_CACHE_HEADERS,
    },
  })

  return withScreenshotCacheStatus(response, 'FALLBACK', undefined, variant, undefined, metadata)
}

const getImageFormat = (contentType: string) => {
  return contentType.replace(/^image\//, '') || 'unknown'
}

const getScreenshotProcessor = (
  image: ScreenshotResult | R2Screenshot,
  variant: ScreenshotVariant,
  thumbnailFallback?: boolean,
): ScreenshotProcessorName => {
  if (thumbnailFallback) {
    return 'original'
  }

  if (image.processor) {
    return image.processor
  }

  return variant === 'thumbnail' ? 'wasm' : 'original'
}

const createImageResponse = (
  image: ScreenshotResult | R2Screenshot,
  sourceUrlHash: string,
  variant: ScreenshotVariant,
  cacheStatus: ScreenshotCacheStatus,
  provider?: ScreenshotProviderName,
  options: { metadata?: ScreenshotPolicyMetadata, thumbnailFallback?: boolean } = {},
) => {
  const format = getImageFormat(image.contentType)
  const processor = getScreenshotProcessor(image, variant, options.thumbnailFallback)
  const fallbackSuffix = options.thumbnailFallback ? '-fallback-original' : ''
  const headers = new Headers({
    'Content-Type': image.contentType,
    'Content-Length': String(image.bytes.byteLength),
    'ETag': `W/"hn42-screenshot-v2-${variant}-${format}-${processor}${fallbackSuffix}-${sourceUrlHash.slice(0, 16)}"`,
    'Accept-Ranges': 'bytes',
    'X-HN42-Screenshot-Format': format,
    ...(cacheStatus === 'STALE' ? STALE_SCREENSHOT_CACHE_HEADERS : SCREENSHOT_CACHE_HEADERS),
  })

  if (options.thumbnailFallback) {
    headers.set('X-HN42-Screenshot-Thumbnail-Fallback', 'original')
  }

  return withScreenshotCacheStatus(
    new Response(image.bytes, { headers }),
    cacheStatus,
    provider ?? image.provider,
    variant,
    processor,
    options.metadata,
  )
}

const readR2Cache = async (
  env: ScreenshotEnv | undefined,
  key: string,
  ttlDays: unknown,
  failureTtlMinutes: unknown,
): Promise<R2ReadResult> => {
  if (hasFreshR2Miss(key)) {
    return null
  }

  const result = await readR2Screenshot(env, key, ttlDays, failureTtlMinutes).catch((error) => {
    console.warn(`R2 screenshot read failed: ${error instanceof Error ? error.message : String(error)}`)
    return R2_READ_FAILED
  })

  if (result === null) {
    noteR2Miss(key)
  }

  return result
}

const getR2Screenshot = (result: R2ReadResult) => {
  return result && result !== R2_READ_FAILED && !isR2ScreenshotFailure(result)
    ? result
    : null
}

const getR2Failure = (result: R2ReadResult) => {
  return result && result !== R2_READ_FAILED && isR2ScreenshotFailure(result)
    ? result
    : null
}

const toScreenshotResult = (
  image: R2Screenshot,
  variant: ScreenshotVariant,
): ScreenshotResult => {
  return {
    bytes: image.bytes,
    contentType: image.contentType,
    processor: image.processor,
    provider: image.provider ?? 'backup15',
    sourceStrategy: image.sourceStrategy,
    variant,
  }
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

const getSkipErrorMetadata = (
  error: ScreenshotPolicySkipError,
): ScreenshotPolicyMetadata => ({
  policy: 'skip',
  skipReason: error.skipReason,
  sourceStrategy: error.sourceStrategy,
})

const captureAndPersistOriginal = (
  event: any,
  env: ScreenshotEnv | undefined,
  originalKey: string,
  sourceUrlHash: string,
  sourceDecision: ScreenshotCaptureDecision,
  runtimeConfig: any,
  concurrency: unknown,
  writeFailureMarker: boolean,
) => {
  const pendingCapture = pendingOriginalCaptures.get(originalKey)

  if (pendingCapture) {
    return pendingCapture
  }

  const capture = probeCaptureUrlContent(sourceDecision.captureUrl, runtimeConfig)
    .then((probeResult) => {
      if (probeResult.policy === 'skip') {
        throw new ScreenshotPolicySkipError(probeResult.skipReason, sourceDecision.sourceStrategy)
      }

      return captureScreenshotWithProvider(
        sourceDecision.captureProvider,
        sourceDecision.captureUrl,
        concurrency,
      )
    })
    .then((screenshot) => {
      const original: ScreenshotResult = {
        ...screenshot,
        processor: 'original',
        sourceStrategy: sourceDecision.sourceStrategy,
        variant: 'original',
      }

      forgetR2Miss(originalKey)
      runInBackground(
        event,
        writeR2Screenshot(env, originalKey, sourceUrlHash, original, 'original', getCaptureMetadata(sourceDecision)).catch((error) => {
          console.warn(`R2 original screenshot write failed: ${error instanceof Error ? error.message : String(error)}`)
        }),
      )

      return original
    })
    .catch((error) => {
      if (writeFailureMarker) {
        const metadata = isScreenshotPolicySkipError(error)
          ? getSkipErrorMetadata(error)
          : getCaptureMetadata(sourceDecision)

        runInBackground(
          event,
          writeR2ScreenshotFailure(
            env,
            originalKey,
            sourceUrlHash,
            error instanceof Error ? error.message : String(error),
            'original',
            metadata,
          ).catch((writeError) => {
            console.warn(`R2 original failure write failed: ${writeError instanceof Error ? writeError.message : String(writeError)}`)
          }),
        )
      }

      throw error
    })
    .finally(() => {
      pendingOriginalCaptures.delete(originalKey)
    })

  pendingOriginalCaptures.set(originalKey, capture)

  return capture
}

const isValidStoryId = (id: unknown): id is string => {
  return typeof id === 'string' && /^\d+$/.test(id)
}

const getRequestedVariant = (event: any): ScreenshotVariant => {
  const rawVariant = getQuery(event).variant
  const variant = Array.isArray(rawVariant) ? rawVariant[0] : rawVariant

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
  const story = await $fetch<HnFirebaseStory>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)

  return normalizeSourceUrl(story?.url)
}

const serveOriginal = async (
  event: any,
  options: {
    cache: Cache | undefined
    cacheKey: Request | undefined
    env: ScreenshotEnv | undefined
    fallbackKey: string
    id: string
    originalKey: string
    runtimeConfig: any
    sourceDecision: ScreenshotCaptureDecision
    sourceUrlHash: string
  },
) => {
  const captureMetadata = getCaptureMetadata(options.sourceDecision)
  const originalResult = await readR2Cache(
    options.env,
    options.originalKey,
    options.runtimeConfig.screenshotR2TtlDays,
    options.runtimeConfig.screenshotFailureTtlMinutes,
  )
  const originalFailure = getR2Failure(originalResult)

  if (originalFailure) {
    if (originalFailure.isFresh) {
      return createFallbackResponse(options.fallbackKey, 'original', getFailureMetadata(originalFailure, options.sourceDecision))
    }

    noteR2Miss(options.originalKey)
  }

  const originalScreenshot = getR2Screenshot(originalResult)

  if (originalScreenshot?.isFresh) {
    const response = createImageResponse(
      originalScreenshot,
      options.sourceUrlHash,
      'original',
      'R2',
      originalScreenshot.provider,
      { metadata: captureMetadata },
    )

    putCacheResponse(event, options.cache, options.cacheKey, response)

    return response
  }

  try {
    const screenshot = await captureAndPersistOriginal(
      event,
      options.env,
      options.originalKey,
      options.sourceUrlHash,
      options.sourceDecision,
      options.runtimeConfig,
      options.runtimeConfig.screenshotFetchConcurrency,
      originalResult !== R2_READ_FAILED && !originalScreenshot,
    )
    const response = createImageResponse(
      screenshot,
      options.sourceUrlHash,
      'original',
      'MISS',
      screenshot.provider,
      { metadata: captureMetadata },
    )

    putCacheResponse(event, options.cache, options.cacheKey, response)

    return response
  } catch (error) {
    if (isScreenshotPolicySkipError(error)) {
      if (originalScreenshot) {
        const response = createImageResponse(
          originalScreenshot,
          options.sourceUrlHash,
          'original',
          'STALE',
          originalScreenshot.provider,
          { metadata: getSkipErrorMetadata(error) },
        )

        putCacheResponse(event, options.cache, options.cacheKey, response)

        return response
      }

      return createFallbackResponse(options.fallbackKey, 'original', getSkipErrorMetadata(error))
    }

    console.warn(`screenshot capture failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (originalScreenshot) {
    const response = createImageResponse(
      originalScreenshot,
      options.sourceUrlHash,
      'original',
      'STALE',
      originalScreenshot.provider,
      { metadata: captureMetadata },
    )

    putCacheResponse(event, options.cache, options.cacheKey, response)

    return response
  }

  return createFallbackResponse(options.fallbackKey, 'original', captureMetadata)
}

const serveThumbnail = async (
  event: any,
  options: {
    cache: Cache | undefined
    cacheKey: Request | undefined
    env: ScreenshotEnv | undefined
    fallbackKey: string
    id: string
    originalKey: string
    runtimeConfig: any
    sourceDecision: ScreenshotCaptureDecision
    sourceUrlHash: string
    thumbnailConfig: ThumbnailRuntimeConfig
    thumbnailJpegKey: string
    thumbnailWebpKey: string
  },
) => {
  const captureMetadata = getCaptureMetadata(options.sourceDecision)
  const webpThumbnailResult = await readR2Cache(
    options.env,
    options.thumbnailWebpKey,
    options.runtimeConfig.screenshotR2TtlDays,
    options.runtimeConfig.screenshotFailureTtlMinutes,
  )
  const webpThumbnailFailure = getR2Failure(webpThumbnailResult)

  if (webpThumbnailFailure && !webpThumbnailFailure.isFresh) {
    noteR2Miss(options.thumbnailWebpKey)
  }

  const webpThumbnailScreenshot = getR2Screenshot(webpThumbnailResult)

  if (webpThumbnailScreenshot?.isFresh) {
    const response = createImageResponse(
      webpThumbnailScreenshot,
      options.sourceUrlHash,
      'thumbnail',
      'R2',
      webpThumbnailScreenshot.provider,
      { metadata: captureMetadata },
    )

    putCacheResponse(event, options.cache, options.cacheKey, response)

    return response
  }

  const jpegThumbnailResult = await readR2Cache(
    options.env,
    options.thumbnailJpegKey,
    options.runtimeConfig.screenshotR2TtlDays,
    options.runtimeConfig.screenshotFailureTtlMinutes,
  )
  const jpegThumbnailFailure = getR2Failure(jpegThumbnailResult)

  if (jpegThumbnailFailure && !jpegThumbnailFailure.isFresh) {
    noteR2Miss(options.thumbnailJpegKey)
  }

  const jpegThumbnailScreenshot = getR2Screenshot(jpegThumbnailResult)

  if (jpegThumbnailScreenshot?.isFresh) {
    const response = createImageResponse(
      jpegThumbnailScreenshot,
      options.sourceUrlHash,
      'thumbnail',
      'R2',
      jpegThumbnailScreenshot.provider,
      { metadata: captureMetadata },
    )

    putCacheResponse(event, options.cache, options.cacheKey, response)

    return response
  }

  const staleThumbnailScreenshot = webpThumbnailScreenshot ?? jpegThumbnailScreenshot

  const originalResult = await readR2Cache(
    options.env,
    options.originalKey,
    options.runtimeConfig.screenshotR2TtlDays,
    options.runtimeConfig.screenshotFailureTtlMinutes,
  )
  const originalFailure = getR2Failure(originalResult)

  if (originalFailure) {
    if (originalFailure.isFresh) {
      const failureMetadata = getFailureMetadata(originalFailure, options.sourceDecision)

      if (staleThumbnailScreenshot) {
        const response = createImageResponse(
          staleThumbnailScreenshot,
          options.sourceUrlHash,
          'thumbnail',
          'STALE',
          staleThumbnailScreenshot.provider,
          { metadata: failureMetadata },
        )

        putCacheResponse(event, options.cache, options.cacheKey, response)

        return response
      }

      return createFallbackResponse(options.fallbackKey, 'thumbnail', failureMetadata)
    }

    noteR2Miss(options.originalKey)
  }

  const originalScreenshot = getR2Screenshot(originalResult)
  let original = originalScreenshot ? toScreenshotResult(originalScreenshot, 'original') : null
  let originalCacheStatus: ScreenshotCacheStatus = originalScreenshot ? 'R2' : 'MISS'

  if (!original) {
    try {
      original = await captureAndPersistOriginal(
        event,
        options.env,
        options.originalKey,
        options.sourceUrlHash,
        options.sourceDecision,
        options.runtimeConfig,
        options.runtimeConfig.screenshotFetchConcurrency,
        originalResult !== R2_READ_FAILED && !originalScreenshot,
      )
      originalCacheStatus = 'MISS'
    } catch (error) {
      if (isScreenshotPolicySkipError(error)) {
        if (staleThumbnailScreenshot) {
          const response = createImageResponse(
            staleThumbnailScreenshot,
            options.sourceUrlHash,
            'thumbnail',
            'STALE',
            staleThumbnailScreenshot.provider,
            { metadata: getSkipErrorMetadata(error) },
          )

          putCacheResponse(event, options.cache, options.cacheKey, response)

          return response
        }

        return createFallbackResponse(options.fallbackKey, 'thumbnail', getSkipErrorMetadata(error))
      }

      console.warn(`screenshot capture failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (!original) {
    if (staleThumbnailScreenshot) {
      const response = createImageResponse(
        staleThumbnailScreenshot,
        options.sourceUrlHash,
        'thumbnail',
        'STALE',
        staleThumbnailScreenshot.provider,
        { metadata: captureMetadata },
      )

      putCacheResponse(event, options.cache, options.cacheKey, response)

      return response
    }

    return createFallbackResponse(options.fallbackKey, 'thumbnail', captureMetadata)
  }

  if (!webpThumbnailFailure?.isFresh) {
    const thumbnail = await createAndPersistThumbnailWithPipeline({
      config: options.thumbnailConfig,
      env: options.env,
      forgetR2Miss,
      jpegKey: options.thumbnailJpegKey,
      original,
      scheduleBackground: (task) => runInBackground(event, task),
      sourceUrlHash: options.sourceUrlHash,
      webpKey: options.thumbnailWebpKey,
      writeFailureMarker: webpThumbnailResult !== R2_READ_FAILED && !webpThumbnailScreenshot && !jpegThumbnailScreenshot,
    })

    if (thumbnail) {
      const response = createImageResponse(
        thumbnail,
        options.sourceUrlHash,
        'thumbnail',
        originalCacheStatus === 'MISS' ? 'MISS' : 'R2',
        thumbnail.provider,
        { metadata: captureMetadata },
      )

      putCacheResponse(event, options.cache, options.cacheKey, response)

      return response
    }
  }

  const response = createImageResponse(
    original,
    options.sourceUrlHash,
    'thumbnail',
    'STALE',
    original.provider,
    { metadata: captureMetadata, thumbnailFallback: true },
  )

  putCacheResponse(event, options.cache, options.cacheKey, response)

  return response
}

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event)
  const id = params.id

  if (!isValidStoryId(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid story ID is required',
    })
  }

  const variant = getRequestedVariant(event)
  const fallbackKey = getFallbackKey(id, variant)
  const cache = globalThis.caches?.default
  const cacheKey = cache ? new Request(getRequestURL(event).toString(), { method: 'GET' }) : undefined
  const cachedResponse = cacheKey ? await cache?.match(cacheKey) : undefined

  if (cachedResponse) {
    return withScreenshotCacheStatus(cachedResponse, 'HIT')
  }

  try {
    const runtimeConfig = useRuntimeConfig(event)
    const env = event.context.cloudflare?.env as ScreenshotEnv | undefined

    const fallbackMetadata = getFreshFallbackMetadata(fallbackKey)

    if (fallbackMetadata) {
      return createFallbackResponse(undefined, variant, fallbackMetadata)
    }

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
    const originalKey = getR2OriginalScreenshotKey(sourceUrlHash)
    const thumbnailWebpKey = getR2ThumbnailScreenshotKey(
      sourceUrlHash,
      runtimeConfig.screenshotThumbnailWidth,
      runtimeConfig.screenshotThumbnailHeight,
      runtimeConfig.screenshotThumbnailJpegQuality,
      'webp',
    )
    const thumbnailJpegKey = getR2ThumbnailScreenshotKey(
      sourceUrlHash,
      runtimeConfig.screenshotThumbnailWidth,
      runtimeConfig.screenshotThumbnailHeight,
      runtimeConfig.screenshotThumbnailJpegQuality,
    )

    if (variant === 'thumbnail') {
      return await serveThumbnail(event, {
        cache,
        cacheKey,
        env,
        fallbackKey,
        id,
        originalKey,
        runtimeConfig,
        sourceDecision,
        sourceUrlHash,
        thumbnailConfig: {
          concurrency: runtimeConfig.screenshotThumbnailProcessingConcurrency,
          height: runtimeConfig.screenshotThumbnailHeight,
          jpegQuality: runtimeConfig.screenshotThumbnailJpegQuality,
          maxInputBytes: runtimeConfig.screenshotThumbnailMaxInputBytes,
          maxInputPixels: runtimeConfig.screenshotThumbnailMaxInputPixels,
          timeoutMs: runtimeConfig.screenshotThumbnailProcessingTimeoutMs,
          width: runtimeConfig.screenshotThumbnailWidth,
        },
        thumbnailJpegKey,
        thumbnailWebpKey,
      })
    }

    return await serveOriginal(event, {
      cache,
      cacheKey,
      env,
      fallbackKey,
      id,
      originalKey,
      runtimeConfig,
      sourceDecision,
      sourceUrlHash,
    })
  } catch (error) {
    console.warn(`Screenshot route failed: ${error instanceof Error ? error.message : String(error)}`)
    return createFallbackResponse(fallbackKey, variant)
  }
})
