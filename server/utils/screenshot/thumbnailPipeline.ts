import {
  createThumbnailWithCloudflareImages,
  isCloudflareImagesQuotaError,
} from './cloudflareImages'
import {
  writeR2Screenshot,
  writeR2ScreenshotFailure,
} from './r2Cache'
import { createThumbnailFromJpeg } from './thumbnail'
import type {
  ScreenshotEnv,
  ScreenshotResult,
  ThumbnailRuntimeConfig,
} from './types'

const IMAGES_QUOTA_COOLDOWN_MS = 30 * 60 * 1000
const pendingThumbnailProcesses = new Map<string, Promise<ScreenshotResult>>()
let imagesQuotaCooldownExpiresAt = 0

type ThumbnailPipelineOptions = {
  config: ThumbnailRuntimeConfig
  env: ScreenshotEnv | undefined
  forgetR2Miss: (key: string) => void
  jpegKey: string
  original: ScreenshotResult
  scheduleBackground: (task: Promise<unknown>) => void
  sourceUrlHash: string
  webpKey: string
  writeFailureMarker: boolean
}

const shouldSkipCloudflareImages = () => {
  if (imagesQuotaCooldownExpiresAt <= Date.now()) {
    imagesQuotaCooldownExpiresAt = 0
    return false
  }

  return true
}

const noteCloudflareImagesQuotaExhausted = () => {
  imagesQuotaCooldownExpiresAt = Date.now() + IMAGES_QUOTA_COOLDOWN_MS
}

const canUseCloudflareImages = (env: ScreenshotEnv | undefined) => {
  return !import.meta.dev && Boolean(env?.IMAGES)
}

const createAndPersistCloudflareImagesThumbnail = (
  options: ThumbnailPipelineOptions,
) => {
  const pendingProcess = pendingThumbnailProcesses.get(options.webpKey)

  if (pendingProcess) {
    return pendingProcess
  }

  const process = createThumbnailWithCloudflareImages(options.env?.IMAGES, options.original, {
    concurrency: options.config.concurrency,
    height: options.config.height,
    quality: options.config.jpegQuality,
    timeoutMs: options.config.timeoutMs,
    width: options.config.width,
  })
    .then((thumbnail) => {
      options.forgetR2Miss(options.webpKey)
      options.scheduleBackground(
        writeR2Screenshot(options.env, options.webpKey, options.sourceUrlHash, thumbnail, 'thumbnail').catch((error) => {
          console.warn(`R2 WebP thumbnail screenshot write failed: ${error instanceof Error ? error.message : String(error)}`)
        }),
      )

      return thumbnail
    })
    .finally(() => {
      pendingThumbnailProcesses.delete(options.webpKey)
    })

  pendingThumbnailProcesses.set(options.webpKey, process)

  return process
}

const createAndPersistWasmThumbnail = (
  options: ThumbnailPipelineOptions,
) => {
  const pendingProcess = pendingThumbnailProcesses.get(options.jpegKey)

  if (pendingProcess) {
    return pendingProcess
  }

  const process = createThumbnailFromJpeg(options.original, {
    concurrency: options.config.concurrency,
    height: options.config.height,
    jpegQuality: options.config.jpegQuality,
    maxInputBytes: options.config.maxInputBytes,
    maxInputPixels: options.config.maxInputPixels,
    timeoutMs: options.config.timeoutMs,
    width: options.config.width,
  })
    .then((thumbnail) => {
      options.forgetR2Miss(options.jpegKey)
      options.scheduleBackground(
        writeR2Screenshot(options.env, options.jpegKey, options.sourceUrlHash, thumbnail, 'thumbnail').catch((error) => {
          console.warn(`R2 thumbnail screenshot write failed: ${error instanceof Error ? error.message : String(error)}`)
        }),
      )

      return thumbnail
    })
    .finally(() => {
      pendingThumbnailProcesses.delete(options.jpegKey)
    })

  pendingThumbnailProcesses.set(options.jpegKey, process)

  return process
}

const getErrorMessage = (error: unknown) => {
  return error instanceof Error ? error.message : String(error)
}

export const createAndPersistThumbnailWithPipeline = async (
  options: ThumbnailPipelineOptions,
) => {
  let imagesError: unknown = null
  let imagesAttempted = false
  let imagesQuotaExhausted = false

  if (canUseCloudflareImages(options.env) && !shouldSkipCloudflareImages()) {
    try {
      imagesAttempted = true
      return await createAndPersistCloudflareImagesThumbnail(options)
    } catch (error) {
      imagesError = error

      if (isCloudflareImagesQuotaError(error)) {
        imagesQuotaExhausted = true
        noteCloudflareImagesQuotaExhausted()
      }

      console.warn(`Cloudflare Images thumbnail processing failed: ${getErrorMessage(error)}`)
    }
  }

  try {
    return await createAndPersistWasmThumbnail(options)
  } catch (error) {
    console.warn(`JPEG thumbnail processing failed: ${getErrorMessage(error)}`)

    if (options.writeFailureMarker && imagesAttempted && !imagesQuotaExhausted) {
      const imagesReason = imagesError ? getErrorMessage(imagesError) : 'Cloudflare Images was unavailable or skipped'
      const wasmReason = getErrorMessage(error)

      options.scheduleBackground(
        writeR2ScreenshotFailure(
          options.env,
          options.webpKey,
          options.sourceUrlHash,
          `Images: ${imagesReason}; WASM: ${wasmReason}`,
          'thumbnail',
        ).catch((writeError) => {
          console.warn(`R2 thumbnail failure write failed: ${getErrorMessage(writeError)}`)
        }),
      )
    }
  }

  return null
}
