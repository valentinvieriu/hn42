import { defineEventHandler, getRouterParams, createError, setHeaders } from '#imports'
import { extractKeywords } from '../../utils/keywordExtractor'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event)
  const id = params.id
  console.log('Fetching related stories for story ID:', id);

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
    console.log('Story title:', story.title);

    // Extract keywords from the story title
    const keywords = extractKeywords(story.title)
    console.log('Extracted Keywords:', keywords);
    
    if (keywords.length === 0) {
      throw createError({
        statusCode: 400,
        message: 'No relevant keywords found in the story title'
      })
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

    console.log('Constructed Query:', query);

    // Fetch related stories from Algolia
    const searchUrl = `https://hn.algolia.com/api/v1/search`
    const searchParams = new URLSearchParams({
      query,
      tags: 'story',
      hitsPerPage: '10'
    })
    console.log('Search URL:', `${searchUrl}?${searchParams.toString()}`);
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

    // Set cache headers
    setHeaders(event, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=1800',
      'CDN-Cache-Control': 'public, max-age=3600',
      'Cloudflare-CDN-Cache-Control': 'public, max-age=3600'
    })

    // Return the response
    return relatedStories

  } catch (error) {
    console.error('Error fetching related stories:', error)
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch related stories'
    })
  }
})
