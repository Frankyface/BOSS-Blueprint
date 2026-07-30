import {
  BLANK_VARIANCE_FLOOR,
  INK_FLOOR_REFERENCE_HEIGHT_PX,
  INK_LUMA_DELTA,
  LUMA_BUCKET_SIZE,
  MAX_SAFE_RENDER_HEIGHT_PX,
  MIN_DISTINCT_LUMA,
  MIN_DISTINCT_LUMA_ALWAYS,
  MIN_INK_RATIO,
} from './constants.ts'
import type { InkAssessment, InspectedPng, PngDimensions, PngRenderFailure } from './types.ts'

/**
 * SANITY VALIDATION — the binding mitigation from debate #1, as pure functions.
 *
 * "Non-blank pixel variance" has no numeric definition in `docs/export-format.md`
 * §4.3/§5 V6, so this module adopts the one the round-trip gate already states
 * (`scripts/roundtrip/README.md` note 5, `scripts/roundtrip/lib/png-inspect.mjs`):
 * **blank iff luminance variance < 1.0 AND fewer than 3 distinct luma buckets** —
 * both must hold, so a legitimately sparse page still passes. Restating it here
 * rather than inventing a second rule is the point: the app at submit time and
 * the Stage 4 harness against the shipped zip must agree.
 *
 * On top of that shared floor the feature spec adds two app-side conditions:
 * at least two distinct buckets ALWAYS (a solid non-white rectangle has one),
 * and `inkRatio ≥` the height-scaled `MIN_INK_RATIO` whenever the page has
 * content on it — a block OR a pen stroke. A near-empty page is V9's WARN, never
 * a renderer failure.
 */

/**
 * ITU-R BT.709 luma, the same weights `png-inspect.mjs` uses. Exported because
 * `inkExpectation.ts` has to answer "would this colour even register as ink?" with
 * the same arithmetic that measures the capture — two answers to that would be
 * worse than none.
 */
export const LUMA_RED = 0.2126
export const LUMA_GREEN = 0.7152
export const LUMA_BLUE = 0.0722
export const WHITE_LUMA = 255
const RGBA_STRIDE = 4

const EMPTY_ASSESSMENT: InkAssessment = {
  inkRatio: 0,
  variance: 0,
  distinctLuma: 0,
  blank: true,
  sampleCount: 0,
}

/**
 * Measure a buffer of RGBA samples. The caller does the downsampling (it needs a
 * canvas); this function only does arithmetic, which is what makes it testable.
 *
 * Alpha is composited onto page white before measuring: an engine that hands
 * back a transparent capture must read as blank, not as "every pixel is 0".
 */
export function assessInk(samples: ArrayLike<number>): InkAssessment {
  const count = Math.floor(samples.length / RGBA_STRIDE)
  if (count === 0) return EMPTY_ASSESSMENT

  const buckets = new Set<number>()
  let sum = 0
  let sumSquares = 0
  let inkPixels = 0

  for (let index = 0; index < count; index += 1) {
    const offset = index * RGBA_STRIDE
    const alpha = (samples[offset + 3] ?? 0) / 255
    const red = (samples[offset] ?? 0) * alpha + WHITE_LUMA * (1 - alpha)
    const green = (samples[offset + 1] ?? 0) * alpha + WHITE_LUMA * (1 - alpha)
    const blue = (samples[offset + 2] ?? 0) * alpha + WHITE_LUMA * (1 - alpha)

    const luma = LUMA_RED * red + LUMA_GREEN * green + LUMA_BLUE * blue
    sum += luma
    sumSquares += luma * luma
    buckets.add(Math.round(luma / LUMA_BUCKET_SIZE))

    if (Math.abs(WHITE_LUMA - luma) > INK_LUMA_DELTA) inkPixels += 1
  }

  const mean = sum / count
  const variance = Math.max(0, sumSquares / count - mean * mean)
  const distinctLuma = buckets.size

  return {
    inkRatio: inkPixels / count,
    variance,
    distinctLuma,
    blank: variance < BLANK_VARIANCE_FLOOR && distinctLuma < MIN_DISTINCT_LUMA,
    sampleCount: count,
  }
}

export interface SanityVerdict {
  readonly ok: boolean
  readonly failure: PngRenderFailure | null
  readonly detail: string
}

const PASSED: SanityVerdict = { ok: true, failure: null, detail: '' }

function describe(size: PngDimensions): string {
  return `${String(size.width)}x${String(size.height)}`
}

/**
 * The geometry guard, run BEFORE anything is rendered. A page taller than the
 * ceiling fails honestly instead of producing a truncated or empty canvas.
 */
export function checkRenderableHeight(height: number): SanityVerdict {
  if (!Number.isInteger(height) || height <= 0) {
    return { ok: false, failure: 'geometry', detail: `page height ${String(height)} is not a positive integer` }
  }

  if (height > MAX_SAFE_RENDER_HEIGHT_PX) {
    return {
      ok: false,
      failure: 'geometry',
      detail: `page height ${String(height)} exceeds MAX_SAFE_RENDER_HEIGHT_PX (${String(MAX_SAFE_RENDER_HEIGHT_PX)})`,
    }
  }

  return PASSED
}

export interface SanityInput {
  readonly inspected: InspectedPng
  readonly expected: PngDimensions
  /** Did the client put anything on this page — a block or a stroke? Only then is the ink floor enforced. */
  readonly requiresInk: boolean
}

/**
 * `MIN_INK_RATIO` restated as an absolute quantity of ink for a page of this
 * height (see `INK_FLOOR_REFERENCE_HEIGHT_PX`). Capped at 1: a page shorter than
 * the reference keeps the derived floor exactly, so this can only ever LOWER the
 * bar — a capture that passes today cannot start failing because of it.
 */
export function inkFloorFor(height: number): number {
  return MIN_INK_RATIO * Math.min(1, INK_FLOOR_REFERENCE_HEIGHT_PX / Math.max(height, 1))
}

/**
 * The full V6 gate over an already-decoded PNG: exact dimensions from BOTH
 * independent reads, then non-blank.
 */
export function checkPngSanity({ inspected, expected, requiresInk }: SanityInput): SanityVerdict {
  const { decoded, header, ink } = inspected

  if (decoded.width !== expected.width || decoded.height !== expected.height) {
    return {
      ok: false,
      failure: 'dimensions',
      detail: `decoded bitmap is ${describe(decoded)}, expected ${describe(expected)}`,
    }
  }

  if (header.width !== expected.width || header.height !== expected.height) {
    return {
      ok: false,
      failure: 'dimensions',
      detail: `IHDR says ${describe(header)}, expected ${describe(expected)}`,
    }
  }

  if (ink.blank || ink.distinctLuma < MIN_DISTINCT_LUMA_ALWAYS) {
    return {
      ok: false,
      failure: 'blank',
      detail:
        `no ink: variance ${ink.variance.toFixed(2)} (floor ${String(BLANK_VARIANCE_FLOOR)}), ` +
        `${String(ink.distinctLuma)} distinct luma bucket(s), ${String(ink.sampleCount)} samples`,
    }
  }

  const inkFloor = inkFloorFor(expected.height)
  if (requiresInk && ink.inkRatio < inkFloor) {
    return {
      ok: false,
      failure: 'blank',
      detail:
        `ink ratio ${ink.inkRatio.toExponential(2)} is below the floor ` +
        `${inkFloor.toExponential(2)} (MIN_INK_RATIO ${String(MIN_INK_RATIO)} scaled for a ` +
        `${String(expected.height)}px page) on a page that has content`,
    }
  }

  return PASSED
}
