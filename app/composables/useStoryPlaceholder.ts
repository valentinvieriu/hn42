export type StoryPlaceholderLayout =
  | 'layout-01'
  | 'layout-02'
  | 'layout-03'
  | 'layout-04'
  | 'layout-05'
  | 'layout-06'

export type StoryPlaceholderMotif = 'bands' | 'glow' | 'grid' | 'plain'
export type StoryPlaceholderPrimitiveShape = 'circle' | 'line' | 'rect'
export type StoryPlaceholderPrimitiveTone = 'accent' | 'accent-soft' | 'raised' | 'surface'
export type StoryPlaceholderPrimitiveRadius = 'lg' | 'md' | 'pill' | 'sm'

export type StoryPlaceholderRect = {
  height: number
  width: number
  x: number
  y: number
}

export type StoryPlaceholderPrimitive = {
  key: string
  opacity: number
  radius: StoryPlaceholderPrimitiveRadius
  rect: StoryPlaceholderRect
  shape: StoryPlaceholderPrimitiveShape
  tone: StoryPlaceholderPrimitiveTone
}

export type StoryPlaceholder = {
  density: 0 | 1 | 2
  initials: string
  layout: StoryPlaceholderLayout
  mirror: boolean
  motif: StoryPlaceholderMotif
  primitives: StoryPlaceholderPrimitive[]
  style: Record<string, string>
  variant: 0 | 1 | 2
  version: 2
}

type PrimitiveDefinition = {
  minDensity?: 0 | 1 | 2
  radius: StoryPlaceholderPrimitiveRadius
  rect: StoryPlaceholderRect
  shape: StoryPlaceholderPrimitiveShape
  tone: 'raised' | 'surface'
}

const CANVAS_SIZE = 1000
const CANVAS_MARGIN = 40

const LAYOUTS: StoryPlaceholderLayout[] = [
  'layout-01',
  'layout-02',
  'layout-03',
  'layout-04',
  'layout-05',
  'layout-06',
]

const MOTIFS: StoryPlaceholderMotif[] = ['plain', 'grid', 'glow', 'bands']

