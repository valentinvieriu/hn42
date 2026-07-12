const HN_ITEM_ID_PATTERN = /^[1-9]\d{0,14}$/
const HN_USERNAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

const getFirstRouteParam = (value: unknown) => {
  return Array.isArray(value) ? value[0] : value
}

export const isValidHnItemId = (value: unknown): value is string => {
  return typeof value === 'string'
    && HN_ITEM_ID_PATTERN.test(value)
    && Number.isSafeInteger(Number(value))
}

export const normalizeHnItemId = (value: unknown) => {
  const itemId = getFirstRouteParam(value)

  return isValidHnItemId(itemId) ? itemId : null
}

export const isValidHnUsername = (value: unknown): value is string => {
  return typeof value === 'string' && HN_USERNAME_PATTERN.test(value)
}

export const normalizeHnUsername = (value: unknown) => {
  const username = getFirstRouteParam(value)

  return isValidHnUsername(username) ? username : ''
}

export const getHnItemUrl = (itemId: string | number) => {
  return `https://news.ycombinator.com/item?id=${encodeURIComponent(String(itemId))}`
}

export const getHnUserPath = (username: string) => {
  return `/user/${encodeURIComponent(username)}`
}
