export type ScreenshotProviderName = 'cloudflare-browser' | 'backup15'

export type ScreenshotEnv = {
  BROWSER?: Fetcher
  SCREENSHOTS_BUCKET?: R2Bucket
}

export type ScreenshotResult = {
  bytes: ArrayBuffer
  contentType: string
  provider: ScreenshotProviderName
  browserSession?: 'launched' | 'reused'
}

export type ScreenshotProviderContext = {
  env?: ScreenshotEnv
  browserConcurrency?: unknown
  browserKeepAliveMs?: unknown
  browserReuseSessions?: unknown
  backup15Concurrency?: unknown
}
