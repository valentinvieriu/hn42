import {
  createError,
  defineEventHandler,
  getRequestHeader,
  getRouterParams,
  readRawBody,
} from 'h3'
import { isValidHnItemId } from '#shared/utils/hn'
import {
  isScreenshotAcceptedOutcome,
  isScreenshotSourceRoute,
  SCREENSHOT_PREVIEW_HEIGHT,
  SCREENSHOT_PREVIEW_MAX_BYTES,
  SCREENSHOT_PREVIEW_WIDTH,
  SCREENSHOT_PROFILE_VERSION,
} from '#shared/utils/screenshot'
import { requireScreenshotAgent } from '../../../../utils/screenshot/agentAuth'
import {
  getR2PreviewScreenshotKey,
  writeR2Screenshot,
} from '../../../../utils/screenshot/r2Cache'
import type { ScreenshotResult } from '../../../../utils/screenshot/types'
import { validateWebpScreenshot } from '../../../../utils/screenshot/validation'

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

  const contentLength = Number(getRequestHeader(event, 'content-length'))
  const outcome = getRequestHeader(event, 'x-screenshot-outcome')?.toLowerCase() ?? ''
  const sourceRoute = getRequestHeader(event, 'x-screenshot-source-route')?.toLowerCase() ?? ''

  if (getRequestHeader(event, 'content-type')?.split(';')[0]?.trim().toLowerCase() !== 'image/webp') {
    throw createError({ statusCode: 415, statusMessage: 'Screenshot result must be WebP' })
  }

  if (
    getRequestHeader(event, 'x-hn-screenshot-profile') !== SCREENSHOT_PROFILE_VERSION
    || !isScreenshotAcceptedOutcome(outcome)
    || !isScreenshotSourceRoute(sourceRoute)
  ) {
    throw createError({ statusCode: 422, statusMessage: 'Screenshot result metadata is invalid' })
  }

  requireDimension(event, 'x-screenshot-width', SCREENSHOT_PREVIEW_WIDTH)
  requireDimension(event, 'x-screenshot-height', SCREENSHOT_PREVIEW_HEIGHT)

  if (!Number.isSafeInteger(contentLength) || contentLength < 1 || contentLength > SCREENSHOT_PREVIEW_MAX_BYTES) {
    throw createError({ statusCode: 413, statusMessage: 'Screenshot result is outside the byte limit' })
  }

  const rawBody = await readRawBody(event, false)

  if (!rawBody) {
    throw createError({ statusCode: 400, statusMessage: 'Screenshot result body is required' })
  }

  const bytes = toArrayBuffer(rawBody)

  try {
    validateWebpScreenshot(bytes, SCREENSHOT_PREVIEW_MAX_BYTES)
  } catch {
    throw createError({ statusCode: 422, statusMessage: 'Screenshot result is not a bounded WebP image' })
  }

  const previewKey = getR2PreviewScreenshotKey(storyId)
  const result: ScreenshotResult = {
    bytes,
    contentType: 'image/webp',
    processor: `browserless-${sourceRoute}`,
    provider: 'browserless-agent',
    sourceRoute,
  }

  await writeR2Screenshot(
    env,
    previewKey,
    storyId,
    result,
    'original',
  )

  console.info(JSON.stringify({
    message: 'Background screenshot stored',
    bytes: bytes.byteLength,
    sourceRoute,
    storyId,
  }))

  return { status: 'stored' }
})
