import { describe, expect, it } from 'vitest'
import {
  getScreenshotPath,
  isScreenshotAcceptedOutcome,
  isScreenshotSourceRoute,
  SCREENSHOT_PROFILE_VERSION,
  SCREENSHOT_RETENTION_DAYS,
  SCREENSHOT_RETENTION_SECONDS,
} from './screenshot'

describe('screenshot profile URL', () => {
  it('uses one versioned canonical path for every consumer', () => {
    expect(SCREENSHOT_PROFILE_VERSION).toBe('v9')
    expect(SCREENSHOT_RETENTION_DAYS).toBe(28)
    expect(SCREENSHOT_RETENTION_SECONDS).toBe(2_419_200)
    expect(getScreenshotPath('48876506'))
      .toBe('/api/screenshot/48876506?profile=v9')
  })

  it('recognizes only trusted capture outcomes and source routes', () => {
    expect(isScreenshotAcceptedOutcome('ok')).toBe(true)
    expect(isScreenshotAcceptedOutcome('challenge')).toBe(false)
    expect(isScreenshotSourceRoute('ladder')).toBe(true)
    expect(isScreenshotSourceRoute('caller-provided')).toBe(false)
  })
})
