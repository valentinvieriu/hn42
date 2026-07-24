import { defineEventHandler, getRouterParams, createError, setHeader } from 'h3'
import { isValidHnItemId } from '#shared/utils/hn'
import { formatServerTiming } from '#shared/utils/serverTiming'
import { fetchAlgoliaItem } from '../../utils/algolia'
import {
  normalizeStoryDetail,
  type AlgoliaItemResponse,
} from '../../utils/item'
import { getErrorStatusCode } from '../../utils/error'

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event)
  const id = params.id

  if (!isValidHnItemId(id)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid story ID is required',
    })
  }

  try {
    const algoliaStartedAt = performance.now()
    const hnResponse = await fetchAlgoliaItem<AlgoliaItemResponse>(id)
    const algoliaDuration = performance.now() - algoliaStartedAt

    if (!hnResponse?.id) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Story not found',
      })
    }

    const normalizeStartedAt = performance.now()
    const story = normalizeStoryDetail(hnResponse)
    const normalizeDuration = performance.now() - normalizeStartedAt

    setHeader(event, 'Cache-Control', 'public, max-age=120, stale-while-revalidate=600')
    setHeader(event, 'Server-Timing', formatServerTiming([
      {
        name: 'algolia',
        duration: algoliaDuration,
        description: 'Algolia item fetch',
      },
      {
        name: 'normalize',
        duration: normalizeDuration,
        description: 'HN Glance story normalization',
      },
    ]))

    return story
  } catch (error) {
    if (getErrorStatusCode(error) === 404) {
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
