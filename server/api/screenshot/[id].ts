import {
  defineEventHandler,
  getQuery,
  getRequestURL,
  getRouterParams,
  createError,
  useRuntimeConfig,
} from '#imports'
import { captureWithBackup15 } from '../../utils/screenshot/backup15'
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
import { createThumbnailFromJpeg } from '../../utils/screenshot/thumbnail'
import type {
  ScreenshotEnv,
  ScreenshotProviderName,
  ScreenshotResult,
  ScreenshotVariant,
} from '../../utils/screenshot/types'

const FALLBACK_MEMORY_TTL_MS = 15 * 60 * 1000
const R2_MISS_MEMORY_TTL_MS = 2 * 60 * 1000
const TRANSPARENT_GIF = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255,
  255, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 1, 76, 0, 59,
])
const fallbackExpirations = new Map<string, number>()
const r2MissExpirations = new Map<string, number>()
const pendingOriginalCaptures = new Map<string, Promise<ScreenshotResult>>()
const pendingThumbnailProcesses = new Map<string, Promise<ScreenshotResult>>()

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

type ThumbnailRuntimeConfig = {
  concurrency: unknown
  height: unknown
  jpegQuality: unknown
  maxInputBytes: unknown
  maxInputPixels: unknown
  timeoutMs: unknown
  width: unknown
}

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
) => {
  const headers = new Headers(response.headers)
  headers.set('X-HN42-Screenshot-Cache', status)

  if (provider) {
    headers.set('X-HN42-Screenshot-Provider', provider)
  }

  if (variant) {
    headers.set('X-HN42-Screenshot-Variant', variant)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const getFallbackKey = (id: string, variant: ScreenshotVariant) => `${id}:${variant}`

const hasFreshFallback = (fallbackKey: string) => {
  const expiresAt = fallbackExpirations.get(fallbackKey)

  if (!expiresAt) {
    return false
  }

  if (expiresAt <= Date.now()) {
    fallbackExpirations.delete(fallbackKey)
    return false
  }

  return true
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

const createFallbackResponse = (fallbackKey?: string, variant: ScreenshotVariant = 'original') => {
  if (fallbackKey) {
    fallbackExpirations.set(fallbackKey, Date.now() + FALLBACK_MEMORY_TTL_MS)
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

  return withScreenshotCacheStatus(response, 'FALLBACK', undefined, variant)
}

const getImageFormat = (contentType: string) => {
  return contentType.replace(/^image\//, '') || 'unknown'
}

const createImageResponse = (
  image: ScreenshotResult | R2Screenshot,
  sourceUrlHash: string,
  variant: ScreenshotVariant,
  cacheStatus: ScreenshotCacheStatus,
  provider?: ScreenshotProviderName,
  options: { thumbnailFallback?: boolean } = {},
) => {
  const headers = new Headers({
    'Content-Type': image.contentType,
    'Content-Length': String(image.bytes.byteLength),
    'ETag': `W/"hn42-screenshot-v2-${variant}-${sourceUrlHash.slice(0, 16)}"`,
    'Accept-Ranges': 'bytes',
    'X-HN42-Screenshot-Format': getImageFormat(image.contentType),
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
    provider: image.provider ?? 'backup15',
    variant,
  }
}

const captureAndPersistOriginal = (
  event: any,
  env: ScreenshotEnv | undefined,
  originalKey: string,
  sourceUrlHash: string,
  sourceUrl: string,
  concurrency: unknown,
  writeFailureMarker: boolean,
) => {
  const pendingCapture = pendingOriginalCaptures.get(originalKey)

  if (pendingCapture) {
    return pendingCapture
  }

  const capture = captureWithBackup15(sourceUrl, concurrency)
    .then((screenshot) => {
      const original: ScreenshotResult = {
        ...screenshot,
        variant: 'original',
      }

      forgetR2Miss(originalKey)
      runInBackground(
        event,
        writeR2Screenshot(env, originalKey, sourceUrlHash, original, 'original').catch((error) => {
          console.warn(`R2 original screenshot write failed: ${error instanceof Error ? error.message : String(error)}`)
        }),
      )

      return original
    })
    .catch((error) => {
      if (writeFailureMarker) {
        runInBackground(
          event,
          writeR2ScreenshotFailure(
            env,
            originalKey,
            sourceUrlHash,
            error instanceof Error ? error.message : String(error),
            'original',
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

const createAndPersistThumbnail = (
  event: any,
  env: ScreenshotEnv | undefined,
  thumbnailKey: string,
  sourceUrlHash: string,
  original: ScreenshotResult,
  config: ThumbnailRuntimeConfig,
  writeFailureMarker: boolean,
) => {
  const pendingProcess = pendingThumbnailProcesses.get(thumbnailKey)

  if (pendingProcess) {
    return pendingProcess
  }

  const process = createThumbnailFromJpeg(original, {
    concurrency: config.concurrency,
    height: config.height,
    jpegQuality: config.jpegQuality,
    maxInputBytes: config.maxInputBytes,
    maxInputPixels: config.maxInputPixels,
    timeoutMs: config.timeoutMs,
    width: config.width,
  })
    .then((thumbnail) => {
      forgetR2Miss(thumbnailKey)
      runInBackground(
        event,
        writeR2Screenshot(env, thumbnailKey, sourceUrlHash, thumbnail, 'thumbnail').catch((error) => {
          console.warn(`R2 thumbnail screenshot write failed: ${error instanceof Error ? error.message : String(error)}`)
        }),
      )

      return thumbnail
    })
    .catch((error) => {
      if (writeFailureMarker) {
        runInBackground(
          event,
          writeR2ScreenshotFailure(
            env,
            thumbnailKey,
            sourceUrlHash,
            error instanceof Error ? error.message : String(error),
            'thumbnail',
          ).catch((writeError) => {
            console.warn(`R2 thumbnail failure write failed: ${writeError instanceof Error ? writeError.message : String(writeError)}`)
          }),
        )
      }

      throw error
    })
    .finally(() => {
      pendingThumbnailProcesses.delete(thumbnailKey)
    })

  pendingThumbnailProcesses.set(thumbnailKey, process)

  return process
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

const isPrivateIpv4Address = (hostname: string) => {
  const parts = hostname.split('.')

  if (parts.length !== 4) {
    return false
  }

  const octets = parts.map((part) => Number(part))

  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return false
  }

  const [first, second] = octets

  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second >= 64 && second <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
}

const isBlockedHostname = (hostname: string) => {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[(.*)\]$/, '$1')
  const isIpv6Literal = normalizedHostname.includes(':')

  return normalizedHostname === 'localhost'
    || normalizedHostname.endsWith('.localhost')
    || normalizedHostname.endsWith('.local')
    || (isIpv6Literal && normalizedHostname === '::1')
    || (isIpv6Literal && normalizedHostname.startsWith('fc'))
    || (isIpv6Literal && normalizedHostname.startsWith('fd'))
    || (isIpv6Literal && normalizedHostname.startsWith('fe80:'))
    || isPrivateIpv4Address(normalizedHostname)
}

const normalizeSourceUrl = (input: unknown) => {
  if (typeof input !== 'string' || input.trim() === '') {
    return null
  }

  try {
    const url = new URL(input)

    if (!['http:', 'https:'].includes(url.protocol) || isBlockedHostname(url.hostname)) {
      return null
    }

    return url.toString()
  } catch {
    return null
  }
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
    sourceUrl: string
    sourceUrlHash: string
  },
) => {
  const originalResult = await readR2Cache(
    options.env,
    options.originalKey,
    options.runtimeConfig.screenshotR2TtlDays,
    options.runtimeConfig.screenshotFailureTtlMinutes,
  )
  const originalFailure = getR2Failure(originalResult)

  if (originalFailure) {
    if (originalFailure.isFresh) {
      return createFallbackResponse(options.fallbackKey, 'original')
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
      options.sourceUrl,
      options.runtimeConfig.screenshotFetchConcurrency,
      originalResult !== R2_READ_FAILED && !originalScreenshot,
    )
    const response = createImageResponse(
      screenshot,
      options.sourceUrlHash,
      'original',
      'MISS',
      screenshot.provider,
    )

    putCacheResponse(event, options.cache, options.cacheKey, response)

    return response
  } catch (error) {
    console.warn(`backup15 screenshot capture failed: ${error instanceof Error ? error.message : String(error)}`)
  }

  if (originalScreenshot) {
    const response = createImageResponse(
      originalScreenshot,
      options.sourceUrlHash,
      'original',
      'STALE',
      originalScreenshot.provider,
    )

    putCacheResponse(event, options.cache, options.cacheKey, response)

    return response
  }

  return createFallbackResponse(options.fallbackKey, 'original')
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
    sourceUrl: string
    sourceUrlHash: string
    thumbnailConfig: ThumbnailRuntimeConfig
    thumbnailKey: string
  },
) => {
  const thumbnailResult = await readR2Cache(
    options.env,
    options.thumbnailKey,
    options.runtimeConfig.screenshotR2TtlDays,
    options.runtimeConfig.screenshotFailureTtlMinutes,
  )
  const thumbnailFailure = getR2Failure(thumbnailResult)

  if (thumbnailFailure && !thumbnailFailure.isFresh) {
    noteR2Miss(options.thumbnailKey)
  }

  const thumbnailScreenshot = getR2Screenshot(thumbnailResult)

  if (thumbnailScreenshot?.isFresh) {
    const response = createImageResponse(
      thumbnailScreenshot,
      options.sourceUrlHash,
      'thumbnail',
      'R2',
      thumbnailScreenshot.provider,
    )

    putCacheResponse(event, options.cache, options.cacheKey, response)

    return response
  }

  const originalResult = await readR2Cache(
    options.env,
    options.originalKey,
    options.runtimeConfig.screenshotR2TtlDays,
    options.runtimeConfig.screenshotFailureTtlMinutes,
  )
  const originalFailure = getR2Failure(originalResult)

  if (originalFailure) {
    if (originalFailure.isFresh) {
      if (thumbnailScreenshot) {
        const response = createImageResponse(
          thumbnailScreenshot,
          options.sourceUrlHash,
          'thumbnail',
          'STALE',
          thumbnailScreenshot.provider,
        )

        putCacheResponse(event, options.cache, options.cacheKey, response)

        return response
      }

      return createFallbackResponse(options.fallbackKey, 'thumbnail')
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
        options.sourceUrl,
        options.runtimeConfig.screenshotFetchConcurrency,
        originalResult !== R2_READ_FAILED,
      )
      originalCacheStatus = 'MISS'
    } catch (error) {
      console.warn(`backup15 screenshot capture failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (!original) {
    if (thumbnailScreenshot) {
      const response = createImageResponse(
        thumbnailScreenshot,
        options.sourceUrlHash,
        'thumbnail',
        'STALE',
        thumbnailScreenshot.provider,
      )

      putCacheResponse(event, options.cache, options.cacheKey, response)

      return response
    }

    return createFallbackResponse(options.fallbackKey, 'thumbnail')
  }

  if (!thumbnailFailure?.isFresh) {
    try {
      const thumbnail = await createAndPersistThumbnail(
        event,
        options.env,
        options.thumbnailKey,
        options.sourceUrlHash,
        original,
        options.thumbnailConfig,
        thumbnailResult !== R2_READ_FAILED && !thumbnailScreenshot,
      )
      const response = createImageResponse(
        thumbnail,
        options.sourceUrlHash,
        'thumbnail',
        originalCacheStatus === 'MISS' ? 'MISS' : 'R2',
        thumbnail.provider,
      )

      putCacheResponse(event, options.cache, options.cacheKey, response)

      return response
    } catch (error) {
      console.warn(`JPEG thumbnail processing failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const response = createImageResponse(
    original,
    options.sourceUrlHash,
    'original',
    'STALE',
    original.provider,
    { thumbnailFallback: true },
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

    if (hasFreshFallback(fallbackKey)) {
      return createFallbackResponse(undefined, variant)
    }

    const sourceUrl = await resolveStorySourceUrl(id)

    if (!sourceUrl) {
      return createFallbackResponse(fallbackKey, variant)
    }

    const sourceUrlHash = await getSourceUrlHash(sourceUrl)
    const originalKey = getR2OriginalScreenshotKey(sourceUrlHash)
    const thumbnailKey = getR2ThumbnailScreenshotKey(
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
        sourceUrl,
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
        thumbnailKey,
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
      sourceUrl,
      sourceUrlHash,
    })
  } catch (error) {
    console.warn(`Screenshot route failed: ${error instanceof Error ? error.message : String(error)}`)
    return createFallbackResponse(fallbackKey, variant)
  }
})
