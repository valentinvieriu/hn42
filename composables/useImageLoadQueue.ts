import { useRuntimeConfig } from '#imports'

type QueueTask = {
  canceled: boolean
  completed: boolean
  run: () => void
  started: boolean
}

export type ImageLoadQueueHandle = {
  cancel: () => void
  complete: () => void
}

const DEFAULT_MAX_PARALLEL_IMAGE_LOADS = 1
const pendingTasks: QueueTask[] = []
let activeLoads = 0
let maxParallelImageLoads = DEFAULT_MAX_PARALLEL_IMAGE_LOADS

const normalizeConcurrency = (value: unknown) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_MAX_PARALLEL_IMAGE_LOADS
  }

  return Math.max(1, Math.floor(parsedValue))
}

const configureImageLoadQueue = (value: unknown) => {
  maxParallelImageLoads = normalizeConcurrency(value)
  pumpQueue()
}

const pumpQueue = () => {
  while (activeLoads < maxParallelImageLoads && pendingTasks.length > 0) {
    const task = pendingTasks.shift()

    if (!task || task.canceled) {
      continue
    }

    task.started = true
    activeLoads += 1

    try {
      task.run()
    } catch {
      task.completed = true
      activeLoads = Math.max(0, activeLoads - 1)
      pumpQueue()
    }
  }
}

export const useImageLoadQueue = () => {
  const config = useRuntimeConfig()
  configureImageLoadQueue(config.public.screenshotImageQueueConcurrency)

  const enqueueImageLoad = (run: () => void): ImageLoadQueueHandle => {
    const task: QueueTask = {
      canceled: false,
      completed: false,
      run,
      started: false,
    }

    pendingTasks.push(task)
    pumpQueue()

    const complete = () => {
      if (!task.started || task.completed) {
        return
      }

      task.completed = true
      activeLoads = Math.max(0, activeLoads - 1)
      pumpQueue()
    }

    const cancel = () => {
      if (task.canceled || task.completed) {
        return
      }

      task.canceled = true

      if (task.started) {
        complete()
        return
      }

      const taskIndex = pendingTasks.indexOf(task)
      if (taskIndex !== -1) {
        pendingTasks.splice(taskIndex, 1)
      }
    }

    return {
      cancel,
      complete,
    }
  }

  return {
    enqueueImageLoad,
  }
}
