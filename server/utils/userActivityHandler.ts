import {
  createError,
  defineEventHandler,
  getQuery,
  getRouterParams,
  setHeader,
  type H3Event,
} from 'h3'
import { defineCachedFunction } from 'nitropack/runtime'
import type { UserActivityPage } from '#shared/types'
import { isValidHnUsername } from '#shared/utils/hn'
import { formatServerTiming } from '#shared/utils/serverTiming'
import {
  normalizeActivityBefore,
  normalizeActivityHitsPerPage,
  normalizeActivityPage,
  type ActivityQueryOptions,
} from './userActivity'
import {
  getDataCacheStatus,
  isDataCacheEntryValid,
  type TimedData,
} from './dataCache'
import {
  isUpstreamUnavailable,
  logUpstreamFailure,
} from './upstream'

const USER_ACTIVITY_CACHE_MAX_AGE_SECONDS = 120
const USER_ACTIVITY_CACHE_STALE_MAX_AGE_SECONDS = 600

type UserActivityHandlerOptions<T> = {
  cacheName: string
  errorStatusMessage: string
  fetchActivity: (
    username: string,
    options: ActivityQueryOptions,
  ) => Promise<UserActivityPage<T>>
  timingDescription: string
}

export const createUserActivityHandler = <T>(
  options: UserActivityHandlerOptions<T>,
) => {
  const loadActivity = defineCachedFunction(
    async (
      _event: H3Event,
      username: string,
      activityOptions: ActivityQueryOptions,
    ): Promise<TimedData<UserActivityPage<T>>> => {
      const userActivityStartedAt = performance.now()
      const data = await options.fetchActivity(username, activityOptions)

      return {
        data,
        generatedAt: Date.now(),
        upstreamDuration: performance.now() - userActivityStartedAt,
      }
    },
    {
      getKey: (_event, username, activityOptions) => [
        encodeURIComponent(username),
        activityOptions.hitsPerPage,
        activityOptions.page,
        activityOptions.before ?? 'latest',
      ].join(':'),
      group: 'hn/data',
      maxAge: USER_ACTIVITY_CACHE_MAX_AGE_SECONDS,
      name: options.cacheName,
      staleMaxAge: USER_ACTIVITY_CACHE_STALE_MAX_AGE_SECONDS,
      swr: true,
      validate: (entry) => isDataCacheEntryValid(
        entry,
        USER_ACTIVITY_CACHE_MAX_AGE_SECONDS,
        USER_ACTIVITY_CACHE_STALE_MAX_AGE_SECONDS,
      ),
    },
  )

  return defineEventHandler(async (event) => {
    const { username } = getRouterParams(event)

    if (!isValidHnUsername(username)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Valid username is required',
      })
    }

    const query = getQuery(event)

    try {
      const requestStartedAt = Date.now()
      const activityOptions = {
        page: normalizeActivityPage(query.page),
        hitsPerPage: normalizeActivityHitsPerPage(query.hitsPerPage),
        before: normalizeActivityBefore(query.before),
      }
      const cacheStartedAt = performance.now()
      const result = await loadActivity(event, username, activityOptions)
      const cacheDuration = performance.now() - cacheStartedAt
      const cacheStatus = getDataCacheStatus(
        requestStartedAt,
        result.generatedAt,
        USER_ACTIVITY_CACHE_MAX_AGE_SECONDS,
      )

      setHeader(
        event,
        'Cache-Control',
        `public, max-age=${USER_ACTIVITY_CACHE_MAX_AGE_SECONDS}, stale-while-revalidate=${USER_ACTIVITY_CACHE_STALE_MAX_AGE_SECONDS}`,
      )
      setHeader(event, 'Server-Timing', formatServerTiming([
        {
          name: 'user-activity-cache',
          duration: cacheDuration,
          description: `Nitro user activity cache ${cacheStatus}`,
        },
        ...(cacheStatus === 'miss' ? [{
          name: 'user-activity',
          duration: result.upstreamDuration,
          description: options.timingDescription,
        }] : []),
      ]))

      return result.data
    } catch (error) {
      const unavailable = isUpstreamUnavailable(error)
      logUpstreamFailure(options.cacheName, error, { username })

      if (unavailable) {
        setHeader(event, 'Retry-After', 30)
      }

      throw createError({
        statusCode: unavailable ? 503 : 500,
        statusMessage: unavailable
          ? 'User activity is temporarily unavailable'
          : options.errorStatusMessage,
      })
    }
  })
}
