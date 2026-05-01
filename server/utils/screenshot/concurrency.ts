type QueueTask = {
  clearQueueTimeout: () => void
  reject: (error: Error) => void
  release: (releaseSlot: () => void) => void
  settled: boolean
}

const DEFAULT_MAX_QUEUE_WAIT_MS = 2_000

export class ScreenshotConcurrencyTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} concurrency queue timed out after ${timeoutMs}ms`)
    this.name = 'ScreenshotConcurrencyTimeoutError'
  }
}

const normalizeConcurrency = (value: unknown, fallback: number) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return fallback
  }

  return Math.max(1, Math.floor(parsedValue))
}

const normalizeQueueTimeout = (value: unknown) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_MAX_QUEUE_WAIT_MS
  }

  return Math.max(1, Math.floor(parsedValue))
}

export const createConcurrencyLimiter = (defaultConcurrency: number) => {
  const pendingTasks: QueueTask[] = []
  let activeTasks = 0
  let maxConcurrency = defaultConcurrency

  const pumpQueue = () => {
    while (activeTasks < maxConcurrency && pendingTasks.length > 0) {
      const task = pendingTasks.shift()

      if (!task) {
        continue
      }

      if (task.settled) {
        continue
      }

      task.settled = true
      task.clearQueueTimeout()
      activeTasks += 1

      task.release(() => {
        activeTasks = Math.max(0, activeTasks - 1)
        pumpQueue()
      })
    }
  }

  const acquire = async (
    concurrency: unknown,
    options: { label?: string, maxQueueWaitMs?: unknown } = {},
  ) => {
    maxConcurrency = normalizeConcurrency(concurrency, defaultConcurrency)
    const maxQueueWaitMs = normalizeQueueTimeout(options.maxQueueWaitMs)
    const label = options.label ?? 'Screenshot'

    return new Promise<() => void>((resolve, reject) => {
      const task: QueueTask = {
        clearQueueTimeout: () => {},
        reject,
        release: (releaseSlot) => {
          let hasReleased = false

          resolve(() => {
            if (hasReleased) {
              return
            }

            hasReleased = true
            releaseSlot()
          })
        },
        settled: false,
      }

      const timeout = setTimeout(() => {
        if (task.settled) {
          return
        }

        task.settled = true
        const taskIndex = pendingTasks.indexOf(task)

        if (taskIndex !== -1) {
          pendingTasks.splice(taskIndex, 1)
        }

        task.reject(new ScreenshotConcurrencyTimeoutError(label, maxQueueWaitMs))
      }, maxQueueWaitMs)

      task.clearQueueTimeout = () => {
        clearTimeout(timeout)
      }

      pendingTasks.push(task)
      pumpQueue()
    })
  }

  return {
    acquire,
  }
}
