export type FeedEndpoint = 'top' | 'best' | 'new' | 'show'

type FeedTheme = {
  key: FeedEndpoint
  label: string
  title: string
  description: string
  path: string
  hues: [number, number, number]
}

const feedThemeOrder: FeedEndpoint[] = ['top', 'best', 'new', 'show']

const feedThemes: Record<FeedEndpoint, FeedTheme> = {
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

const feedThemeStyles = new Map(feedThemeOrder.map<[
  FeedEndpoint,
  Record<string, string>,
]>((feed) => {
  const [hueA, hueB, hueC] = feedThemes[feed].hues

  return [feed, {
    '--feed-hue-a': `${hueA}`,
    '--feed-hue-b': `${hueB}`,
    '--feed-hue-c': `${hueC}`,
  }]
}))

export const isFeedEndpoint = (value: string | undefined): value is FeedEndpoint => {
  return Boolean(value && value in feedThemes)
}

export const getFeedTheme = (feed: FeedEndpoint) => feedThemes[feed]

export const getFeedThemeStyle = (feed: FeedEndpoint) => feedThemeStyles.get(feed)
