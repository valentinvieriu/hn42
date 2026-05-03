export type ScreenshotProviderName = 'backup15'

export type ScreenshotEnv = {
  SCREENSHOTS_BUCKET?: R2Bucket
}

export type ScreenshotResult = {
  bytes: ArrayBuffer
  contentType: string
  provider: ScreenshotProviderName
}
