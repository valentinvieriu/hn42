import { describe, expect, it } from 'vitest'
import { getScreenshotPath, SCREENSHOT_PROFILE_VERSION } from './screenshot'

describe('screenshot profile URL', () => {
  it('uses one versioned canonical path for every consumer', () => {
    expect(SCREENSHOT_PROFILE_VERSION).toBe('v7')
    expect(getScreenshotPath('48876506'))
      .toBe('/api/screenshot/48876506?profile=v7')
  })
})
