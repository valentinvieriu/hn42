type SeedPaletteStyle = Record<string, string>

const DEFAULT_SEED = 'hn42'
const DEFAULT_CONTEXT_SEED = 'hn42-visual-palette'
const HARMONY_OFFSETS = [0, 28, -28, 58, -58, 88, -88, 118, -118, 148, -148, 180]

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

const getSeedHue = (
  seed: string | number | null | undefined,
  contextSeed: string | number | null | undefined = DEFAULT_CONTEXT_SEED,
): number => {
  const seedHash = hashSeed(seed)
  const contextHue = hashSeed(contextSeed) % 360
  const offset = HARMONY_OFFSETS[seedHash % HARMONY_OFFSETS.length] ?? 0
  const jitter = Math.floor(seedHash / HARMONY_OFFSETS.length) % 17 - 8

  return normalizeHue(contextHue + offset + jitter)
}

export const getSeedPaletteStyle = (
  seed: string | number | null | undefined,
  contextSeed: string | number | null | undefined = DEFAULT_CONTEXT_SEED,
): SeedPaletteStyle => {
  const hue = getSeedHue(seed, contextSeed)

  return {
    '--seed-hue': `${hue}`,
  }
}
