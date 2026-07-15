/// <reference path="../worker-configuration.d.ts" />

import {
  SCREENSHOT_JOB_PROTOCOL_VERSION,
  type ScreenshotJobFeed,
  type ScreenshotJobMessage,
} from '../../../shared/utils/screenshotJobs'
import { SCREENSHOT_PROFILE_VERSION } from '../../../shared/utils/screenshot'

const HN_FIREBASE_API_URL = 'https://hacker-news.firebaseio.com/v0'
const ADMISSION_PREFIX = `screenshot-jobs/v1/${SCREENSHOT_PROFILE_VERSION}/`
const FEEDS: ScreenshotJobFeed[] = ['top', 'best', 'new', 'show']
const FEED_LIMIT = 100
const MAX_ADMISSIONS_PER_RUN = 200
const QUEUE_BATCH_LIMIT = 100

type Env = SchedulerEnv & {
  SCREENSHOT_JOBS: Queue<ScreenshotJobMessage>
}

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

const listAdmissions = async (bucket: R2Bucket) => {
  const admitted = new Set<string>()
  let cursor: string | undefined

  do {
    const page = await bucket.list({
      cursor,
      prefix: ADMISSION_PREFIX,
    })

    for (const object of page.objects) {
      admitted.add(object.key.slice(ADMISSION_PREFIX.length))
    }

    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  return admitted
}

const enqueueBatch = async (
  env: Env,
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

export const scheduleScreenshots = async (env: Env) => {
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

  const [admitted, candidates] = await Promise.all([
    listAdmissions(env.SCREENSHOTS_BUCKET),
    Promise.resolve(mergeFeeds(successfulFeeds)),
  ])
  const newStories = candidates
    .filter((story) => !admitted.has(story.storyId))
    .slice(0, MAX_ADMISSIONS_PER_RUN)
  const admittedCount = await enqueueBatch(env, newStories, new Date().toISOString())

  console.info(JSON.stringify({
    message: 'Screenshot scheduler completed',
    admitted: admittedCount,
    candidates: candidates.length,
    previouslyAdmitted: admitted.size,
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

  scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(scheduleScreenshots(env))
  },
} satisfies ExportedHandler<Env>
