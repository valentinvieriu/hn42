import type { UserActivityPage, UserComment, UserPost } from '#shared/types'
import { getHnItemUrl } from '../../shared/utils/hn'

const ALGOLIA_SEARCH_BY_DATE_URL = 'https://hn.algolia.com/api/v1/search_by_date'
const ALGOLIA_RESULT_WINDOW = 1000
const DEFAULT_HITS_PER_PAGE = 30
const MAX_HITS_PER_PAGE = 50

type ActivityType = 'comment' | 'story'

export type ActivityQueryOptions = {
  page: number
  hitsPerPage: number
  before?: number | null
}

type AlgoliaSearchResponse<T> = {
  hits?: T[]
  page?: number
  hitsPerPage?: number
  nbHits?: number
  nbPages?: number
}

type AlgoliaStoryHit = {
  objectID?: string
  title?: string | null
  url?: string | null
  points?: number | null
  num_comments?: number | null
  created_at?: string | null
  created_at_i?: number | null
}

type AlgoliaCommentHit = {
  objectID?: string
  points?: number | null
  created_at?: string | null
  created_at_i?: number | null
  comment_text?: string | null
  story_id?: number | string | null
  story_title?: string | null
  story_url?: string | null
}

type ActivityHit = {
  created_at_i?: number | null
}

const ACTIVITY_ATTRIBUTES: Record<ActivityType, string> = {
  comment: 'objectID,points,created_at,created_at_i,comment_text,story_id,story_title,story_url',
  story: 'objectID,title,url,points,num_comments,created_at,created_at_i',
}

const firstQueryValue = (value: unknown) => {
  return Array.isArray(value) ? value[0] : value
}

const toBoundedInteger = (value: unknown, fallback: number, min: number, max: number) => {
  const rawValue = firstQueryValue(value)
  const parsedValue = typeof rawValue === 'string' ? Number.parseInt(rawValue, 10) : Number(rawValue)

  if (!Number.isFinite(parsedValue)) {
    return fallback
  }

  return Math.min(max, Math.max(min, Math.floor(parsedValue)))
}

export const normalizeActivityPage = (value: unknown) => {
  return toBoundedInteger(value, 0, 0, 1000)
}

export const normalizeActivityHitsPerPage = (value: unknown) => {
  return toBoundedInteger(value, DEFAULT_HITS_PER_PAGE, 1, MAX_HITS_PER_PAGE)
}

export const normalizeActivityBefore = (value: unknown) => {
  const rawValue = firstQueryValue(value)

  if (typeof rawValue !== 'string' || rawValue.trim() === '') {
    return null
  }

  const parsedValue = Number.parseInt(rawValue, 10)

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null
}

const buildActivitySearchParams = (
  username: string,
  activityType: ActivityType,
  options: ActivityQueryOptions,
) => {
  const searchParams = new URLSearchParams({
    attributesToRetrieve: ACTIVITY_ATTRIBUTES[activityType],
    tags: `${activityType},author_${username}`,
    hitsPerPage: String(options.hitsPerPage),
    page: String(options.before ? 0 : options.page),
  })

  if (options.before) {
    searchParams.set('numericFilters', `created_at_i<${options.before}`)
  }

  return searchParams
}

const fetchUserActivity = async <THit extends ActivityHit, TItem>(
  username: string,
  activityType: ActivityType,
  options: ActivityQueryOptions,
  mapHit: (hit: THit) => TItem | null,
): Promise<UserActivityPage<TItem>> => {
  const searchParams = buildActivitySearchParams(username, activityType, options)
  const response = await $fetch<AlgoliaSearchResponse<THit>>(
    `${ALGOLIA_SEARCH_BY_DATE_URL}?${searchParams.toString()}`,
  )

  const items: TItem[] = []
  let nextCursor: number | null = null

  for (const hit of response.hits ?? []) {
    const item = mapHit(hit)

    if (item === null) {
      continue
    }

    items.push(item)

    if (typeof hit.created_at_i === 'number' && Number.isFinite(hit.created_at_i)) {
      nextCursor = nextCursor === null
        ? hit.created_at_i
        : Math.min(nextCursor, hit.created_at_i)
    }
  }

  const page = response.page ?? options.page
  const hitsPerPage = response.hitsPerPage ?? options.hitsPerPage
  const nbPages = response.nbPages ?? 0
  const nbHits = response.nbHits ?? items.length
  const nextOffset = (page + 1) * hitsPerPage
  const nextPage = !options.before
    && items.length > 0
    && nextOffset < ALGOLIA_RESULT_WINDOW
    && page + 1 < nbPages
    ? page + 1
    : null
  const hasCursorPage =
    Boolean(nextCursor)
    && (options.before ? items.length === hitsPerPage : nbHits > nextOffset)

  return {
    items,
    nbHits,
    nextPage,
    nextCursor,
    hasMore: Boolean(nextPage || hasCursorPage),
  }
}

export const fetchUserPosts = (
  username: string,
  options: ActivityQueryOptions,
): Promise<UserActivityPage<UserPost>> => {
  return fetchUserActivity<AlgoliaStoryHit, UserPost>(
    username,
    'story',
    options,
    (hit) => {
      const objectID = hit.objectID

      if (!objectID) {
        return null
      }

      return {
        objectID,
        title: hit.title || 'Untitled',
        url: hit.url || getHnItemUrl(objectID),
        author: username,
        points: hit.points || 0,
        num_comments: hit.num_comments || 0,
        created_at: hit.created_at || '',
      }
    },
  )
}

export const fetchUserComments = (
  username: string,
  options: ActivityQueryOptions,
): Promise<UserActivityPage<UserComment>> => {
  return fetchUserActivity<AlgoliaCommentHit, UserComment>(
    username,
    'comment',
    options,
    (hit) => {
      const objectID = hit.objectID

      if (!objectID) {
        return null
      }

      const storyId = hit.story_id ? String(hit.story_id) : ''

      return {
        objectID,
        points: hit.points || 0,
        created_at: hit.created_at || '',
        text: hit.comment_text || '',
        story_id: storyId,
        story_title: hit.story_title || 'Untitled story',
        story_url: hit.story_url || (storyId ? getHnItemUrl(storyId) : ''),
      }
    },
  )
}
