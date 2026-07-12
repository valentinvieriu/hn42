import { captureWithBrowserRun } from './browserRun'
import type {
  ScreenshotEnv,
  ScreenshotProviderName,
  ScreenshotResult,
} from './types'

export const captureScreenshotWithProvider = async (
  provider: ScreenshotProviderName,
  env: ScreenshotEnv | undefined,
  sourceUrl: string,
  runtimeConfig: any,
): Promise<ScreenshotResult> => {
  switch (provider) {
    case 'browser-run':
      return await captureWithBrowserRun(env, sourceUrl, runtimeConfig)
  }
}
