import { describe, expect, it } from 'vitest'
import {
  parseScreenshotJobMessage,
  SCREENSHOT_JOB_PROTOCOL_VERSION,
} from './screenshotJobs'
import { SCREENSHOT_PROFILE_VERSION } from './screenshot'

const validJob = {
  discoveredAt: '2026-07-15T10:00:00.000Z',
  feed: 'top',
  profile: SCREENSHOT_PROFILE_VERSION,
  protocolVersion: SCREENSHOT_JOB_PROTOCOL_VERSION,
  rank: 1,
  reason: 'scheduled',
  storyId: '12345678',
}

describe('parseScreenshotJobMessage', () => {
  it('accepts the versioned scheduler contract', () => {
    expect(parseScreenshotJobMessage(validJob)).toEqual(validJob)
  })

  it.each([
    { ...validJob, storyId: 'not-an-id' },
    { ...validJob, profile: 'v7' },
    { ...validJob, rank: 0 },
    { ...validJob, feed: 'ask' },
    { ...validJob, discoveredAt: 'invalid-date' },
  ])('rejects an invalid job', (job) => {
    expect(parseScreenshotJobMessage(job)).toBeNull()
  })
})
