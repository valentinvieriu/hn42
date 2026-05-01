type QueueTask = {
  release: (releaseSlot: () => void) => void
}

const normalizeConcurrency = (value: unknown, fallback: number) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return fallback
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

      activeTasks += 1

      task.release(() => {
        activeTasks = Math.max(0, activeTasks - 1)
        pumpQueue()
      })
    }
  }

  const acquire = async (concurrency: unknown) => {
    maxConcurrency = normalizeConcurrency(concurrency, defaultConcurrency)

    return new Promise<() => void>((resolve) => {
      pendingTasks.push({
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
      })
      pumpQueue()
    })
  }

  return {
    acquire,
  }
}

