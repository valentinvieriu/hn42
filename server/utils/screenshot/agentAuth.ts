import { timingSafeEqual as compareTimingSafe } from 'node:crypto'
import { createError, getRequestHeader, type H3Event } from 'h3'
import type { ScreenshotEnv } from './types'

const hashValue = async (value: string) => {
  return await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
}

const timingSafeEqual = async (provided: string, expected: string) => {
  const [providedHash, expectedHash] = await Promise.all([
    hashValue(provided),
    hashValue(expected),
  ])

  return compareTimingSafe(new Uint8Array(providedHash), new Uint8Array(expectedHash))
}

export const requireScreenshotAgent = async (event: H3Event) => {
  const env = event.context.cloudflare?.env as ScreenshotEnv | undefined
  const expectedToken = typeof env?.HN42_SCREENSHOT_AGENT_TOKEN === 'string'
    ? env.HN42_SCREENSHOT_AGENT_TOKEN.trim()
    : ''
  const authorization = getRequestHeader(event, 'authorization')?.trim() ?? ''
  const providedToken = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''

  if (
    !expectedToken
    || !providedToken
    || !(await timingSafeEqual(providedToken, expectedToken))
  ) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Valid screenshot agent credentials are required',
    })
  }

  return env
}
