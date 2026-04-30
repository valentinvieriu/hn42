import { defineEventHandler, getRouterParams, createError, setHeader } from 'h3'
import type { Comment, HNResponse } from '~/types'

type StoryDetail = {
  id: number
  created_at: string
  author: string
  title: string
  url: string
  text: string | null
  points: number
  parent_id: number | null
  children: Comment[]
}

const isValidStoryId = (id: unknown): id is string => {
  return typeof id === 'string' && /^\d+$/.test(id)
}

const getStatusCode = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') {
    return null
  }

  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode
  }

  if ('response' in error && error.response && typeof error.response === 'object') {
    const response = error.response as { status?: unknown }

    if (typeof response.status === 'number') {
      return response.status
    }
  }

  return null
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

  try {
    const hnResponse: HNResponse = await $fetch(`https://hn.algolia.com/api/v1/items/${id}`)

    if (!hnResponse?.id) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Story not found',
      })
    }

    const story: StoryDetail = {
      id: hnResponse.id,
      created_at: hnResponse.created_at,
      author: hnResponse.author,
      title: hnResponse.title || 'Untitled',
      url: hnResponse.url || '',
      text: hnResponse.text,
      points: hnResponse.points || 0,
      parent_id: hnResponse.parent_id,
      children: hnResponse.children || [],
    }

    setHeader(event, 'Cache-Control', 'public, max-age=120, stale-while-revalidate')

    return story
  } catch (error) {
    if (getStatusCode(error) === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Story not found',
      })
    }

    console.error('Error fetching story:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch story',
    })
  }
})
