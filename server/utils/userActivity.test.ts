import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchUserComments, fetchUserPosts } from './userActivity'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('user activity mapping', () => {
  it('computes pagination from raw story hits without exposing cursor-only fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      hits: [{
        objectID: '101',
        author: 'alice',
        created_at: '2026-07-12T12:00:00.000Z',
        created_at_i: 1_700_000_000,
        num_comments: 3,
        points: 12,
        story_text: 'Unused self-post text',
        title: 'A story',
        url: 'https://example.com/story',
      }],
      hitsPerPage: 30,
      nbHits: 100,
      nbPages: 4,
      page: 0,
    })
    vi.stubGlobal('$fetch', fetchMock)

    const result = await fetchUserPosts('alice', {
      hitsPerPage: 30,
      page: 0,
    })

    expect(result).toEqual({
      hasMore: true,
      items: [{
        author: 'alice',
        created_at: '2026-07-12T12:00:00.000Z',
        num_comments: 3,
        objectID: '101',
        points: 12,
        title: 'A story',
        url: 'https://example.com/story',
      }],
      nbHits: 100,
      nextCursor: 1_700_000_000,
      nextPage: 1,
    })

    const requestUrl = new URL(fetchMock.mock.calls[0]?.[0] as string)
    expect(requestUrl.searchParams.get('attributesToRetrieve'))
      .toBe('objectID,title,url,points,num_comments,created_at,created_at_i')
  })

  it('returns only comment fields consumed by the activity UI', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      hits: [{
        objectID: '202',
        author: 'alice',
        comment_text: '<p>Comment</p>',
        created_at: '2026-07-12T13:00:00.000Z',
        created_at_i: 1_700_000_100,
        parent_id: 201,
        points: 2,
        story_id: 101,
        story_title: 'A story',
        story_url: 'https://example.com/story',
      }],
      hitsPerPage: 30,
      nbHits: 1,
      nbPages: 1,
      page: 0,
    })
    vi.stubGlobal('$fetch', fetchMock)

    const result = await fetchUserComments('alice', {
      hitsPerPage: 30,
      page: 0,
    })

    expect(result).toEqual({
      hasMore: false,
      items: [{
        created_at: '2026-07-12T13:00:00.000Z',
        objectID: '202',
        points: 2,
        story_id: '101',
        story_title: 'A story',
        story_url: 'https://example.com/story',
        text: '<p>Comment</p>',
      }],
      nbHits: 1,
      nextCursor: 1_700_000_100,
      nextPage: null,
    })

    const requestUrl = new URL(fetchMock.mock.calls[0]?.[0] as string)
    expect(requestUrl.searchParams.get('attributesToRetrieve'))
      .toBe('objectID,points,created_at,created_at_i,comment_text,story_id,story_title,story_url')
  })
})
