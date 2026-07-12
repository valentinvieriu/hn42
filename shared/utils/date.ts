type DateInput = Date | number | string
type RelativeTimeUnit = 'day' | 'hour' | 'minute' | 'month' | 'year'

const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'always' })
const calendarDateFormatter = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

const RELATIVE_TIME_UNITS: Array<{
  unit: RelativeTimeUnit
  seconds: number
}> = [
  { unit: 'year', seconds: 365 * 24 * 60 * 60 },
  { unit: 'month', seconds: 30 * 24 * 60 * 60 },
  { unit: 'day', seconds: 24 * 60 * 60 },
  { unit: 'hour', seconds: 60 * 60 },
  { unit: 'minute', seconds: 60 },
]

const getTimestamp = (value: DateInput) => {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()

  return Number.isNaN(timestamp) ? null : timestamp
}

export const formatCompactTimeAgo = (value: DateInput, now = Date.now()) => {
  const timestamp = getTimestamp(value)

  if (timestamp === null) {
    return ''
  }

  const elapsedSeconds = Math.max(0, Math.floor((now - timestamp) / 1000))
  const minute = 60
  const hour = minute * 60
  const day = hour * 24
  const month = day * 30
  const year = day * 365

  if (elapsedSeconds < minute) return 'now'
  if (elapsedSeconds < hour) return `${Math.floor(elapsedSeconds / minute)}m ago`
  if (elapsedSeconds < day) return `${Math.floor(elapsedSeconds / hour)}h ago`
  if (elapsedSeconds < month) return `${Math.floor(elapsedSeconds / day)}d ago`
  if (elapsedSeconds < year) return `${Math.floor(elapsedSeconds / month)}mo ago`

  return `${Math.floor(elapsedSeconds / year)}y ago`
}

export const formatTimeAgo = (value: DateInput, now = Date.now()) => {
  const timestamp = getTimestamp(value)

  if (timestamp === null) {
    return ''
  }

  const differenceSeconds = (timestamp - now) / 1000
  const absoluteDifference = Math.abs(differenceSeconds)

  if (absoluteDifference < 60) {
    return differenceSeconds > 0 ? 'in less than a minute' : 'less than a minute ago'
  }

  const selectedUnit = RELATIVE_TIME_UNITS.find(({ seconds }) => absoluteDifference >= seconds)

  if (!selectedUnit) {
    return ''
  }

  return relativeTimeFormatter.format(
    Math.round(differenceSeconds / selectedUnit.seconds),
    selectedUnit.unit,
  )
}

export const formatCalendarDate = (value: DateInput) => {
  const timestamp = getTimestamp(value)

  return timestamp === null ? '' : calendarDateFormatter.format(timestamp)
}
