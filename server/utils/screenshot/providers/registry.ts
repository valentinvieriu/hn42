import type {
  ScreenshotEnv,
  ScreenshotRuntimeConfig,
} from '../types'
import {
  captureWithBrowserRun,
  isBrowserRunCapacityError,
} from './browserRun'
import {
  captureWithBrowserlessProxy,
  classifyBrowserlessProxyError,
  isBrowserlessProxyAvailable,
} from './browserlessProxy'
import {
  captureWithProviderChain,
  type ScreenshotProviderStrategy,
} from './orchestrator'
import type {
  ScreenshotProvider,
  ScreenshotProviderContext,
} from './types'

const DEFAULT_PROVIDERS = ['browser-run']

const browserlessProxyProvider: ScreenshotProvider = {
  capture: async (context) => {
    return await captureWithBrowserlessProxy(
      context.env,
      context.sourceUrl,
      context.runtimeConfig,
    )
  },
  classifyError: classifyBrowserlessProxyError,
  isAvailable: (context) => {
    return isBrowserlessProxyAvailable(context.env, context.runtimeConfig)
  },
  name: 'browserless-proxy',
}

const browserRunProvider: ScreenshotProvider = {
  capture: async (context) => {
    return await captureWithBrowserRun(
      context.env,
      context.sourceUrl,
      context.runtimeConfig,
    )
  },
  classifyError: (error) => {
    if (isBrowserRunCapacityError(error)) {
      const retryAfterMs = error && typeof error === 'object' && 'retryAfterMs' in error
        ? Number(error.retryAfterMs)
        : undefined

      return {
        kind: 'capacity',
        retryAfterMs: Number.isFinite(retryAfterMs) ? retryAfterMs : undefined,
      }
    }

    return { kind: 'transient' }
  },
  isAvailable: (context) => Boolean(context.env?.BROWSER),
  name: 'browser-run',
}

const providerRegistry = new Map<string, ScreenshotProvider>([
  [browserlessProxyProvider.name, browserlessProxyProvider],
  [browserRunProvider.name, browserRunProvider],
])
const reportedUnknownProviders = new Set<string>()

const parseProviderNames = (value: unknown) => {
  if (typeof value !== 'string') {
    return DEFAULT_PROVIDERS
  }

  const providers = value
    .split(',')
    .map((provider) => provider.trim().toLowerCase())
    .filter(Boolean)

  return [...new Set(providers)]
}

export const getScreenshotProviderStrategy = (
  runtimeConfig: ScreenshotRuntimeConfig,
): ScreenshotProviderStrategy => {
  const strategy = typeof runtimeConfig.screenshotProviderStrategy === 'string'
    ? runtimeConfig.screenshotProviderStrategy.trim().toLowerCase()
    : ''

  return strategy === 'balanced' ? 'balanced' : 'ordered'
}

export const getConfiguredScreenshotProviders = (
  runtimeConfig: ScreenshotRuntimeConfig,
) => {
  return parseProviderNames(runtimeConfig.screenshotProviders)
    .map((providerName) => {
      const provider = providerRegistry.get(providerName)

      if (!provider && !reportedUnknownProviders.has(providerName)) {
        reportedUnknownProviders.add(providerName)
        console.warn(JSON.stringify({
          message: 'Unknown screenshot provider ignored',
          provider: providerName,
        }))
      }

      return provider
    })
    .filter((provider): provider is ScreenshotProvider => Boolean(provider))
}

export const getScreenshotProviderPlanId = (
  runtimeConfig: ScreenshotRuntimeConfig,
) => {
  const strategy = getScreenshotProviderStrategy(runtimeConfig)
  const providers = getConfiguredScreenshotProviders(runtimeConfig)
    .map((provider) => provider.name)

  return `${strategy}:${providers.join(',')}`
}

const createProviderContext = (
  env: ScreenshotEnv | undefined,
  sourceUrl: string,
  runtimeConfig: ScreenshotRuntimeConfig,
): ScreenshotProviderContext => ({ env, runtimeConfig, sourceUrl })

export const hasAvailableScreenshotProvider = (
  env: ScreenshotEnv | undefined,
  sourceUrl: string,
  runtimeConfig: ScreenshotRuntimeConfig,
) => {
  const context = createProviderContext(env, sourceUrl, runtimeConfig)

  return getConfiguredScreenshotProviders(runtimeConfig).some((provider) => {
    try {
      return provider.isAvailable(context)
    } catch {
      return false
    }
  })
}

export const captureWithScreenshotProviders = async (
  env: ScreenshotEnv | undefined,
  sourceUrl: string,
  balanceKey: string,
  runtimeConfig: ScreenshotRuntimeConfig,
) => {
  return await captureWithProviderChain(
    getConfiguredScreenshotProviders(runtimeConfig),
    createProviderContext(env, sourceUrl, runtimeConfig),
    {
      balanceKey,
      strategy: getScreenshotProviderStrategy(runtimeConfig),
    },
  )
}
