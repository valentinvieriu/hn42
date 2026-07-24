import type { Story } from '#shared/types'
import { searchAlgoliaHits, type AlgoliaStoryHit } from './algolia'

type AlgoliaStoryWithSource = AlgoliaStoryHit & {
  objectID: string
  url: string
}

const STORY_ATTRIBUTES = 'objectID,title,author,created_at,points,num_comments,url'

const hasSourceUrl = (hit: AlgoliaStoryHit): hit is AlgoliaStoryWithSource => {
  return typeof hit.objectID === 'string'
    && hit.objectID.length > 0
    && typeof hit.url === 'string'
    && hit.url.trim().length > 0
}

export const fetchStories = async (
  queryParams: Record<string, string>,
): Promise<Story[]> => {
  try {
    const hits = await searchAlgoliaHits<AlgoliaStoryHit>({
      ...queryParams,
      attributesToRetrieve: STORY_ATTRIBUTES,
    })

    return hits
      .filter(hasSourceUrl)
      .map((hit) => ({
        title: hit.title || 'Untitled',
        url: hit.url,
        author: hit.author || 'Unknown',
        points: hit.points || 0,
        num_comments: hit.num_comments || 0,
        created_at: hit.created_at || '',
        objectID: hit.objectID,
      }))
  } catch (error) {
    console.error('Error fetching stories:', error)
    throw new Error('Failed to fetch stories', { cause: error })
  }
}
