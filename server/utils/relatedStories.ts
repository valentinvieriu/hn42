import type { RelatedStory } from '../../shared/types'
import type { AlgoliaRankingInfo, AlgoliaStoryHit } from './algolia'

const MAX_RELATED_STORIES = 10
const MAX_STORIES_PER_HOST = 3
const TITLE_SIMILARITY_THRESHOLD = 0.82
const RELATED_TOKEN_LIMIT = 24

export type RelatedSourceStory = {
  title?: string | null
  url?: string | null
  created_at_i?: number | null
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
  ranks: Map<RelatedSearchKind, number>
  rankingInfo: Map<RelatedSearchKind, AlgoliaRankingInfo>
}

type ScoredCandidate = {
  candidate: CandidateEvidence
  canonicalUrl: string
  exactSourceUrl: boolean
  score: number
  tokens: Set<string>
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

const GENERIC_COMPOUND_TERMS = new Set([
  'open-source', 'real-time', 'self-hosted', 'state-of-the-art',
])

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, ' ')

const cleanTitle = (title: string) => title
  .replace(/^\s*(ask|launch|show|tell)\s+hn:\s*/i, '')
  .replace(/\s*\[(pdf|video|audio|slides?)\]\s*$/i, '')
  .replace(/\s*\((\d{4}|pdf|video|audio|slides?)\)\s*$/i, '')
  .replace(/\s+/g, ' ')
  .trim()

const normalizeToken = (value: string) => {
  const token = value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/^[._-]+|[._-]+$/gu, '')

  if (token.length > 4 && token.endsWith('ies')) {
    return `${token.slice(0, -3)}y`
  }

  if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1)
  }

  return token
}

const isUsefulToken = (token: string) => {
  if (!token || STOPWORDS.has(token)) return false
  if (/\d/u.test(token)) return true
  if (/[^\x00-\x7F]/u.test(token)) return true
  if (token.length >= 3) return true
  return SHORT_TECH_TERMS.has(token)
}

const addToken = (tokens: string[], seen: Set<string>, value: string, maxTokens: number) => {
  const token = normalizeToken(value)

  if (!isUsefulToken(token) || seen.has(token) || tokens.length >= maxTokens) return

  seen.add(token)
  tokens.push(token)
}

