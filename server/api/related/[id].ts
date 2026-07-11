import { createError, defineEventHandler, getRouterParams, setHeaders, type H3Event } from 'h3'

const ALGOLIA_SEARCH_URL = 'https://hn.algolia.com/api/v1/search'
const ALGOLIA_ITEMS_URL = 'https://hn.algolia.com/api/v1/items'
const MAX_RELATED_STORIES = 10

type AlgoliaItem = {
  id?: number
  title?: string | null
  url?: string | null
  text?: string | null
}

type AlgoliaStoryHit = {
  objectID?: string
  title?: string | null
  points?: number | null
  num_comments?: number | null
  author?: string | null
  url?: string | null
}

type AlgoliaCommentHit = {
  story_id?: number | string | null
  story_title?: string | null
  story_url?: string | null
}

type AlgoliaSearchResponse<T> = {
  hits?: T[]
}

type RelatedStory = {
  title: string
  objectID: string
  points: number
  num_comments: number
  author: string
  url: string
}

type ScoredStory = RelatedStory & {
  score: number
}

type SearchResult = {
  hits: AlgoliaStoryHit[]
  weight: number
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'how', 'i', 'in', 'into', 'is', 'it', 'its', 'new', 'of', 'on',
  'or', 'our', 'over', 'show', 'that', 'the', 'their', 'this', 'to',
  'using', 'was', 'we', 'what', 'when', 'where', 'which', 'why',
  'with', 'you', 'your', 'hn', 'pdf', 'video', 'write', 'writing',
  'written', 'build', 'building', 'built', 'make', 'making', 'made',
  'create', 'creating', 'created', 'intro', 'introduction', 'guide',
  'law', 'laws', 'rule', 'rules'
])

const SHORT_TECH_TERMS = new Set([
  'ai', 'ar', 'c#', 'c++', 'db', 'go', 'js', 'llm', 'ml',
  'os', 'ts', 'ui', 'ux', 'vm', 'vr'
])

const GENERIC_HOST_TERMS = new Set([
  'github', 'gitlab', 'medium', 'substack', 'youtube', 'youtu',
  'twitter', 'x', 'reddit', 'wikipedia', 'arxiv', 'archive',
  'google', 'docs', 'drive', 'dropbox'
])

const HOST_NOISE_TERMS = new Set([
  'www', 'm', 'mobile', 'amp', 'blog', 'blogs', 'news', 'docs',
  'developer', 'developers', 'www2', 'com', 'net', 'org', 'io',
  'dev', 'app', 'co', 'ai', 'edu', 'gov'
])

const setRelatedCacheHeaders = (event: H3Event) => {
  setHeaders(event, {
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=3600, stale-while-revalidate=1800',
    'CDN-Cache-Control': 'public, max-age=3600',
    'Cloudflare-CDN-Cache-Control': 'public, max-age=3600'
  })
}

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, ' ')

const cleanTitle = (title: string) => title
  .replace(/^\s*(ask|launch|show|tell)\s+hn:\s*/i, '')
  .replace(/\s*\[(pdf|video|audio|slides?)\]\s*$/i, '')
  .replace(/\s*\((\d{4}|pdf|video|audio|slides?)\)\s*$/i, '')
  .replace(/\s+/g, ' ')
  .trim()

