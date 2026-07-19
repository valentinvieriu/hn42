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
const SCHEDULER_STATE_KEY = `screenshot-scheduler/v1/${SCREENSHOT_PROFILE_VERSION}/state.json`
const SCREENSHOT_PREFIX = `screenshots/${SCREENSHOT_PROFILE_VERSION}/items/`
export const SCHEDULER_FEEDS: ScreenshotJobFeed[] = ['top', 'best', 'show', 'new']
const FEED_LIMIT = 100
const MAX_ADMISSIONS_PER_RUN = 200
export const MAX_ADMISSIONS_PER_UTC_DAY = 8_000
const R2_FREE_STORAGE_BYTES = 10_000_000_000
const QUEUE_BATCH_LIMIT = 100
const MS_PER_DAY = 24 * 60 * 60 * 1000
const MS_PER_HOUR = 60 * 60 * 1000
const R2_OPERATION_CONCURRENCY = 6
const SCHEDULER_STATE_VERSION = 1
const STATE_WRITE_ATTEMPTS = 3
const STORAGE_STATE_MAX_AGE_MS = 60 * 60 * 1000

type RankedStory = {
  feed: ScreenshotJobFeed
  rank: number
  storyId: string
}

type AdmissionBucket = {
  count: number
  startedAt: string
}

type SchedulerState = {
  admissionBuckets: AdmissionBucket[]
  storageCalculatedAt: string
  storedScreenshotBytes: number
  version: typeof SCHEDULER_STATE_VERSION
}

type LoadedSchedulerState = {
  etag?: string
  state: SchedulerState | null
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

const mapWithConcurrency = async <Item, Result>(
  items: Item[],
  concurrency: number,
  callback: (item: Item, index: number) => Promise<Result>,
) => {
  const results = new Array<Result>(items.length)
  let nextIndex = 0

  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await callback(items[index]!, index)
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(Math.max(1, concurrency), items.length) },
      worker,
    ),
  )

  return results
}

export const filterUnadmittedStories = async (
  bucket: R2Bucket,
  stories: RankedStory[],
) => {
  const admissionMarkers = await mapWithConcurrency(
    stories,
    R2_OPERATION_CONCURRENCY,
    (story) => bucket.head(getAdmissionKey(story.storyId)),
  )
  const unadmitted: RankedStory[] = []
  let previouslyAdmitted = 0

  for (const [index, marker] of admissionMarkers.entries()) {
    if (marker) {
      previouslyAdmitted += 1
    } else {
      unadmitted.push(stories[index]!)
    }
  }

  return { previouslyAdmitted, unadmitted }
}

const getHourStart = (value: Date) => {
  const hour = new Date(value)
  hour.setUTCMinutes(0, 0, 0)
  return hour.toISOString()
}

const normalizeAdmissionBuckets = (
  buckets: AdmissionBucket[],
  now: Date,
) => {
  const countsByHour = new Map<string, number>()
  const rollingWindowStart = now.getTime() - MS_PER_DAY

  for (const bucket of buckets) {
    const startedAtMs = Date.parse(bucket.startedAt)

    if (
      !Number.isFinite(startedAtMs)
      || startedAtMs + MS_PER_HOUR <= rollingWindowStart
      || !Number.isSafeInteger(bucket.count)
      || bucket.count < 1
    ) {
      continue
    }

    const startedAt = getHourStart(new Date(startedAtMs))
    countsByHour.set(startedAt, (countsByHour.get(startedAt) ?? 0) + bucket.count)
  }

  return [...countsByHour.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([startedAt, count]) => ({ count, startedAt }))
}

export const summarizeAdmissionBuckets = (
  buckets: AdmissionBucket[],
  now: Date,
) => {
  const normalizedBuckets = normalizeAdmissionBuckets(buckets, now)
  const todayStartedAt = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  )

  return {
    admittedToday: normalizedBuckets.reduce((count, bucket) => {
      return count + (Date.parse(bucket.startedAt) >= todayStartedAt ? bucket.count : 0)
    }, 0),
    admittedWithinOneDay: normalizedBuckets.reduce((count, bucket) => count + bucket.count, 0),
    buckets: normalizedBuckets,
  }
}

