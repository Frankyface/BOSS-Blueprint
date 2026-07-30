import { describe, expect, it } from 'vitest'

import {
  MAX_BLOCK_HEIGHT_PX,
  MAX_PAGE_HEIGHT_PX,
  MIN_PAGE_HEIGHT_PX,
  PAGE_BOTTOM_PADDING_PX,
} from '../../canvas/constants.ts'
import { pageHeightForContent } from '../../canvas/geometry.ts'

import {
  BLANK_VARIANCE_FLOOR,
  INK_FLOOR_REFERENCE_HEIGHT_PX,
  INK_SAMPLE_DIVISOR,
  MAX_SAFE_RENDER_HEIGHT_PX,
  MIN_DISTINCT_LUMA,
  MIN_DISTINCT_LUMA_ALWAYS,
  MIN_INK_RATIO,
} from './constants.ts'
import { assessInk, checkPngSanity, checkRenderableHeight } from './sanity.ts'
import type { InspectedPng, PngDimensions } from './types.ts'

/**
 * The sanity gate on synthetic buffers — the half of V6 that needs no browser.
 */

const EXPECTED = { width: 1200, height: 800 } as const

/** How many pixels a 1200×`height` page contributes once downscaled by the divisor. */
function sampleCountFor(height: number): number {
  return Math.ceil(1200 / INK_SAMPLE_DIVISOR) * Math.ceil(height / INK_SAMPLE_DIVISOR)
}

/** How many pixels a 1200×800 page contributes once downscaled by the divisor. */
const SAMPLE_COUNT = sampleCountFor(800)

function buffer(count: number, fill: readonly [number, number, number, number]): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4)
  for (let index = 0; index < count; index += 1) {
    data.set(fill, index * 4)
  }
  return data
}

function withDarkPixels(count: number, darkPixels: number): Uint8ClampedArray {
  const data = buffer(count, [255, 255, 255, 255])
  for (let index = 0; index < darkPixels; index += 1) {
    data.set([0, 0, 0, 255], index * 4)
  }
  return data
}

function inspected(ink: InspectedPng['ink'], size: PngDimensions = EXPECTED): InspectedPng {
  return { decoded: size, header: size, ink }
}

describe('assessInk', () => {
  it('calls an all-white buffer blank', () => {
    const assessment = assessInk(buffer(SAMPLE_COUNT, [255, 255, 255, 255]))

    expect(assessment.inkRatio).toBe(0)
    // Not exactly 0: `E[x²] − mean²` on a constant buffer leaves float dust.
    expect(assessment.variance).toBeLessThan(BLANK_VARIANCE_FLOOR)
    expect(assessment.distinctLuma).toBe(1)
    expect(assessment.blank).toBe(true)
  })

  it('calls a SOLID NON-WHITE buffer blank too — one bucket, no variance', () => {
    // The case a variance-only rule misses: a page rendered as a flat grey
    // rectangle is just as broken as a page rendered white.
    const assessment = assessInk(buffer(SAMPLE_COUNT, [128, 128, 128, 255]))

    expect(assessment.variance).toBeLessThan(BLANK_VARIANCE_FLOOR)
    expect(assessment.distinctLuma).toBe(1)
    expect(assessment.blank).toBe(true)
    expect(checkPngSanity({ inspected: inspected(assessment), expected: EXPECTED, requiresInk: false }).ok).toBe(
      false,
    )
  })

  it('treats a fully transparent buffer as page white, not as black', () => {
    const assessment = assessInk(buffer(SAMPLE_COUNT, [0, 0, 0, 0]))

    expect(assessment.inkRatio).toBe(0)
    expect(assessment.blank).toBe(true)
  })

  it('passes a two-tone buffer — two buckets is the always-on minimum', () => {
    // Pure black on pure white has exactly TWO buckets, which is why the
    // round-trip gate's three-bucket rule is an AND with the variance floor and
    // never a standalone requirement.
    const half = Math.floor(SAMPLE_COUNT / 2)
    const assessment = assessInk(withDarkPixels(SAMPLE_COUNT, half))

    expect(assessment.distinctLuma).toBe(MIN_DISTINCT_LUMA_ALWAYS)
    expect(assessment.distinctLuma).toBeLessThan(MIN_DISTINCT_LUMA)
    expect(assessment.variance).toBeGreaterThan(BLANK_VARIANCE_FLOOR)
    expect(assessment.blank).toBe(false)
    expect(checkPngSanity({ inspected: inspected(assessment), expected: EXPECTED, requiresInk: true }).ok).toBe(
      true,
    )
  })

  it('reports an empty buffer as zero samples rather than dividing by zero', () => {
    const assessment = assessInk(new Uint8ClampedArray(0))

    expect(assessment.sampleCount).toBe(0)
    expect(assessment.inkRatio).toBe(0)
    expect(assessment.blank).toBe(true)
  })

  it('ignores a difference smaller than the ink threshold', () => {
    // 250 is 5 luma below white — inside INK_LUMA_DELTA, so not ink.
    const assessment = assessInk(buffer(SAMPLE_COUNT, [250, 250, 250, 255]))

    expect(assessment.inkRatio).toBe(0)
  })
})

