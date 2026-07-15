import {
  createError,
  defineEventHandler,
  getRouterParams,
} from 'h3'
import { useRuntimeConfig } from '#imports'
import { isValidHnItemId } from '#shared/utils/hn'
import type { ScreenshotPrepareResponse } from '#shared/utils/screenshotJobs'
import { requireScreenshotAgent } from '../../../../utils/screenshot/agentAuth'
import { resolveScreenshotJob } from '../../../../utils/screenshot/jobResolution'
import {
  isR2ScreenshotFailure,
  readR2Screenshot,
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
  const job = await resolveScreenshotJob(storyId, runtimeConfig)

  if (job.status === 'skip') {
    return {
      reason: job.skipReason,
      status: 'skipped',
    }
  }

  const [preview, failure] = await Promise.all([
    readR2Screenshot(
      env,
      job.previewKey,
      runtimeConfig.screenshotR2TtlDays,
      runtimeConfig.screenshotFailureTtlMinutes,
    ),
    readR2Screenshot(
      env,
      job.failureKey,
      runtimeConfig.screenshotR2TtlDays,
      runtimeConfig.screenshotFailureTtlMinutes,
    ),
  ])

  if (preview && !isR2ScreenshotFailure(preview) && preview.isFresh) {
    return { status: 'ready' }
  }

  if (failure && isR2ScreenshotFailure(failure) && failure.isFresh) {
    return {
      reason: 'recent-capture-failure',
      status: 'cooldown',
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
    profile: job.profile,
    status: 'capture',
  }
})
