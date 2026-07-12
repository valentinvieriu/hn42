import { createError, defineEventHandler, setHeaders } from 'h3'
import { formatServerTiming } from '#shared/utils/serverTiming'
import { fetchStories } from './fetchStories'

const ALGOLIA_SEARCH_URL = 'https://hn.algolia.com/api/v1/search'
const FIREBASE_API_URL = 'https://hacker-news.firebaseio.com/v0'
const MAX_ITEMS = 100

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

export const createFeedHandler = (feed: FeedName) => defineEventHandler(async (event) => {
  try {
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

    setHeaders(event, {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=120, stale-while-revalidate=600',
      'Server-Timing': formatServerTiming([
        {
          name: 'firebase-ids',
          duration: firebaseIdsDuration,
          description: 'HN Firebase feed IDs',
        },
        {
          name: 'algolia-stories',
          duration: algoliaStoriesDuration,
          description: 'Algolia story hydration',
        },
        {
          name: 'feed-order',
          duration: feedOrderDuration,
          description: 'HN source-order restore',
        },
      ]),
    })

    return stories
  } catch (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch stories',
      cause: error,
    })
  }
})
