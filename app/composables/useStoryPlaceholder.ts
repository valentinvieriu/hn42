export type StoryPlaceholderComposition = 'dashboard' | 'editorial' | 'mosaic' | 'poster' | 'terminal'

export type StoryPlaceholderPanel = {
  key: string
  role: string
  style: Record<string, string | number>
  variant: 'strong' | 'soft' | 'line'
}

export type StoryPlaceholder = {
  composition: StoryPlaceholderComposition
  initials: string
  panels: StoryPlaceholderPanel[]
  style: Record<string, string>
}

type PanelDefinition = {
  height: number
  left: number
  role: string
  top: number
  variant: StoryPlaceholderPanel['variant']
  width: number
}

const COMPOSITIONS: StoryPlaceholderComposition[] = ['editorial', 'dashboard', 'terminal', 'mosaic', 'poster']

const COMPOSITION_PANELS: Record<StoryPlaceholderComposition, PanelDefinition[]> = {
  editorial: [
    { role: 'eyebrow', variant: 'line', left: 10, top: 13, width: 20, height: 2 },
    { role: 'headline', variant: 'strong', left: 10, top: 22, width: 58, height: 13 },
    { role: 'headline-line', variant: 'line', left: 10, top: 40, width: 46, height: 2 },
    { role: 'hero', variant: 'soft', left: 49, top: 49, width: 43, height: 34 },
    { role: 'copy', variant: 'line', left: 10, top: 54, width: 27, height: 2 },
    { role: 'copy', variant: 'line', left: 10, top: 62, width: 32, height: 2 },
    { role: 'copy', variant: 'line', left: 10, top: 70, width: 23, height: 2 },
  ],
  dashboard: [
    { role: 'sidebar', variant: 'soft', left: 7, top: 10, width: 17, height: 78 },
    { role: 'toolbar', variant: 'line', left: 31, top: 13, width: 54, height: 2 },
    { role: 'metric', variant: 'strong', left: 31, top: 25, width: 24, height: 16 },
    { role: 'metric', variant: 'soft', left: 62, top: 25, width: 24, height: 16 },
    { role: 'chart', variant: 'soft', left: 31, top: 50, width: 55, height: 35 },
    { role: 'chart-line', variant: 'line', left: 38, top: 70, width: 38, height: 2 },
  ],
  terminal: [
    { role: 'terminal-window', variant: 'soft', left: 8, top: 12, width: 84, height: 74 },
    { role: 'terminal-header', variant: 'strong', left: 8, top: 12, width: 84, height: 8 },
    { role: 'code', variant: 'line', left: 16, top: 31, width: 49, height: 2 },
    { role: 'code', variant: 'line', left: 22, top: 42, width: 57, height: 2 },
    { role: 'code', variant: 'line', left: 16, top: 53, width: 34, height: 2 },
    { role: 'code', variant: 'line', left: 27, top: 64, width: 46, height: 2 },
    { role: 'code', variant: 'line', left: 16, top: 75, width: 25, height: 2 },
  ],
  mosaic: [
    { role: 'tile-tall', variant: 'strong', left: 7, top: 9, width: 30, height: 51 },
    { role: 'tile', variant: 'soft', left: 44, top: 9, width: 49, height: 23 },
    { role: 'tile', variant: 'soft', left: 44, top: 39, width: 22, height: 21 },
    { role: 'tile', variant: 'strong', left: 73, top: 39, width: 20, height: 45 },
    { role: 'tile', variant: 'soft', left: 7, top: 67, width: 59, height: 17 },
  ],
  poster: [
    { role: 'poster-orb', variant: 'strong', left: 50, top: 11, width: 37, height: 37 },
    { role: 'poster-band', variant: 'soft', left: 7, top: 50, width: 86, height: 17 },
    { role: 'poster-title', variant: 'line', left: 12, top: 76, width: 51, height: 2 },
    { role: 'poster-caption', variant: 'line', left: 12, top: 84, width: 28, height: 2 },
  ],
}

const hashSeed = (seed: string): number => {
  let hash = 2166136261

  for (const character of seed) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

const seededRange = (seed: string, salt: string, min: number, max: number): number => {
  return min + (hashSeed(`${seed}:${salt}`) % (max - min + 1))
}

const normalizeDomain = (domain: string) => domain.trim().toLowerCase().replace(/^www\./, '') || 'news.ycombinator.com'

const getInitials = (domain: string) => {
  const label = domain.split('.')[0] ?? 'hn'
  return (label.replace(/[^a-z0-9]/gi, '').slice(0, 2) || 'HN').toUpperCase()
}

export const buildStoryPlaceholder = (domain: string, storySeed: string): StoryPlaceholder => {
  const normalizedDomain = normalizeDomain(domain)
  const composition = COMPOSITIONS[hashSeed(normalizedDomain) % COMPOSITIONS.length] ?? 'editorial'
  const seed = `${normalizedDomain}:${storySeed}`
  const angle = seededRange(seed, 'angle', -8, 8)
  const mirror = seededRange(seed, 'mirror', 0, 1) === 1
  const panels = COMPOSITION_PANELS[composition].map((panel, index) => {
    const leftJitter = seededRange(seed, `panel-${index}-x`, -2, 2)
    const topJitter = seededRange(seed, `panel-${index}-y`, -2, 2)
    const sizeJitter = seededRange(seed, `panel-${index}-size`, -2, 2)
    const rotation = composition === 'poster' || composition === 'mosaic'
      ? seededRange(seed, `panel-${index}-rotate`, -5, 5)
      : 0

    return {
      key: `${storySeed}-${index}`,
      role: panel.role,
      variant: panel.variant,
      style: {
        width: `${Math.max(2, panel.width + sizeJitter)}%`,
        height: `${Math.max(2, panel.height + sizeJitter)}%`,
        left: `${panel.left + leftJitter}%`,
        top: `${panel.top + topJitter}%`,
        opacity: seededRange(seed, `panel-${index}-opacity`, 50, 82) / 100,
        transform: `rotate(${rotation}deg)`,
      },
    }
  })

  return {
    composition,
    initials: getInitials(normalizedDomain),
    panels,
    style: {
      '--fallback-angle': `${angle}deg`,
      '--fallback-frame-angle': `${angle * -0.5}deg`,
      '--fallback-band-angle': `${angle * 0.25}deg`,
      '--fallback-grid': `${seededRange(seed, 'grid', 26, 44)}px`,
      '--fallback-sweep': `${seededRange(seed, 'sweep', 24, 72)}%`,
      '--fallback-cut': `${seededRange(seed, 'cut', 30, 66)}%`,
      '--fallback-direction': mirror ? '-90deg' : '90deg',
    },
  }
}
