import type { RelatedStory } from '../../shared/types'

const MAX_RELATED_STORIES = 10

export type RelatedSourceStory = {
  title?: string | null
  url?: string | null
}

export type AlgoliaStoryHit = {
  objectID?: string
  title?: string | null
  created_at?: string | null
  created_at_i?: number | null
  points?: number | null
  num_comments?: number | null
  author?: string | null
  url?: string | null
}

type RelatedStoryCandidate = RelatedStory & {
  url: string
  created_at_i: number
}

export type RelatedSearchKind = 'title' | 'recent-title' | 'full-text' | 'comment' | 'url'

export type SearchResult = {
  hits: AlgoliaStoryHit[]
  kind: RelatedSearchKind
  weight: number
}

type CandidateEvidence = RelatedStoryCandidate & {
  evidence: Set<RelatedSearchKind>
  retrievalScores: Map<RelatedSearchKind, number>
}

const STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
  'against', 'how', 'i', 'in', 'into', 'is', 'it', 'its', 'new', 'of', 'on',
  'or', 'our', 'over', 'show', 'that', 'the', 'their', 'this', 'to',
  'using', 'was', 'we', 'what', 'when', 'where', 'which', 'why',
  'with', 'you', 'your', 'hn', 'pdf', 'video', 'write', 'writing',
  'written', 'build', 'building', 'built', 'make', 'making', 'made',
  'create', 'creating', 'created', 'intro', 'introduction', 'guide',
  'law', 'laws', 'predecessor', 'rule', 'rules', 'successor', 'versus', 'via', 'vs'
])

const SHORT_TECH_TERMS = new Set([
  'ai', 'ar', 'c#', 'c++', 'db', 'go', 'js', 'llm', 'ml',
  'os', 'ts', 'ui', 'ux', 'vm', 'vr'
])

