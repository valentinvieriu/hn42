export const SCREENSHOT_PROFILE_VERSION = 'v9'
export const SCREENSHOT_PREVIEW_HEIGHT = 11111
export const SCREENSHOT_PREVIEW_MAX_BYTES = 2_000_000
export const SCREENSHOT_PREVIEW_QUALITY = 55
export const SCREENSHOT_PREVIEW_WIDTH = 1440

export const getScreenshotPath = (storyId: string | number) => {
  return `/api/screenshot/${encodeURIComponent(String(storyId))}?profile=${SCREENSHOT_PROFILE_VERSION}`
}
