import type {
  ScreenshotEnv,
  ScreenshotRuntimeConfig,
} from './types'

const SCREENSHOT_RUNTIME_CONFIG_KEYS = [
  'screenshotBrowserActionTimeoutMs',
  'screenshotBrowserCacheTtlSeconds',
  'screenshotBrowserGotoTimeoutMs',
  'screenshotBrowserMinIntervalMs',
  'screenshotBrowserViewportHeight',
  'screenshotBrowserWaitAfterLoadMs',
  'screenshotBrowserlessProxyConcurrency',
  'screenshotBrowserlessProxyNavigationTimeoutMs',
  'screenshotBrowserlessProxyQueueDepth',
  'screenshotBrowserlessProxyQueueTimeoutMs',
  'screenshotBrowserlessProxyRequestTimeoutMs',
  'screenshotBrowserlessProxySettleMs',
  'screenshotBrowserlessProxyToken',
  'screenshotBrowserlessProxyUrl',
  'screenshotBrowserlessProxyViewportHeight',
  'screenshotCaptureConcurrency',
  'screenshotCaptureDailyLimit',
  'screenshotCaptureEnabled',
  'screenshotCaptureQueueDepth',
  'screenshotCaptureQueueTimeoutMs',
  'screenshotFailureTtlMinutes',
  'screenshotPolicyBlockedHosts',
  'screenshotPolicyProbeTimeoutMs',
  'screenshotPreviewHeight',
  'screenshotPreviewWebpQuality',
  'screenshotPreviewMaxBytes',
  'screenshotPreviewWidth',
  'screenshotProviders',
  'screenshotProviderStrategy',
  'screenshotRequestCaptureEnabled',
  'screenshotR2TtlDays',
  'screenshotXCancelBaseUrl',
] as const

const getNuxtBindingName = (runtimeConfigKey: string) => {
  const snakeCaseKey = runtimeConfigKey
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toUpperCase()

  return `NUXT_${snakeCaseKey}`
}

/**
 * Wrangler exposes `.dev.vars` and Worker secrets as platform bindings rather
 * than Node process environment variables. Overlay the same private `NUXT_*`
 * names that Nuxt accepts so screenshot configuration behaves consistently in
 * `nuxt dev` and in the deployed Worker runtime.
 */
export const resolveScreenshotRuntimeConfig = (
  runtimeConfig: ScreenshotRuntimeConfig,
  env: ScreenshotEnv | undefined,
): ScreenshotRuntimeConfig => {
  if (!env) {
    return runtimeConfig
  }

  let resolvedConfig = runtimeConfig

  for (const runtimeConfigKey of SCREENSHOT_RUNTIME_CONFIG_KEYS) {
    const bindingValue = env[getNuxtBindingName(runtimeConfigKey)]

    if (typeof bindingValue !== 'string') {
      continue
    }

    if (resolvedConfig === runtimeConfig) {
      resolvedConfig = { ...runtimeConfig }
    }

    resolvedConfig[runtimeConfigKey] = bindingValue
  }

  return resolvedConfig
}
