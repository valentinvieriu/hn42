import type { H3Event } from 'h3'
import { appendEarlyHintLinks, collectEarlyHintLinks } from '../utils/earlyHints'

const earlyHintLinksByEvent = new WeakMap<H3Event, string[]>()

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    const earlyHintLinks = collectEarlyHintLinks(html.head)

    if (earlyHintLinks.length > 0) {
      earlyHintLinksByEvent.set(event, earlyHintLinks)
    }
  })

  nitroApp.hooks.hook('render:response', (response, { event }) => {
    const earlyHintLinks = earlyHintLinksByEvent.get(event)

    if (!earlyHintLinks) {
      return
    }

    earlyHintLinksByEvent.delete(event)
    response.headers ??= {}

    const headerName = Object.keys(response.headers)
      .find((name) => name.toLowerCase() === 'link') ?? 'Link'
    response.headers[headerName] = appendEarlyHintLinks(
      response.headers[headerName],
      earlyHintLinks,
    )
  })
})
