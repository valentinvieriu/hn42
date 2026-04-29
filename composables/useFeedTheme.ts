export type FeedEndpoint = 'top' | 'best' | 'new' | 'show'

export type FeedThemeMode = 'light' | 'dark'

export type FeedTheme = {
  key: FeedEndpoint
  label: string
  title: string
  description: string
  path: string
  hues: [number, number, number]
}

const oklch = (lightness: number, chroma: number, hue: number, alpha = 1) => {
  const alphaChannel = alpha < 1 ? ` / ${alpha}` : ''
  return `oklch(${lightness}% ${chroma} ${hue}${alphaChannel})`
}

export const feedThemeOrder: FeedEndpoint[] = ['top', 'best', 'new', 'show']

export const feedThemes: Record<FeedEndpoint, FeedTheme> = {
  top: {
    key: 'top',
    label: 'Top',
    title: 'Top Stories',
    description: 'The current HN front-page mix.',
    path: '/top',
    hues: [30, 54, 356],
  },
  best: {
    key: 'best',
    label: 'Best',
    title: 'Best Stories',
    description: 'High-signal stories with staying power.',
    path: '/best',
    hues: [142, 180, 96],
  },
  new: {
    key: 'new',
    label: 'New',
    title: 'New Stories',
    description: 'Fresh submissions as they arrive.',
    path: '/new',
    hues: [210, 236, 184],
  },
  show: {
    key: 'show',
    label: 'Show',
    title: 'Show HN',
    description: 'Projects, demos, and launches.',
    path: '/show',
    hues: [292, 334, 28],
  },
}

export const feedThemeList = feedThemeOrder.map((feed) => feedThemes[feed])

export const isFeedEndpoint = (value: string | undefined): value is FeedEndpoint => {
  return Boolean(value && value in feedThemes)
}

export const getFeedTheme = (feed: FeedEndpoint) => feedThemes[feed]

export const getFeedThemeStyle = (
  feed: FeedEndpoint,
  mode: FeedThemeMode = 'light',
): Record<string, string> => {
  const [hueA, hueB, hueC] = feedThemes[feed].hues
  const isDark = mode === 'dark'

  return {
    '--feed-bg-start': isDark ? oklch(18, 0.035, hueA) : oklch(98, 0.018, hueA),
    '--feed-bg-mid': isDark ? oklch(16, 0.04, hueB) : oklch(95, 0.026, hueB),
    '--feed-bg-end': isDark ? oklch(14, 0.034, hueC) : oklch(97, 0.02, hueC),
    '--feed-glow-a': isDark ? oklch(52, 0.13, hueA, 0.22) : oklch(78, 0.13, hueA, 0.34),
    '--feed-glow-b': isDark ? oklch(48, 0.11, hueB, 0.16) : oklch(82, 0.1, hueB, 0.25),
    '--feed-glow-c': isDark ? oklch(44, 0.12, hueC, 0.14) : oklch(84, 0.11, hueC, 0.2),
    '--feed-accent': isDark ? oklch(76, 0.15, hueA) : oklch(49, 0.17, hueA),
    '--feed-accent-strong': isDark ? oklch(86, 0.12, hueA) : oklch(34, 0.13, hueA),
    '--feed-accent-soft': isDark ? oklch(38, 0.06, hueA, 0.36) : oklch(91, 0.046, hueA, 0.76),
    '--feed-border': isDark ? oklch(72, 0.1, hueA, 0.32) : oklch(70, 0.1, hueA, 0.36),
    '--feed-nav-gradient': isDark
      ? `linear-gradient(135deg, ${oklch(76, 0.14, hueA)} 0%, ${oklch(72, 0.13, hueB)} 56%, ${oklch(70, 0.12, hueC)} 100%)`
      : `linear-gradient(135deg, ${oklch(26, 0.16, hueA)} 0%, ${oklch(27, 0.15, hueB)} 56%, ${oklch(25, 0.14, hueC)} 100%)`,
    '--feed-nav-text': isDark ? oklch(12, 0.018, hueA) : oklch(99, 0.01, hueA),
    '--feed-swatch': `linear-gradient(135deg, ${oklch(67, 0.16, hueA)} 0%, ${oklch(70, 0.13, hueB)} 58%, ${oklch(64, 0.13, hueC)} 100%)`,
  }
}
