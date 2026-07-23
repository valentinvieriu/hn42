import { getErrorStatusCode } from './error'

type LogContext = Record<string, boolean | number | string | null | undefined>

const getErrorName = (error: unknown) => {
  if (!error || typeof error !== 'object' || !('name' in error)) {
    return null
  }

  return typeof error.name === 'string' ? error.name : null
}

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message
  }

  if (
    error
    && typeof error === 'object'
    && 'message' in error
    && typeof error.message === 'string'
  ) {
    return error.message
  }

  return typeof error === 'string' ? error : 'Unknown upstream error'
}

export const isUpstreamUnavailable = (error: unknown) => {
  const statusCode = getErrorStatusCode(error)

  return getErrorName(error) === 'FetchError'
    || statusCode === 403
    || statusCode === 408
    || statusCode === 425
    || statusCode === 429
    || (statusCode !== null && statusCode >= 500)
}

export const logUpstreamFailure = (
  operation: string,
  error: unknown,
  context: LogContext = {},
) => {
  const payload = JSON.stringify({
    event: 'upstream_fetch_failed',
    upstream: 'hn-algolia',
    operation,
    statusCode: getErrorStatusCode(error),
    error: getErrorMessage(error),
    ...context,
  })

  if (isUpstreamUnavailable(error)) {
    console.warn(payload)
    return
  }

  console.error(payload)
}