const tokenize = (value: string, maxTokens = 12): string[] => {
  const words = stripHtml(value)
    .toLowerCase()
    .replace(/&[#a-z0-9]+;/g, ' ')
    .match(/[a-z0-9][a-z0-9+#.-]*/g) ?? []

  const tokens: string[] = []
  const seen = new Set<string>()

  for (const word of words) {
    const token = word.replace(/^[.-]+|[.-]+$/g, '')

    if (!token) continue
    if (STOPWORDS.has(token)) continue
    if (token.length < 3 && !SHORT_TECH_TERMS.has(token)) continue
    if (seen.has(token)) continue

    seen.add(token)
    tokens.push(token)

    if (tokens.length === maxTokens) break
  }

  return tokens
}

const buildTitleQuery = (title: string) => {
  const tokens = tokenize(cleanTitle(title), 6)
  return tokens.length > 0 ? tokens.join(' ') : cleanTitle(title)
}

const normalizeHost = (url?: string | null) => {
  if (!url) return ''

  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '')
  } catch {
    return ''
  }
}

const canonicalizeUrl = (value?: string | null) => {
  if (!value) return ''

  try {
    const url = new URL(value)
    url.hash = ''

    for (const key of Array.from(url.searchParams.keys())) {
      if (key.startsWith('utm_') || ['fbclid', 'gclid', 'ref', 'source'].includes(key)) {
        url.searchParams.delete(key)
      }
    }

    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    const pathname = url.pathname.replace(/\/+$/, '')
    const search = url.searchParams.toString()

    return `${host}${pathname}${search ? `?${search}` : ''}`
  } catch {
    return value
  }
}

const getUrlTerms = (value?: string | null) => {
  if (!value) return []

  try {
    const url = new URL(value)
    const hostTerms = url.hostname
      .toLowerCase()
      .replace(/^www\./, '')
      .split('.')
      .filter(term => term && !HOST_NOISE_TERMS.has(term))

    const specificHostTerms = hostTerms.filter(term => !GENERIC_HOST_TERMS.has(term))
    if (specificHostTerms.length > 0) {
      return specificHostTerms.slice(0, 2)
    }

    return tokenize(url.pathname.replace(/[/-]/g, ' '), 5)
  } catch {
    return []
  }
}

const searchAlgolia = async <T>(params: Record<string, string>) => {
  const response = await $fetch<AlgoliaSearchResponse<T>>(`${ALGOLIA_SEARCH_URL}?${new URLSearchParams(params)}`)
  return response.hits ?? []
}

const fetchStoryHits = async (params: Record<string, string>, weight: number): Promise<SearchResult> => {
  try {
    const hits = await searchAlgolia<AlgoliaStoryHit>(params)
    return { hits, weight }
  } catch (error) {
    console.warn('Failed to fetch related story candidates:', error)
    return { hits: [], weight }
  }
}

const fetchCommentLinkedStories = async (query: string, excludeId: string): Promise<SearchResult> => {
  try {
    const comments = await searchAlgolia<AlgoliaCommentHit>({
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
      return { hits: [], weight: 26 }
    }

    const order = new Map(rankedStoryIds.map((storyId, index) => [storyId, index]))
    const filters = rankedStoryIds.map(storyId => `objectID:${storyId}`).join(' OR ')
    const hits = await searchAlgolia<AlgoliaStoryHit>({
      tags: 'story',
      filters,
      hitsPerPage: String(rankedStoryIds.length)
    })

    return {
      hits: hits.sort((a, b) => (order.get(a.objectID ?? '') ?? 99) - (order.get(b.objectID ?? '') ?? 99)),
      weight: 26
    }
  } catch (error) {
    console.warn('Failed to fetch comment-linked related stories:', error)
    return { hits: [], weight: 26 }
  }
}

const getOverlapScore = (sourceTokens: string[], candidateTitle: string) => {
  const candidateTokens = new Set(tokenize(candidateTitle, 12))
  const overlap = sourceTokens.filter(token => candidateTokens.has(token)).length

  if (overlap === 0) return 0

  return overlap * 8 + (overlap > 1 ? 10 : 0)
}

const getPopularityScore = (hit: AlgoliaStoryHit) => {
  const points = Math.max(hit.points ?? 0, 0)
  const comments = Math.max(hit.num_comments ?? 0, 0)

  return Math.min(16, Math.log10(points + 1) * 6) + Math.min(8, Math.log10(comments + 1) * 4)
}

const toRelatedStory = (hit: AlgoliaStoryHit): RelatedStory | null => {
  if (!hit.objectID || !hit.title) return null

  return {
    title: hit.title,
    objectID: hit.objectID,
    points: hit.points ?? 0,
    num_comments: hit.num_comments ?? 0,
    author: hit.author ?? 'Unknown',
    url: hit.url ?? ''
  }
}

const rankRelatedStories = (results: SearchResult[], source: AlgoliaItem, excludeId: string) => {
  const sourceTokens = tokenize(cleanTitle(source.title ?? ''), 12)
  const sourceHost = normalizeHost(source.url)
  const sourceUrl = canonicalizeUrl(source.url)
  const candidates = new Map<string, ScoredStory>()

  for (const result of results) {
    result.hits.forEach((hit, index) => {
      const story = toRelatedStory(hit)

      if (!story) return
      if (story.objectID === excludeId) return
      if (sourceUrl && canonicalizeUrl(story.url) === sourceUrl) return

      const existing = candidates.get(story.objectID)
      const candidateHost = normalizeHost(story.url)
      const sameHostScore = sourceHost && candidateHost === sourceHost ? 16 : 0
      const score = result.weight
        - index
        + getOverlapScore(sourceTokens, story.title)
        + sameHostScore
        + getPopularityScore(hit)

      if (existing) {
        existing.score += score
      } else {
        candidates.set(story.objectID, { ...story, score })
      }
    })
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RELATED_STORIES)
    .map(({ score, ...story }) => story)
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
    const story = await $fetch<AlgoliaItem>(`${ALGOLIA_ITEMS_URL}/${id}`)
    
    if (!story || !story.title) {
      throw createError({
        statusCode: 404,
        message: 'Story not found'
      })
    }

    const titleQuery = buildTitleQuery(story.title)
    const urlQuery = getUrlTerms(story.url).join(' ')

    if (!titleQuery && !urlQuery) {
      setRelatedCacheHeaders(event)
      return []
    }

    const searches: Array<Promise<SearchResult>> = []

    if (titleQuery) {
      searches.push(fetchStoryHits({
        query: titleQuery,
        tags: 'story',
        restrictSearchableAttributes: 'title',
        hitsPerPage: '24'
      }, 80))

      searches.push(fetchStoryHits({
        query: titleQuery,
        tags: 'story',
        hitsPerPage: '18'
      }, 52))

      searches.push(fetchCommentLinkedStories(titleQuery, id))
    }

    if (urlQuery) {
      searches.push(fetchStoryHits({
        query: urlQuery,
        tags: 'story',
        restrictSearchableAttributes: 'url',
        hitsPerPage: '16'
      }, 28))
    }

    const results = await Promise.all(searches)
    const relatedStories = rankRelatedStories(results, story, id)

    setRelatedCacheHeaders(event)

    return relatedStories

  } catch (error: any) {
    if (error?.statusCode) {
      throw error
    }

    throw createError({
      statusCode: 500,
      message: 'Failed to fetch related stories',
      cause: error
    })
  }
})
