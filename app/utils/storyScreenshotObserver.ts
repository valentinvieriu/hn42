type StoryScreenshotLoadCallback = () => void

const loadCallbacks = new WeakMap<Element, StoryScreenshotLoadCallback>()
let loadObserver: IntersectionObserver | null = null

const getLoadObserver = () => {
  if (
    loadObserver
    || typeof window === 'undefined'
    || !('IntersectionObserver' in window)
  ) {
    return loadObserver
  }

  loadObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return
        }

        const callback = loadCallbacks.get(entry.target)
        loadObserver?.unobserve(entry.target)
        loadCallbacks.delete(entry.target)
        callback?.()
      })
    },
    {
      rootMargin: '200px 0px',
      threshold: 0.01,
    },
  )

  return loadObserver
}

export const observeStoryScreenshot = (
  element: Element,
  callback: StoryScreenshotLoadCallback,
) => {
  const observer = getLoadObserver()

  if (!observer) {
    return false
  }

  loadCallbacks.set(element, callback)
  observer.observe(element)

  return true
}

export const unobserveStoryScreenshot = (element: Element | null) => {
  if (!element) {
    return
  }

  loadObserver?.unobserve(element)
  loadCallbacks.delete(element)
}
