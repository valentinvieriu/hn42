import { captureWithBackup15 } from './backup15'
import { captureWithCloudflareBrowser } from './cloudflareBrowser'
import type {
  ScreenshotProviderContext,
  ScreenshotProviderName,
  ScreenshotResult,
} from './types'

const DEFAULT_PROVIDER_ORDER: ScreenshotProviderName[] = ['cloudflare-browser', 'backup15']

const normalizeProviderName = (provider: string): ScreenshotProviderName | null => {
  const normalizedProvider = provider.trim().toLowerCase()

  if (
    normalizedProvider === 'cloudflare-browser'
    || normalizedProvider === 'browser'
    || normalizedProvider === 'browser-run'
  ) {
    return 'cloudflare-browser'
  }

  if (normalizedProvider === 'backup15' || normalizedProvider === 'terasp') {
    return 'backup15'
  }

  return null
}

export const parseProviderOrder = (value: unknown): ScreenshotProviderName[] => {
  if (typeof value !== 'string') {
    return DEFAULT_PROVIDER_ORDER
  }

  const providers = value
    .split(',')
    .map(normalizeProviderName)
    .filter((provider): provider is ScreenshotProviderName => Boolean(provider))

  return providers.length > 0 ? Array.from(new Set(providers)) : DEFAULT_PROVIDER_ORDER
}

const formatError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export const captureScreenshot = async (
  sourceUrl: string,
  providerOrder: unknown,
  context: ScreenshotProviderContext,
): Promise<ScreenshotResult | null> => {
  const providers = parseProviderOrder(providerOrder)

  for (const provider of providers) {
    try {
      if (provider === 'cloudflare-browser') {
        return await captureWithCloudflareBrowser(
          sourceUrl,
          context.env,
          context.browserConcurrency,
          context.browserKeepAliveMs,
          context.browserReuseSessions,
        )
      }

      return await captureWithBackup15(sourceUrl, context.backup15Concurrency)
    } catch (error) {
      console.warn(`Screenshot provider ${provider} failed: ${formatError(error)}`)
    }
  }

  return null
}
