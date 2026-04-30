import { createError, defineEventHandler, getQuery, getRouterParams, setHeader } from 'h3'
import {
  fetchUserPosts,
  isValidHNUsername,
  normalizeActivityBefore,
  normalizeActivityHitsPerPage,
  normalizeActivityPage,
} from '../../../utils/userActivity'

export default defineEventHandler(async (event) => {
  const { username } = getRouterParams(event)

  if (!isValidHNUsername(username)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid username is required',
    })
  }

  const query = getQuery(event)

  try {
    const response = await fetchUserPosts(username, {
      page: normalizeActivityPage(query.page),
      hitsPerPage: normalizeActivityHitsPerPage(query.hitsPerPage),
      before: normalizeActivityBefore(query.before),
    })

    setHeader(event, 'Cache-Control', 'public, max-age=120, stale-while-revalidate=600')

    return response
  } catch (error) {
    console.error('Error fetching user stories:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch user stories',
    })
  }
})
