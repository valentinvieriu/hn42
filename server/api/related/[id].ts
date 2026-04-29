import { defineEventHandler, getRouterParams, createError, setHeaders } from '#imports'
import type { H3Event } from 'h3'
import { extractKeywords } from '../../utils/keywordExtractor'

const setRelatedCacheHeaders = (event: H3Event) => {
  setHeaders(event, {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=1800',
    'CDN-Cache-Control': 'public, max-age=3600',
    'Cloudflare-CDN-Cache-Control': 'public, max-age=3600'
  })
}

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event)
  const id = params.id

  if (!id) {
    throw createError({
      statusCode: 400,
      message: 'Story ID is required'
    })
  }

  try {
    // Fetch original story first to get its title
    const story = await $fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)
    
    if (!story || !story.title) {
      throw createError({
        statusCode: 404,
        message: 'Story not found'
      })
    }

    // Extract keywords from the story title
    const keywords = extractKeywords(story.title)
    
    if (keywords.length === 0) {
      setRelatedCacheHeaders(event)
      return []
    }

    // Construct search query with keywords
    const singleWords = keywords.filter(word => !word.includes(' '))
    const phrases = keywords.filter(word => word.includes(' '))

    let query = ''
    if (singleWords.length > 0) {
      query += `(${singleWords.map(word => `"${word}"`).join(' OR ')})`
    }
    if (phrases.length > 0) {
      if (query) query += ' AND '
      query += `(${phrases.map(phrase => `"${phrase}"`).join(' OR ')})`
    }

    // Fetch related stories from Algolia
    const searchUrl = `https://hn.algolia.com/api/v1/search`
    const searchParams = new URLSearchParams({
      query,
      tags: 'story',
      hitsPerPage: '10'
    })
    const response = await $fetch(`${searchUrl}?${searchParams.toString()}`)
    
    // Filter out the current story and format the response
    const relatedStories = response.hits
      .filter(hit => hit.objectID !== id)
      .map(hit => ({
        title: hit.title,
        objectID: hit.objectID,
        points: hit.points,
        num_comments: hit.num_comments,
        author: hit.author,
        url: hit.url
      }))
      .slice(0, 10)

    setRelatedCacheHeaders(event)

    // Return the response
    return relatedStories

  } catch (error) {
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch related stories'
    })
  }
})
