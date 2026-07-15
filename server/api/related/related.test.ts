import { describe, expect, it } from 'vitest'
import {
  rankRelatedStories,
  type AlgoliaStoryHit,
  type RelatedSearchKind,
  type SearchResult,
} from '../../utils/relatedStories'

const story = (
  objectID: string,
  title: string,
  created_at_i: number,
  url = `https://example.com/${objectID}`,
  overrides: Partial<AlgoliaStoryHit> = {},
): AlgoliaStoryHit => ({
  objectID,
  title,
  created_at: new Date(created_at_i * 1000).toISOString(),
  created_at_i,
  points: 20,
  num_comments: 5,
  author: 'author',
  url,
  ...overrides,
})

const result = (
  kind: RelatedSearchKind,
  hits: AlgoliaStoryHit[],
  weight = 80,
): SearchResult => ({ kind, hits, weight })

describe('rankRelatedStories', () => {
  it('presents the selected stories newest first', () => {
    const ranked = rankRelatedStories([
      result('title', [
        story('101', 'Postgres query planner notes', 1_700_000_100),
        story('102', 'Improving a Postgres query planner', 1_700_000_300),
        story('103', 'Inside the Postgres query planner', 1_700_000_200),
      ]),
    ], {
      title: 'Postgres query planner improvements',
      url: 'https://source.example/postgres-planner',
    }, '100')

    expect(ranked.map(item => item.objectID)).toEqual(['102', '103', '101'])
    expect(ranked.every(item => item.created_at)).toBe(true)
  })

  it('chooses the most relevant ten before applying chronological presentation order', () => {
    const hits = Array.from({ length: 11 }, (_, index) => story(
      String(201 + index),
      `Postgres planner update ${index}`,
      index === 10 ? 1_800_000_000 : 1_700_000_000 + index,
    ))

    const ranked = rankRelatedStories([
      result('title', hits),
    ], {
      title: 'Postgres planner update',
      url: 'https://source.example/postgres-planner',
    }, '200')

    expect(ranked).toHaveLength(10)
    expect(ranked.map(item => item.objectID)).not.toContain('211')
    expect(ranked.map(item => item.objectID)).toEqual([
      '210', '209', '208', '207', '206', '205', '204', '203', '202', '201',
    ])
  })

  it('filters weak single-channel matches but keeps candidates supported by independent searches', () => {
    const weak = story('301', 'A very popular unrelated launch', 1_700_000_300, undefined, {
      points: 50_000,
      num_comments: 10_000,
    })
    const supported = story('302', 'Database reliability lessons', 1_700_000_200)

    const ranked = rankRelatedStories([
      result('full-text', [weak, supported], 52),
      result('comment', [supported], 26),
    ], {
      title: 'Postgres query planner improvements',
      url: 'https://source.example/postgres-planner',
    }, '300')

    expect(ranked.map(item => item.objectID)).toEqual(['302'])
  })

  it('requires multiple shared concepts for a long-title single-channel match', () => {
    const ranked = rankRelatedStories([
      result('title', [
        story('351', 'Apple privacy changes', 1_700_000_300),
        story('352', 'Apple speech APIs compared with Whisper', 1_700_000_200),
      ]),
    ], {
      title: "Apple's SpeechAnalyzer API benchmarked against Whisper",
      url: 'https://source.example/speech-benchmark',
    }, '350')

    expect(ranked.map(item => item.objectID)).toEqual(['352'])
  })

  it('keeps only the strongest candidate for the same canonical URL', () => {
    const ranked = rankRelatedStories([
      result('title', [
        story('401', 'Postgres planner deep dive', 1_700_000_100, 'https://example.com/post?utm_source=hn'),
        story('402', 'Postgres planner discussion', 1_700_000_200, 'https://www.example.com/post?ref=home'),
        story('403', 'Postgres planner benchmarks', 1_700_000_300, 'https://example.com/benchmarks'),
      ]),
    ], {
      title: 'Postgres query planner improvements',
      url: 'https://source.example/postgres-planner',
    }, '400')

    expect(ranked.map(item => item.objectID)).toEqual(['403', '401'])
  })
})
