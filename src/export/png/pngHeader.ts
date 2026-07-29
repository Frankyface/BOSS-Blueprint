import type { PngDimensions } from './types.ts'

/**
 * PNG dimensions read straight out of the IHDR bytes.
 *
 * V6 checks the size TWICE — once from the decoded bitmap, once from here — and
 * this is the half that needs no browser at all. A pure function over a byte
 * array is unit-testable in jsdom, runs in the Stage 4 harness unchanged, and
 * catches the one failure a bitmap read cannot: an engine that hands back a blob
 * whose pixels are fine but whose file says something else.
 *
 * Format: 8-byte signature, then chunks of `[length:4][type:4][data][crc:4]`.
 * IHDR is mandatory and MUST be first (PNG spec §11.2.2), so the width and
 * height sit at fixed offsets 16 and 20. No CRC check — a corrupt file fails the
 * decode half of V6, which is the check that owns that question.
 */

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

const SIGNATURE_LENGTH = PNG_SIGNATURE.length
const IHDR_LENGTH_OFFSET = SIGNATURE_LENGTH
const IHDR_TYPE_OFFSET = SIGNATURE_LENGTH + 4
const IHDR_WIDTH_OFFSET = SIGNATURE_LENGTH + 8
const IHDR_HEIGHT_OFFSET = SIGNATURE_LENGTH + 12
/** Signature + length + type + the 13 IHDR data bytes. */
const MIN_PNG_LENGTH = SIGNATURE_LENGTH + 4 + 4 + 13
const IHDR_DATA_LENGTH = 13
/** 'I' 'H' 'D' 'R'. */
const IHDR_TYPE = [0x49, 0x48, 0x44, 0x52] as const

export class PngHeaderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PngHeaderError'
  }
}

function byteAt(bytes: Uint8Array, index: number): number {
  const value = bytes[index]
  if (value === undefined) throw new PngHeaderError(`PNG data ends at byte ${String(index)}.`)
  return value
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    byteAt(bytes, offset) * 0x1000000 +
    (byteAt(bytes, offset + 1) << 16) +
    (byteAt(bytes, offset + 2) << 8) +
    byteAt(bytes, offset + 3)
  )
}

function matches(bytes: Uint8Array, offset: number, expected: readonly number[]): boolean {
  return expected.every((value, index) => bytes[offset + index] === value)
}

/**
 * @throws {PngHeaderError} when the bytes are not a PNG whose first chunk is IHDR.
 */
export function readPngHeader(bytes: Uint8Array): PngDimensions {
  if (bytes.length < MIN_PNG_LENGTH) {
    throw new PngHeaderError(
      `Truncated PNG: ${String(bytes.length)} bytes, need at least ${String(MIN_PNG_LENGTH)}.`,
    )
  }

  if (!matches(bytes, 0, PNG_SIGNATURE)) {
    throw new PngHeaderError('Not a PNG: the 8-byte signature does not match.')
  }

  if (!matches(bytes, IHDR_TYPE_OFFSET, IHDR_TYPE)) {
    throw new PngHeaderError('Malformed PNG: the first chunk is not IHDR.')
  }

  const declaredLength = readUint32(bytes, IHDR_LENGTH_OFFSET)
  if (declaredLength !== IHDR_DATA_LENGTH) {
    throw new PngHeaderError(
      `Malformed PNG: IHDR declares ${String(declaredLength)} bytes, not ${String(IHDR_DATA_LENGTH)}.`,
    )
  }

  const width = readUint32(bytes, IHDR_WIDTH_OFFSET)
  const height = readUint32(bytes, IHDR_HEIGHT_OFFSET)

  if (width === 0 || height === 0) {
    throw new PngHeaderError(`Malformed PNG: IHDR says ${String(width)}x${String(height)}.`)
  }

  return { width, height }
}
