import { createError, defineEventHandler, getHeader, getRequestURL } from 'h3'

const CLAUDE_BOT_USER_AGENT = 'ClaudeBot'

export default defineEventHandler((event) => {
  const userAgent = getHeader(event, 'user-agent')

  if (
    !userAgent?.includes(CLAUDE_BOT_USER_AGENT)
    || getRequestURL(event).pathname === '/robots.txt'
  ) {
    return
  }

  throw createError({
    statusCode: 403,
    statusMessage: 'Crawler access is disabled',
  })
})
