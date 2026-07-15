const MIN_SCREENSHOT_BYTES = 1024

export const isWebpScreenshot = (bytes: ArrayBuffer) => {
  const view = new Uint8Array(bytes)

  return view.length >= 12
    && view[0] === 0x52
    && view[1] === 0x49
    && view[2] === 0x46
    && view[3] === 0x46
    && view[8] === 0x57
    && view[9] === 0x45
    && view[10] === 0x42
    && view[11] === 0x50
}

export const validateWebpScreenshot = (
  bytes: ArrayBuffer,
  maximumBytes: number,
) => {
  if (
    bytes.byteLength < MIN_SCREENSHOT_BYTES
    || bytes.byteLength > maximumBytes
    || !isWebpScreenshot(bytes)
  ) {
    throw new Error('Screenshot result is not a bounded WebP image')
  }

  return bytes
}

