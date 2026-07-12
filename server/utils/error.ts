export const getErrorStatusCode = (error: unknown): number | null => {
  if (!error || typeof error !== 'object') {
    return null
  }

  if ('statusCode' in error && typeof error.statusCode === 'number') {
    return error.statusCode
  }

  if ('response' in error && error.response && typeof error.response === 'object') {
    const response = error.response as { status?: unknown }

    if (typeof response.status === 'number') {
      return response.status
    }
  }

  return null
}
