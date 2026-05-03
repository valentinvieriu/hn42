import decode, { init as initJpegDecode } from '@jsquash/jpeg/decode'
import encode, { init as initJpegEncode } from '@jsquash/jpeg/encode'
import resize, { initResize } from '@jsquash/resize'
import { createConcurrencyLimiter } from './concurrency'
import type { ScreenshotResult } from './types'

const DEFAULT_WIDTH = 720
const DEFAULT_HEIGHT = 1440
const DEFAULT_QUALITY = 78
const DEFAULT_MAX_INPUT_BYTES = 6_000_000
const DEFAULT_MAX_INPUT_PIXELS = 8_000_000
const DEFAULT_QUEUE_TIMEOUT_MS = 15000
const DEFAULT_TIMEOUT_MS = 5000
const thumbnailProcessingLimiter = createConcurrencyLimiter(1)
let wasmReady: Promise<void> | null = null

const JSQUASH_WASM_MODULES = {
  jpegDecode: '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm',
  jpegEncode: '@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm',
  resize: '@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm',
} as const

type ThumbnailOptions = {
  concurrency?: unknown
  height?: unknown
  jpegQuality?: unknown
  maxInputBytes?: unknown
  maxInputPixels?: unknown
  queueTimeoutMs?: unknown
  timeoutMs?: unknown
  width?: unknown
}

const normalizePositiveInteger = (value: unknown, fallback: number) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return fallback
  }

  return Math.max(1, Math.floor(parsedValue))
}

const normalizeJpegQuality = (value: unknown) => {
  const parsedValue = Number(value)

  if (!Number.isFinite(parsedValue)) {
    return DEFAULT_QUALITY
  }

  return Math.min(100, Math.max(1, Math.floor(parsedValue)))
}

const isJpeg = (bytes: ArrayBuffer) => {
  const view = new Uint8Array(bytes)

  return view.length >= 3 && view[0] === 0xff && view[1] === 0xd8 && view[2] === 0xff
}

