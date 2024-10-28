import { defineEventHandler, createError } from 'h3';
import { fetchStories } from '../utils/fetchStories';

export default defineEventHandler(async (event) => {
  try {
    const stories = await fetchStories(
      'http://hn.algolia.com/api/v1/search',
      { tags: 'front_page,story', hitsPerPage: '30' }
    );
    
    // Set cache headers
    event.node.res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
    
    return stories;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch stories',
      cause: error
    });
  }
});
