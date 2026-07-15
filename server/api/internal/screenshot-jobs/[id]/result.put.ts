import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRouterParams,
  readRawBody,
} from 'h3'
import { useRuntimeConfig } from '#imports'
import { isValidHnItemId } from '#shared/utils/hn'
import { SCREENSHOT_PROFILE_VERSION } from '#shared/utils/screenshot'
import { requireScreenshotAgent } from '../../../../utils/screenshot/agentAuth'
import { resolveScreenshotJob } from '../../../../utils/screenshot/jobResolution'
import {
  deleteR2ScreenshotFailure,
  writeR2Screenshot,
} from '../../../../utils/screenshot/r2Cache'
import { resolveScreenshotRuntimeConfig } from '../../../../utils/screenshot/runtimeConfig'
import type {
  ScreenshotResult,
  ScreenshotRuntimeConfig,
} from '../../../../utils/screenshot/types'
import { validateWebpScreenshot } from '../../../../utils/screenshot/validation'

const normalizePositiveInteger = (value: unknown, fallback: number) => {
  const parsed = Number(value)

  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback
}

const requireDimension = (event: Parameters<typeof getRequestHeader>[0], name: string, maximum: number) => {
  const value = Number(getRequestHeader(event, name))

  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw createError({
      statusCode: 422,
      statusMessage: `Valid ${name} header is required`,
    })
  }
}

const toArrayBuffer = (body: string | Buffer<ArrayBufferLike>) => {
  if (typeof body === 'string') {
    return new TextEncoder().encode(body).buffer
  }

  return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer
}

export default defineEventHandler(async (event) => {
  const env = await requireScreenshotAgent(event)
  const storyId = getRouterParams(event).id

  if (!isValidHnItemId(storyId)) {
    throw createError({ statusCode: 400, statusMessage: 'Valid story ID is required' })
  }

  if (!env?.SCREENSHOTS_BUCKET) {
    throw createError({ statusCode: 503, statusMessage: 'Screenshot storage is unavailable' })
  }

  const runtimeConfig = resolveScreenshotRuntimeConfig(
    useRuntimeConfig(event) as ScreenshotRuntimeConfig,
    env,
  )
  const maximumBytes = normalizePositiveInteger(runtimeConfig.screenshotPreviewMaxBytes, 2_000_000)
  const maximumWidth = normalizePositiveInteger(runtimeConfig.screenshotPreviewWidth, 1440)
  const maximumHeight = normalizePositiveInteger(runtimeConfig.screenshotPreviewHeight, 11111)
  const contentLength = Number(getRequestHeader(event, 'content-length'))

  if (getRequestHeader(event, 'content-type')?.split(';')[0]?.trim().toLowerCase() !== 'image/webp') {
    throw createError({ statusCode: 415, statusMessage: 'Screenshot result must be WebP' })
  }

  if (
    getRequestHeader(event, 'x-hn42-screenshot-profile') !== SCREENSHOT_PROFILE_VERSION
    || !['ok', 'access_gate'].includes(getRequestHeader(event, 'x-screenshot-outcome')?.toLowerCase() ?? '')
    || getRequestHeader(event, 'x-screenshot-source-route')?.toLowerCase() !== 'direct'
  ) {
    throw createError({ statusCode: 422, statusMessage: 'Screenshot result metadata is invalid' })
  }

  requireDimension(event, 'x-screenshot-width', maximumWidth)
  requireDimension(event, 'x-screenshot-height', maximumHeight)

  if (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > maximumBytes) {
    throw createError({ statusCode: 413, statusMessage: 'Screenshot result is outside the byte limit' })
  }

  const rawBody = await readRawBody(event, false)

  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Screenshot result body is required' })
  }

  const bytes = toArrayBuffer(rawBody)

  try {
    validateWebpScreenshot(bytes, maximumBytes)
  } catch {
    throw createError({ statusCode: 422, statusMessage: 'Screenshot result is not a bounded WebP image' })
  }

  const job = await resolveScreenshotJob(storyId, runtimeConfig)

  if (job.status === 'skip') {
    throw createError({ statusCode: 409, statusMessage: 'Story is no longer eligible for capture' })
  }

  const result: ScreenshotResult = {
    bytes,
    contentType: 'image/webp',
    processor: 'browserless-proxy',
    provider: 'browserless-agent',
  }

  await writeR2Screenshot(
    env,
    job.previewKey,
    job.sourceUrlHash,
    result,
    'original',
    {
      policy: 'capture',
      sourceStrategy: job.sourceDecision.sourceStrategy,
    },
  )
  await deleteR2ScreenshotFailure(env, job.failureKey)

  console.info(JSON.stringify({
    message: 'Background screenshot stored',
    bytes: bytes.byteLength,
    storyId,
  }))

  return { status: 'stored' }
})
