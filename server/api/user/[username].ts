import { createError, defineEventHandler, getRouterParams, setHeader } from 'h3'
import type { HNUserProfile } from '#shared/types'
import { isValidHnUsername } from '#shared/utils/hn'
import { formatServerTiming } from '#shared/utils/serverTiming'
import { getErrorStatusCode } from '../../utils/error'

type AlgoliaUserProfile = {
  username?: string | null
  created_at?: string | null
  karma?: number | null
  about?: string | null
}

export default defineEventHandler(async (event) => {
  const { username } = getRouterParams(event)

  if (!isValidHnUsername(username)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid username is required',
    })
  }

  try {
    const algoliaUserStartedAt = performance.now()
    const profile = await $fetch<AlgoliaUserProfile>(
      `https://hn.algolia.com/api/v1/users/${encodeURIComponent(username)}`,
    )
    const algoliaUserDuration = performance.now() - algoliaUserStartedAt

    if (!profile?.username) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found',
      })
    }

    const userNormalizeStartedAt = performance.now()
    const userProfile: HNUserProfile = {
      username: profile.username,
      created_at: profile.created_at || '',
      karma: profile.karma || 0,
      about: profile.about || null,
    }
    const userNormalizeDuration = performance.now() - userNormalizeStartedAt

    setHeader(event, 'Cache-Control', 'public, max-age=300, stale-while-revalidate=900')
    setHeader(event, 'Server-Timing', formatServerTiming([
      {
        name: 'algolia-user',
        duration: algoliaUserDuration,
        description: 'Algolia user profile',
      },
      {
        name: 'user-normalize',
        duration: userNormalizeDuration,
        description: 'HN Glance user normalization',
      },
    ]))

    return userProfile
  } catch (error) {
    if (getErrorStatusCode(error) === 404) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found',
      })
    }

    console.error('Error fetching user profile:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to fetch user profile',
    })
  }
})
