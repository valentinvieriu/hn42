import { captureWithBackup15 } from './backup15'
import type {
  ScreenshotProviderName,
  ScreenshotResult,
} from './types'

export const captureScreenshotWithProvider = async (
  provider: ScreenshotProviderName,
  sourceUrl: string,
  concurrency: unknown,
): Promise<ScreenshotResult> => {
  switch (provider) {
    case 'backup15':
      return await captureWithBackup15(sourceUrl, concurrency)
  }
}