describe('the MIN_INK_RATIO boundary', () => {
  const atFloor = Math.ceil(MIN_INK_RATIO * SAMPLE_COUNT)

  it('fails a page WITH blocks just below the floor', () => {
    const ink = assessInk(withDarkPixels(SAMPLE_COUNT, atFloor - 1))
    const verdict = checkPngSanity({ inspected: inspected(ink), expected: EXPECTED, requiresInk: true })

    expect(ink.inkRatio).toBeLessThan(MIN_INK_RATIO)
    expect(verdict.ok).toBe(false)
    expect(verdict.failure).toBe('blank')
  })

  it('passes the same page at the floor', () => {
    const ink = assessInk(withDarkPixels(SAMPLE_COUNT, atFloor))

    expect(ink.inkRatio).toBeGreaterThanOrEqual(MIN_INK_RATIO)
    expect(checkPngSanity({ inspected: inspected(ink), expected: EXPECTED, requiresInk: true }).ok).toBe(true)
  })

  it('does NOT punish a near-empty page that has no blocks', () => {
    // V9 WARNs about a sparse page; the renderer must not BLOCK it.
    const ink = assessInk(withDarkPixels(SAMPLE_COUNT, atFloor - 1))

    expect(checkPngSanity({ inspected: inspected(ink), expected: EXPECTED, requiresInk: false }).ok).toBe(true)
  })
})

/**
 * The floor is a RATIO over the whole page, so without scaling a page five times
 * as tall needs five times the ink to clear the same bar — which would BLOCK a
 * legitimately sparse tall page with V6's unfixable "export hiccup, try again".
 * These assert the floor as an ABSOLUTE expectation about ink pixels instead.
 */
describe('the ink floor against page height', () => {
  /** How much taller the long page in these cases is than the reference one. */
  const TALL_PAGE_MULTIPLE = 5

  const SHORTEST = { width: 1200, height: MIN_PAGE_HEIGHT_PX } as const
  const TALLEST = { width: 1200, height: MIN_PAGE_HEIGHT_PX * TALL_PAGE_MULTIPLE } as const

  /** The ink the floor asks of the page it was derived against (1200 × 1600). */
  const REFERENCE_INK_PIXELS = Math.ceil(MIN_INK_RATIO * sampleCountFor(MIN_PAGE_HEIGHT_PX))

  function verdictFor(size: PngDimensions, darkPixels: number): ReturnType<typeof checkPngSanity> {
    const ink = assessInk(withDarkPixels(sampleCountFor(size.height), darkPixels))
    return checkPngSanity({ inspected: inspected(ink, size), expected: size, requiresInk: true })
  }

  it('is anchored to the shortest page the editor can produce — they cannot drift', () => {
    // MIN_INK_RATIO's derivation is written against a 1200 × 1600 page. If the
    // editor's minimum ever moves, that derivation has to be redone, not inherited.
    expect(INK_FLOOR_REFERENCE_HEIGHT_PX).toBe(MIN_PAGE_HEIGHT_PX)
  })

  it('holds the reference page to exactly MIN_INK_RATIO — the byte-compat guard', () => {
    expect(verdictFor(SHORTEST, REFERENCE_INK_PIXELS).ok).toBe(true)
    expect(verdictFor(SHORTEST, REFERENCE_INK_PIXELS - 1).ok).toBe(false)
  })

  it('passes a page 5× as tall carrying the SAME absolute ink', () => {
    // Identical pen marks on a longer sheet. Nothing about the render got worse,
    // so nothing about the verdict may change.
    expect(verdictFor(TALLEST, REFERENCE_INK_PIXELS).ok).toBe(true)
  })

  it('still fails that tall page one ink pixel short — the floor is not switched off', () => {
    const verdict = verdictFor(TALLEST, REFERENCE_INK_PIXELS - 1)

    expect(verdict.ok).toBe(false)
    expect(verdict.failure).toBe('blank')
  })

  it('still fails a genuinely white tall page', () => {
    // Scaling the floor must not open a hole underneath it. This one never reaches
    // the floor — the always-on blank rule has it first, whatever `requiresInk`
    // says — which is why the floor's real job is the band just ABOVE white.
    const verdict = verdictFor(TALLEST, 0)

    expect(verdict.ok).toBe(false)
    expect(verdict.failure).toBe('blank')
  })
})

