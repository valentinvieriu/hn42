export type ScreenshotProviderName = 'browser-run'
export type ScreenshotProcessorName = 'browser-run' | 'original'
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
}

export type ScreenshotResult = {
  bytes: ArrayBuffer
  browserMsUsed?: number
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
