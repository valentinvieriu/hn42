import {
  createApp,
  defineEventHandler,
  toWebHandler,
} from 'h3'
import { describe, expect, it } from 'vitest'
import crawlerPolicy from './crawlerPolicy'

const createTestHandler = () => {
  const app = createApp()
  app.use(crawlerPolicy)
  app.use(defineEventHandler(() => 'ok'))

  return toWebHandler(app)
}

describe('crawler policy', () => {
  it('rejects ClaudeBot before route handlers run', async () => {
    const response = await createTestHandler()(new Request('https://hnglance.com/user/alice', {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ClaudeBot/1.0)',
      },
    }))

    expect(response.status).toBe(403)
  })

  it('lets ClaudeBot read robots.txt and leaves other clients unchanged', async () => {
    const handler = createTestHandler()
    const claudeRobotsResponse = await handler(new Request('https://hnglance.com/robots.txt', {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; ClaudeBot/1.0)',
      },
    }))
    const browserResponse = await handler(new Request('https://hnglance.com/user/alice'))

    expect(claudeRobotsResponse.status).toBe(200)
    expect(browserResponse.status).toBe(200)
  })
})
