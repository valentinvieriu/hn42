import { defineEventHandler, createError } from 'h3';
import { fetchStories } from '../utils/fetchStories';

const MAX_ITEMS = 100; // Configurable constant for the number of new stories to fetch

export default defineEventHandler(async (event) => {
  try {
    // First fetch new story IDs from Firebase
    const newStoryIds = await $fetch('https://hacker-news.firebaseio.com/v0/newstories.json');
    
    // Take the first MAX_ITEMS IDs and create an order map for sorting
    const newItemsIds = newStoryIds.slice(0, MAX_ITEMS);
    const orderMap = new Map(newItemsIds.map((id, index) => [id.toString(), index]));
    
    // Construct Algolia query with these IDs
    const filters = newItemsIds.map(id => `objectID:${id}`).join(' OR ');
    
    const ALGOLIA_URL = 'http://hn.algolia.com/api/v1/search';
    const QUERY_PARAMS = {
      tags: 'story',
      filters,
      hitsPerPage: MAX_ITEMS.toString(),
    };

    let stories = await fetchStories(ALGOLIA_URL, QUERY_PARAMS, newItemsIds);
    
    // Sort stories based on the original Firebase order
    stories = stories.sort((a, b) => {
      const orderA = orderMap.get(a.objectID) ?? MAX_ITEMS;
      const orderB = orderMap.get(b.objectID) ?? MAX_ITEMS;
      return orderA - orderB;
    });
    
    // Set cache headers
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
