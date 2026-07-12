export const SCREENSHOT_PROFILE_VERSION = 'v7'

export const getScreenshotPath = (storyId: string | number) => {
  return `/api/screenshot/${encodeURIComponent(String(storyId))}?profile=${SCREENSHOT_PROFILE_VERSION}`
}
