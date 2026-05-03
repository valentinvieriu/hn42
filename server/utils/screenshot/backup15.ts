import { createConcurrencyLimiter } from './concurrency'
import type { ScreenshotResult } from './types'

const SCREENSHOT_TIMEOUT_MS = 8000
const MIN_SCREENSHOT_BYTES = 1024
const backup15Limiter = createConcurrencyLimiter(1)

const fetchWithTimeout = async (url: string, timeoutMs: number) => {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

const isJpeg = (bytes: ArrayBuffer) => {
  const view = new Uint8Array(bytes)

  return view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff
}

export const captureWithBackup15 = async (
  sourceUrl: string,
  concurrency: unknown,
): Promise<ScreenshotResult> => {
  const release = await backup15Limiter.acquire(concurrency, {
    label: 'backup15',
  })

  try {
    const screenshotUrl = `https://backup15.terasp.net/api/screenshot?url=${encodeURIComponent(
      sourceUrl,
    )}&resX=1080&resY=1600&outFormat=jpg&waitTime=100&isFullPage=true&dismissModals=true`

    const response = await fetchWithTimeout(screenshotUrl, SCREENSHOT_TIMEOUT_MS)

    if (!response.ok) {
      throw new Error(`backup15 returned ${response.status}`)
    }

    const bytes = await response.arrayBuffer()

    if (bytes.byteLength < MIN_SCREENSHOT_BYTES || !isJpeg(bytes)) {
      throw new Error('backup15 returned an invalid JPEG screenshot')
    }

    return {
      bytes,
      contentType: 'image/jpeg',
      provider: 'backup15',
    }
  } finally {
    release()
  }
}