const GENERIC_TOPIC_TERMS = new Set([
  'amazon', 'api', 'apis', 'app', 'apps', 'apple', 'benchmark',
  'benchmarked', 'data', 'google', 'launch', 'launched', 'meta',
  'microsoft', 'openai', 'release', 'released', 'software', 'system',
  'tool', 'tools', 'update', 'updated'
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

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, ' ')

const cleanTitle = (title: string) => title
  .replace(/^\s*(ask|launch|show|tell)\s+hn:\s*/i, '')
  .replace(/\s*\[(pdf|video|audio|slides?)\]\s*$/i, '')
  .replace(/\s*\((\d{4}|pdf|video|audio|slides?)\)\s*$/i, '')
  .replace(/\s+/g, ' ')
  .trim()

const tokenize = (value: string, maxTokens = 12): string[] => {
  const words = stripHtml(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
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

export const buildTitleQuery = (title: string) => {
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

export const getUrlTerms = (value?: string | null) => {
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

const getTitleOverlap = (sourceTokens: string[], candidateTitle: string) => {
  const candidateTokens = new Set(tokenize(candidateTitle, 12))
  return sourceTokens.filter(token => candidateTokens.has(token)).length
}

const getSpecificTitleOverlap = (sourceTokens: string[], candidateTitle: string) => {
  const candidateTokens = new Set(tokenize(candidateTitle, 12))
  return sourceTokens.filter(token => (
    !GENERIC_TOPIC_TERMS.has(token) && candidateTokens.has(token)
  )).length
}

const getEvidenceFamily = (kind: RelatedSearchKind) => kind === 'recent-title' ? 'title' : kind

const getOverlapScore = (sourceTokens: string[], candidateTitle: string) => {
  const overlap = getTitleOverlap(sourceTokens, candidateTitle)

  if (overlap === 0) return 0

  return overlap * 8 + (overlap > 1 ? 10 : 0)
}

const getPopularityScore = (hit: AlgoliaStoryHit) => {
  const points = Math.max(hit.points ?? 0, 0)
  const comments = Math.max(hit.num_comments ?? 0, 0)

  return Math.min(16, Math.log10(points + 1) * 6) + Math.min(8, Math.log10(comments + 1) * 4)
}

const toRelatedStory = (hit: AlgoliaStoryHit): RelatedStoryCandidate | null => {
  if (!hit.objectID || !hit.title) return null

  return {
    title: hit.title,
    objectID: hit.objectID,
    created_at: hit.created_at ?? (hit.created_at_i ? new Date(hit.created_at_i * 1000).toISOString() : ''),
    created_at_i: hit.created_at_i ?? 0,
    points: hit.points ?? 0,
    num_comments: hit.num_comments ?? 0,
    author: hit.author ?? 'Unknown',
    url: hit.url ?? ''
  }
}

const compareNewestFirst = (a: RelatedStoryCandidate, b: RelatedStoryCandidate) => {
  if (a.created_at_i !== b.created_at_i) {
    return b.created_at_i - a.created_at_i
  }

  return Number(b.objectID) - Number(a.objectID)
}

export const rankRelatedStories = (results: SearchResult[], source: RelatedSourceStory, excludeId: string) => {
  const sourceTokens = tokenize(cleanTitle(source.title ?? ''), 12)
  const sourceHost = normalizeHost(source.url)
  const sourceUrl = canonicalizeUrl(source.url)
  const requiredOverlap = sourceTokens.length >= 6
    ? 3
    : sourceTokens.length >= 4 ? 2 : 1
  const candidates = new Map<string, CandidateEvidence>()

  for (const result of results) {
    result.hits.forEach((hit, index) => {
      const story = toRelatedStory(hit)

      if (!story) return
      if (story.objectID === excludeId) return
      if (sourceUrl && canonicalizeUrl(story.url) === sourceUrl) return

      const existing = candidates.get(story.objectID)
      const retrievalScore = Math.max(1, result.weight - index)

      if (existing) {
        if (!existing.evidence.has(result.kind)) {
          existing.evidence.add(result.kind)
          existing.retrievalScores.set(result.kind, retrievalScore)
        }
      } else {
        candidates.set(story.objectID, {
          ...story,
          evidence: new Set([result.kind]),
          retrievalScores: new Map([[result.kind, retrievalScore]]),
        })
      }
    })
  }

  const seenUrls = new Set<string>()

  return Array.from(candidates.values())
    .map((candidate) => {
      const overlap = getTitleOverlap(sourceTokens, candidate.title)
      const specificOverlap = getSpecificTitleOverlap(sourceTokens, candidate.title)
      const sameHost = Boolean(sourceHost && normalizeHost(candidate.url) === sourceHost)
      const evidenceFamilies = new Set(Array.from(candidate.evidence, getEvidenceFamily))
      const titleRetrievalScore = Math.max(
        candidate.retrievalScores.get('title') ?? 0,
        candidate.retrievalScores.get('recent-title') ?? 0,
      )
      const retrievalScore = titleRetrievalScore
        + (candidate.retrievalScores.get('full-text') ?? 0)
        + (candidate.retrievalScores.get('comment') ?? 0)
        + (candidate.retrievalScores.get('url') ?? 0)
      const consensusScore = Math.max(0, evidenceFamilies.size - 1) * 12
      const score = retrievalScore
        + getOverlapScore(sourceTokens, candidate.title)
        + (sameHost ? 16 : 0)
        + getPopularityScore(candidate)
        + consensusScore

      const hasRelevantSignal = (overlap >= requiredOverlap && specificOverlap > 0)
        || (sameHost && candidate.evidence.has('url'))
        || evidenceFamilies.size > 1

      return { candidate, hasRelevantSignal, score }
    })
    .filter(result => result.hasRelevantSignal)
    .sort((a, b) => b.score - a.score)
    .filter(({ candidate }) => {
      const url = canonicalizeUrl(candidate.url)

      if (!url) return true
      if (seenUrls.has(url)) return false

      seenUrls.add(url)
      return true
    })
    .slice(0, MAX_RELATED_STORIES)
    .map(({ candidate }) => candidate)
    .sort(compareNewestFirst)
    .map(({ url: _url, created_at_i: _createdAt, evidence: _evidence, retrievalScores: _retrievalScores, ...story }) => story)
}
