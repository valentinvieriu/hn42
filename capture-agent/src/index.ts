import { createServer } from 'node:http'
import {
  parseScreenshotJobMessage,
  type ScreenshotJobMessage,
  type ScreenshotPrepareResponse,
} from '../../shared/utils/screenshotJobs'
import {
  SCREENSHOT_PREVIEW_HEIGHT,
  SCREENSHOT_PREVIEW_MAX_BYTES,
  SCREENSHOT_PREVIEW_QUALITY,
  SCREENSHOT_PREVIEW_WIDTH,
} from '../../shared/utils/screenshot'

type PullMessage = {
  attempts?: number
  body?: unknown
  id?: string
  lease_id: string
  metadata?: Record<string, unknown>
}

type PullResponse = {
  result?: {
    messages?: PullMessage[]
  }
  success?: boolean
}

type MessageDisposition =
  | { action: 'ack'; leaseId: string }
  | { action: 'retry'; delaySeconds: number; leaseId: string }

type AgentConfig = {
  accountId: string
  agentToken: string
  batchSize: number
  captureConcurrency: number
  hn42BaseUrl: string
  idlePollMs: number
  port: number
  queueId: string
  queueToken: string
  screenshotApiToken: string
  screenshotApiUrl: string
  visibilityTimeoutMs: number
}

const REQUEST_TIMEOUT_MS = 45_000
const sleep = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const getRequiredEnv = (name: string) => {
  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`${name} is required`)
  }

  return value
}

const getPositiveIntegerEnv = (name: string, fallback: number) => {
  const value = Number(process.env[name])

  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}

export const loadConfig = (): AgentConfig => {
  const captureConcurrency = getPositiveIntegerEnv('CAPTURE_CONCURRENCY', 4)

  return {
    accountId: getRequiredEnv('CF_ACCOUNT_ID'),
    agentToken: getRequiredEnv('HN42_SCREENSHOT_AGENT_TOKEN'),
    batchSize: Math.min(100, getPositiveIntegerEnv('QUEUE_BATCH_SIZE', captureConcurrency)),
    captureConcurrency,
    hn42BaseUrl: getRequiredEnv('HN42_BASE_URL').replace(/\/$/, ''),
    idlePollMs: getPositiveIntegerEnv('QUEUE_IDLE_POLL_MS', 30_000),
    port: getPositiveIntegerEnv('PORT', 3002),
    queueId: getRequiredEnv('CF_QUEUE_ID'),
    queueToken: getRequiredEnv('CF_QUEUES_API_TOKEN'),
    screenshotApiToken: getRequiredEnv('SCREENSHOT_API_TOKEN'),
    screenshotApiUrl: getRequiredEnv('SCREENSHOT_API_URL'),
    visibilityTimeoutMs: getPositiveIntegerEnv('QUEUE_VISIBILITY_TIMEOUT_MS', 180_000),
  }
}

const queueApiUrl = (config: AgentConfig, operation: 'ack' | 'pull') => {
  return `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(config.accountId)}/queues/${encodeURIComponent(config.queueId)}/messages/${operation}`
}

const queueHeaders = (config: AgentConfig) => ({
  Authorization: `Bearer ${config.queueToken}`,
  'Content-Type': 'application/json',
})

const parseQueueBody = (message: PullMessage) => {
  if (typeof message.body === 'object' && message.body !== null) {
    return message.body
  }

  if (typeof message.body !== 'string') {
    return null
  }

  const contentType = String(message.metadata?.['CF-Content-Type'] ?? '').toLowerCase()
  const decoded = Buffer.from(message.body, 'base64').toString('utf8')
  const candidates = contentType === 'json' || contentType === 'bytes'
    ? [decoded, message.body]
    : [message.body, decoded]

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown
    } catch {
      // Try the alternate plain/base64 representation used by the pull API.
    }
  }

  return null
}

