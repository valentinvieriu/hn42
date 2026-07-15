import { describe, expect, it } from 'vitest'
import {
  getScreenshotProviderPlanId,
  hasAvailableScreenshotProvider,
} from './providers/registry'
import { resolveScreenshotRuntimeConfig } from './runtimeConfig'

describe('screenshot runtime config', () => {
  it('overlays Nuxt screenshot settings supplied as Cloudflare bindings', () => {
    const runtimeConfig = {
      screenshotBrowserlessProxyToken: '',
      screenshotBrowserlessProxyUrl: 'https://default.example/v1/screenshots',
      screenshotCaptureEnabled: 'false',
      screenshotRequestCaptureEnabled: 'false',
      screenshotProviders: 'browser-run',
      screenshotProviderStrategy: 'balanced',
    }

    const resolvedConfig = resolveScreenshotRuntimeConfig(runtimeConfig, {
      NUXT_SCREENSHOT_BROWSERLESS_PROXY_TOKEN: 'proxy-secret',
      NUXT_SCREENSHOT_BROWSERLESS_PROXY_URL: 'https://screenshots.dev.localhost/v1/screenshots',
      NUXT_SCREENSHOT_CAPTURE_ENABLED: 'true',
      NUXT_SCREENSHOT_REQUEST_CAPTURE_ENABLED: 'true',
      NUXT_SCREENSHOT_PROVIDERS: 'browserless-proxy',
      NUXT_SCREENSHOT_PROVIDER_STRATEGY: 'ordered',
    })

    expect(resolvedConfig).toMatchObject({
      screenshotBrowserlessProxyToken: 'proxy-secret',
      screenshotBrowserlessProxyUrl: 'https://screenshots.dev.localhost/v1/screenshots',
      screenshotCaptureEnabled: 'true',
      screenshotRequestCaptureEnabled: 'true',
      screenshotProviders: 'browserless-proxy',
      screenshotProviderStrategy: 'ordered',
    })
    expect(runtimeConfig).toMatchObject({
      screenshotBrowserlessProxyToken: '',
      screenshotCaptureEnabled: 'false',
      screenshotProviders: 'browser-run',
    })
    expect(getScreenshotProviderPlanId(resolvedConfig))
      .toBe('ordered:browserless-proxy')
    expect(hasAvailableScreenshotProvider(
      undefined,
      'https://example.com/article',
      resolvedConfig,
    )).toBe(true)
  })

  it('maps acronym-heavy Nuxt binding names exactly', () => {
    const resolvedConfig = resolveScreenshotRuntimeConfig({}, {
      NUXT_SCREENSHOT_PREVIEW_WEBP_QUALITY: '62',
      NUXT_SCREENSHOT_R2_TTL_DAYS: '90',
      NUXT_SCREENSHOT_X_CANCEL_BASE_URL: 'https://xcancel.example',
    })

    expect(resolvedConfig).toMatchObject({
      screenshotPreviewWebpQuality: '62',
      screenshotR2TtlDays: '90',
      screenshotXCancelBaseUrl: 'https://xcancel.example',
    })
  })

  it('allows an empty secret binding to disable a configured provider', () => {
    const resolvedConfig = resolveScreenshotRuntimeConfig({
      screenshotBrowserlessProxyToken: 'process-secret',
    }, {
      NUXT_SCREENSHOT_BROWSERLESS_PROXY_TOKEN: '',
    })

    expect(resolvedConfig.screenshotBrowserlessProxyToken).toBe('')
  })

  it('ignores non-string bindings and avoids cloning when there are no overrides', () => {
    const runtimeConfig = { screenshotCaptureEnabled: 'false' }

    expect(resolveScreenshotRuntimeConfig(runtimeConfig, {
      NUXT_SCREENSHOT_CAPTURE_ENABLED: true,
    })).toBe(runtimeConfig)
    expect(resolveScreenshotRuntimeConfig(runtimeConfig, undefined)).toBe(runtimeConfig)
  })

  it('preserves false-like strings and ignores unknown binding names', () => {
    const resolvedConfig = resolveScreenshotRuntimeConfig({}, {
      NUXT_SCREENSHOT_CAPTURE_ENABLED: 'false',
      NUXT_SCREENSHOT_CAPTURE_QUEUE_DEPTH: '0',
      NUXT_SCREENSHOT_PROVIDERZ: 'browser-run',
    })

    expect(resolvedConfig).toMatchObject({
      screenshotCaptureEnabled: 'false',
      screenshotCaptureQueueDepth: '0',
    })
    expect(resolvedConfig.screenshotProviders).toBeUndefined()
  })
})
