import { defineEventHandler } from 'h3';
import { fetchStories } from '../utils/fetchStories';

export default defineEventHandler(async (event) => {
  const BASE_URL = 'http://hn.algolia.com/api/v1/search';
  const QUERY_PARAMS = {
    tags: 'front_page,story',
    hitsPerPage: '30',
  };

  return await fetchStories(BASE_URL, QUERY_PARAMS);
});
