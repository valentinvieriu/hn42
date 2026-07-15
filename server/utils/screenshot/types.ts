export type ScreenshotProviderName = string
export type ScreenshotProcessorName = string
export type ScreenshotVariant = 'original' | 'thumbnail'
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
  HN42_SCREENSHOT_AGENT_TOKEN?: string
  SCREENSHOTS_BUCKET?: R2Bucket
  [key: string]: unknown
}

export type ScreenshotRuntimeConfig = {
  screenshotPolicyBlockedHosts?: unknown
  screenshotPolicyProbeTimeoutMs?: unknown
  screenshotR2TtlDays?: unknown
  screenshotXCancelBaseUrl?: unknown
  [key: string]: unknown
}

export type ScreenshotResult = {
  bytes: ArrayBuffer
  contentType: string
  processor?: ScreenshotProcessorName
  provider: ScreenshotProviderName
}