const addAdmissions = (
  buckets: AdmissionBucket[],
  admittedCount: number,
  now: Date,
) => {
  if (admittedCount < 1) {
    return normalizeAdmissionBuckets(buckets, now)
  }

  return normalizeAdmissionBuckets([
    ...buckets,
    {
      count: admittedCount,
      startedAt: getHourStart(now),
    },
  ], now)
}

const rebuildAdmissionBuckets = async (bucket: R2Bucket, now: Date) => {
  const buckets: AdmissionBucket[] = []
  let cursor: string | undefined

  do {
    const page = await bucket.list({
      cursor,
      include: ['customMetadata'],
      prefix: ADMISSION_PREFIX,
    })

    for (const object of page.objects) {
      if (!/^\d+$/.test(object.key.slice(ADMISSION_PREFIX.length))) {
        continue
      }

      const discoveredAt = object.customMetadata?.discoveredAt
      const discoveredAtMs = discoveredAt ? Date.parse(discoveredAt) : Number.NaN

      if (Number.isFinite(discoveredAtMs)) {
        buckets.push({
          count: 1,
          startedAt: getHourStart(new Date(discoveredAtMs)),
        })
      }
    }

    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)

  return normalizeAdmissionBuckets(buckets, now)
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

const isSchedulerState = (value: unknown): value is SchedulerState => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const state = value as Partial<SchedulerState>

  return state.version === SCHEDULER_STATE_VERSION
    && Array.isArray(state.admissionBuckets)
    && typeof state.storageCalculatedAt === 'string'
    && Number.isFinite(Date.parse(state.storageCalculatedAt))
    && Number.isSafeInteger(state.storedScreenshotBytes)
    && Number(state.storedScreenshotBytes) >= 0
}

const readSchedulerState = async (
  bucket: R2Bucket,
  now: Date,
): Promise<LoadedSchedulerState> => {
  const object = await bucket.get(SCHEDULER_STATE_KEY)

  if (!object) {
    return { state: null }
  }

  try {
    const value = await object.json<unknown>()

    if (!isSchedulerState(value)) {
      return { etag: object.etag, state: null }
    }

    return {
      etag: object.etag,
      state: {
        ...value,
        admissionBuckets: normalizeAdmissionBuckets(value.admissionBuckets, now),
      },
    }
  } catch {
    return { etag: object.etag, state: null }
  }
}

const writeSchedulerState = async (
  bucket: R2Bucket,
  state: SchedulerState,
  etag: string | undefined,
) => {
  const object = await bucket.put(SCHEDULER_STATE_KEY, JSON.stringify(state), {
    httpMetadata: {
      cacheControl: 'no-store',
      contentType: 'application/json',
    },
    onlyIf: etag
      ? { etagMatches: etag }
      : { etagDoesNotMatch: '*' },
  })

  return object !== null
}

const loadSchedulerState = async (
  bucket: R2Bucket,
  now: Date,
) => {
  const loaded = await readSchedulerState(bucket, now)

  if (loaded.state) {
    return {
      ...loaded,
      rebuilt: false,
    }
  }

  const [admissionBuckets, storedScreenshotBytes] = await Promise.all([
    rebuildAdmissionBuckets(bucket, now),
    getStoredScreenshotBytes(bucket),
  ])

  return {
    etag: loaded.etag,
    rebuilt: true,
    state: {
      admissionBuckets,
      storageCalculatedAt: now.toISOString(),
      storedScreenshotBytes,
      version: SCHEDULER_STATE_VERSION,
    },
  } satisfies LoadedSchedulerState & { rebuilt: boolean }
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

  return Math.min(
    MAX_ADMISSIONS_PER_RUN,
    dailyCapacity,
    storageCapacity,
  )
}

