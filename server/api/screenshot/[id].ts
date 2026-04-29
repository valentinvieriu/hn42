import { defineEventHandler, getRequestURL, getRouterParams, createError } from '#imports'

const SCREENSHOT_CACHE_CONTROL = 'public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400'
const CDN_CACHE_CONTROL = 'public, max-age=604800, stale-while-revalidate=86400'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event)
  const id = params.id
  if (!id) {
    throw createError({
      statusCode: 400,
    })
  }

  try {
    const cache = globalThis.caches?.default
    const cacheKey = cache ? new Request(getRequestURL(event).toString(), { method: 'GET' }) : undefined
    const cachedResponse = cacheKey ? await cache?.match(cacheKey) : undefined

    if (cachedResponse) {
      return cachedResponse
    }

    // Fetch story details from HN Firebase API
    const story = await $fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
    
    if (!story || !story.url) {
      throw createError({
        statusCode: 404,
      })
    }
    // Generate screenshot URL
    const screenshotUrl = `https://backup15.terasp.net/api/screenshot?url=${encodeURIComponent(
      story.url
    )}&resX=1080&resY=1600&outFormat=jpg&waitTime=100&isFullPage=true&dismissModals=true`

    // Fetch the image
    const imageResponse = await fetch(screenshotUrl)
    
    if (!imageResponse.ok || !imageResponse.body) {
      throw createError({
        statusCode: imageResponse.status,
      })
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

    const response = new Response(imageResponse.body, { headers })

    if (cache && cacheKey) {
      event.context.cloudflare?.context.waitUntil(cache.put(cacheKey, response.clone()))
    }
    
    return response
  } catch (error) {
    console.error('Error fetching screenshot:', error)
    throw createError({
      statusCode: 500,
    })
  }
})
