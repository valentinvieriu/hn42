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
})