const runWithTimeout = async <T>(
  task: Promise<T>,
  timeoutMs: number,
  label = 'JPEG thumbnail processing',
) => {
  let timeout: ReturnType<typeof setTimeout> | undefined

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`))
    }, timeoutMs)
  })

  try {
    return await Promise.race([task, timeoutPromise])
  } finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

const isStartOfFrameMarker = (marker: number) => (
  marker >= 0xc0
  && marker <= 0xcf
  && marker !== 0xc4
  && marker !== 0xc8
  && marker !== 0xcc
)

const getJpegDimensions = (bytes: ArrayBuffer) => {
  const view = new Uint8Array(bytes)

  if (view.length < 4 || view[0] !== 0xff || view[1] !== 0xd8) {
    return null
  }

  let offset = 2

  while (offset + 4 <= view.length) {
    if (view[offset] !== 0xff) {
      offset += 1
      continue
    }

    while (view[offset] === 0xff) {
      offset += 1
    }

    const marker = view[offset]
    offset += 1

    if (marker === 0xda || marker === 0xd9) {
      return null
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue
    }

    if (offset + 2 > view.length) {
      return null
    }

    const segmentLength = (view[offset] << 8) | view[offset + 1]

    if (segmentLength < 2 || offset + segmentLength > view.length) {
      return null
    }

    if (isStartOfFrameMarker(marker)) {
      if (segmentLength < 7) {
        return null
      }

      return {
        height: (view[offset + 3] << 8) | view[offset + 4],
        width: (view[offset + 5] << 8) | view[offset + 6],
      }
    }

    offset += segmentLength
  }

  return null
}

const ensureImageData = () => {
  if (typeof globalThis.ImageData !== 'undefined') {
    return
  }

  globalThis.ImageData = class ImageData {
    data: Uint8ClampedArray
    height: number
    width: number

    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data
      this.width = width
      this.height = height
    }
  } as typeof ImageData
}

const loadWasmModuleFromNodeFile = async (specifier: string) => {
  const [
    { readFile },
    { createRequire },
  ] = await Promise.all([
    import('node:fs/promises'),
    import('node:module'),
  ])
  const require = createRequire(import.meta.url)
  const bytes = await readFile(require.resolve(specifier))

  return WebAssembly.compile(bytes)
}

const loadNodeWasmModules = async () => {
  const [
    jpegDecodeWasm,
    jpegEncodeWasm,
    resizeWasm,
  ] = await Promise.all([
    loadWasmModuleFromNodeFile(JSQUASH_WASM_MODULES.jpegDecode),
    loadWasmModuleFromNodeFile(JSQUASH_WASM_MODULES.jpegEncode),
    loadWasmModuleFromNodeFile(JSQUASH_WASM_MODULES.resize),
  ])

  return {
    jpegDecodeWasm,
    jpegEncodeWasm,
    resizeWasm,
  }
}

const loadBundledWasmModules = async () => {
  const [
    { default: jpegDecodeWasm },
    { default: jpegEncodeWasm },
    { default: resizeWasm },
  ] = await Promise.all([
    import('@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm?module'),
    import('@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm?module'),
    import('@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm?module'),
  ])

  if (!jpegDecodeWasm || !jpegEncodeWasm || !resizeWasm) {
    throw new Error('Bundled JPEG thumbnail WASM modules are unavailable')
  }

  return {
    jpegDecodeWasm,
    jpegEncodeWasm,
    resizeWasm,
  }
}

const initializeWasmRuntime = async () => {
  ensureImageData()

  const {
    jpegDecodeWasm,
    jpegEncodeWasm,
    resizeWasm,
  } = import.meta.dev
    ? await loadNodeWasmModules()
    : await loadBundledWasmModules()

  await Promise.all([
    initJpegDecode(jpegDecodeWasm),
    initJpegEncode(jpegEncodeWasm),
    initResize(resizeWasm),
  ])
}

const initializeWasm = (timeoutMs: number) => {
  if (!wasmReady) {
    const initialization = initializeWasmRuntime()

    wasmReady = runWithTimeout(
      initialization,
      timeoutMs,
      'JPEG thumbnail WASM initialization',
    ).catch((error) => {
      wasmReady = null
      throw error
    })
  }

  return wasmReady
}

const cropTop = (image: ImageData, height: number) => {
  const cropHeight = Math.min(image.height, height)

  if (cropHeight === image.height) {
    return image
  }

  const rowBytes = image.width * 4
  const data = new Uint8ClampedArray(rowBytes * cropHeight)

  for (let row = 0; row < cropHeight; row += 1) {
    const sourceStart = row * rowBytes
    data.set(image.data.subarray(sourceStart, sourceStart + rowBytes), sourceStart)
  }

  return new ImageData(data, image.width, cropHeight)
}

const processThumbnail = async (
  original: ScreenshotResult,
  options: Required<ThumbnailOptions>,
): Promise<ScreenshotResult> => {
  if (original.contentType !== 'image/jpeg' || !isJpeg(original.bytes)) {
    throw new Error('Thumbnail processing requires a JPEG original')
  }

  if (original.bytes.byteLength > Number(options.maxInputBytes)) {
    throw new Error(`Original JPEG is too large to process (${original.bytes.byteLength} bytes)`)
  }

  const dimensions = getJpegDimensions(original.bytes)

  if (!dimensions) {
    throw new Error('Could not read original JPEG dimensions')
  }

  const inputPixels = dimensions.width * dimensions.height

  if (inputPixels > Number(options.maxInputPixels)) {
    throw new Error(
      `Original JPEG dimensions are too large to process (${dimensions.width}x${dimensions.height}, ${inputPixels} pixels)`,
    )
  }

  await initializeWasm(Number(options.timeoutMs))

  const decoded = await decode(original.bytes)
  const width = Math.min(Number(options.width), decoded.width)
  const scale = width / decoded.width
  const sourceCropHeight = Math.min(decoded.height, Math.ceil(Number(options.height) / scale))
  const cropped = cropTop(decoded, sourceCropHeight)
  const height = Math.min(Number(options.height), Math.max(1, Math.round(cropped.height * scale)))
  const resized = await resize(cropped, {
    fitMethod: 'stretch',
    height,
    linearRGB: true,
    method: 'lanczos3',
    premultiply: true,
    width,
  })
  const bytes = await encode(resized, {
    optimize_coding: true,
    progressive: true,
    quality: Number(options.jpegQuality),
  })

  if (!isJpeg(bytes)) {
    throw new Error('JPEG thumbnail encoder returned invalid bytes')
  }

  return {
    bytes,
    contentType: 'image/jpeg',
    processor: 'wasm',
    provider: original.provider,
    sourceStrategy: original.sourceStrategy,
    variant: 'thumbnail',
  }
}

export const createThumbnailFromJpeg = async (
  original: ScreenshotResult,
  options: ThumbnailOptions,
) => {
  const normalizedOptions: Required<ThumbnailOptions> = {
    concurrency: options.concurrency,
    height: normalizePositiveInteger(options.height, DEFAULT_HEIGHT),
    jpegQuality: normalizeJpegQuality(options.jpegQuality),
    maxInputBytes: normalizePositiveInteger(options.maxInputBytes, DEFAULT_MAX_INPUT_BYTES),
    maxInputPixels: normalizePositiveInteger(options.maxInputPixels, DEFAULT_MAX_INPUT_PIXELS),
    queueTimeoutMs: normalizePositiveInteger(options.queueTimeoutMs, DEFAULT_QUEUE_TIMEOUT_MS),
    timeoutMs: normalizePositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS),
    width: normalizePositiveInteger(options.width, DEFAULT_WIDTH),
  }
  const release = await thumbnailProcessingLimiter.acquire(normalizedOptions.concurrency, {
    label: 'thumbnail processing',
    maxQueueWaitMs: normalizedOptions.queueTimeoutMs,
  })

  try {
    return await runWithTimeout(
      processThumbnail(original, normalizedOptions),
      normalizedOptions.timeoutMs,
      'JPEG thumbnail processing',
    )
  } finally {
    release()
  }
}
