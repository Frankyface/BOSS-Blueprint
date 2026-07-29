/**
 * PNG CHUNK SURGERY — the compression ladder's rung 1.
 *
 * A PNG is a signature followed by `[length:4][type:4][data:length][crc:4]`
 * chunks. Dropping an ANCILLARY chunk is pure byte surgery: no inflate, no
 * re-encode, not one pixel changes, and the file stays valid because ancillary
 * chunks are optional by definition.
 *
 * The four types stripped are exactly the ones §1's ladder names — metadata a
 * builder never reads. Notably NOT stripped: `sRGB`, `sBIT` and `iCCP`, which
 * WebKit emits and which describe how to interpret the colours. Measured on the
 * committed export baselines: chromium and firefox emit no ancillary chunks at
 * all, webkit emits only those three — so on today's renderers this rung is a
 * no-op, which is precisely why a stroke page comes out byte-identical.
 */

/** The ancillary chunk types rung 1 removes. */
export const STRIPPED_CHUNK_TYPES: readonly string[] = ['tEXt', 'tIME', 'pHYs', 'iTXt']

const SIGNATURE: readonly number[] = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const SIGNATURE_LENGTH: number = SIGNATURE.length
const LENGTH_FIELD = 4
const TYPE_FIELD = 4
const CRC_FIELD = 4
const CHUNK_OVERHEAD = LENGTH_FIELD + TYPE_FIELD + CRC_FIELD

function hasPngSignature(bytes: Uint8Array): boolean {
  if (bytes.length < SIGNATURE_LENGTH) return false
  return SIGNATURE.every((byte, index) => bytes[index] === byte)
}

function readUint32(bytes: Uint8Array, offset: number): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return view.getUint32(offset)
}

function readType(bytes: Uint8Array, offset: number): string {
  let type = ''
  for (let index = 0; index < TYPE_FIELD; index += 1) {
    type += String.fromCharCode(bytes[offset + index] ?? 0)
  }
  return type
}

interface Chunk {
  readonly type: string
  readonly start: number
  readonly end: number
}

/** Every chunk in order, or `null` if the bytes are not a well-formed PNG. */
export function readChunks(png: Uint8Array): Chunk[] | null {
  if (!hasPngSignature(png)) return null

  const chunks: Chunk[] = []
  let offset = SIGNATURE_LENGTH

  while (offset + CHUNK_OVERHEAD <= png.length) {
    const length = readUint32(png, offset)
    const end = offset + CHUNK_OVERHEAD + length
    if (end > png.length) return null

    const type = readType(png, offset + LENGTH_FIELD)
    chunks.push({ type, start: offset, end })
    offset = end
    if (type === 'IEND') break
  }

  return chunks.length > 0 ? chunks : null
}

/**
 * The same PNG without `STRIPPED_CHUNK_TYPES`. Anything that is not a decodable
 * PNG comes back UNCHANGED rather than throwing: the ladder is an optimization,
 * and an optimization that can fail a submission is a worse deal than a slightly
 * larger zip. (V6 already refuses a page whose render is not a PNG.)
 */
export function stripAncillaryChunks(png: Uint8Array): Uint8Array {
  const chunks = readChunks(png)
  if (chunks === null) return png

  const keep = chunks.filter((chunk) => !STRIPPED_CHUNK_TYPES.includes(chunk.type))
  if (keep.length === chunks.length) return png

  const size = keep.reduce((total, chunk) => total + (chunk.end - chunk.start), SIGNATURE_LENGTH)
  const out = new Uint8Array(size)
  out.set(png.subarray(0, SIGNATURE_LENGTH), 0)

  let cursor = SIGNATURE_LENGTH
  for (const chunk of keep) {
    out.set(png.subarray(chunk.start, chunk.end), cursor)
    cursor += chunk.end - chunk.start
  }
  return out
}
