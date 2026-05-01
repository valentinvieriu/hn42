import { createConcurrencyLimiter } from './concurrency'
import type { ScreenshotEnv, ScreenshotResult } from './types'

const VIEWPORT_WIDTH = 1080
const VIEWPORT_HEIGHT = 1600
const MAX_CAPTURE_HEIGHT = 6000
const DEFAULT_KEEP_ALIVE_MS = 600_000
const MAX_KEEP_ALIVE_MS = 600_000
const browserLimiter = createConcurrencyLimiter(1)

const OVERLAY_SUPPRESSION_CSS = `
  [id*="cookie" i],
  [class*="cookie" i],
  [id*="consent" i],
  [class*="consent" i],
  [aria-modal="true"],
  [role="dialog"],
  .modal,
  .popup,
  .overlay,
  .interstitial {
    display: none !important;
    visibility: hidden !important;
    opacity: 0 !important;
    pointer-events: none !important;
  }

  html,
  body {
    scroll-behavior: auto !important;
  }
`

const toArrayBuffer = (bytes: ArrayBuffer | Uint8Array) => {
  if (bytes instanceof ArrayBuffer) {
    return bytes
  }

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

const loadCloudflarePuppeteer = async () => {
  const puppeteer = await import('@cloudflare/puppeteer')

  return puppeteer.default
}

const normalizeKeepAliveMs = (value: unknown) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_KEEP_ALIVE_MS
  }

  return Math.min(MAX_KEEP_ALIVE_MS, Math.max(1, Math.floor(parsedValue)))
}

const shouldReuseSessions = (value: unknown) => {
  if (typeof value !== 'string') {
    return value !== false
  }

  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase())
}

const getFreeSessionIds = async (puppeteer: any, browserBinding: Fetcher) => {
  const sessions = await puppeteer.sessions(browserBinding)

  return sessions
    .filter((session: { sessionId?: string, connectionId?: string }) => {
      return session.sessionId && !session.connectionId
    })
    .sort((first: { startTime?: number }, second: { startTime?: number }) => {
      return (first.startTime ?? 0) - (second.startTime ?? 0)
    })
    .map((session: { sessionId: string }) => session.sessionId)
}

