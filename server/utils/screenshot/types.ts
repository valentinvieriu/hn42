import type { ScreenshotSourceRoute } from '../../../shared/utils/screenshot'

export type ScreenshotProviderName = string
export type ScreenshotProcessorName = string
export type ScreenshotVariant = 'original' | 'thumbnail'
export type ScreenshotSourceStrategy =
  | 'direct'
  | 'xcancel'
  | 'arxiv-abs'
  | 'skip-pdf'
export type ScreenshotSkipReason =
  | 'blocked-hostname'
  | 'invalid-url'
  | 'non-html-content'
  | 'pdf-content'
  | 'pdf-url'
  | 'unverified-content'

export type ScreenshotEnv = {
  HN42_SCREENSHOT_AGENT_TOKEN?: string
  SCREENSHOTS_BUCKET?: R2Bucket
  [key: string]: unknown
}

export type ScreenshotRuntimeConfig = {
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
  sourceRoute: ScreenshotSourceRoute
}
