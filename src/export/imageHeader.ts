/**
 * IMAGE HEADER PARSING — `docs/export-format.md` §4.6 (`width`/`height`/`bytes`
 * describe the file in the zip) and §5 V21 (the manifest must match those bytes).
 *
 * Parsing the very bytes being staged is what makes the manifest and the file agree
 * BY CONSTRUCTION rather than by luck, and it keeps the whole transform pure: no
 * `<img>`, no canvas, no async decode, testable in Vitest against committed
 * fixtures. Three formats, because §4.6 names exactly three MIME types.
 */

import type { AssetMimeType } from './types.ts'

/** §4.6 — MIME → file extension. The only mapping; `asset.path` is built from it. */
export const MIME_EXTENSIONS: Readonly<Record<AssetMimeType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export interface ImageFacts {
  readonly mimeType: AssetMimeType
  readonly width: number
  readonly height: number
  readonly bytes: number
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const BASE64_VALUES: Readonly<Record<string, number>> = Object.fromEntries(
  [...BASE64_ALPHABET].map((character, index) => [character, index]),
)

/**
 * Decode base64 to bytes without `atob`, `Buffer` or a dependency.
 *
 * Hand-rolled on purpose: this module has to run identically in the browser (the
 * app at submit), in jsdom (Vitest) and in Node (the Stage 4 harness), and the
 * three disagree about which of `atob`/`Buffer` exists. It is ~20 lines and it is
 * the only decoder in the export path.
 */
export function decodeBase64(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '')
  const byteLength = Math.floor((clean.length * 3) / 4)
  const out = new Uint8Array(byteLength)

  let outIndex = 0
  let accumulator = 0
  let bitsHeld = 0

  for (const character of clean) {
    const value = BASE64_VALUES[character]
    if (value === undefined) continue

    accumulator = (accumulator << 6) | value
    bitsHeld += 6
    if (bitsHeld < 8) continue

    bitsHeld -= 8
    out[outIndex] = (accumulator >> bitsHeld) & 0xff
    outIndex += 1
  }

  return out.subarray(0, outIndex)
}

export interface ParsedDataUrl {
  readonly mimeType: AssetMimeType
  readonly bytes: Uint8Array
}

const DATA_URL_PREFIX = /^data:(image\/(?:jpeg|png|webp));base64,/

/**
 * Split a stored `data:` URL into its MIME type and its decoded bytes. Returns
 * `null` for anything that is not one of the three accepted raster types — an
 * imported `.blueprint` is untrusted input (`src/canvas/imageAssets.ts` guards the
 * same three), and the export must never stage bytes it could not identify.
 */
export function parseImageDataUrl(dataUrl: string): ParsedDataUrl | null {
  const match = DATA_URL_PREFIX.exec(dataUrl)
  if (!match) return null

  const mimeType = match[1] as AssetMimeType
  return { mimeType, bytes: decodeBase64(dataUrl.slice(match[0].length)) }
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) << 24) |
    ((bytes[offset + 1] ?? 0) << 16) |
    ((bytes[offset + 2] ?? 0) << 8) |
    (bytes[offset + 3] ?? 0)
  ) >>> 0
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16)
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const PNG_IHDR_WIDTH_OFFSET = 16

/** PNG: the IHDR chunk is mandatory and is always the first one, at a fixed offset. */
function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null
  if (!PNG_SIGNATURE.every((byte, index) => bytes[index] === byte)) return null

  return {
    width: readUint32BE(bytes, PNG_IHDR_WIDTH_OFFSET),
    height: readUint32BE(bytes, PNG_IHDR_WIDTH_OFFSET + 4),
  }
}

/** Start-of-frame markers carry the dimensions; DHT/DRI/APPn and friends do not. */
const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
])

/** JPEG: walk the segment chain to the first SOF marker. */
function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (readUint16BE(bytes, 0) !== 0xffd8) return null

  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = bytes[offset + 1] ?? 0
    // Standalone markers (RSTn, SOI, TEM) carry no length word.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) return null

    const length = readUint16BE(bytes, offset + 2)
    if (JPEG_SOF_MARKERS.has(marker)) {
      return { height: readUint16BE(bytes, offset + 5), width: readUint16BE(bytes, offset + 7) }
    }
    if (length < 2) return null
    offset += 2 + length
  }
  return null
}

const RIFF = 0x52494646
const WEBP = 0x57454250

/** WebP: one of three chunk layouts — lossy VP8, lossless VP8L, extended VP8X. */
function webpSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 30) return null
  if (readUint32BE(bytes, 0) !== RIFF || readUint32BE(bytes, 8) !== WEBP) return null

  const chunk = String.fromCharCode(...bytes.subarray(12, 16))

  if (chunk === 'VP8 ') {
    return { width: readUint16LE(bytes, 26) & 0x3fff, height: readUint16LE(bytes, 28) & 0x3fff }
  }
  if (chunk === 'VP8L') {
    // 14-bit width-1 then 14-bit height-1, packed little-endian after the 0x2f signature byte.
    const packed =
      ((bytes[21] ?? 0) |
        ((bytes[22] ?? 0) << 8) |
        ((bytes[23] ?? 0) << 16) |
        ((bytes[24] ?? 0) << 24)) >>>
      0
    return { width: (packed & 0x3fff) + 1, height: ((packed >>> 14) & 0x3fff) + 1 }
  }
  if (chunk === 'VP8X') {
    return { width: readUint24LE(bytes, 24) + 1, height: readUint24LE(bytes, 27) + 1 }
  }
  return null
}

/**
 * Pixel dimensions straight out of the file's own header bytes, or `null` when the
 * bytes are truncated or malformed — which the caller must treat as a packaging
 * bug, never as a default size.
 */
export function imageSize(
  mimeType: AssetMimeType,
  bytes: Uint8Array,
): { width: number; height: number } | null {
  const size =
    mimeType === 'image/png'
      ? pngSize(bytes)
      : mimeType === 'image/jpeg'
        ? jpegSize(bytes)
        : webpSize(bytes)

  if (!size || size.width <= 0 || size.height <= 0) return null
  return size
}

/** Everything the asset manifest needs about one stored `data:` URL. */
export function imageFacts(dataUrl: string): ImageFacts | null {
  const parsed = parseImageDataUrl(dataUrl)
  if (!parsed) return null

  const size = imageSize(parsed.mimeType, parsed.bytes)
  if (!size) return null

  return {
    mimeType: parsed.mimeType,
    width: size.width,
    height: size.height,
    bytes: parsed.bytes.length,
  }
}