const LAYOUT_PRIMITIVES: Record<StoryPlaceholderLayout, PrimitiveDefinition[]> = {
  'layout-01': [
    { shape: 'rect', tone: 'raised', radius: 'lg', rect: { x: 55, y: 70, width: 455, height: 675 } },
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 575, y: 105, width: 285, height: 18 } },
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 575, y: 185, width: 355, height: 14 } },
    { shape: 'rect', tone: 'surface', radius: 'md', rect: { x: 575, y: 285, width: 355, height: 245 } },
    { shape: 'rect', tone: 'raised', radius: 'md', rect: { x: 575, y: 590, width: 165, height: 190 } },
    { shape: 'rect', tone: 'surface', radius: 'md', rect: { x: 780, y: 590, width: 150, height: 190 }, minDensity: 1 },
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 575, y: 855, width: 245, height: 14 }, minDensity: 2 },
  ],
  'layout-02': [
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 65, y: 75, width: 250, height: 16 } },
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 65, y: 145, width: 390, height: 14 } },
    { shape: 'rect', tone: 'raised', radius: 'lg', rect: { x: 65, y: 235, width: 870, height: 390 } },
    { shape: 'rect', tone: 'surface', radius: 'md', rect: { x: 65, y: 690, width: 260, height: 210 } },
    { shape: 'rect', tone: 'raised', radius: 'md', rect: { x: 370, y: 690, width: 260, height: 210 } },
    { shape: 'rect', tone: 'surface', radius: 'md', rect: { x: 675, y: 690, width: 260, height: 210 }, minDensity: 1 },
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 700, y: 125, width: 235, height: 14 }, minDensity: 2 },
  ],
  'layout-03': [
    { shape: 'rect', tone: 'surface', radius: 'lg', rect: { x: 55, y: 60, width: 215, height: 875 } },
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 95, y: 135, width: 130, height: 14 } },
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 95, y: 225, width: 95, height: 12 } },
    { shape: 'rect', tone: 'raised', radius: 'lg', rect: { x: 335, y: 65, width: 600, height: 405 } },
    { shape: 'rect', tone: 'surface', radius: 'md', rect: { x: 335, y: 535, width: 280, height: 270 } },
    { shape: 'rect', tone: 'raised', radius: 'md', rect: { x: 655, y: 535, width: 280, height: 270 }, minDensity: 1 },
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 335, y: 880, width: 365, height: 14 }, minDensity: 2 },
  ],
  'layout-04': [
    { shape: 'rect', tone: 'raised', radius: 'lg', rect: { x: 55, y: 55, width: 500, height: 520 } },
    { shape: 'rect', tone: 'surface', radius: 'md', rect: { x: 610, y: 55, width: 335, height: 230 } },
    { shape: 'rect', tone: 'raised', radius: 'md', rect: { x: 610, y: 330, width: 155, height: 245 } },
    { shape: 'rect', tone: 'surface', radius: 'md', rect: { x: 810, y: 330, width: 135, height: 245 } },
    { shape: 'rect', tone: 'surface', radius: 'md', rect: { x: 55, y: 630, width: 330, height: 300 } },
    { shape: 'rect', tone: 'raised', radius: 'lg', rect: { x: 440, y: 630, width: 505, height: 300 }, minDensity: 1 },
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 485, y: 775, width: 330, height: 15 }, minDensity: 2 },
  ],
  'layout-05': [
    { shape: 'circle', tone: 'raised', radius: 'pill', rect: { x: 570, y: 50, width: 300, height: 300 } },
    { shape: 'rect', tone: 'surface', radius: 'lg', rect: { x: 65, y: 390, width: 870, height: 250 } },
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 85, y: 735, width: 430, height: 18 } },
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 85, y: 815, width: 285, height: 14 } },
    { shape: 'rect', tone: 'raised', radius: 'pill', rect: { x: 690, y: 735, width: 245, height: 75 } },
    { shape: 'rect', tone: 'surface', radius: 'pill', rect: { x: 690, y: 855, width: 150, height: 55 }, minDensity: 1 },
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 85, y: 890, width: 190, height: 12 }, minDensity: 2 },
  ],
  'layout-06': [
    { shape: 'rect', tone: 'surface', radius: 'pill', rect: { x: 75, y: 65, width: 45, height: 860 } },
    { shape: 'circle', tone: 'raised', radius: 'pill', rect: { x: 50, y: 105, width: 95, height: 95 } },
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 210, y: 125, width: 590, height: 17 } },
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 290, y: 285, width: 640, height: 16 } },
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 210, y: 455, width: 475, height: 16 } },
    { shape: 'rect', tone: 'raised', radius: 'lg', rect: { x: 310, y: 600, width: 620, height: 280 } },
    { shape: 'line', tone: 'surface', radius: 'pill', rect: { x: 210, y: 915, width: 325, height: 13 }, minDensity: 1 },
    { shape: 'circle', tone: 'surface', radius: 'pill', rect: { x: 60, y: 430, width: 75, height: 75 }, minDensity: 2 },
  ],
}

