import { SCREENSHOT_PROFILE_VERSION } from '#shared/utils/screenshot'
import { isValidHnItemId } from '#shared/utils/hn'
import {
  getR2PreviewScreenshotKey,
  getR2ScreenshotFailureKey,
  getSourceUrlHash,
} from './r2Cache'
import {
  createScreenshotSourceDecision,
  normalizeSourceUrl,
  type ScreenshotCaptureDecision,
} from './sourcePolicy'
import type {
  ScreenshotRuntimeConfig,
  ScreenshotSkipReason,
  ScreenshotSourceStrategy,
} from './types'

const HN_FIREBASE_API_URL = 'https://hacker-news.firebaseio.com/v0'

type HnFirebaseStory = {
  dead?: unknown
  deleted?: unknown
  type?: unknown
  url?: unknown
}

export type ResolvedScreenshotCaptureJob = {
  failureKey: string
  hostname: string
  previewKey: string
  profile: typeof SCREENSHOT_PROFILE_VERSION
  sourceDecision: ScreenshotCaptureDecision
  sourceUrlHash: string
  status: 'capture'
  storyId: string
}

export type ResolvedScreenshotSkipJob = {
  skipReason: ScreenshotSkipReason
  sourceStrategy?: ScreenshotSourceStrategy
  status: 'skip'
  storyId: string
}

export type ResolvedScreenshotJob = ResolvedScreenshotCaptureJob | ResolvedScreenshotSkipJob

const resolveStorySourceUrl = async (storyId: string) => {
  const response = await fetch(`${HN_FIREBASE_API_URL}/item/${storyId}.json`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(3000),
  })

  if (!response.ok) {
    throw new Error(`HN item lookup returned ${response.status}`)
  }

  const story = await response.json() as HnFirebaseStory | null

  if (story?.type !== 'story' || story.dead === true || story.deleted === true) {
    return null
  }

  return normalizeSourceUrl(story.url)
}

export const resolveScreenshotJob = async (
  storyId: string,
  runtimeConfig: ScreenshotRuntimeConfig,
): Promise<ResolvedScreenshotJob> => {
  if (!isValidHnItemId(storyId)) {
    return {
      skipReason: 'invalid-url',
      status: 'skip',
      storyId,
    }
  }

  const sourceUrl = await resolveStorySourceUrl(storyId)

  if (!sourceUrl) {
    return {
      skipReason: 'invalid-url',
      status: 'skip',
      storyId,
    }
  }

  const sourceDecision = createScreenshotSourceDecision(sourceUrl, runtimeConfig)

  if (sourceDecision.policy === 'skip') {
    return {
      skipReason: sourceDecision.skipReason,
      sourceStrategy: sourceDecision.sourceStrategy,
      status: 'skip',
      storyId,
    }
  }

  const sourceUrlHash = await getSourceUrlHash(sourceDecision.cacheIdentityUrl)
  const previewKey = getR2PreviewScreenshotKey(
    sourceUrlHash,
    runtimeConfig.screenshotPreviewWidth,
    runtimeConfig.screenshotPreviewHeight,
    runtimeConfig.screenshotPreviewWebpQuality,
  )

  return {
    failureKey: getR2ScreenshotFailureKey(previewKey),
    hostname: new URL(sourceDecision.captureUrl).hostname.toLowerCase(),
    previewKey,
    profile: SCREENSHOT_PROFILE_VERSION,
    sourceDecision,
    sourceUrlHash,
    status: 'capture',
    storyId,
  }
}

