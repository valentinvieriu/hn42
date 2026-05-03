export type ScreenshotProviderName = 'backup15'
export type ScreenshotProcessorName = 'images' | 'wasm' | 'original'
export type ScreenshotVariant = 'original' | 'thumbnail'
export type ScreenshotPolicyName = 'capture' | 'skip'
export type ScreenshotSourceStrategy =
  | 'direct'
  | 'xcancel'
  | 'arxiv-abs'
  | 'skip-pdf'
  | 'skip-known-blocked'
export type ScreenshotSkipReason =
  | 'blocked-hostname'
  | 'invalid-url'
  | 'known-blocked-host'
  | 'pdf-content'
  | 'pdf-url'

export type ScreenshotEnv = {
  IMAGES?: ImagesBinding
  SCREENSHOTS_BUCKET?: R2Bucket
}

export type ScreenshotResult = {
  bytes: ArrayBuffer
  contentType: string
  processor?: ScreenshotProcessorName
  provider: ScreenshotProviderName
  sourceStrategy?: ScreenshotSourceStrategy
  variant?: ScreenshotVariant
}

export type ScreenshotPolicyMetadata = {
  policy?: ScreenshotPolicyName
  skipReason?: ScreenshotSkipReason
  sourceStrategy?: ScreenshotSourceStrategy
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
