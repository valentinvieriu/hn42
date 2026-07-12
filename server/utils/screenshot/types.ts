export type ScreenshotProviderName = string
export type ScreenshotProcessorName = string
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
  | 'non-html-content'
  | 'pdf-content'
  | 'pdf-url'
  | 'unavailable-content'
  | 'unverified-content'

export type ScreenshotEnv = {
  BROWSER?: BrowserRun
  SCREENSHOTS_BUCKET?: R2Bucket
  [key: string]: unknown
}

export type ScreenshotRuntimeConfig = {
  screenshotBrowserActionTimeoutMs?: unknown
  screenshotBrowserCacheTtlSeconds?: unknown
  screenshotBrowserGotoTimeoutMs?: unknown
  screenshotBrowserMinIntervalMs?: unknown
  screenshotBrowserViewportHeight?: unknown
  screenshotBrowserWaitAfterLoadMs?: unknown
  screenshotCaptureConcurrency?: unknown
  screenshotCaptureDailyLimit?: unknown
  screenshotCaptureEnabled?: unknown
  screenshotCaptureQueueDepth?: unknown
  screenshotCaptureQueueTimeoutMs?: unknown
  screenshotFailureTtlMinutes?: unknown
  screenshotPolicyBlockedHosts?: unknown
  screenshotPolicyProbeTimeoutMs?: unknown
  screenshotPreviewHeight?: unknown
  screenshotPreviewJpegQuality?: unknown
  screenshotPreviewMaxBytes?: unknown
  screenshotPreviewWidth?: unknown
  screenshotProviders?: unknown
  screenshotProviderStrategy?: unknown
  screenshotR2TtlDays?: unknown
  screenshotXCancelBaseUrl?: unknown
  [key: string]: unknown
}

export type ScreenshotResult = {
  bytes: ArrayBuffer
  browserMsUsed?: number
  contentType: string
  processor?: ScreenshotProcessorName
  provider: ScreenshotProviderName
}

export type ScreenshotPolicyMetadata = {
  policy?: ScreenshotPolicyName
  skipReason?: ScreenshotSkipReason
  sourceStrategy?: ScreenshotSourceStrategy
}
