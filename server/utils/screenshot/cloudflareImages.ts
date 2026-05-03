import { createConcurrencyLimiter } from './concurrency'
import type { ScreenshotResult } from './types'

const DEFAULT_WIDTH = 720
const DEFAULT_HEIGHT = 1440
const DEFAULT_QUALITY = 78
const DEFAULT_QUEUE_TIMEOUT_MS = 15000
const DEFAULT_TIMEOUT_MS = 5000
const MIN_THUMBNAIL_BYTES = 512
const imagesTransformLimiter = createConcurrencyLimiter(1)

type ImagesThumbnailOptions = {
  concurrency?: unknown
  height?: unknown
  quality?: unknown
  queueTimeoutMs?: unknown
  timeoutMs?: unknown
  width?: unknown
}

const normalizePositiveInteger = (value: unknown, fallback: number) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return fallback
  }

  return Math.max(1, Math.floor(parsedValue))
}

const normalizeQuality = (value: unknown) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_QUALITY
  }

  return Math.min(100, Math.max(1, Math.floor(parsedValue)))
}

const runWithTimeout = async <T>(
  task: Promise<T>,
  timeoutMs: number,
  label = 'Cloudflare Images thumbnail transformation',
) => {
  let timeout: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([task, timeoutPromise])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

const getImageStream = (original: ScreenshotResult) => {
  const stream = new Response(original.bytes, {
    headers: {
      'Content-Type': original.contentType,
    },
  }).body

  if (!stream) {
    throw new Error('Could not create image stream for Cloudflare Images')
  }

  return stream
}

const transformThumbnail = async (
  images: ImagesBinding,
  original: ScreenshotResult,
  options: Required<ImagesThumbnailOptions>,
): Promise<ScreenshotResult> => {
  const result = await images
    .input(getImageStream(original))
    .transform({
      fit: 'crop',
      gravity: 'top',
      height: Number(options.height),
      width: Number(options.width),
    })
    .output({
      anim: false,
      format: 'image/webp',
      quality: Number(options.quality),
    })
  const bytes = await new Response(result.image()).arrayBuffer()
  const contentType = result.contentType()

  if (contentType !== 'image/webp') {
    throw new Error(`Cloudflare Images returned ${contentType || 'unknown content type'}`)
  }

  if (bytes.byteLength < MIN_THUMBNAIL_BYTES) {
    throw new Error('Cloudflare Images returned an invalid thumbnail')
  }

  return {
    bytes,
    contentType,
    processor: 'images',
    provider: original.provider,
    sourceStrategy: original.sourceStrategy,
    variant: 'thumbnail',
  }
}

export const createThumbnailWithCloudflareImages = async (
  images: ImagesBinding | undefined,
  original: ScreenshotResult,
  options: ImagesThumbnailOptions,
) => {
  if (!images) {
    throw new Error('Cloudflare Images binding is not configured')
  }

  const normalizedOptions: Required<ImagesThumbnailOptions> = {
    concurrency: options.concurrency,
    height: normalizePositiveInteger(options.height, DEFAULT_HEIGHT),
    quality: normalizeQuality(options.quality),
    queueTimeoutMs: normalizePositiveInteger(options.queueTimeoutMs, DEFAULT_QUEUE_TIMEOUT_MS),
    timeoutMs: normalizePositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS),
    width: normalizePositiveInteger(options.width, DEFAULT_WIDTH),
  }
  const release = await imagesTransformLimiter.acquire(normalizedOptions.concurrency, {
    label: 'Cloudflare Images thumbnail transformation',
    maxQueueWaitMs: normalizedOptions.queueTimeoutMs,
  })

  try {
    return await runWithTimeout(
      transformThumbnail(images, original, normalizedOptions),
      normalizedOptions.timeoutMs,
      'Cloudflare Images thumbnail transformation',
    )
  } finally {
    release()
  }
}

export const getCloudflareImagesErrorCode = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null
  }

  const code = Number((error as { code?: unknown }).code)

  return Number.isFinite(code) ? code : null
}

export const isCloudflareImagesQuotaError = (error: unknown) => {
  return getCloudflareImagesErrorCode(error) === 9422
}
