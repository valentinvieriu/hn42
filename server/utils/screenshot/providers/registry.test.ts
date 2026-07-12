import { describe, expect, it } from 'vitest'
import { getScreenshotProviderPlanId } from './registry'

describe('screenshot provider registry', () => {
  it('fingerprints the resolved provider order and strategy', () => {
    expect(getScreenshotProviderPlanId({}))
      .toBe('ordered:browser-run')
    expect(getScreenshotProviderPlanId({ screenshotProviderStrategy: ' BALANCED ' }))
      .toBe('balanced:browser-run')
  })
})
