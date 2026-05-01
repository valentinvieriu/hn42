import { defineEventHandler, getRequestURL, getRouterParams, createError, useRuntimeConfig } from '#imports'
import { captureScreenshot } from '../../utils/screenshot/orchestrate'
import {
  getR2ScreenshotKey,
  getSourceUrlHash,
  readR2Screenshot,
  writeR2Screenshot,
  type R2Screenshot,
} from '../../utils/screenshot/r2Cache'
import type { ScreenshotEnv, ScreenshotProviderName, ScreenshotResult } from '../../utils/screenshot/types'

const FALLBACK_MEMORY_TTL_MS = 15 * 60 * 1000
const TRANSPARENT_GIF = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255,
  255, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 1, 76, 0, 59,
])
const fallbackExpirations = new Map<string, number>()

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

type HnFirebaseStory = {
  url?: unknown
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
) => {
  const headers = new Headers(response.headers)
  headers.set('X-HN42-Screenshot-Cache', status)

  if (provider) {
    headers.set('X-HN42-Screenshot-Provider', provider)
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

const hasFreshFallback = (id: string) => {
  const expiresAt = fallbackExpirations.get(id)

  if (!expiresAt) {
    return false
  }

  if (expiresAt <= Date.now()) {
    fallbackExpirations.delete(id)
    return false
  }

  return true
}

const createFallbackResponse = (id?: string) => {
  if (id) {
    fallbackExpirations.set(id, Date.now() + FALLBACK_MEMORY_TTL_MS)
  }

  const response = new Response(TRANSPARENT_GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(TRANSPARENT_GIF.byteLength),
      'ETag': id ? `W/"hn42-screenshot-fallback-${id}"` : 'W/"hn42-screenshot-fallback"',
      'Accept-Ranges': 'bytes',
      'X-HN42-Screenshot-Fallback': '1',
      ...FALLBACK_CACHE_HEADERS,
    },
  })

  return withScreenshotCacheStatus(response, 'FALLBACK')
}

const createImageResponse = (
  image: ScreenshotResult | R2Screenshot,
  storyId: string,
  sourceUrlHash: string,
  cacheStatus: ScreenshotCacheStatus,
  provider?: ScreenshotProviderName,
) => {
  const headers = new Headers({
    'Content-Type': image.contentType,
    'Content-Length': String(image.bytes.byteLength),
    'ETag': `W/"hn42-screenshot-${storyId}-${sourceUrlHash.slice(0, 16)}"`,
    'Accept-Ranges': 'bytes',
    ...(cacheStatus === 'STALE' ? STALE_SCREENSHOT_CACHE_HEADERS : SCREENSHOT_CACHE_HEADERS),
  })

  if ('browserSession' in image && image.browserSession) {
    headers.set('X-HN42-Browser-Session', image.browserSession)
  }

  return withScreenshotCacheStatus(
    new Response(image.bytes, { headers }),
    cacheStatus,
    provider ?? image.provider,
  )
}

const isValidStoryId = (id: unknown): id is string => {
  return typeof id === 'string' && /^\d+$/.test(id)
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

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event)
  const id = params.id

  if (!isValidStoryId(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid story ID is required',
    })
  }

  const cache = globalThis.caches?.default
  const cacheKey = cache ? new Request(getRequestURL(event).toString(), { method: 'GET' }) : undefined
  const cachedResponse = cacheKey ? await cache?.match(cacheKey) : undefined

  if (cachedResponse) {
    return withScreenshotCacheStatus(cachedResponse, 'HIT')
  }

  try {
    const runtimeConfig = useRuntimeConfig(event)
    const env = event.context.cloudflare?.env as ScreenshotEnv | undefined
    const sourceUrl = await resolveStorySourceUrl(id)

    if (!sourceUrl) {
      return createFallbackResponse(id)
    }

    const sourceUrlHash = await getSourceUrlHash(sourceUrl)
    const r2Key = getR2ScreenshotKey(id, sourceUrlHash)
    const r2Screenshot = await readR2Screenshot(
      env,
      r2Key,
      runtimeConfig.screenshotR2TtlDays,
    ).catch((error) => {
      console.warn(`R2 screenshot read failed: ${error instanceof Error ? error.message : String(error)}`)
      return null
    })

    if (r2Screenshot?.isFresh) {
      const response = createImageResponse(
        r2Screenshot,
        id,
        sourceUrlHash,
        'R2',
        r2Screenshot.provider,
      )

      putCacheResponse(event, cache, cacheKey, response)

      return response
    }

    if (hasFreshFallback(id)) {
      if (r2Screenshot) {
        const response = createImageResponse(
          r2Screenshot,
          id,
          sourceUrlHash,
          'STALE',
          r2Screenshot.provider,
        )

        putCacheResponse(event, cache, cacheKey, response)

        return response
      }

      return createFallbackResponse()
    }

    const screenshot = await captureScreenshot(
      sourceUrl,
      runtimeConfig.screenshotProviderOrder,
      {
        env,
        browserConcurrency: runtimeConfig.screenshotBrowserConcurrency,
        browserKeepAliveMs: runtimeConfig.screenshotBrowserKeepAliveMs,
        browserReuseSessions: runtimeConfig.screenshotBrowserReuseSessions,
        backup15Concurrency: runtimeConfig.screenshotFetchConcurrency,
      },
    )

    if (screenshot) {
      runInBackground(
        event,
        writeR2Screenshot(env, r2Key, sourceUrlHash, screenshot).catch((error) => {
          console.warn(`R2 screenshot write failed: ${error instanceof Error ? error.message : String(error)}`)
        }),
      )

      const response = createImageResponse(
        screenshot,
        id,
        sourceUrlHash,
        'MISS',
        screenshot.provider,
      )

      putCacheResponse(event, cache, cacheKey, response)

      return response
    }

    if (r2Screenshot) {
      const response = createImageResponse(
        r2Screenshot,
        id,
        sourceUrlHash,
        'STALE',
        r2Screenshot.provider,
      )

      putCacheResponse(event, cache, cacheKey, response)

      return response
    }

    return createFallbackResponse(id)
  } catch (error) {
    console.warn(`Screenshot route failed: ${error instanceof Error ? error.message : String(error)}`)
    return createFallbackResponse(id)
  }
})
