import { defineEventHandler } from 'h3';
import { fetchStories } from '../utils/fetchStories';

export default defineEventHandler(async () => {
  const BASE_URL = 'http://hn.algolia.com/api/v1/search_by_date';
  const QUERY_PARAMS = {
    tags: 'story',
    hitsPerPage: '30',
  };

  return await fetchStories(BASE_URL, QUERY_PARAMS);
});
