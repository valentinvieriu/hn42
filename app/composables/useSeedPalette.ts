export type SeedPaletteMode = 'light' | 'dark'

export type SeedPaletteStyle = Record<string, string>

const DEFAULT_SEED = 'hn42'
const DEFAULT_CONTEXT_SEED = 'hn42-visual-palette'
const HARMONY_OFFSETS = [0, 28, -28, 58, -58, 88, -88, 118, -118, 148, -148, 180]

const oklch = (lightness: number, chroma: number, hue: number, alpha = 1) => {
  const alphaChannel = alpha < 1 ? ` / ${alpha}` : ''
  return `oklch(${lightness}% ${chroma} ${hue}${alphaChannel})`
}

const normalizeHue = (hue: number) => ((hue % 360) + 360) % 360

const hashSeed = (seed: string | number | null | undefined): number => {
  const value = String(seed ?? DEFAULT_SEED)
  let hash = 2166136261

  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }

  return hash >>> 0
}

export const getSeedHue = (
  seed: string | number | null | undefined,
  contextSeed: string | number | null | undefined = DEFAULT_CONTEXT_SEED,
): number => {
  const seedHash = hashSeed(seed)
  const contextHue = hashSeed(contextSeed) % 360
  const offset = HARMONY_OFFSETS[seedHash % HARMONY_OFFSETS.length] ?? 0
  const jitter = Math.floor(seedHash / HARMONY_OFFSETS.length) % 17 - 8

  return normalizeHue(contextHue + offset + jitter)
}

const getSeedPaletteTokens = (hue: number, mode: SeedPaletteMode): SeedPaletteStyle => {
  const isDark = mode === 'dark'

  // Text colors use conservative lightness/chroma bands; the more saturated
  // tokens are reserved for decoration so arbitrary seeds do not compromise contrast.
  return {
    '--seed-accent': isDark ? oklch(76, 0.14, hue) : oklch(50, 0.115, hue),
    '--seed-accent-strong': isDark ? oklch(84, 0.14, hue) : oklch(31, 0.09, hue),
    '--seed-accent-soft': isDark ? oklch(31, 0.04, hue, 0.6) : oklch(96, 0.018, hue, 0.74),
    '--seed-author-text': isDark ? oklch(86, 0.09, hue) : oklch(30, 0.072, hue),
    '--seed-border': isDark ? oklch(67, 0.1, hue, 0.38) : oklch(76, 0.045, hue, 0.36),
    '--seed-border-strong': isDark ? oklch(74, 0.12, hue, 0.52) : oklch(63, 0.07, hue, 0.48),
    '--seed-rail': isDark ? oklch(76, 0.14, hue, 0.8) : oklch(43, 0.09, hue, 0.74),
    '--seed-ring': isDark ? oklch(76, 0.14, hue, 0.18) : oklch(55, 0.08, hue, 0.1),
    '--seed-surface': isDark ? oklch(24, 0.024, hue, 0.46) : oklch(98.7, 0.006, hue, 0.86),
    '--seed-surface-strong': isDark ? oklch(29, 0.034, hue, 0.58) : oklch(97.5, 0.008, hue, 0.84),
    '--seed-surface-raised': isDark ? oklch(30, 0.028, hue, 0.76) : oklch(99.3, 0.005, hue, 0.92),
    '--seed-highlight': isDark ? oklch(88, 0.06, hue, 0.1) : oklch(100, 0, hue, 0.66),
    '--seed-metric-bg': isDark ? oklch(32, 0.032, hue, 0.5) : oklch(97.4, 0.014, hue, 0.74),
    '--seed-metric-bg-hover': isDark ? oklch(37, 0.04, hue, 0.68) : oklch(95.8, 0.022, hue, 0.9),
    '--seed-metric-border': isDark ? oklch(70, 0.09, hue, 0.24) : oklch(76, 0.045, hue, 0.34),
    '--seed-shadow': isDark ? oklch(9, 0.012, hue, 0.36) : oklch(47, 0.035, hue, 0.16),
    '--seed-shadow-strong': isDark ? oklch(7, 0.014, hue, 0.52) : oklch(42, 0.04, hue, 0.24),
    '--seed-child-guide': isDark ? oklch(72, 0.09, hue, 0.28) : oklch(58, 0.055, hue, 0.24),
    '--seed-overlay-mid': isDark ? oklch(50, 0.1, hue, 0.28) : oklch(52, 0.06, hue, 0.18),
    '--seed-overlay-edge': isDark ? oklch(34, 0.085, hue, 0.44) : oklch(38, 0.05, hue, 0.26),
  }
}

export const getSeedPaletteStyle = (
  seed: string | number | null | undefined,
  _mode: SeedPaletteMode = 'light',
  contextSeed: string | number | null | undefined = DEFAULT_CONTEXT_SEED,
): SeedPaletteStyle => {
  const hue = getSeedHue(seed, contextSeed)
  const lightTokens = getSeedPaletteTokens(hue, 'light')
  const darkTokens = getSeedPaletteTokens(hue, 'dark')
  const style: SeedPaletteStyle = {
    '--seed-hue': `${hue}`,
  }

  Object.entries(lightTokens).forEach(([token, value]) => {
    style[`${token}-light`] = value
  })

  Object.entries(darkTokens).forEach(([token, value]) => {
    style[`${token}-dark`] = value
  })

  return style
}
