import {
  getResponseHeader,
  setResponseHeader,
  type H3Event,
} from 'h3'
import { appendServerTiming } from '#shared/utils/serverTiming'

const apiRequestStarts = new WeakMap<H3Event, number>()

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('request', (event) => {
    if (event.path.startsWith('/api/')) {
      apiRequestStarts.set(event, performance.now())
    }
  })

  nitroApp.hooks.hook('beforeResponse', (event) => {
    const startedAt = apiRequestStarts.get(event)

    if (startedAt === undefined) {
      return
    }

    apiRequestStarts.delete(event)
    setResponseHeader(event, 'Server-Timing', appendServerTiming(
      getResponseHeader(event, 'Server-Timing'),
      [{
        name: 'api-total',
        duration: performance.now() - startedAt,
        description: 'HN42 API processing',
      }],
    ))
  })
})