describe('checkPngSanity dimensions', () => {
  const goodInk = assessInk(withDarkPixels(SAMPLE_COUNT, Math.floor(SAMPLE_COUNT / 2)))

  it('rejects a bitmap of the wrong size', () => {
    const verdict = checkPngSanity({
      inspected: { decoded: { width: 2400, height: 1600 }, header: EXPECTED, ink: goodInk },
      expected: EXPECTED,
      requiresInk: true,
    })

    expect(verdict.failure).toBe('dimensions')
    expect(verdict.detail).toContain('2400x1600')
  })

  it('rejects a file whose IHDR disagrees with its own pixels', () => {
    // The failure only the second, independent read can catch.
    const verdict = checkPngSanity({
      inspected: { decoded: EXPECTED, header: { width: 1200, height: 801 }, ink: goodInk },
      expected: EXPECTED,
      requiresInk: true,
    })

    expect(verdict.failure).toBe('dimensions')
    expect(verdict.detail).toContain('IHDR')
  })
})

describe('checkRenderableHeight', () => {
  it('accepts the tallest page the shipped formula can produce', () => {
    expect(checkRenderableHeight(MAX_PAGE_HEIGHT_PX).ok).toBe(true)
  })

  it('refuses a page past the ceiling instead of truncating it', () => {
    const verdict = checkRenderableHeight(MAX_SAFE_RENDER_HEIGHT_PX + 1)

    expect(verdict.ok).toBe(false)
    expect(verdict.failure).toBe('geometry')
  })

  it('refuses a non-integer or non-positive height', () => {
    expect(checkRenderableHeight(0).failure).toBe('geometry')
    expect(checkRenderableHeight(1600.5).failure).toBe('geometry')
  })

  it('keeps the ceiling above the worst case §4.2 can reach — they cannot drift', () => {
    // The worst case the editor allows: a block as tall as a block may be, dragged
    // as low as `clampPosition` permits. That bound is FULL CONTAINMENT — the whole
    // block stays on the page, so the lowest legal top is `MAX_PAGE_HEIGHT_PX` minus
    // the block's own height, and no block's bottom edge can pass 8000.
    const worstBlock = {
      x: 0,
      y: MAX_PAGE_HEIGHT_PX - MAX_BLOCK_HEIGHT_PX,
      width: 1200,
      height: MAX_BLOCK_HEIGHT_PX,
    }

    expect(pageHeightForContent([worstBlock])).toBeLessThanOrEqual(MAX_SAFE_RENDER_HEIGHT_PX)

    // And the ceiling still clears the formula's UNCLAMPED worst case, so raising
    // MAX_PAGE_HEIGHT_PX later cannot silently walk past it.
    const unclamped = worstBlock.y + worstBlock.height + PAGE_BOTTOM_PADDING_PX
    expect(unclamped).toBeLessThanOrEqual(MAX_SAFE_RENDER_HEIGHT_PX)
  })
})
