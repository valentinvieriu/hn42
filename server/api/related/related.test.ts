import { describe, expect, it } from 'vitest'
import {
  buildTitleQuery,
  rankRelatedStories,
  type AlgoliaStoryHit,
  type RelatedSearchKind,
  type SearchResult,
} from '../../utils/relatedStories'

const story = (
  objectID: string,
  title: string,
  created_at_i: number,
  url = `https://story-${objectID}.example/${objectID}`,
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

describe('buildTitleQuery', () => {
  it('preserves Unicode terms and splits compounds into searchable concepts', () => {
    expect(buildTitleQuery('Qwen-Image-3.0: Déjà vu in 東京')).toBe(
      'qwen-image-3.0 qwen image 3.0 déjà 東京',
    )
  })
})

describe('rankRelatedStories', () => {
  it('presents selected stories in relevance order', () => {
    const ranked = rankRelatedStories([
      result('title', [
        story('101', 'Postgres query planner notes', 1_700_000_100),
        story('102', 'Improving a Postgres query planner', 1_700_000_300),
        story('103', 'Inside the Postgres query planner', 1_700_000_200),
      ]),
    ], {
      title: 'Postgres query planner improvements',
      url: 'https://source.example/postgres-planner',
      created_at_i: 1_700_000_400,
    }, '100')

    expect(ranked.map(item => item.objectID)).toEqual(['101', '102', '103'])
    expect(ranked.every(item => item.created_at)).toBe(true)
  })

  it('chooses the ten strongest candidates without a chronological reorder', () => {
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
    expect(ranked.map(item => item.objectID)).toEqual([
      '201', '202', '203', '204', '205', '206', '207', '208', '209', '210',
    ])
  })

  it('does not let correlated search channels replace title relevance', () => {
    const unrelated = story('301', 'Database reliability lessons', 1_700_000_200)
    const related = story('302', 'Postgres planner reliability lessons', 1_700_000_100)

    const ranked = rankRelatedStories([
      result('full-text', [unrelated, related], 52),
      result('comment', [unrelated, related], 26),
    ], {
      title: 'Postgres query planner improvements',
      url: 'https://source.example/postgres-planner',
    }, '300')

    expect(ranked.map(item => item.objectID)).toEqual(['302'])
  })

  it('requires multiple shared concepts for a long-title match', () => {
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

    expect(ranked.map(item => item.objectID)).toEqual(['402', '403'])
  })

  it('retains the strongest previous discussion of the exact source URL', () => {
    const ranked = rankRelatedStories([
      result('url', [
        story('501', 'PCjs Machines', 1_700_000_100, 'https://www.pcjs.org/', { points: 293 }),
        story('502', 'PCjs Machines', 1_700_000_200, 'https://pcjs.org/?utm_source=hn', { points: 10 }),
        story('503', 'Thinking Machines releases a model', 1_700_000_300, 'https://pcjs.org/model'),
      ], 28),
    ], {
      title: 'PCjs Machines',
      url: 'https://pcjs.org/',
      created_at_i: 1_800_000_000,
    }, '500')

    expect(ranked.map(item => item.objectID)).toEqual(['501'])
  })

  it('rejects unrelated stories that only share a publisher hostname', () => {
    const ranked = rankRelatedStories([
      result('url', [
        story('551', 'In Europe, wind and solar overtake fossil fuels', 1_700_000_300, 'https://e360.yale.edu/digest/wind-solar'),
        story('552', 'China has added forest the size of Texas', 1_700_000_200, 'https://e360.yale.edu/digest/china-forest'),
        story('553', 'Dead coral skeletons hinder reef regeneration', 1_700_000_100, 'https://phys.org/dead-coral-reef'),
      ], 28),
    ], {
      title: 'Long presumed dead, a thriving coral reef is discovered in West Africa',
      url: 'https://e360.yale.edu/digest/benin-coral-reef',
    }, '550')

    expect(ranked.map(item => item.objectID)).toEqual(['553'])
  })

  it('requires the distinctive anchor for short branded titles', () => {
    const ranked = rankRelatedStories([
      result('title', [
        story('601', 'Thinking Machines releases a model', 1_700_000_300),
        story('602', 'MacOS container machines', 1_700_000_200),
        story('603', 'PCjs emulator for the original IBM PC', 1_700_000_100, 'https://pcjs.org/emulator'),
      ]),
    ], {
      title: 'PCjs Machines',
      url: 'https://pcjs.org/',
    }, '600')

    expect(ranked.map(item => item.objectID)).toEqual(['603'])
  })

  it('does not confuse words inside a brand with a generic topic', () => {
    const ranked = rankRelatedStories([
      result('title', [
        story('621', 'NetNewsWire: Free and open source RSS reader', 1_700_000_300),
        story('622', 'Open ecosystem for privacy-friendly e-readers', 1_700_000_200),
      ]),
    ], {
      title: 'FreeInk: Open ecosystem for e-readers',
      url: 'https://freeink.org/',
    }, '620')

    expect(ranked.map(item => item.objectID)).toEqual(['622'])
  })

  it('uses Algolia exact-match metadata without making it a relevance bypass', () => {
    const ranked = rankRelatedStories([
      result('title', [
        story('651', 'Postgres planner tuning', 1_700_000_200, undefined, {
          _rankingInfo: { words: 3, nbExactWords: 1, nbTypos: 1 },
        }),
        story('652', 'Postgres planner tuning', 1_700_000_100, undefined, {
          _rankingInfo: { words: 3, nbExactWords: 3, nbTypos: 0 },
        }),
      ]),
    ], {
      title: 'Postgres planner tuning',
      url: 'https://source.example/planner',
    }, '650')

    expect(ranked.map(item => item.objectID)).toEqual(['652'])
  })

  it('caps one product hostname so related results retain variety', () => {
    const ranked = rankRelatedStories([
      result('url', Array.from({ length: 5 }, (_, index) => story(
        String(701 + index),
        `Qwen ${3 + index} model release`,
        1_700_000_500 - index,
        `https://qwen.ai/blog/model-${index}`,
      )), 28),
    ], {
      title: 'Qwen-Image-3.0: Rich content and authentic details',
      url: 'https://qwen.ai/blog?id=qwen-image-3.0',
    }, '700')

    expect(ranked).toHaveLength(3)
    expect(ranked.map(item => item.objectID)).toEqual(['701', '702', '703'])
  })

  it('does not treat a shared numeric version as a branded relationship', () => {
    const ranked = rankRelatedStories([
      result('title', [
        story('751', 'Niui 3.0: lightweight rich accessible front end', 1_700_000_300),
        story('752', 'Qwen-Image: native text rendering', 1_700_000_200, 'https://qwen.ai/blog/qwen-image'),
      ]),
    ], {
      title: 'Qwen-Image-3.0: Rich content and authentic details',
      url: 'https://qwen.ai/blog?id=qwen-image-3.0',
    }, '750')

    expect(ranked.map(item => item.objectID)).toEqual(['752'])
  })
})
