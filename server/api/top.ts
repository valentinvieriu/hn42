import { defineEventHandler, createError } from 'h3';
import { fetchStories } from '../utils/fetchStories';

const MAX_ITEMS = 100; // Configurable constant for the number of top stories to fetch

export default defineEventHandler(async (event) => {
  try {
    // First fetch top story IDs from Firebase
    const topStoryIds = await $fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    
    // Take the first MAX_ITEMS IDs and create an order map for sorting
    const topItemsIds = topStoryIds.slice(0, MAX_ITEMS);
    const orderMap = new Map(topItemsIds.map((id, index) => [id.toString(), index]));
    
    // Construct Algolia query with these IDs
    const filters = topItemsIds.map(id => `objectID:${id}`).join(' OR ');
    
    const ALGOLIA_URL = 'http://hn.algolia.com/api/v1/search';
    const QUERY_PARAMS = {
      tags: 'story',
      filters,
      hitsPerPage: MAX_ITEMS.toString(), // Use the constant here
    };

    let stories = await fetchStories(ALGOLIA_URL, QUERY_PARAMS, topItemsIds);
    
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
