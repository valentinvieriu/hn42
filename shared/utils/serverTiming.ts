export type ServerTimingMetric = {
  name: string
  duration: number
  description?: string
}

const normalizeMetricName = (name: string) => {
  return name.replace(/[^A-Za-z0-9_.-]/g, '-') || 'metric'
}

const normalizeDuration = (duration: number) => {
  return Number.isFinite(duration) ? Math.max(0, duration) : 0
}

const escapeDescription = (description: string) => {
  return description.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

export const formatServerTiming = (metrics: ServerTimingMetric[]) => {
  return metrics.map((metric) => {
    const description = metric.description
      ? `;desc="${escapeDescription(metric.description)}"`
      : ''

    return `${normalizeMetricName(metric.name)};dur=${normalizeDuration(metric.duration).toFixed(1)}${description}`
  }).join(', ')
}

export const appendServerTiming = (existingHeader: unknown, metrics: ServerTimingMetric[]) => {
  const existingValue = Array.isArray(existingHeader)
    ? existingHeader.join(', ')
    : typeof existingHeader === 'string'
      ? existingHeader.trim()
      : ''
  const nextValue = formatServerTiming(metrics)

  return existingValue ? `${existingValue}, ${nextValue}` : nextValue
}
