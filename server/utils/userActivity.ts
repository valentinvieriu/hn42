import type { UserActivityPage, UserComment, UserPost } from '#shared/types'
import { getScreenshotPath } from '#shared/utils/screenshot'

const ALGOLIA_SEARCH_BY_DATE_URL = 'https://hn.algolia.com/api/v1/search_by_date'
const ALGOLIA_RESULT_WINDOW = 1000
const DEFAULT_HITS_PER_PAGE = 30
const MAX_HITS_PER_PAGE = 50

type ActivityType = 'comment' | 'story'

type ActivityQueryOptions = {
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
  exhaustiveNbHits?: boolean
}

type AlgoliaStoryHit = {
  objectID?: string
  title?: string | null
  url?: string | null
  author?: string | null
  points?: number | null
  num_comments?: number | null
  created_at?: string | null
  created_at_i?: number | null
  story_text?: string | null
}

type AlgoliaCommentHit = {
  objectID?: string
  author?: string | null
  points?: number | null
  created_at?: string | null
  created_at_i?: number | null
  comment_text?: string | null
  story_id?: number | string | null
  story_title?: string | null
  story_url?: string | null
  parent_id?: number | null
}

export const isValidHNUsername = (username: unknown): username is string => {
  return typeof username === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(username)
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

const getHnItemUrl = (id: string) => `https://news.ycombinator.com/item?id=${id}`

const getNextCursor = (items: Array<{ created_at_i?: number }>) => {
  const timestamps = items
    .map((item) => item.created_at_i)
    .filter((timestamp): timestamp is number => typeof timestamp === 'number' && Number.isFinite(timestamp))

  if (timestamps.length === 0) {
    return null
  }

  return Math.min(...timestamps)
}

const buildActivitySearchParams = (
  username: string,
  activityType: ActivityType,
  options: ActivityQueryOptions,
) => {
  const searchParams = new URLSearchParams({
    tags: `${activityType},author_${username}`,
    hitsPerPage: String(options.hitsPerPage),
    page: String(options.before ? 0 : options.page),
  })

  if (options.before) {
    searchParams.set('numericFilters', `created_at_i<${options.before}`)
  }

  return searchParams
}

const fetchUserActivity = async <THit, TItem extends { created_at_i?: number }>(
  username: string,
  activityType: ActivityType,
  options: ActivityQueryOptions,
  mapHit: (hit: THit) => TItem | null,
): Promise<UserActivityPage<TItem>> => {
  const searchParams = buildActivitySearchParams(username, activityType, options)
  const response = await $fetch<AlgoliaSearchResponse<THit>>(
    `${ALGOLIA_SEARCH_BY_DATE_URL}?${searchParams.toString()}`,
  )

  const items = (response.hits ?? [])
    .map(mapHit)
    .filter((item): item is TItem => Boolean(item))

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
  const nextCursor = getNextCursor(items)
  const hasCursorPage =
    Boolean(nextCursor)
    && (options.before ? items.length === hitsPerPage : nbHits > nextOffset)

  return {
    items,
    page,
    hitsPerPage,
    nbHits,
    nbPages,
    nextPage,
    nextCursor,
    hasMore: Boolean(nextPage || hasCursorPage),
    exhaustiveNbHits: response.exhaustiveNbHits,
  }
}

export const fetchUserPosts = async (
  username: string,
  options: ActivityQueryOptions,
): Promise<UserActivityPage<UserPost>> => {
  return await fetchUserActivity<AlgoliaStoryHit, UserPost>(
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
        author: hit.author || username,
        points: hit.points || 0,
        num_comments: hit.num_comments || 0,
        created_at: hit.created_at || '',
        created_at_i: hit.created_at_i ?? undefined,
        story_text: hit.story_text || null,
        screenshotUrl: getScreenshotPath(objectID),
      }
    },
  )
}

export const fetchUserComments = async (
  username: string,
  options: ActivityQueryOptions,
): Promise<UserActivityPage<UserComment>> => {
  return await fetchUserActivity<AlgoliaCommentHit, UserComment>(
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
        id: Number.parseInt(objectID, 10) || 0,
        objectID,
        author: hit.author || username,
        points: hit.points || 0,
        created_at: hit.created_at || '',
        created_at_i: hit.created_at_i ?? undefined,
        text: hit.comment_text || '',
        story_id: storyId,
        story_title: hit.story_title || 'Untitled story',
        story_url: hit.story_url || (storyId ? getHnItemUrl(storyId) : ''),
        parent_id: hit.parent_id ?? null,
      }
    },
  )
}
