export type ScreenshotProviderName = 'backup15'
export type ScreenshotProcessorName = 'images' | 'wasm' | 'original'
export type ScreenshotVariant = 'original' | 'thumbnail'

export type ScreenshotEnv = {
  IMAGES?: ImagesBinding
  SCREENSHOTS_BUCKET?: R2Bucket
}

export type ScreenshotResult = {
  bytes: ArrayBuffer
  contentType: string
  processor?: ScreenshotProcessorName
  provider: ScreenshotProviderName
  variant?: ScreenshotVariant
}

export type ThumbnailRuntimeConfig = {
  concurrency: unknown
  height: unknown
  jpegQuality: unknown
  maxInputBytes: unknown
  maxInputPixels: unknown
  timeoutMs: unknown
  width: unknown
}
