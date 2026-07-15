/// <reference path="../worker-configuration.d.ts" />

import {
  SCREENSHOT_JOB_PROTOCOL_VERSION,
  type ScreenshotJobFeed,
  type ScreenshotJobMessage,
} from '../../../shared/utils/screenshotJobs'
import {
  SCREENSHOT_PREVIEW_MAX_BYTES,
  SCREENSHOT_PROFILE_VERSION,
} from '../../../shared/utils/screenshot'

const HN_FIREBASE_API_URL = 'https://hacker-news.firebaseio.com/v0'
const ADMISSION_PREFIX = `screenshot-jobs/v1/${SCREENSHOT_PROFILE_VERSION}/`
const STORAGE_STATE_KEY = `${ADMISSION_PREFIX}_storage-state`
const SCREENSHOT_PREFIX = `screenshots/${SCREENSHOT_PROFILE_VERSION}/items/`
const FEEDS: ScreenshotJobFeed[] = ['top', 'best', 'new', 'show']
const FEED_LIMIT = 100
const MAX_ADMISSIONS_PER_RUN = 200
const MAX_ADMISSIONS_PER_UTC_DAY = 1_000
const R2_FREE_STORAGE_BYTES = 10_000_000_000
const QUEUE_BATCH_LIMIT = 100
const MS_PER_DAY = 24 * 60 * 60 * 1000
const STORAGE_STATE_MAX_AGE_MS = 60 * 60 * 1000

type RankedStory = {
  feed: ScreenshotJobFeed
  rank: number
  storyId: string
}

const getAdmissionKey = (storyId: string) => `${ADMISSION_PREFIX}${storyId}`

const fetchFeed = async (feed: ScreenshotJobFeed): Promise<RankedStory[]> => {
  const response = await fetch(`${HN_FIREBASE_API_URL}/${feed}stories.json`)

  if (!response.ok) {
    throw new Error(`${feed} feed returned ${response.status}`)
  }

  const storyIds = await response.json<unknown>()

  if (!Array.isArray(storyIds)) {
    throw new Error(`${feed} feed returned an invalid payload`)
  }

  return storyIds
    .slice(0, FEED_LIMIT)
    .flatMap((storyId, index) => {
      const normalizedStoryId = String(storyId)

      return /^\d+$/.test(normalizedStoryId)
        ? [{ feed, rank: index + 1, storyId: normalizedStoryId }]
        : []
    })
}

export const mergeFeeds = (feeds: RankedStory[][]) => {
  const seen = new Set<string>()
  const merged: RankedStory[] = []

  for (const feed of feeds) {
    for (const story of feed) {
      if (!seen.has(story.storyId)) {
        seen.add(story.storyId)
        merged.push(story)
      }
    }
  }

  return merged
}