const connectToReusableSession = async (puppeteer: any, browserBinding: Fetcher) => {
  let sessionIds: string[] = []

  try {
    sessionIds = await getFreeSessionIds(puppeteer, browserBinding)
  } catch (error) {
    console.warn(`Unable to list Browser Run sessions: ${error instanceof Error ? error.message : String(error)}`)
  }

  for (const sessionId of sessionIds) {
    try {
      const browser = await puppeteer.connect(browserBinding, sessionId)

      return { browser, browserSession: 'reused' as const }
    } catch (error) {
      console.warn(`Unable to reuse Browser Run session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return null
}

const getBrowser = async (
  puppeteer: any,
  browserBinding: Fetcher,
  keepAliveMs: number,
  reuseSessions: boolean,
) => {
  if (reuseSessions) {
    const reusableSession = await connectToReusableSession(puppeteer, browserBinding)

    if (reusableSession) {
      return reusableSession
    }
  }

  const browser = await puppeteer.launch(browserBinding, {
    keep_alive: keepAliveMs,
  })

  return { browser, browserSession: 'launched' as const }
}

const createCapturePage = async (browser: any) => {
  if (typeof browser.createBrowserContext === 'function') {
    const context = await browser.createBrowserContext()
    const page = await context.newPage()

    return {
      page,
      close: async () => {
        await context.close()
      },
    }
  }

  const page = await browser.newPage()

  return {
    page,
    close: async () => {
      await page.close()
    },
  }
}

export const captureWithCloudflareBrowser = async (
  sourceUrl: string,
  env: ScreenshotEnv | undefined,
  concurrency: unknown,
  keepAliveMs: unknown,
  reuseSessions: unknown,
): Promise<ScreenshotResult> => {
  if (!env?.BROWSER) {
    throw new Error('Cloudflare Browser binding BROWSER is not available')
  }

  const release = await browserLimiter.acquire(concurrency)
  let browser: any
  let shouldCloseBrowser = false

  try {
    const puppeteer = await loadCloudflarePuppeteer()
    const browserHandle = await getBrowser(
      puppeteer,
      env.BROWSER,
      normalizeKeepAliveMs(keepAliveMs),
      shouldReuseSessions(reuseSessions),
    )
    browser = browserHandle.browser

    try {
      const capturePage = await createCapturePage(browser)
      const page = capturePage.page

      try {
        page.setDefaultTimeout(5_000)
        page.setDefaultNavigationTimeout(24_000)

        await page.setViewport({
          width: VIEWPORT_WIDTH,
          height: VIEWPORT_HEIGHT,
          deviceScaleFactor: 1,
        })

        await page.goto(sourceUrl, {
          waitUntil: 'load',
          timeout: 24_000,
        })

        await page.evaluate(() => {
          const labels = ['Accept all', 'Accept', 'Agree', 'I agree', 'Continue', 'Got it', 'Close']
          const buttons = Array.from(document.querySelectorAll('button, [role="button"]'))

          for (const button of buttons) {
            const text = button.textContent?.trim() ?? ''

            if (labels.some((label) => new RegExp(`^${label}$`, 'i').test(text))) {
              const htmlButton = button as HTMLElement
              htmlButton.click()
              break
            }
          }
        }).catch(() => {})

        await page.addStyleTag({
          content: OVERLAY_SUPPRESSION_CSS,
        }).catch(() => {})

        await page.evaluate(async (maxScrollY) => {
          const getPageHeight = () => Math.max(
            document.documentElement?.scrollHeight ?? 0,
            document.body?.scrollHeight ?? 0,
            window.innerHeight,
          )

          await new Promise<void>((resolve) => {
            let y = 0
            const startedAt = Date.now()
            const timer = setInterval(() => {
              y += 800
              window.scrollTo(0, y)

              if (y >= Math.min(getPageHeight(), maxScrollY) || Date.now() - startedAt > 2800) {
                clearInterval(timer)
                window.scrollTo(0, 0)
                resolve()
              }
            }, 100)
          })
        }, MAX_CAPTURE_HEIGHT).catch(() => {})

        await new Promise((resolve) => setTimeout(resolve, 500))

        const captureHeight = await page.evaluate((maxHeight) => {
          const pageHeight = Math.max(
            document.documentElement?.scrollHeight ?? 0,
            document.body?.scrollHeight ?? 0,
            window.innerHeight,
          )

          return Math.min(Math.max(pageHeight, window.innerHeight), maxHeight)
        }, MAX_CAPTURE_HEIGHT).catch(() => VIEWPORT_HEIGHT)

        const screenshotHeight = Math.max(VIEWPORT_HEIGHT, Math.floor(captureHeight))

        await page.setViewport({
          width: VIEWPORT_WIDTH,
          height: screenshotHeight,
          deviceScaleFactor: 1,
        })

        const image = await page.screenshot({
          type: 'jpeg',
          quality: 82,
          clip: {
            x: 0,
            y: 0,
            width: VIEWPORT_WIDTH,
            height: screenshotHeight,
          },
        })

        return {
          bytes: toArrayBuffer(image),
          contentType: 'image/jpeg',
          provider: 'cloudflare-browser',
          browserSession: browserHandle.browserSession,
        }
      } finally {
        await capturePage.close().catch((error: unknown) => {
          shouldCloseBrowser = true
          console.warn(`Unable to clean up Browser Run page context: ${error instanceof Error ? error.message : String(error)}`)
        })
      }
    } finally {
      if (shouldCloseBrowser) {
        await browser.close().catch(() => {})
      } else {
        await browser.disconnect().catch(async () => {
          await browser.close().catch(() => {})
        })
      }
    }
  } finally {
    release()
  }
}
