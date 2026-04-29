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
  const offset = HARMONY_OFFSETS[seedHash % HARMONY_OFFSETS.length]
  const jitter = Math.floor(seedHash / HARMONY_OFFSETS.length) % 17 - 8

  return normalizeHue(contextHue + offset + jitter)
}

export const getSeedPaletteStyle = (
  seed: string | number | null | undefined,
  mode: SeedPaletteMode = 'light',
  contextSeed: string | number | null | undefined = DEFAULT_CONTEXT_SEED,
): SeedPaletteStyle => {
  const hue = getSeedHue(seed, contextSeed)
  const isDark = mode === 'dark'

  // Text colors use conservative lightness/chroma bands; the more saturated
  // tokens are reserved for decoration so arbitrary seeds do not compromise contrast.
  return {
    '--seed-hue': `${hue}`,
    '--seed-accent': isDark ? oklch(76, 0.14, hue) : oklch(54, 0.15, hue),
    '--seed-accent-strong': isDark ? oklch(84, 0.14, hue) : oklch(38, 0.12, hue),
    '--seed-accent-soft': isDark ? oklch(31, 0.04, hue, 0.6) : oklch(94, 0.03, hue, 0.88),
    '--seed-author-text': isDark ? oklch(86, 0.09, hue) : oklch(34, 0.1, hue),
    '--seed-border': isDark ? oklch(67, 0.1, hue, 0.38) : oklch(72, 0.09, hue, 0.42),
    '--seed-rail': isDark ? oklch(76, 0.14, hue, 0.8) : oklch(50, 0.13, hue, 0.78),
    '--seed-ring': isDark ? oklch(76, 0.14, hue, 0.18) : oklch(50, 0.13, hue, 0.16),
    '--seed-surface': isDark ? oklch(24, 0.024, hue, 0.46) : oklch(98, 0.016, hue, 0.88),
    '--seed-surface-strong': isDark ? oklch(29, 0.034, hue, 0.58) : oklch(95, 0.024, hue, 0.92),
    '--seed-child-guide': isDark ? oklch(72, 0.09, hue, 0.28) : oklch(56, 0.1, hue, 0.3),
    '--seed-overlay-mid': oklch(50, 0.1, hue, 0.28),
    '--seed-overlay-edge': oklch(34, 0.085, hue, 0.44),
  }
}
