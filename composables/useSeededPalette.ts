export const useSeededPalette = () => {
  const hashSeed = (value: string) => {
    let hash = 0
    for (let index = 0; index < value.length; index += 1) {
      hash = value.charCodeAt(index) + ((hash << 5) - hash)
    }
    return Math.abs(hash)
  }

  const getHueFromSeed = (seed: string) => {
    return hashSeed(seed) % 360
  }

  const getOklchColor = (seed: string, lightness: number, chroma: number) => {
    const hue = getHueFromSeed(seed)
    return `oklch(${lightness}% ${chroma} ${hue})`
  }

  return {
    hashSeed,
    getHueFromSeed,
    getOklchColor,
  }
}