export const normalizeStoryPlaceholderDomain = (domain: string) => {
  return domain.trim().toLowerCase().replace(/^www\./, '') || 'news.ycombinator.com'
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

const decimalStringModulo = (value: string, divisor: number): number => {
  const digits = /^\d+$/.test(value) ? value : String(hashSeed(value))

  return [...digits].reduce((remainder, digit) => {
    return (remainder * 10 + Number(digit)) % divisor
  }, 0)
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const getInitials = (domain: string) => {
  const label = domain.split('.')[0] ?? 'hn'
  return (label.replace(/[^a-z0-9]/gi, '').slice(0, 2) || 'HN').toUpperCase()
}

const selectLayout = (domain: string, storySeed: string): StoryPlaceholderLayout => {
  const layoutOrder = LAYOUTS.map((_, index) => index)

  for (let index = layoutOrder.length - 1; index > 0; index -= 1) {
    const swapIndex = hashSeed(`v2:layout-order:${domain}:${index}`) % (index + 1)
    const current = layoutOrder[index] ?? index
    layoutOrder[index] = layoutOrder[swapIndex] ?? swapIndex
    layoutOrder[swapIndex] = current
  }

  const residue = decimalStringModulo(storySeed, LAYOUTS.length)
  const layoutIndex = layoutOrder[residue] ?? residue

  return LAYOUTS[layoutIndex] ?? 'layout-01'
}

const buildPrimitive = (
  definition: PrimitiveDefinition,
  index: number,
  seed: string,
  mirror: boolean,
  variant: 0 | 1 | 2,
  focusIndex: number,
  accentLineIndex: number,
): StoryPlaceholderPrimitive => {
  const isLine = definition.shape === 'line'
  const minimumWidth = isLine ? 40 : 60
  const minimumHeight = isLine ? 8 : 40
  const isCompactVariant = variant === 1
  const baseWidth = Math.round(definition.rect.width * (isCompactVariant ? 0.86 : 1))
  const baseHeight = Math.round(definition.rect.height * (isCompactVariant && !isLine ? 0.9 : 1))
  const centeredX = definition.rect.x + Math.round((definition.rect.width - baseWidth) / 2)
  const centeredY = definition.rect.y + Math.round((definition.rect.height - baseHeight) / 2)
  const sizeJitter = seededRange(seed, `primitive-${index}-size`, -10, 10)
  let width = clamp(
    baseWidth + sizeJitter,
    minimumWidth,
    CANVAS_SIZE - CANVAS_MARGIN * 2,
  )
  let height = clamp(
    baseHeight + (isLine ? 0 : sizeJitter),
    minimumHeight,
    CANVAS_SIZE - CANVAS_MARGIN * 2,
  )

  if (definition.shape === 'circle') {
    const diameter = Math.min(width, height)
    width = diameter
    height = diameter
  }

  const jitteredX = centeredX + seededRange(seed, `primitive-${index}-x`, -10, 10)
  const jitteredY = centeredY + seededRange(seed, `primitive-${index}-y`, -10, 10)
  const baseX = mirror ? CANVAS_SIZE - jitteredX - width : jitteredX
  const baseY = variant === 2 ? CANVAS_SIZE - jitteredY - height : jitteredY
  const x = clamp(baseX, CANVAS_MARGIN, CANVAS_SIZE - CANVAS_MARGIN - width)
  const y = clamp(baseY, CANVAS_MARGIN, CANVAS_SIZE - CANVAS_MARGIN - height)
  const isFocus = index === focusIndex && !isLine
  const isAccentLine = index === accentLineIndex && isLine
  const tone: StoryPlaceholderPrimitiveTone = isFocus
    ? 'accent-soft'
    : isAccentLine
      ? 'accent'
      : definition.tone
  const opacityMin = tone === 'accent' || tone === 'accent-soft' ? 74 : 62
  const opacityMax = tone === 'accent' || tone === 'accent-soft' ? 92 : 86

  return {
    key: `v2-${index}`,
    opacity: seededRange(seed, `primitive-${index}-opacity`, opacityMin, opacityMax),
    radius: definition.radius,
    rect: { x, y, width, height },
    shape: definition.shape,
    tone,
  }
}

export const buildStoryPlaceholder = (domain: string, storySeed: string): StoryPlaceholder => {
  const normalizedDomain = normalizeStoryPlaceholderDomain(domain)
  const normalizedStorySeed = storySeed.trim() || 'story'
  const seed = `v2:${normalizedDomain}:${normalizedStorySeed}`
  const layout = selectLayout(normalizedDomain, normalizedStorySeed)
  const density = seededRange(seed, 'density', 0, 2) as 0 | 1 | 2
  const variant = seededRange(seed, 'variant', 0, 2) as 0 | 1 | 2
  const mirror = seededRange(seed, 'mirror', 0, 1) === 1
  const motif = MOTIFS[seededRange(seed, 'motif', 0, MOTIFS.length - 1)] ?? 'plain'
  const definitions = LAYOUT_PRIMITIVES[layout].filter((definition) => {
    return (definition.minDensity ?? 0) <= density
  })
  const focusCandidates = definitions
    .map((definition, index) => definition.shape === 'line' ? -1 : index)
    .filter((index) => index >= 0)
  const lineCandidates = definitions
    .map((definition, index) => definition.shape === 'line' ? index : -1)
    .filter((index) => index >= 0)
  const focusIndex = focusCandidates[seededRange(seed, 'focus', 0, focusCandidates.length - 1)] ?? 0
  const accentLineIndex = lineCandidates[seededRange(seed, 'accent-line', 0, Math.max(0, lineCandidates.length - 1))] ?? -1
  const primitives = definitions.map((definition, index) => {
    return buildPrimitive(
      definition,
      index,
      seed,
      mirror,
      variant,
      focusIndex,
      accentLineIndex,
    )
  })

  return {
    version: 2,
    layout,
    variant,
    density,
    mirror,
    motif,
    initials: getInitials(normalizedDomain),
    primitives,
    style: {
      '--wire-frame-radius': `${seededRange(seed, 'frame-radius', 14, 24)}px`,
      '--wire-grid-size': `${seededRange(seed, 'grid-size', 22, 38)}px`,
      '--wire-glow-x': `${seededRange(seed, 'glow-x', 12, 88)}%`,
      '--wire-glow-y': `${seededRange(seed, 'glow-y', 8, 82)}%`,
    },
  }
}
