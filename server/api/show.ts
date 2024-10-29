import { defineEventHandler, createError } from 'h3';
import { fetchStories } from '../utils/fetchStories';

export default defineEventHandler(async (event) => {
  const BASE_URL = 'http://hn.algolia.com/api/v1/search_by_date';
  const QUERY_PARAMS = {
    tags: 'show_hn,story',
    hitsPerPage: '60',
  };

  try {
    const stories = await fetchStories(BASE_URL, QUERY_PARAMS);
    
    event.node.res.setHeader('Content-Type', 'application/json');
    event.node.res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate');
    
    return stories;
  } catch (error) {
    throw createError({
      statusCode: 500,
      message: 'Failed to fetch stories',
      cause: error
    });
  }
});
