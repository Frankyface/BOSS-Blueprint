import { describe, expect, it } from 'vitest'

import {
  decodeFixture,
  PAGE_1200X12056_PNG,
  PAGE_1200X800_PNG,
  PIXEL_1X1_PNG,
} from './fixtures/pngFixtures.ts'
import { PngHeaderError, readPngHeader } from './pngHeader.ts'

/**
 * The IHDR parser against REAL PNG files, committed under `fixtures/`.
 *
 * They are plain 8-bit greyscale PNGs (signature + IHDR + deflated IDAT + IEND)
 * at the three sizes that matter: the degenerate 1×1, a normal page, and the
 * tallest page §4.2's formula can describe. Synthetic byte arrays would prove the
 * offsets and nothing else; these prove the parser survives a file an encoder
 * actually wrote.
 */

const PIXEL = decodeFixture(PIXEL_1X1_PNG)
const PAGE_800 = decodeFixture(PAGE_1200X800_PNG)
const PAGE_TALL = decodeFixture(PAGE_1200X12056_PNG)

describe('readPngHeader', () => {
  it('reads 1x1 from the degenerate fixture', () => {
    expect(readPngHeader(PIXEL)).toEqual({ width: 1, height: 1 })
  })

  it('reads a normal page size', () => {
    expect(readPngHeader(PAGE_800)).toEqual({ width: 1200, height: 800 })
  })

  it('reads the tallest page §4.2 can describe without overflowing', () => {
    expect(readPngHeader(PAGE_TALL)).toEqual({ width: 1200, height: 12_056 })
  })

  it('rejects a file that is not a PNG', () => {
    const notPng = new Uint8Array(PAGE_800)
    notPng[1] = 0x00

    expect(() => readPngHeader(notPng)).toThrow(PngHeaderError)
    expect(() => readPngHeader(notPng)).toThrow(/signature/)
  })

  it('rejects a truncated file', () => {
    expect(() => readPngHeader(PAGE_800.subarray(0, 20))).toThrow(/Truncated/)
  })

  it('rejects a PNG whose first chunk is not IHDR', () => {
    const moved = new Uint8Array(PAGE_800)
    // 'IHDR' -> 'IHDS': a valid-looking chunk that is not the header.
    moved[15] = 0x53

    expect(() => readPngHeader(moved)).toThrow(/not IHDR/)
  })

  it('rejects an IHDR that declares the wrong data length', () => {
    const badLength = new Uint8Array(PAGE_800)
    badLength[11] = 12

    expect(() => readPngHeader(badLength)).toThrow(/IHDR declares 12 bytes/)
  })

  it('rejects a zero dimension', () => {
    const zeroWidth = new Uint8Array(PAGE_800)
    zeroWidth[16] = 0
    zeroWidth[17] = 0
    zeroWidth[18] = 0
    zeroWidth[19] = 0

    expect(() => readPngHeader(zeroWidth)).toThrow(/IHDR says 0x800/)
  })

  it('reads dimensions above 2^24 without sign or shift damage', () => {
    // 0x01000001 = 16 777 217. `<< 24` would wrap this to a negative number, so
    // the top byte is multiplied rather than shifted; this is that regression.
    const huge = new Uint8Array(PAGE_800)
    huge.set([0x01, 0x00, 0x00, 0x01], 16)

    expect(readPngHeader(huge).width).toBe(16_777_217)
  })
})
