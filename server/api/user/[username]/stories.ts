import { createError, defineEventHandler, getQuery, getRouterParams, setHeader } from 'h3'
import { formatServerTiming } from '#shared/utils/serverTiming'
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
    const userActivityStartedAt = performance.now()
    const response = await fetchUserPosts(username, {
      page: normalizeActivityPage(query.page),
      hitsPerPage: normalizeActivityHitsPerPage(query.hitsPerPage),
      before: normalizeActivityBefore(query.before),
    })
    const userActivityDuration = performance.now() - userActivityStartedAt

    setHeader(event, 'Cache-Control', 'public, max-age=120, stale-while-revalidate=600')
    setHeader(event, 'Server-Timing', formatServerTiming([{
      name: 'user-activity',
      duration: userActivityDuration,
      description: 'Algolia user stories and mapping',
    }]))

    return response
  } catch (error) {
    console.error('Error fetching user stories:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch user stories',
    })
  }
})
