/**
 * Base64 ENCODING without `btoa` or `Buffer`, for the same reason
 * `src/export/imageHeader.ts` hand-rolls the decoder: this code has to behave
 * identically in the browser (the app at submit), in jsdom (Vitest) and in Node
 * (the Stage 4 harness), and the three disagree about which of the two globals
 * exists. Twenty lines beats an environment check.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BITS_PER_CHARACTER = 6
const BYTE_BITS = 8
const GROUP_BYTES = 3
const PAD = '='

export function encodeBase64(bytes: Uint8Array): string {
  let out = ''
  let accumulator = 0
  let bitsHeld = 0

  for (const byte of bytes) {
    accumulator = (accumulator << BYTE_BITS) | byte
    bitsHeld += BYTE_BITS

    while (bitsHeld >= BITS_PER_CHARACTER) {
      bitsHeld -= BITS_PER_CHARACTER
      out += ALPHABET[(accumulator >> bitsHeld) & 0x3f]
    }
  }

  if (bitsHeld > 0) {
    out += ALPHABET[(accumulator << (BITS_PER_CHARACTER - bitsHeld)) & 0x3f]
  }
  while (out.length % (GROUP_BYTES + 1) !== 0) out += PAD

  return out
}
