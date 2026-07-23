import {
  createError,
  defineEventHandler,
  getRouterParams,
  setHeader,
  type H3Event,
} from 'h3'
import { defineCachedFunction } from 'nitropack/runtime'
import type { HNUserProfile } from '#shared/types'
import { isValidHnUsername } from '#shared/utils/hn'
import { formatServerTiming } from '#shared/utils/serverTiming'
import { getErrorStatusCode } from '../../utils/error'
import {
  getDataCacheStatus,
  isDataCacheEntryValid,
  type TimedData,
} from '../../utils/dataCache'
import {
  isUpstreamUnavailable,
  logUpstreamFailure,
} from '../../utils/upstream'

type AlgoliaUserProfile = {
  username?: string | null
  created_at?: string | null
  karma?: number | null
  about?: string | null
}

const USER_PROFILE_CACHE_MAX_AGE_SECONDS = 300
const USER_PROFILE_CACHE_STALE_MAX_AGE_SECONDS = 900

type CachedUserProfile = TimedData<HNUserProfile | null> & {
  normalizeDuration: number
}

const loadUserProfile = defineCachedFunction(
  async (_event: H3Event, username: string): Promise<CachedUserProfile> => {
    const algoliaUserStartedAt = performance.now()
    const profile = await $fetch<AlgoliaUserProfile>(
      `https://hn.algolia.com/api/v1/users/${encodeURIComponent(username)}`,
      { retry: 0 },
    )
    const algoliaUserDuration = performance.now() - algoliaUserStartedAt
    const userNormalizeStartedAt = performance.now()
    const userProfile: HNUserProfile | null = profile?.username
      ? {
          username: profile.username,
          created_at: profile.created_at || '',
          karma: profile.karma || 0,
          about: profile.about || null,
        }
      : null

    return {
      data: userProfile,
      generatedAt: Date.now(),
      normalizeDuration: performance.now() - userNormalizeStartedAt,
      upstreamDuration: algoliaUserDuration,
    }
  },
  {
    getKey: (_event, username) => username,
    group: 'hn/data',
    maxAge: USER_PROFILE_CACHE_MAX_AGE_SECONDS,
    name: 'user-profile',
    staleMaxAge: USER_PROFILE_CACHE_STALE_MAX_AGE_SECONDS,
    swr: true,
    validate: (entry) => isDataCacheEntryValid(
      entry,
      USER_PROFILE_CACHE_MAX_AGE_SECONDS,
      USER_PROFILE_CACHE_STALE_MAX_AGE_SECONDS,
    ),
  },
)

export default defineEventHandler(async (event) => {
  const { username } = getRouterParams(event)

  if (!isValidHnUsername(username)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid username is required',
    })
  }

  try {
    const requestStartedAt = Date.now()
    const cacheStartedAt = performance.now()
    const result = await loadUserProfile(event, username)
    const cacheDuration = performance.now() - cacheStartedAt
    const cacheStatus = getDataCacheStatus(
      requestStartedAt,
      result.generatedAt,
      USER_PROFILE_CACHE_MAX_AGE_SECONDS,
    )

    if (!result.data) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found',
      })
    }

    setHeader(
      event,
      'Cache-Control',
      `public, max-age=${USER_PROFILE_CACHE_MAX_AGE_SECONDS}, stale-while-revalidate=${USER_PROFILE_CACHE_STALE_MAX_AGE_SECONDS}`,
    )
    setHeader(event, 'Server-Timing', formatServerTiming([
      {
        name: 'user-profile-cache',
        duration: cacheDuration,
        description: `Nitro user profile cache ${cacheStatus}`,
      },
      ...(cacheStatus === 'miss' ? [
        {
          name: 'algolia-user',
          duration: result.upstreamDuration,
          description: 'Algolia user profile',
        },
        {
          name: 'user-normalize',
          duration: result.normalizeDuration,
          description: 'HN Glance user normalization',
        },
      ] : []),
    ]))

    return result.data
  } catch (error) {
    if (getErrorStatusCode(error) === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found',
      })
    }

    const unavailable = isUpstreamUnavailable(error)
    logUpstreamFailure('user-profile', error, { username })

    if (unavailable) {
      setHeader(event, 'Retry-After', 30)
    }

    throw createError({
      statusCode: unavailable ? 503 : 500,
      statusMessage: unavailable
        ? 'User data is temporarily unavailable'
        : 'Failed to fetch user profile',
    })
  }
})
