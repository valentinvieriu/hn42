import type { HNHit } from '#shared/types'

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

export const fetchRelatedStories = async (keywords: string[], excludeId?: string) => {
  const query = keywords.join(' OR ');
  const queryParams = {
    query,
    tags: 'story',
    restrictSearchableAttributes: 'title',
    hitsPerPage: '5'
  };

  const stories = await fetchStories('http://hn.algolia.com/api/v1/search', queryParams);
  
  // Filter out the current story if excludeId is provided
  return stories.filter(story => story.objectID !== excludeId);
};
