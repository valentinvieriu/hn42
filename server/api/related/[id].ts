import { createError, defineEventHandler, getRouterParams, setHeader, setHeaders, type H3Event } from 'h3'
import { isValidHnItemId } from '#shared/utils/hn'
import { formatServerTiming, type ServerTimingMetric } from '#shared/utils/serverTiming'
import { getErrorStatusCode } from '../../utils/error'
import {
  buildTitleQuery,
  getUrlTerms,
  rankRelatedStories,
  type AlgoliaStoryHit,
  type RelatedSearchKind,
  type RelatedSourceStory,
  type SearchResult,
} from '../../utils/relatedStories'

const ALGOLIA_SEARCH_URL = 'https://hn.algolia.com/api/v1/search'
const ALGOLIA_SEARCH_BY_DATE_URL = 'https://hn.algolia.com/api/v1/search_by_date'
const RELATED_STORY_ATTRIBUTES = 'objectID,title,created_at,created_at_i,points,num_comments,author,url'
const SOURCE_STORY_ATTRIBUTES = 'title,url'

type AlgoliaCommentHit = {
  story_id?: number | string | null
}

type AlgoliaSearchResponse<T> = {
  hits?: T[]
}


const setRelatedCacheHeaders = (event: H3Event) => {
  setHeaders(event, {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=1800',
    'CDN-Cache-Control': 'public, max-age=3600',
    'Cloudflare-CDN-Cache-Control': 'public, max-age=3600'
  })
}

const searchAlgolia = async <T>(params: Record<string, string>, order: 'relevance' | 'date' = 'relevance') => {
  const endpoint = order === 'date' ? ALGOLIA_SEARCH_BY_DATE_URL : ALGOLIA_SEARCH_URL
  const response = await $fetch<AlgoliaSearchResponse<T>>(`${endpoint}?${new URLSearchParams(params)}`)
  return response.hits ?? []
}

const fetchStoryHits = async (
  params: Record<string, string>,
  weight: number,
  kind: RelatedSearchKind,
  order: 'relevance' | 'date' = 'relevance',
): Promise<SearchResult> => {
  try {
    const hits = await searchAlgolia<AlgoliaStoryHit>({
      attributesToRetrieve: RELATED_STORY_ATTRIBUTES,
      ...params,
    }, order)
    return { hits, kind, weight }
  } catch (error) {
    console.warn('Failed to fetch related story candidates:', error)
    return { hits: [], kind, weight }
  }
}

const fetchCommentLinkedStories = async (query: string, excludeId: string): Promise<SearchResult> => {
  try {
    const comments = await searchAlgolia<AlgoliaCommentHit>({
      attributesToRetrieve: 'story_id',
      query,
      tags: 'comment',
      hitsPerPage: '24'
    })

    const rankedStoryIds: string[] = []
    const seen = new Set<string>([excludeId])

    for (const comment of comments) {
      const storyId = comment.story_id ? String(comment.story_id) : ''

      if (!storyId || seen.has(storyId)) continue

      seen.add(storyId)
      rankedStoryIds.push(storyId)

      if (rankedStoryIds.length === 12) break
    }

    if (rankedStoryIds.length === 0) {
      return { hits: [], kind: 'comment', weight: 26 }
    }

    const order = new Map(rankedStoryIds.map((storyId, index) => [storyId, index]))
    const filters = rankedStoryIds.map(storyId => `objectID:${storyId}`).join(' OR ')
    const hits = await searchAlgolia<AlgoliaStoryHit>({
      attributesToRetrieve: RELATED_STORY_ATTRIBUTES,
      tags: 'story',
      filters,
      hitsPerPage: String(rankedStoryIds.length)
    })

    return {
      hits: hits.sort((a, b) => (order.get(a.objectID ?? '') ?? 99) - (order.get(b.objectID ?? '') ?? 99)),
      kind: 'comment',
      weight: 26
    }
  } catch (error) {
    console.warn('Failed to fetch comment-linked related stories:', error)
    return { hits: [], kind: 'comment', weight: 26 }
  }
}

const fetchSourceStory = async (id: string) => {
  const stories = await searchAlgolia<RelatedSourceStory>({
    attributesToRetrieve: SOURCE_STORY_ATTRIBUTES,
    filters: `objectID:${id}`,
    hitsPerPage: '1',
    tags: 'story',
  })

  return stories[0] ?? null
}

export default defineEventHandler(async (event) => {
  const params = getRouterParams(event)
  const id = params.id

  if (!isValidHnItemId(id)) {
    throw createError({
      statusCode: 400,
      message: 'Story ID is required'
    })
  }

  try {
    const sourceItemStartedAt = performance.now()
    const story = await fetchSourceStory(id)
    const sourceItemDuration = performance.now() - sourceItemStartedAt
    
    if (!story || !story.title) {
      throw createError({
        statusCode: 404,
        message: 'Story not found'
      })
    }

    const titleQuery = buildTitleQuery(story.title)
    const optionalTitleWords = titleQuery.split(' ').join(',')
    const urlQuery = getUrlTerms(story.url).join(' ')

    if (!titleQuery && !urlQuery) {
      setRelatedCacheHeaders(event)
      setHeader(event, 'Server-Timing', formatServerTiming([{
        name: 'source-item',
        duration: sourceItemDuration,
        description: 'Algolia source item',
      }]))
      return []
    }

    const searches: Array<Promise<SearchResult>> = []

    if (titleQuery) {
      searches.push(fetchStoryHits({
        query: titleQuery,
        optionalWords: optionalTitleWords,
        tags: 'story',
        restrictSearchableAttributes: 'title',
        hitsPerPage: '24'
      }, 80, 'title'))

      searches.push(fetchStoryHits({
        query: titleQuery,
        optionalWords: optionalTitleWords,
        tags: 'story',
        restrictSearchableAttributes: 'title',
        hitsPerPage: '18'
      }, 62, 'recent-title', 'date'))

      searches.push(fetchStoryHits({
        query: titleQuery,
        tags: 'story',
        hitsPerPage: '18'
      }, 52, 'full-text'))

      searches.push(fetchCommentLinkedStories(titleQuery, id))
    }

    if (urlQuery) {
      searches.push(fetchStoryHits({
        query: urlQuery,
        tags: 'story',
        restrictSearchableAttributes: 'url',
        hitsPerPage: '16'
      }, 28, 'url'))
    }

    const relatedSearchesStartedAt = performance.now()
    const results = await Promise.all(searches)
    const relatedSearchesDuration = performance.now() - relatedSearchesStartedAt
    const relatedRankStartedAt = performance.now()
    const relatedStories = rankRelatedStories(results, story, id)
    const relatedRankDuration = performance.now() - relatedRankStartedAt
    const timingMetrics: ServerTimingMetric[] = [
      {
        name: 'source-item',
        duration: sourceItemDuration,
        description: 'Algolia source item',
      },
      {
        name: 'related-searches',
        duration: relatedSearchesDuration,
        description: 'Concurrent Algolia related searches',
      },
      {
        name: 'related-rank',
        duration: relatedRankDuration,
        description: 'Related-story ranking',
      },
    ]

    setRelatedCacheHeaders(event)
    setHeader(event, 'Server-Timing', formatServerTiming(timingMetrics))

    return relatedStories

  } catch (error: unknown) {
    if (getErrorStatusCode(error) !== null) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: 'Failed to fetch related stories',
      cause: error
    })
  }
})
