import {
  createError,
  defineEventHandler,
  getRouterParams,
} from 'h3'
import { useRuntimeConfig } from '#imports'
import { isValidHnItemId } from '#shared/utils/hn'
import { SCREENSHOT_PROFILE_VERSION } from '#shared/utils/screenshot'
import type { ScreenshotPrepareResponse } from '#shared/utils/screenshotJobs'
import { requireScreenshotAgent } from '../../../../utils/screenshot/agentAuth'
import { resolveScreenshotJob } from '../../../../utils/screenshot/jobResolution'
import {
  getR2PreviewScreenshotKey,
  headR2Screenshot,
} from '../../../../utils/screenshot/r2Cache'
import { resolveScreenshotRuntimeConfig } from '../../../../utils/screenshot/runtimeConfig'
import { probeCaptureUrlContent } from '../../../../utils/screenshot/sourcePolicy'
import type { ScreenshotRuntimeConfig } from '../../../../utils/screenshot/types'

export default defineEventHandler(async (event): Promise<ScreenshotPrepareResponse> => {
  const env = await requireScreenshotAgent(event)
  const storyId = getRouterParams(event).id

  if (!isValidHnItemId(storyId)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Valid story ID is required',
    })
  }

  if (!env?.SCREENSHOTS_BUCKET) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Screenshot storage is unavailable',
    })
  }

  const runtimeConfig = resolveScreenshotRuntimeConfig(
    useRuntimeConfig(event) as ScreenshotRuntimeConfig,
    env,
  )
  const previewKey = getR2PreviewScreenshotKey(storyId)
  const preview = await headR2Screenshot(
    env,
    previewKey,
    runtimeConfig.screenshotR2TtlDays,
  )

  if (preview?.isFresh) {
    return { status: 'ready' }
  }

  const job = await resolveScreenshotJob(storyId, runtimeConfig)

  if (job.status === 'skip') {
    return {
      reason: job.skipReason,
      status: 'skipped',
    }
  }

  const probe = await probeCaptureUrlContent(job.sourceDecision.captureUrl, runtimeConfig)

  if (probe.policy === 'skip') {
    return {
      reason: probe.skipReason,
      status: 'skipped',
    }
  }

  return {
    captureUrl: probe.captureUrl,
    profile: SCREENSHOT_PROFILE_VERSION,
    status: 'capture',
  }
})
