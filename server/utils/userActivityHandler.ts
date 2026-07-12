import {
  createError,
  defineEventHandler,
  getQuery,
  getRouterParams,
  setHeader,
} from 'h3'
import type { UserActivityPage } from '#shared/types'
import { isValidHnUsername } from '#shared/utils/hn'
import { formatServerTiming } from '#shared/utils/serverTiming'
import {
  normalizeActivityBefore,
  normalizeActivityHitsPerPage,
  normalizeActivityPage,
  type ActivityQueryOptions,
} from './userActivity'

type UserActivityHandlerOptions<T> = {
  errorLogMessage: string
  errorStatusMessage: string
  fetchActivity: (
    username: string,
    options: ActivityQueryOptions,
  ) => Promise<UserActivityPage<T>>
  timingDescription: string
}

export const createUserActivityHandler = <T>(
  options: UserActivityHandlerOptions<T>,
) => defineEventHandler(async (event) => {
  const { username } = getRouterParams(event)

  if (!isValidHnUsername(username)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid username is required',
    })
  }

  const query = getQuery(event)

  try {
    const userActivityStartedAt = performance.now()
    const response = await options.fetchActivity(username, {
      page: normalizeActivityPage(query.page),
      hitsPerPage: normalizeActivityHitsPerPage(query.hitsPerPage),
      before: normalizeActivityBefore(query.before),
    })
    const userActivityDuration = performance.now() - userActivityStartedAt

    setHeader(event, 'Cache-Control', 'public, max-age=120, stale-while-revalidate=600')
    setHeader(event, 'Server-Timing', formatServerTiming([{
      name: 'user-activity',
      duration: userActivityDuration,
      description: options.timingDescription,
    }]))

    return response
  } catch (error) {
    console.error(options.errorLogMessage, error)
    throw createError({
      statusCode: 500,
      statusMessage: options.errorStatusMessage,
    })
  }
})
