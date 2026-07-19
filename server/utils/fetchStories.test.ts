import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchStories } from './fetchStories'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('feed story mapping', () => {
  it('requests and returns only fields consumed by story cards', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      hits: [{
        objectID: '101',
        author: 'alice',
        created_at: '2026-07-12T12:00:00.000Z',
        num_comments: 3,
        points: 12,
        story_text: 'Unused',
        title: 'A story',
        url: 'https://example.com/story',
      }],
    })
    vi.stubGlobal('$fetch', fetchMock)

    await expect(fetchStories('https://hn.algolia.com/api/v1/search', {
      hitsPerPage: '100',
      tags: 'story',
    })).resolves.toEqual([{
      author: 'alice',
      created_at: '2026-07-12T12:00:00.000Z',
      num_comments: 3,
      objectID: '101',
      points: 12,
      title: 'A story',
      url: 'https://example.com/story',
    }])

    const requestUrl = new URL(fetchMock.mock.calls[0]?.[0] as string)
    expect(requestUrl.searchParams.get('attributesToRetrieve'))
      .toBe('objectID,title,author,created_at,points,num_comments,url')
  })

  it('excludes HN-native stories without an explicit source URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      hits: [
        {
          objectID: '201',
          title: 'Ask HN: A question',
          url: null,
        },
        {
          objectID: '202',
          title: 'A text-only submission',
        },
        {
          objectID: '203',
          title: 'An empty source',
          url: '',
        },
        {
          objectID: '204',
          title: 'An external story',
          url: 'https://example.com/external-story',
        },
      ],
    })
    vi.stubGlobal('$fetch', fetchMock)

    await expect(fetchStories('https://hn.algolia.com/api/v1/search', {
      hitsPerPage: '100',
      tags: 'story',
    })).resolves.toEqual([{
      author: 'Unknown',
      created_at: '',
      num_comments: 0,
      objectID: '204',
      points: 0,
      title: 'An external story',
      url: 'https://example.com/external-story',
    }])
  })
})
