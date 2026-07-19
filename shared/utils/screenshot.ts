export const SCREENSHOT_PROFILE_VERSION = 'v9'
export const SCREENSHOT_RETENTION_DAYS = 28
export const SCREENSHOT_RETENTION_SECONDS = SCREENSHOT_RETENTION_DAYS * 24 * 60 * 60
export const SCREENSHOT_PREVIEW_HEIGHT = 11111
export const SCREENSHOT_PREVIEW_MAX_BYTES = 2_000_000
export const SCREENSHOT_PREVIEW_QUALITY = 55
export const SCREENSHOT_PREVIEW_WIDTH = 1440
export const SCREENSHOT_ACCEPTED_OUTCOMES = ['ok', 'access_gate'] as const
export const SCREENSHOT_SOURCE_ROUTES = ['direct', 'ladder'] as const

export type ScreenshotAcceptedOutcome = typeof SCREENSHOT_ACCEPTED_OUTCOMES[number]
export type ScreenshotSourceRoute = typeof SCREENSHOT_SOURCE_ROUTES[number]

export const isScreenshotAcceptedOutcome = (value: string): value is ScreenshotAcceptedOutcome => {
  return SCREENSHOT_ACCEPTED_OUTCOMES.some((outcome) => outcome === value)
}

export const isScreenshotSourceRoute = (value: string): value is ScreenshotSourceRoute => {
  return SCREENSHOT_SOURCE_ROUTES.some((route) => route === value)
}

export const getScreenshotPath = (storyId: string | number) => {
  return `/api/screenshot/${encodeURIComponent(String(storyId))}?profile=${SCREENSHOT_PROFILE_VERSION}`
}
