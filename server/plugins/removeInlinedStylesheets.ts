const NUXT_STYLESHEET_LINK_PATTERN = /<link\s+rel="stylesheet"\s+href="\/_nuxt\/[^"?]+\.css"[^>]*>/g

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html) => {
    // features.inlineStyles already placed these styles in the document.
    html.head = html.head.map((chunk) => {
      return chunk.replace(NUXT_STYLESHEET_LINK_PATTERN, '')
    })
  })
})