const tokenize = (value: string, maxTokens = RELATED_TOKEN_LIMIT): string[] => {
  const words = stripHtml(value)
    .replace(/&[#\p{L}\p{N}]+;/gu, ' ')
    .match(/[\p{L}\p{N}][\p{L}\p{N}+#._-]*/gu) ?? []
  const tokens: string[] = []
  const seen = new Set<string>()

  for (const word of words) {
    addToken(tokens, seen, word, maxTokens)

    const styledParts = word
      .replace(/([\p{Ll}\p{N}])([\p{Lu}])/gu, '$1 $2')
      .split(/\s+/u)
    const compoundParts = styledParts.flatMap(part => part.split(/[-_]+/u))

    for (const part of compoundParts) {
      addToken(tokens, seen, part, maxTokens)
    }

    for (const part of compoundParts) {
      if (part.includes('.') && !/^\d+(?:\.\d+)+$/u.test(part)) {
        for (const dotPart of part.split('.')) {
          addToken(tokens, seen, dotPart, maxTokens)
        }
      }

      const alphaPrefix = part.match(/^[\p{L}]{2,}(?=\d)/u)?.[0]
      if (alphaPrefix) {
        addToken(tokens, seen, alphaPrefix, maxTokens)
      }
    }

    if (tokens.length >= maxTokens) break
  }

  return tokens
}

export const buildTitleQuery = (title: string) => {
  const tokens = tokenize(cleanTitle(title), 10)
    .slice(0, 8)

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

const getHostTerms = (value?: string | null) => {
  if (!value) return []

  try {
    return new URL(value).hostname
      .toLowerCase()
      .replace(/^www\./, '')
      .split('.')
      .map(normalizeToken)
      .filter(term => term && !HOST_NOISE_TERMS.has(term) && !GENERIC_HOST_TERMS.has(term))
      .slice(0, 2)
  } catch {
    return []
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

    url.searchParams.sort()

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
    const hostTerms = getHostTerms(value)
    if (hostTerms.length > 0) return hostTerms

    const pathTerms = tokenize(
      `${url.pathname.replace(/[/-]/g, ' ')} ${Array.from(url.searchParams.values()).join(' ')}`,
      6,
    )

    return pathTerms
  } catch {
    return []
  }
}

const getAnchorTokens = (sourceTitle: string, sourceUrl?: string | null) => {
  const titleTokens = new Set(tokenize(sourceTitle))
  const anchors = new Set(
    getHostTerms(sourceUrl).filter(term => titleTokens.has(term)),
  )

  for (const token of titleTokens) {
    if (
      (/\d/u.test(token) && /\p{L}/u.test(token))
      || /[+#]/u.test(token)
      || (/[-_]/u.test(token) && !GENERIC_COMPOUND_TERMS.has(token))
    ) {
      anchors.add(token)
    }
  }

  return anchors
}

const getBigrams = (tokens: string[]) => {
  const bigrams = new Set<string>()

  for (let index = 0; index < tokens.length - 1; index += 1) {
    bigrams.add(`${tokens[index]}\u0000${tokens[index + 1]}`)
  }

  return bigrams
}

const getPopularityScore = (hit: AlgoliaStoryHit) => {
  const points = Math.max(hit.points ?? 0, 0)
  const comments = Math.max(hit.num_comments ?? 0, 0)

  return Math.min(5, Math.log10(points + 1) * 2)
    + Math.min(3, Math.log10(comments + 1) * 1.5)
}

const getRecencyScore = (candidateTimestamp: number, sourceTimestamp: number) => {
  if (!candidateTimestamp || !sourceTimestamp) return 0

  const fiveYearsInSeconds = 5 * 365.25 * 24 * 60 * 60
  const distance = Math.abs(candidateTimestamp - sourceTimestamp)

  return Math.exp(-distance / fiveYearsInSeconds) * 6
}

const getRankScore = (rank?: number) => {
  if (rank === undefined) return 0
  return 21 / (21 + rank)
}

const getRetrievalScore = (candidate: CandidateEvidence, queryTokenCount: number) => {
  const titleRank = Math.max(
    getRankScore(candidate.ranks.get('title')),
    getRankScore(candidate.ranks.get('recent-title')),
  )
  const titleRankingInfo = [
    candidate.rankingInfo.get('title'),
    candidate.rankingInfo.get('recent-title'),
  ].filter((info): info is AlgoliaRankingInfo => Boolean(info))
  const exactCoverage = titleRankingInfo.reduce((best, info) => (
    Math.max(best, Math.min(1, Math.max(info.nbExactWords ?? 0, 0) / Math.max(queryTokenCount, 1)))
  ), 0)
  const typoPenalty = titleRankingInfo.reduce((best, info) => (
    Math.min(best, Math.max(info.nbTypos ?? 0, 0))
  ), Number.POSITIVE_INFINITY)
  const exactScore = exactCoverage * 10 / (1 + (Number.isFinite(typoPenalty) ? typoPenalty : 0))

  return titleRank * 12
    + getRankScore(candidate.ranks.get('full-text')) * 4
    + getRankScore(candidate.ranks.get('comment')) * 3
    + getRankScore(candidate.ranks.get('url')) * 2
    + exactScore
}

const getTokenSimilarity = (
  sourceTokens: string[],
  candidateTokens: Set<string>,
  tokenWeights: Map<string, number>,
) => {
  const matchedTokens = sourceTokens.filter(token => candidateTokens.has(token))
  const sourceWeight = sourceTokens.reduce((total, token) => total + (tokenWeights.get(token) ?? 1), 0)
  const matchedWeight = matchedTokens.reduce((total, token) => total + (tokenWeights.get(token) ?? 1), 0)
  const sourceCoverage = sourceWeight > 0 ? matchedWeight / sourceWeight : 0
  const candidatePrecision = matchedTokens.length / Math.max(
    1,
    Math.min(candidateTokens.size, sourceTokens.length),
  )

  return {
    matchedTokens,
    similarity: sourceCoverage * 0.75 + candidatePrecision * 0.25,
  }
}

const getSetSimilarity = (first: Set<string>, second: Set<string>) => {
  if (first.size === 0 || second.size === 0) return 0

  let intersection = 0
  for (const token of first) {
    if (second.has(token)) intersection += 1
  }

  return intersection / (first.size + second.size - intersection)
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

const selectDiverseStories = (scoredCandidates: ScoredCandidate[]) => {
  const selected: ScoredCandidate[] = []
  const seenUrls = new Set<string>()
  const hostCounts = new Map<string, number>()

  for (const scored of scoredCandidates) {
    const host = normalizeHost(scored.candidate.url)

    if (scored.canonicalUrl && seenUrls.has(scored.canonicalUrl)) continue
    if (host && (hostCounts.get(host) ?? 0) >= MAX_STORIES_PER_HOST) continue
    if (selected.some(existing => (
      !scored.exactSourceUrl
      && !existing.exactSourceUrl
      && getSetSimilarity(scored.tokens, existing.tokens) >= TITLE_SIMILARITY_THRESHOLD
    ))) continue

    selected.push(scored)

    if (scored.canonicalUrl) seenUrls.add(scored.canonicalUrl)
    if (host) hostCounts.set(host, (hostCounts.get(host) ?? 0) + 1)
    if (selected.length === MAX_RELATED_STORIES) break
  }

  return selected
}

export const rankRelatedStories = (results: SearchResult[], source: RelatedSourceStory, excludeId: string) => {
  const sourceTitle = cleanTitle(source.title ?? '')
  const sourceTokens = tokenize(sourceTitle)
  const sourceBigrams = getBigrams(sourceTokens)
  const sourceAnchors = getAnchorTokens(sourceTitle, source.url)
  const sourceHost = normalizeHost(source.url)
  const sourceUrl = canonicalizeUrl(source.url)
  const candidates = new Map<string, CandidateEvidence>()

  for (const result of results) {
    result.hits.forEach((hit, index) => {
      const story = toRelatedStory(hit)

      if (!story || story.objectID === excludeId) return

      const existing = candidates.get(story.objectID)

      if (existing) {
        existing.evidence.add(result.kind)
        existing.ranks.set(result.kind, Math.min(existing.ranks.get(result.kind) ?? index, index))
        if (hit._rankingInfo) existing.rankingInfo.set(result.kind, hit._rankingInfo)
      } else {
        candidates.set(story.objectID, {
          ...story,
          evidence: new Set([result.kind]),
          ranks: new Map([[result.kind, index]]),
          rankingInfo: hit._rankingInfo
            ? new Map([[result.kind, hit._rankingInfo]])
            : new Map(),
        })
      }
    })
  }

  if (sourceTokens.length === 0) return []

  const candidateTokens = new Map<string, Set<string>>()
  const documentFrequency = new Map<string, number>()

  for (const candidate of candidates.values()) {
    const tokens = new Set(tokenize(cleanTitle(candidate.title)))
    candidateTokens.set(candidate.objectID, tokens)

    for (const sourceToken of sourceTokens) {
      if (tokens.has(sourceToken)) {
        documentFrequency.set(sourceToken, (documentFrequency.get(sourceToken) ?? 0) + 1)
      }
    }
  }

  const tokenWeights = new Map(sourceTokens.map(token => [
    token,
    1 + Math.log((candidates.size + 1) / ((documentFrequency.get(token) ?? 0) + 1)),
  ]))
  const queryTokenCount = buildTitleQuery(sourceTitle).split(' ').filter(Boolean).length
  const scoredCandidates: ScoredCandidate[] = []

  for (const candidate of candidates.values()) {
    const tokens = candidateTokens.get(candidate.objectID) ?? new Set<string>()
    const { matchedTokens, similarity } = getTokenSimilarity(sourceTokens, tokens, tokenWeights)
    const candidateBigrams = getBigrams(Array.from(tokens))
    const bigramMatches = Array.from(sourceBigrams).filter(bigram => candidateBigrams.has(bigram)).length
    const anchorMatch = matchedTokens.some(token => sourceAnchors.has(token))
    const sameHost = Boolean(sourceHost && normalizeHost(candidate.url) === sourceHost)
    const canonicalUrl = canonicalizeUrl(candidate.url)
    const exactSourceUrl = Boolean(sourceUrl && canonicalUrl === sourceUrl)
    const strongTitleMatch = matchedTokens.length >= 2
      && (similarity >= 0.28 || bigramMatches > 0)
      && (
        sourceAnchors.size === 0
        || anchorMatch
        || (matchedTokens.length >= 3 && similarity >= 0.4)
      )
    const anchoredRelation = anchorMatch && (sameHost || matchedTokens.length >= 2)
    const hasRelevantSignal = exactSourceUrl || strongTitleMatch || anchoredRelation

    if (!hasRelevantSignal) continue

    const score = (exactSourceUrl ? 140 : 0)
      + similarity * 100
      + Math.min(2, bigramMatches) * 8
      + (anchorMatch ? 12 : 0)
      + (sameHost ? 4 : 0)
      + getRetrievalScore(candidate, queryTokenCount)
      + getPopularityScore(candidate)
      + getRecencyScore(candidate.created_at_i, source.created_at_i ?? 0)

    scoredCandidates.push({
      candidate,
      canonicalUrl,
      exactSourceUrl,
      score,
      tokens,
    })
  }

  return selectDiverseStories(scoredCandidates.sort((first, second) => {
    if (
      first.exactSourceUrl
      && second.exactSourceUrl
      && first.canonicalUrl === second.canonicalUrl
    ) {
      const engagementDifference = (second.candidate.points + second.candidate.num_comments)
        - (first.candidate.points + first.candidate.num_comments)

      if (engagementDifference !== 0) return engagementDifference
    }

    return second.score - first.score
      || second.candidate.points - first.candidate.points
      || second.candidate.created_at_i - first.candidate.created_at_i
      || Number(second.candidate.objectID) - Number(first.candidate.objectID)
  }))
    .map(({ candidate }) => candidate)
    .map(({ url: _url, created_at_i: _createdAt, evidence: _evidence, ranks: _ranks, rankingInfo: _rankingInfo, ...story }) => story)
}