export const reserveSchedulerCapacity = async (
  bucket: R2Bucket,
  candidateCount: number,
  now: Date,
) => {
  for (let attempt = 0; attempt < STATE_WRITE_ATTEMPTS; attempt += 1) {
    const loaded = await loadSchedulerState(bucket, now)
    let state = loaded.state!
    let stateChanged = loaded.rebuilt
    const storageCalculatedAtMs = Date.parse(state.storageCalculatedAt)

    if (now.getTime() - storageCalculatedAtMs >= STORAGE_STATE_MAX_AGE_MS) {
      state = {
        ...state,
        storageCalculatedAt: now.toISOString(),
        storedScreenshotBytes: await getStoredScreenshotBytes(bucket),
      }
      stateChanged = true
    }

    const admissionSummary = summarizeAdmissionBuckets(state.admissionBuckets, now)
    const admissionLimit = calculateAdmissionLimit({
      admittedToday: admissionSummary.admittedToday,
      admittedWithinOneDay: admissionSummary.admittedWithinOneDay,
      storedScreenshotBytes: state.storedScreenshotBytes,
    })
    const reservedCount = Math.min(candidateCount, admissionLimit)

    if (reservedCount > 0) {
      state = {
        ...state,
        admissionBuckets: addAdmissions(state.admissionBuckets, reservedCount, now),
      }
      stateChanged = true
    }

    if (!stateChanged || await writeSchedulerState(bucket, state, loaded.etag)) {
      const updatedSummary = summarizeAdmissionBuckets(state.admissionBuckets, now)

      return {
        admissionLimit,
        admittedToday: updatedSummary.admittedToday,
        admittedWithinOneDay: updatedSummary.admittedWithinOneDay,
        reservedCount,
        storedScreenshotBytes: state.storedScreenshotBytes,
      }
    }
  }

  throw new Error('Screenshot scheduler state changed repeatedly')
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

    await mapWithConcurrency(batch, R2_OPERATION_CONCURRENCY, (message) => {
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
    })
  }

  return messages.length
}

export const scheduleScreenshots = async (env: SchedulerEnv) => {
  const now = new Date()
  const feedResults = await Promise.allSettled(SCHEDULER_FEEDS.map(fetchFeed))
  const successfulFeeds = feedResults.flatMap((result) => {
    return result.status === 'fulfilled' ? [result.value] : []
  })

  for (const [index, result] of feedResults.entries()) {
    if (result.status === 'rejected') {
      console.warn(JSON.stringify({
        message: 'Screenshot scheduler feed failed',
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        feed: SCHEDULER_FEEDS[index],
      }))
    }
  }

  if (successfulFeeds.length === 0) {
    throw new Error('Every Hacker News feed request failed')
  }

  const candidates = mergeFeeds(successfulFeeds)
  const admissionMarkers = await filterUnadmittedStories(env.SCREENSHOTS_BUCKET, candidates)
  const reservation = await reserveSchedulerCapacity(
    env.SCREENSHOTS_BUCKET,
    admissionMarkers.unadmitted.length,
    now,
  )
  const newStories = admissionMarkers.unadmitted.slice(0, reservation.reservedCount)
  const admittedCount = await enqueueBatch(env, newStories, now.toISOString())

  console.info(JSON.stringify({
    message: 'Screenshot scheduler completed',
    admitted: admittedCount,
    admittedToday: reservation.admittedToday,
    admittedWithinOneDay: reservation.admittedWithinOneDay,
    admissionLimit: reservation.admissionLimit,
    candidates: candidates.length,
    dailyAdmissionCeiling: MAX_ADMISSIONS_PER_UTC_DAY,
    previouslyAdmitted: admissionMarkers.previouslyAdmitted,
    storedScreenshotBytes: reservation.storedScreenshotBytes,
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
