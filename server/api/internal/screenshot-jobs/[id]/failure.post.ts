import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRouterParams,
  readBody,
} from 'h3'
import { useRuntimeConfig } from '#imports'
import { isValidHnItemId } from '#shared/utils/hn'
import { SCREENSHOT_PROFILE_VERSION } from '#shared/utils/screenshot'
import { requireScreenshotAgent } from '../../../../utils/screenshot/agentAuth'
import { resolveScreenshotJob } from '../../../../utils/screenshot/jobResolution'
import { writeR2ScreenshotFailure } from '../../../../utils/screenshot/r2Cache'
import { resolveScreenshotRuntimeConfig } from '../../../../utils/screenshot/runtimeConfig'
import type { ScreenshotRuntimeConfig } from '../../../../utils/screenshot/types'

const TERMINAL_FAILURE_KINDS = new Set(['invalid-output', 'target'])

type FailureBody = {
  kind?: unknown
  reason?: unknown
}

export default defineEventHandler(async (event) => {
  const env = await requireScreenshotAgent(event)
  const storyId = getRouterParams(event).id

  if (!isValidHnItemId(storyId)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid story ID is required' })
  }

  if (getRequestHeader(event, 'x-hn42-screenshot-profile') !== SCREENSHOT_PROFILE_VERSION) {
    throw createError({ statusCode: 400, statusMessage: 'Valid screenshot profile is required' })
  }

  const contentLength = Number(getRequestHeader(event, 'content-length') ?? 0)

  if (contentLength > 2048) {
    throw createError({ statusCode: 413, statusMessage: 'Failure report is too large' })
  }

  const body = await readBody<FailureBody>(event)

  if (
    !TERMINAL_FAILURE_KINDS.has(String(body?.kind))
    || typeof body?.reason !== 'string'
    || !body.reason.trim()
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Valid terminal failure is required' })
  }

  const runtimeConfig = resolveScreenshotRuntimeConfig(
    useRuntimeConfig(event) as ScreenshotRuntimeConfig,
    env,
  )
  const job = await resolveScreenshotJob(storyId, runtimeConfig)

  if (job.status === 'skip') {
    return { status: 'acknowledged' }
  }

  await writeR2ScreenshotFailure(
    env,
    job.failureKey,
    job.sourceUrlHash,
    body.reason,
    'original',
    {
      policy: 'capture',
      sourceStrategy: job.sourceDecision.sourceStrategy,
    },
    'queue:browserless-agent',
  )

  console.info(JSON.stringify({
    message: 'Background screenshot failure cooled down',
    kind: body.kind,
    storyId,
  }))

  return { status: 'acknowledged' }
})
