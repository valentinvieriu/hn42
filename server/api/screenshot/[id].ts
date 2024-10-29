import { defineEventHandler, getRouterParams, createError } from '#imports'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event)
  const id = params.id

  if (!id) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Story ID is required'
    })
  }

  try {
    // Fetch story details from HN Firebase API
    const story = await $fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
    
    if (!story || !story.url) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Story not found or has no URL'
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
        statusMessage: 'Failed to fetch image'
      })
    }

    // Get the full image buffer
    const arrayBuffer = await imageResponse.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Set appropriate headers for image response
    event.node.res.setHeader('Content-Type', imageResponse.headers.get('Content-Type') || 'image/jpeg')
    event.node.res.setHeader('Cache-Control', 'public, max-age=31536000, immutable') // Cache for 1 year
    event.node.res.setHeader('Content-Length', buffer.length)
    
    // Return the buffer directly
    return buffer
  } catch (error) {
    console.error('Error fetching screenshot:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch screenshot'
    })
  }
})
