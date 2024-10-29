import { HNHit } from '~/types'

export const fetchStories = async (baseUrl: string, queryParams: Record<string, string>) => {
  try {
    const response = await $fetch(`${baseUrl}?${new URLSearchParams(queryParams)}`);
    if (!response.hits) {
      return [];
    }

    const stories = response.hits
      .filter((hit: HNHit) => hit.url)
      .map((hit: HNHit) => {
        return {
          title: hit.title || 'Untitled',
          url: hit.url,
          author: hit.author || 'Unknown',
          points: hit.points || 0,
          num_comments: hit.num_comments || 0,
          created_at: hit.created_at || '',
          objectID: hit.objectID,
        };
      });

    return stories;
  } catch (error) {
    console.error('Error fetching stories:', error);
    throw new Error('Failed to fetch stories'); // Custom error handling
  }
};
