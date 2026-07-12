import type { HNHit, Story } from '#shared/types'
import { getScreenshotPath } from '#shared/utils/screenshot'

type AlgoliaStoryResponse = {
  hits?: HNHit[]
}

const getHnItemUrl = (id: string) => `https://news.ycombinator.com/item?id=${id}`

export const fetchStories = async (
  baseUrl: string,
  queryParams: Record<string, string>,
): Promise<Story[]> => {
  try {
    const response = await $fetch<AlgoliaStoryResponse>(
      `${baseUrl}?${new URLSearchParams(queryParams)}`,
    )

    return (response.hits ?? [])
      .filter((hit): hit is HNHit & { objectID: string } => Boolean(hit.objectID))
      .map((hit) => ({
        title: hit.title || 'Untitled',
        url: hit.url || getHnItemUrl(hit.objectID),
        author: hit.author || 'Unknown',
        points: hit.points || 0,
        num_comments: hit.num_comments || 0,
        created_at: hit.created_at || '',
        objectID: hit.objectID,
        screenshotUrl: getScreenshotPath(hit.objectID),
      }))
  } catch (error) {
    console.error('Error fetching stories:', error)
    throw new Error('Failed to fetch stories', { cause: error })
  }
}
