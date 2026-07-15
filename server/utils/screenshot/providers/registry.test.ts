import { describe, expect, it } from 'vitest'
import {
  getConfiguredScreenshotProviders,
  getScreenshotProviderPlanId,
} from './registry'

describe('screenshot provider registry', () => {
  it('fingerprints the resolved provider order and strategy', () => {
    expect(getScreenshotProviderPlanId({}))
      .toBe('ordered:browser-run')
    expect(getScreenshotProviderPlanId({ screenshotProviderStrategy: ' BALANCED ' }))
      .toBe('balanced:browser-run')
  })

  it('registers the Browserless proxy in an ordered fallback chain', () => {
    const runtimeConfig = {
      screenshotBrowserlessProxyToken: 'secret',
      screenshotBrowserlessProxyUrl: 'https://screenshots.dev.localhost/v1/screenshots',
      screenshotProviders: 'browserless-proxy,browser-run',
    }

    expect(getConfiguredScreenshotProviders(runtimeConfig).map((provider) => provider.name))
      .toEqual(['browserless-proxy', 'browser-run'])
    expect(getScreenshotProviderPlanId(runtimeConfig))
      .toBe('ordered:browserless-proxy,browser-run')
  })

  it('treats an explicitly empty provider list as disabled', () => {
    const runtimeConfig = { screenshotProviders: '   ' }

    expect(getConfiguredScreenshotProviders(runtimeConfig)).toEqual([])
    expect(getScreenshotProviderPlanId(runtimeConfig)).toBe('ordered:')
  })
})