const listAdmissions = async (bucket: R2Bucket, now: Date) => {
  const admitted = new Set<string>()
  let admittedToday = 0
  let admittedWithinOneDay = 0
  let cachedStoredScreenshotBytes: number | null = null
  let cursor: string | undefined
  const today = now.toISOString().slice(0, 10)

  do {
    const page = await bucket.list({
      cursor,
      include: ['customMetadata'],
      prefix: ADMISSION_PREFIX,
    })

    for (const object of page.objects) {
      if (object.key === STORAGE_STATE_KEY) {
        const calculatedAtMs = Date.parse(object.customMetadata?.calculatedAt ?? '')
        const storedBytes = Number(object.customMetadata?.storedScreenshotBytes)

        if (
          Number.isFinite(calculatedAtMs)
          && now.getTime() - calculatedAtMs < STORAGE_STATE_MAX_AGE_MS
          && Number.isSafeInteger(storedBytes)
          && storedBytes >= 0
        ) {
          cachedStoredScreenshotBytes = storedBytes
        }

        continue
      }

      admitted.add(object.key.slice(ADMISSION_PREFIX.length))

      const discoveredAt = object.customMetadata?.discoveredAt
      const discoveredAtMs = discoveredAt ? Date.parse(discoveredAt) : Number.NaN

      if (discoveredAt?.startsWith(today)) {
        admittedToday += 1
      }

      if (Number.isFinite(discoveredAtMs) && now.getTime() - discoveredAtMs < MS_PER_DAY) {
        admittedWithinOneDay += 1
      }
    }

    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  return {
    admitted,
    admittedToday,
    admittedWithinOneDay,
    cachedStoredScreenshotBytes,
  }
}

const getStoredScreenshotBytes = async (bucket: R2Bucket) => {
  let bytes = 0
  let cursor: string | undefined

  do {
    const page = await bucket.list({
      cursor,
      prefix: SCREENSHOT_PREFIX,
    })

    for (const object of page.objects) {
      bytes += object.size
    }

    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  return bytes
}

const writeStoredScreenshotBytes = async (
  bucket: R2Bucket,
  storedScreenshotBytes: number,
  calculatedAt: string,
) => {
  await bucket.put(STORAGE_STATE_KEY, new Uint8Array(), {
    httpMetadata: {
      cacheControl: 'no-store',
      contentType: 'application/vnd.hn42.screenshot-storage-state',
    },
    customMetadata: {
      calculatedAt,
      storedScreenshotBytes: String(storedScreenshotBytes),
    },
  })
}

export const calculateAdmissionLimit = (options: {
  admittedToday: number
  admittedWithinOneDay: number
  storedScreenshotBytes: number
}) => {
  const dailyCapacity = Math.max(0, MAX_ADMISSIONS_PER_UTC_DAY - options.admittedToday)
  const reservedBytes = options.admittedWithinOneDay * SCREENSHOT_PREVIEW_MAX_BYTES
  const storageCapacity = Math.max(
    0,
    Math.floor((R2_FREE_STORAGE_BYTES - options.storedScreenshotBytes - reservedBytes) / SCREENSHOT_PREVIEW_MAX_BYTES),
  )

  return Math.min(MAX_ADMISSIONS_PER_RUN, dailyCapacity, storageCapacity)
}

const enqueueBatch = async (
  env: SchedulerEnv,
  stories: RankedStory[],
  discoveredAt: string,
) => {
  const messages: ScreenshotJobMessage[] = stories.map((story) => ({
    discoveredAt,
    feed: story.feed,
    profile: SCREENSHOT_PROFILE_VERSION,
    protocolVersion: SCREENSHOT_JOB_PROTOCOL_VERSION,
    rank: story.rank,
    reason: 'scheduled',
    storyId: story.storyId,
  }))

  for (let index = 0; index < messages.length; index += QUEUE_BATCH_LIMIT) {
    const batch = messages.slice(index, index + QUEUE_BATCH_LIMIT)

    await env.SCREENSHOT_JOBS.sendBatch(
      batch.map((body) => ({ body, contentType: 'json' })),
    )

    await Promise.all(batch.map((message) => {
      return env.SCREENSHOTS_BUCKET.put(getAdmissionKey(message.storyId), new Uint8Array(), {
        httpMetadata: {
          cacheControl: 'no-store',
          contentType: 'application/vnd.hn42.screenshot-job',
        },
        customMetadata: {
          discoveredAt,
          feed: message.feed,
          profile: message.profile,
          rank: String(message.rank),
        },
      })
    }))
  }

  return messages.length
}

export const scheduleScreenshots = async (env: SchedulerEnv) => {
  const now = new Date()
  const feedResults = await Promise.allSettled(FEEDS.map(fetchFeed))
  const successfulFeeds = feedResults.flatMap((result) => {
    return result.status === 'fulfilled' ? [result.value] : []
  })

  for (const [index, result] of feedResults.entries()) {
    if (result.status === 'rejected') {
      console.warn(JSON.stringify({
        message: 'Screenshot scheduler feed failed',
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        feed: FEEDS[index],
      }))
    }
  }

  if (successfulFeeds.length === 0) {
    throw new Error('Every Hacker News feed request failed')
  }

  const [admissionState, candidates] = await Promise.all([
    listAdmissions(env.SCREENSHOTS_BUCKET, now),
    Promise.resolve(mergeFeeds(successfulFeeds)),
  ])
  const storedScreenshotBytes = admissionState.cachedStoredScreenshotBytes
    ?? await getStoredScreenshotBytes(env.SCREENSHOTS_BUCKET)

  if (admissionState.cachedStoredScreenshotBytes === null) {
    await writeStoredScreenshotBytes(
      env.SCREENSHOTS_BUCKET,
      storedScreenshotBytes,
      now.toISOString(),
    )
  }
  const admissionLimit = calculateAdmissionLimit({
    admittedToday: admissionState.admittedToday,
    admittedWithinOneDay: admissionState.admittedWithinOneDay,
    storedScreenshotBytes,
  })
  const newStories = candidates
    .filter((story) => !admissionState.admitted.has(story.storyId))
    .slice(0, admissionLimit)
  const admittedCount = await enqueueBatch(env, newStories, now.toISOString())

  console.info(JSON.stringify({
    message: 'Screenshot scheduler completed',
    admitted: admittedCount,
    admittedToday: admissionState.admittedToday,
    admissionLimit,
    candidates: candidates.length,
    previouslyAdmitted: admissionState.admitted.size,
    storedScreenshotBytes,
  }))
}

export default {
  fetch(request: Request) {
    const url = new URL(request.url)

    if (request.method === 'GET' && url.pathname === '/healthz') {
      return Response.json({ status: 'ok' })
    }

    return new Response('Not found', { status: 404 })
  },

  scheduled(_controller: ScheduledController, env: SchedulerEnv, ctx: ExecutionContext) {
    ctx.waitUntil(scheduleScreenshots(env))
  },
} satisfies ExportedHandler<SchedulerEnv>
