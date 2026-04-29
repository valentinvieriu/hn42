import { defineEventHandler, getRequestURL, getRouterParams, createError, useRuntimeConfig } from '#imports'

const SCREENSHOT_CACHE_CONTROL = 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400'
const CDN_CACHE_CONTROL = 'public, max-age=604800, stale-while-revalidate=86400'
const FALLBACK_CACHE_CONTROL = 'public, max-age=900, s-maxage=900, stale-while-revalidate=3600'
const FALLBACK_MEMORY_TTL_MS = 15 * 60 * 1000
const SCREENSHOT_TIMEOUT_MS = 8000
const DEFAULT_SCREENSHOT_FETCH_CONCURRENCY = 1
const TRANSPARENT_GIF = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255,
  255, 44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 1, 76, 0, 59,
])
const fallbackExpirations = new Map<string, number>()
type ScreenshotQueueTask = {
  release: (releaseSlot: () => void) => void
}

const pendingScreenshotFetches: ScreenshotQueueTask[] = []
let activeScreenshotFetches = 0
let maxScreenshotFetchConcurrency = DEFAULT_SCREENSHOT_FETCH_CONCURRENCY

const normalizeConcurrency = (value: unknown) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_SCREENSHOT_FETCH_CONCURRENCY
  }

  return Math.max(1, Math.floor(parsedValue))
}

const pumpScreenshotQueue = () => {
  while (
    activeScreenshotFetches < maxScreenshotFetchConcurrency
    && pendingScreenshotFetches.length > 0
  ) {
    const task = pendingScreenshotFetches.shift()

    if (!task) {
      continue
    }

    activeScreenshotFetches += 1

    task.release(() => {
      activeScreenshotFetches = Math.max(0, activeScreenshotFetches - 1)
      pumpScreenshotQueue()
    })
  }
}

const acquireScreenshotFetchSlot = async (concurrency: unknown) => {
  maxScreenshotFetchConcurrency = normalizeConcurrency(concurrency)

  return new Promise<() => void>((resolve) => {
    pendingScreenshotFetches.push({
      release: (releaseSlot) => {
        let hasReleased = false

        resolve(() => {
          if (hasReleased) {
            return
          }

          hasReleased = true
          releaseSlot()
        })
      },
    })
    pumpScreenshotQueue()
  })
}

const releaseOnStreamEnd = (body: ReadableStream<Uint8Array>, release: () => void) => {
  const reader = body.getReader()

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()

        if (done) {
          release()
          controller.close()
          return
        }

        controller.enqueue(value)
      } catch (error) {
        release()
        controller.error(error)
      }
    },
    cancel(reason) {
      release()
      return reader.cancel(reason)
    },
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

const createFallbackResponse = async (
  event: any,
  cache?: Cache,
  cacheKey?: Request,
  id?: string,
) => {
  if (id) {
    fallbackExpirations.set(id, Date.now() + FALLBACK_MEMORY_TTL_MS)
  }

  const response = new Response(TRANSPARENT_GIF, {
    headers: {
      'Content-Type': 'image/gif',
      'Content-Length': String(TRANSPARENT_GIF.byteLength),
      'Cache-Control': FALLBACK_CACHE_CONTROL,
      'CDN-Cache-Control': FALLBACK_CACHE_CONTROL,
      'Cloudflare-CDN-Cache-Control': FALLBACK_CACHE_CONTROL,
      'X-HN42-Screenshot-Fallback': '1',
    },
  })

  if (cache && cacheKey) {
    event.context.cloudflare?.context.waitUntil(cache.put(cacheKey, response.clone()))
  }

  return response
}

const fetchWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event)
  const id = params.id
  if (!id) {
    throw createError({
      statusCode: 400,
    })
  }

  let releaseScreenshotFetchSlot: (() => void) | null = null

  try {
    const cache = globalThis.caches?.default
    const cacheKey = cache ? new Request(getRequestURL(event).toString(), { method: 'GET' }) : undefined
    const cachedResponse = cacheKey ? await cache?.match(cacheKey) : undefined

    if (cachedResponse) {
      return cachedResponse
    }

    if (hasFreshFallback(id)) {
      return createFallbackResponse(event, cache, cacheKey)
    }

    // Fetch story details from HN Firebase API
    const story = await $fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
    
    if (!story || !story.url) {
      return createFallbackResponse(event, cache, cacheKey, id)
    }
    // Generate screenshot URL
    const screenshotUrl = `https://backup15.terasp.net/api/screenshot?url=${encodeURIComponent(
      story.url
    )}&resX=1080&resY=1600&outFormat=jpg&waitTime=100&isFullPage=true&dismissModals=true`

    const runtimeConfig = useRuntimeConfig(event)
    releaseScreenshotFetchSlot = await acquireScreenshotFetchSlot(
      runtimeConfig.screenshotFetchConcurrency,
    )

    // Fetch the image through a small in-memory queue so one Worker isolate does
    // not fan out many screenshot-generation requests at once.
    const imageResponse = await fetchWithTimeout(screenshotUrl, SCREENSHOT_TIMEOUT_MS)
    
    if (!imageResponse.ok || !imageResponse.body) {
      releaseScreenshotFetchSlot()
      releaseScreenshotFetchSlot = null
      return createFallbackResponse(event, cache, cacheKey, id)
    }

    const headers = new Headers({
      'Content-Type': imageResponse.headers.get('Content-Type') || 'image/jpeg',
      'Cache-Control': SCREENSHOT_CACHE_CONTROL,
      'CDN-Cache-Control': CDN_CACHE_CONTROL,
      'Cloudflare-CDN-Cache-Control': CDN_CACHE_CONTROL,
      'Vary': 'Accept-Encoding',
    })
    const contentLength = imageResponse.headers.get('Content-Length')

    if (contentLength) {
      headers.set('Content-Length', contentLength)
    }

    const response = new Response(
      releaseOnStreamEnd(imageResponse.body, () => {
        releaseScreenshotFetchSlot?.()
        releaseScreenshotFetchSlot = null
      }),
      { headers },
    )

    if (cache && cacheKey) {
      event.context.cloudflare?.context.waitUntil(cache.put(cacheKey, response.clone()))
    }
    
    return response
  } catch {
    releaseScreenshotFetchSlot?.()
    return createFallbackResponse(event, undefined, undefined, id)
  }
})
