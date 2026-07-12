import { createError, defineEventHandler, setHeaders, type H3Event } from 'h3'
import { defineCachedFunction } from 'nitropack/runtime'
import { formatServerTiming } from '#shared/utils/serverTiming'
import { fetchStories } from './fetchStories'

const ALGOLIA_SEARCH_URL = 'https://hn.algolia.com/api/v1/search'
const FIREBASE_API_URL = 'https://hacker-news.firebaseio.com/v0'
const MAX_ITEMS = 100
const FEED_CACHE_MAX_AGE_SECONDS = 120
const FEED_CACHE_STALE_MAX_AGE_SECONDS = 600

type FeedName = 'best' | 'new' | 'show' | 'top'

const firebaseFeedPaths: Record<FeedName, string> = {
  best: 'beststories',
  new: 'newstories',
  show: 'showstories',
  top: 'topstories',
}

const isStoryIdList = (value: unknown): value is number[] => {
  return Array.isArray(value) && value.every((id) => Number.isSafeInteger(id) && id > 0)
}

const createCachedFeedLoader = (feed: FeedName) => defineCachedFunction(
  async (_event: H3Event) => {
    const feedPath = firebaseFeedPaths[feed]
    const firebaseIdsStartedAt = performance.now()
    const storyIdsResponse = await $fetch<unknown>(`${FIREBASE_API_URL}/${feedPath}.json`)
    const firebaseIdsDuration = performance.now() - firebaseIdsStartedAt

    if (!isStoryIdList(storyIdsResponse)) {
      throw new Error(`Unexpected ${feed} feed response`)
    }

    const storyIds = storyIdsResponse.slice(0, MAX_ITEMS)
    const order = new Map(storyIds.map((id, index) => [String(id), index]))
    const algoliaStoriesStartedAt = performance.now()
    const stories = await fetchStories(ALGOLIA_SEARCH_URL, {
      tags: feed === 'show' ? 'show_hn,story' : 'story',
      filters: storyIds.map((id) => `objectID:${id}`).join(' OR '),
      hitsPerPage: String(MAX_ITEMS),
    })
    const algoliaStoriesDuration = performance.now() - algoliaStoriesStartedAt

    const feedOrderStartedAt = performance.now()
    stories.sort((a, b) => {
      return (order.get(a.objectID) ?? MAX_ITEMS) - (order.get(b.objectID) ?? MAX_ITEMS)
    })
    const feedOrderDuration = performance.now() - feedOrderStartedAt

    return {
      generatedAt: Date.now(),
      stories,
      timings: {
        algoliaStoriesDuration,
        feedOrderDuration,
        firebaseIdsDuration,
      },
    }
  },
  {
    getKey: () => feed,
    group: 'hn42/feed',
    maxAge: FEED_CACHE_MAX_AGE_SECONDS,
    name: feed,
    staleMaxAge: FEED_CACHE_STALE_MAX_AGE_SECONDS,
    swr: true,
    validate: (entry) => {
      if (entry.value === undefined || entry.mtime === undefined) {
        return false
      }

      const maxStaleAgeMs = (
        FEED_CACHE_MAX_AGE_SECONDS
        + FEED_CACHE_STALE_MAX_AGE_SECONDS
      ) * 1000

      return Date.now() - entry.mtime <= maxStaleAgeMs
    },
  },
)

export const createFeedHandler = (feed: FeedName) => {
  const loadFeed = createCachedFeedLoader(feed)

  return defineEventHandler(async (event) => {
    try {
      const requestStartedAt = Date.now()
      const cacheStartedAt = performance.now()
      const result = await loadFeed(event)
      const cacheDuration = performance.now() - cacheStartedAt
      const cacheAgeMs = Math.max(0, requestStartedAt - result.generatedAt)
      const cacheStatus = result.generatedAt >= requestStartedAt
        ? 'miss'
        : cacheAgeMs > FEED_CACHE_MAX_AGE_SECONDS * 1000
          ? 'stale'
          : 'hit'

      setHeaders(event, {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${FEED_CACHE_MAX_AGE_SECONDS}, stale-while-revalidate=${FEED_CACHE_STALE_MAX_AGE_SECONDS}`,
        'Server-Timing': formatServerTiming([
          {
            name: 'feed-cache',
            duration: cacheDuration,
            description: `Nitro feed cache ${cacheStatus}`,
          },
          ...(cacheStatus === 'miss' ? [
            {
              name: 'firebase-ids',
              duration: result.timings.firebaseIdsDuration,
              description: 'HN Firebase feed IDs',
            },
            {
              name: 'algolia-stories',
              duration: result.timings.algoliaStoriesDuration,
              description: 'Algolia story hydration',
            },
            {
              name: 'feed-order',
              duration: result.timings.feedOrderDuration,
              description: 'HN source-order restore',
            },
          ] : []),
        ]),
      })

      return result.stories
    } catch (error) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Failed to fetch stories',
        cause: error,
      })
    }
  })
}
