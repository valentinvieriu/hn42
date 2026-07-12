import { describe, expect, it } from 'vitest'
import {
  normalizeStoryDetail,
  type AlgoliaItemResponse,
} from './item'

describe('item normalization', () => {
  it('recursively keeps only the comment fields rendered by HN42', () => {
    const item = {
      id: 123,
      author: 'alice',
      children: [{
        id: 456,
        author: 'bob',
        children: [{
          id: 789,
          author: null,
          children: [],
          created_at: null,
          created_at_i: 1_700_000_001,
          options: ['dead'],
          parent_id: 456,
          points: null,
          story_id: 123,
          text: null,
          type: 'comment',
          url: null,
        }],
        created_at: '2026-07-12T12:00:00.000Z',
        created_at_i: 1_700_000_000,
        options: [],
        parent_id: 123,
        points: 4,
        story_id: 123,
        text: '<p>Hello</p>',
        type: 'comment',
        url: null,
      }],
      created_at: '2026-07-12T11:00:00.000Z',
      parent_id: null,
      points: 42,
      text: null,
      title: 'A story',
      url: 'https://example.com/story',
    } satisfies AlgoliaItemResponse

    expect(normalizeStoryDetail(item)).toEqual({
      author: 'alice',
      children: [{
        id: 456,
        author: 'bob',
        children: [{
          id: 789,
          author: 'Unknown',
          children: [],
          created_at: '',
          parent_id: 456,
          text: '',
        }],
        created_at: '2026-07-12T12:00:00.000Z',
        parent_id: 123,
        text: '<p>Hello</p>',
      }],
      created_at: '2026-07-12T11:00:00.000Z',
      points: 42,
      text: null,
      title: 'A story',
      url: 'https://example.com/story',
    })
  })
})
