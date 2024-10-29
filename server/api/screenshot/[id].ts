import { defineEventHandler, getRouterParams, createError } from '#imports'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event)
  const id = params.id
  if (!id) {
    throw createError({
      statusCode: 400,
    })
  }

  try {
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
    console.log(screenshotUrl);
    const imageResponse = await fetch(screenshotUrl)
    
    if (!imageResponse.ok || !imageResponse.body) {
      throw createError({
        statusCode: imageResponse.status,
      })
    }

    // Get the full image buffer
    const arrayBuffer = await imageResponse.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Set appropriate headers for image response
    event.node.res.setHeader('Content-Type', imageResponse.headers.get('Content-Type') || 'image/jpeg')
    event.node.res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400') // Cache for 1 week, stale for 1 day
    event.node.res.setHeader('CDN-Cache-Control', 'public, max-age=604800')
    event.node.res.setHeader('Cloudflare-CDN-Cache-Control', 'public, max-age=604800')
    event.node.res.setHeader('Content-Length', buffer.length)
    event.node.res.setHeader('Vary', 'Accept-Encoding')
    
    // Return the buffer directly
    return buffer
  } catch (error) {
    console.error('Error fetching screenshot:', error)
    throw createError({
      statusCode: 500,
    })
  }
})
