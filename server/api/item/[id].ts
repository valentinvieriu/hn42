import {
  createError,
  defineEventHandler,
  getRouterParams,
  setHeader,
  type H3Event,
} from 'h3'
import { defineCachedFunction } from 'nitropack/runtime'
import type { StoryDetail } from '#shared/types'
import { isValidHnItemId } from '#shared/utils/hn'
import { formatServerTiming } from '#shared/utils/serverTiming'
import {
  normalizeStoryDetail,
  type AlgoliaItemResponse,
} from '../../utils/item'
import { getErrorStatusCode } from '../../utils/error'
import {
  getDataCacheStatus,
  isDataCacheEntryValid,
  type TimedData,
} from '../../utils/dataCache'
import {
  isUpstreamUnavailable,
  logUpstreamFailure,
} from '../../utils/upstream'

const ITEM_CACHE_MAX_AGE_SECONDS = 120
const ITEM_CACHE_STALE_MAX_AGE_SECONDS = 600

type CachedStoryDetail = TimedData<StoryDetail | null> & {
  normalizeDuration: number
}

const loadStoryDetail = defineCachedFunction(
  async (_event: H3Event, id: string): Promise<CachedStoryDetail> => {
    const algoliaStartedAt = performance.now()
    const hnResponse = await $fetch<AlgoliaItemResponse>(
      `https://hn.algolia.com/api/v1/items/${id}`,
      { retry: 0 },
    )
    const algoliaDuration = performance.now() - algoliaStartedAt
    const normalizeStartedAt = performance.now()
    const story = hnResponse?.id ? normalizeStoryDetail(hnResponse) : null

    return {
      data: story,
      generatedAt: Date.now(),
      normalizeDuration: performance.now() - normalizeStartedAt,
      upstreamDuration: algoliaDuration,
    }
  },
  {
    getKey: (_event, id) => id,
    group: 'hn/data',
    maxAge: ITEM_CACHE_MAX_AGE_SECONDS,
    name: 'item',
    staleMaxAge: ITEM_CACHE_STALE_MAX_AGE_SECONDS,
    swr: true,
    validate: (entry) => isDataCacheEntryValid(
      entry,
      ITEM_CACHE_MAX_AGE_SECONDS,
      ITEM_CACHE_STALE_MAX_AGE_SECONDS,
    ),
  },
)

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
    const requestStartedAt = Date.now()
    const cacheStartedAt = performance.now()
    const result = await loadStoryDetail(event, id)
    const cacheDuration = performance.now() - cacheStartedAt
    const cacheStatus = getDataCacheStatus(
      requestStartedAt,
      result.generatedAt,
      ITEM_CACHE_MAX_AGE_SECONDS,
    )

    if (!result.data) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Story not found',
      })
    }

    setHeader(
      event,
      'Cache-Control',
      `public, max-age=${ITEM_CACHE_MAX_AGE_SECONDS}, stale-while-revalidate=${ITEM_CACHE_STALE_MAX_AGE_SECONDS}`,
    )
    setHeader(event, 'Server-Timing', formatServerTiming([
      {
        name: 'item-cache',
        duration: cacheDuration,
        description: `Nitro item cache ${cacheStatus}`,
      },
      ...(cacheStatus === 'miss' ? [
        {
          name: 'algolia',
          duration: result.upstreamDuration,
          description: 'Algolia item fetch',
        },
        {
          name: 'normalize',
          duration: result.normalizeDuration,
          description: 'HN Glance story normalization',
        },
      ] : []),
    ]))

    return result.data
  } catch (error) {
    if (getErrorStatusCode(error) === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Story not found',
      })
    }

    const unavailable = isUpstreamUnavailable(error)
    logUpstreamFailure('story-detail', error, { storyId: id })

    if (unavailable) {
      setHeader(event, 'Retry-After', 30)
    }

    throw createError({
      statusCode: unavailable ? 503 : 500,
      statusMessage: unavailable
        ? 'Story data is temporarily unavailable'
        : 'Failed to fetch story',
    })
  }
})
