import { describe, expect, it } from 'vitest'
import { resolveScreenshotRuntimeConfig } from './runtimeConfig'

describe('screenshot runtime config', () => {
  it('overlays background screenshot settings supplied as Cloudflare bindings', () => {
    const runtimeConfig = {
      screenshotPolicyProbeTimeoutMs: '1200',
    }

    const resolvedConfig = resolveScreenshotRuntimeConfig(runtimeConfig, {
      NUXT_SCREENSHOT_POLICY_PROBE_TIMEOUT_MS: '2000',
    })

    expect(resolvedConfig).toMatchObject({
      screenshotPolicyProbeTimeoutMs: '2000',
    })
    expect(runtimeConfig.screenshotPolicyProbeTimeoutMs).toBe('1200')
  })

  it('maps acronym-heavy Nuxt binding names exactly', () => {
    const resolvedConfig = resolveScreenshotRuntimeConfig({}, {
      NUXT_SCREENSHOT_R2_TTL_DAYS: '90',
      NUXT_SCREENSHOT_X_CANCEL_BASE_URL: 'https://xcancel.example',
    })

    expect(resolvedConfig).toMatchObject({
      screenshotR2TtlDays: '90',
      screenshotXCancelBaseUrl: 'https://xcancel.example',
    })
  })

  it('ignores non-string and obsolete bindings without cloning', () => {
    const runtimeConfig = { screenshotR2TtlDays: '30' }

    expect(resolveScreenshotRuntimeConfig(runtimeConfig, {
      NUXT_SCREENSHOT_CAPTURE_ENABLED: 'true',
    })).toBe(runtimeConfig)
    expect(resolveScreenshotRuntimeConfig(runtimeConfig, undefined)).toBe(runtimeConfig)
  })
})