const pullMessages = async (config: AgentConfig) => {
  const response = await fetch(queueApiUrl(config, 'pull'), {
    method: 'POST',
    headers: queueHeaders(config),
    body: JSON.stringify({
      batch_size: Math.min(config.batchSize, config.captureConcurrency),
      visibility_timeout_ms: config.visibilityTimeoutMs,
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(`Queue pull returned ${response.status}`)
  }

  const payload = await response.json() as PullResponse

  if (payload.success !== true || !Array.isArray(payload.result?.messages)) {
    throw new Error('Queue pull returned an invalid payload')
  }

  return payload.result.messages
}

const acknowledgeMessages = async (
  config: AgentConfig,
  dispositions: MessageDisposition[],
) => {
  if (dispositions.length === 0) {
    return
  }

  const response = await fetch(queueApiUrl(config, 'ack'), {
    method: 'POST',
    headers: queueHeaders(config),
    body: JSON.stringify({
      acks: dispositions
        .filter((item) => item.action === 'ack')
        .map((item) => ({ lease_id: item.leaseId })),
      retries: dispositions
        .filter((item) => item.action === 'retry')
        .map((item) => ({ delay_seconds: item.delaySeconds, lease_id: item.leaseId })),
    }),
    signal: AbortSignal.timeout(15_000),
  })

  if (!response.ok) {
    throw new Error(`Queue acknowledgement returned ${response.status}`)
  }
}

const agentHeaders = (config: AgentConfig) => ({
  Authorization: `Bearer ${config.agentToken}`,
})

const prepareJob = async (config: AgentConfig, job: ScreenshotJobMessage) => {
  const response = await fetch(
    `${config.hn42BaseUrl}/api/internal/screenshot-jobs/${encodeURIComponent(job.storyId)}/prepare`,
    {
      method: 'POST',
      headers: agentHeaders(config),
      signal: AbortSignal.timeout(10_000),
    },
  )

  if (!response.ok) {
    throw new Error(`Prepare endpoint returned ${response.status}`)
  }

  return await response.json() as ScreenshotPrepareResponse
}

class TerminalCaptureError extends Error {
  constructor(
    message: string,
    readonly kind: 'invalid-output' | 'target',
  ) {
    super(message)
  }
}

const getErrorCode = async (response: Response) => {
  try {
    const body = await response.json() as { error?: { code?: unknown } }

    return typeof body.error?.code === 'string' ? body.error.code : ''
  } catch {
    return ''
  }
}

const requireCaptureMetadata = (response: Response) => {
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase()
  const outcome = response.headers.get('x-screenshot-outcome')?.toLowerCase()
  const sourceRoute = response.headers.get('x-screenshot-source-route')?.toLowerCase()
  const width = Number(response.headers.get('x-screenshot-width'))
  const height = Number(response.headers.get('x-screenshot-height'))

  if (
    contentType !== 'image/webp'
    || !['ok', 'access_gate'].includes(outcome ?? '')
    || sourceRoute !== 'direct'
    || !Number.isSafeInteger(width)
    || width < 1
    || width > SCREENSHOT_PREVIEW_WIDTH
    || !Number.isSafeInteger(height)
    || height < 1
    || height > SCREENSHOT_PREVIEW_HEIGHT
  ) {
    throw new TerminalCaptureError('Screenshot API returned invalid metadata', 'invalid-output')
  }
}

const validateWebp = (bytes: ArrayBuffer) => {
  const view = new Uint8Array(bytes)

  if (
    view.byteLength < 1024
    || view.byteLength > SCREENSHOT_PREVIEW_MAX_BYTES
    || view[0] !== 0x52
    || view[1] !== 0x49
    || view[2] !== 0x46
    || view[3] !== 0x46
    || view[8] !== 0x57
    || view[9] !== 0x45
    || view[10] !== 0x42
    || view[11] !== 0x50
  ) {
    throw new TerminalCaptureError('Screenshot API returned an invalid WebP', 'invalid-output')
  }

  return bytes
}

const captureScreenshot = async (config: AgentConfig, captureUrl: string) => {
  const response = await fetch(config.screenshotApiUrl, {
    method: 'POST',
    headers: {
      Accept: 'image/webp',
      Authorization: `Bearer ${config.screenshotApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      cleanup: 'nuisances',
      format: 'webp',
      profile: 'fullPage',
      quality: SCREENSHOT_PREVIEW_QUALITY,
      response: 'binary',
      settleMs: 200,
      timeoutMs: 8000,
      url: captureUrl,
      viewport: {
        deviceScaleFactor: 1,
        height: 900,
        isMobile: false,
        width: SCREENSHOT_PREVIEW_WIDTH,
      },
      waitUntil: 'domcontentloaded',
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    const errorCode = await getErrorCode(response)

    if ([400, 405, 413, 415, 422].includes(response.status)) {
      throw new TerminalCaptureError(
        `Screenshot API rejected the target (${response.status}${errorCode ? `:${errorCode}` : ''})`,
        'target',
      )
    }

    throw new Error(`Screenshot API unavailable (${response.status}${errorCode ? `:${errorCode}` : ''})`)
  }

  requireCaptureMetadata(response)
  const contentLength = Number(response.headers.get('content-length'))

  if (Number.isFinite(contentLength) && contentLength > SCREENSHOT_PREVIEW_MAX_BYTES) {
    await response.body?.cancel()
    throw new TerminalCaptureError('Screenshot API result exceeds the byte limit', 'invalid-output')
  }

  const bytes = validateWebp(await response.arrayBuffer())

  return {
    bytes,
    headers: {
      outcome: response.headers.get('x-screenshot-outcome') ?? '',
      sourceRoute: response.headers.get('x-screenshot-source-route') ?? '',
      width: response.headers.get('x-screenshot-width') ?? '',
      height: response.headers.get('x-screenshot-height') ?? '',
    },
  }
}

const uploadResult = async (
  config: AgentConfig,
  job: ScreenshotJobMessage,
  capture: Awaited<ReturnType<typeof captureScreenshot>>,
) => {
  const response = await fetch(
    `${config.hn42BaseUrl}/api/internal/screenshot-jobs/${encodeURIComponent(job.storyId)}/result`,
    {
      method: 'PUT',
      headers: {
        ...agentHeaders(config),
        'Content-Length': String(capture.bytes.byteLength),
        'Content-Type': 'image/webp',
        'X-HN42-Screenshot-Profile': job.profile,
        'X-Screenshot-Height': capture.headers.height,
        'X-Screenshot-Outcome': capture.headers.outcome,
        'X-Screenshot-Source-Route': capture.headers.sourceRoute,
        'X-Screenshot-Width': capture.headers.width,
      },
      body: capture.bytes,
      signal: AbortSignal.timeout(20_000),
    },
  )

  if (response.status === 409) {
    return
  }

  if ([413, 415, 422].includes(response.status)) {
    throw new TerminalCaptureError(`HN42 rejected the screenshot (${response.status})`, 'invalid-output')
  }

  if (!response.ok) {
    throw new Error(`Result endpoint returned ${response.status}`)
  }
}

const retryDelaySeconds = (attempts: number | undefined) => {
  const normalizedAttempts = Number.isSafeInteger(attempts) ? Math.max(1, Number(attempts)) : 1

  return Math.min(1800, 60 * (2 ** (normalizedAttempts - 1)))
}

const processMessage = async (
  config: AgentConfig,
  message: PullMessage,
): Promise<MessageDisposition> => {
  const leaseId = message.lease_id
  const job = parseScreenshotJobMessage(parseQueueBody(message))

  if (!job) {
    console.warn(JSON.stringify({ message: 'Invalid screenshot job acknowledged', messageId: message.id }))
    return { action: 'ack', leaseId }
  }

  try {
    const prepared = await prepareJob(config, job)

    if (prepared.status !== 'capture') {
      console.info(JSON.stringify({
        message: 'Screenshot job completed without capture',
        status: prepared.status,
        storyId: job.storyId,
      }))
      return { action: 'ack', leaseId }
    }

    const capture = await captureScreenshot(config, prepared.captureUrl)
    await uploadResult(config, job, capture)

    console.info(JSON.stringify({
      message: 'Screenshot job stored',
      bytes: capture.bytes.byteLength,
      storyId: job.storyId,
    }))

    return { action: 'ack', leaseId }
  } catch (error) {
    if (error instanceof TerminalCaptureError) {
      console.warn(JSON.stringify({
        message: 'Terminal screenshot failure acknowledged',
        kind: error.kind,
        storyId: job.storyId,
      }))
      return { action: 'ack', leaseId }
    }

    const delaySeconds = retryDelaySeconds(message.attempts)
    console.warn(JSON.stringify({
      message: 'Screenshot job delayed',
      delaySeconds,
      error: error instanceof Error ? error.message : String(error),
      storyId: job.storyId,
    }))
    return { action: 'retry', delaySeconds, leaseId }
  }
}

export const runAgent = async (config: AgentConfig, signal: AbortSignal) => {
  let backoffMs = 1_000

  while (!signal.aborted) {
    try {
      const messages = await pullMessages(config)

      if (messages.length === 0) {
        await sleep(config.idlePollMs)
        continue
      }

      const settledMessages = await Promise.allSettled(
        messages.map((message) => processMessage(config, message)),
      )
      const dispositions = settledMessages.map((result, index): MessageDisposition => {
        if (result.status === 'fulfilled') {
          return result.value
        }

        const message = messages[index]!
        const delaySeconds = retryDelaySeconds(message.attempts)
        console.error(JSON.stringify({
          message: 'Unexpected screenshot job failure isolated',
          delaySeconds,
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
          messageId: message.id,
        }))

        return {
          action: 'retry',
          delaySeconds,
          leaseId: message.lease_id,
        }
      })
      await acknowledgeMessages(config, dispositions)
      backoffMs = 1_000
    } catch (error) {
      console.error(JSON.stringify({
        message: 'Screenshot agent loop failed',
        error: error instanceof Error ? error.message : String(error),
      }))
      await sleep(backoffMs)
      backoffMs = Math.min(30_000, backoffMs * 2)
    }
  }
}

const config = loadConfig()
const abortController = new AbortController()
const healthServer = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/healthz') {
    response.writeHead(200, { 'Content-Type': 'application/json' })
    response.end('{"status":"ok"}')
    return
  }

  response.writeHead(404)
  response.end()
})

healthServer.listen(config.port, '0.0.0.0')

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    abortController.abort()
    healthServer.close()
  })
}

void runAgent(config, abortController.signal)
