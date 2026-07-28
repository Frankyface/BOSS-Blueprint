/**
 * The public shapes of the page PNG renderer.
 *
 * ONE INTERFACE, TWO ENGINES (`docs/decisions.md` 2026-07-27 debate #1): callers
 * ask for a page PNG and get one. Which engine produced it is reported, never
 * chosen, by the caller.
 */

/** The two capture engines. Both MIT, both hard dependencies (§4.3). */
export type PngEngineId = 'snapdom' | 'html-to-image'

/** Why a render failed, in a form the submit flow can branch on. */
export type PngRenderFailure =
  /** The page is taller than `MAX_SAFE_RENDER_HEIGHT_PX` — refused before rendering. */
  | 'geometry'
  /** The engine threw, or handed back something that is not a PNG. */
  | 'capture'
  /** The PNG decoded but is the wrong size. */
  | 'dimensions'
  /** The PNG decoded at the right size but carries no ink. */
  | 'blank'

/** What one page render produced. `hasStrokes` is the zip's compression input (§4.3). */
export interface PageRenderResult {
  readonly blob: Blob
  readonly width: number
  readonly height: number
  readonly engine: PngEngineId
  /** Capture attempts spent, 1–3. A first-attempt success reports 1. */
  readonly attempts: number
  /** Fraction of sampled pixels that differ from page white (§5 V6 variance). */
  readonly inkRatio: number
  /** Does this page carry pen strokes? Lossy zip rungs are barred if so (§4.3). */
  readonly hasStrokes: boolean
}

/** One attempt's outcome, kept so a failure can say what each engine did. */
export interface RenderAttemptRecord {
  readonly engine: PngEngineId
  readonly failure: PngRenderFailure
  readonly detail: string
}

/**
 * The typed error the ladder raises once all three attempts are spent. The
 * submit flow surfaces `clientMessage` and logs `detail` — §5 V6's "export
 * hiccup, try again" plus the engine/attempt breakdown for the console.
 */
export class PngRenderError extends Error {
  readonly finding = 'V6'
  readonly failure: PngRenderFailure
  readonly pageId: string
  readonly attempts: readonly RenderAttemptRecord[]
  readonly clientMessage: string

  constructor(
    pageId: string,
    failure: PngRenderFailure,
    attempts: readonly RenderAttemptRecord[],
    clientMessage: string,
  ) {
    const trail = attempts
      .map((attempt, index) => `#${String(index + 1)} ${attempt.engine}: ${attempt.failure} — ${attempt.detail}`)
      .join(' | ')

    super(`V6: page "${pageId}" could not be rendered (${failure}). ${trail}`)
    this.name = 'PngRenderError'
    this.failure = failure
    this.pageId = pageId
    this.attempts = attempts
    this.clientMessage = clientMessage
  }
}

/** What the client is told when the ladder runs out (§5 V6). */
export const RENDER_HICCUP_MESSAGE =
  'We hit a hiccup turning your page into a picture. Please try submitting again.'

/** The dimensions a decoded PNG reports, from either of the two independent reads. */
export interface PngDimensions {
  readonly width: number
  readonly height: number
}

/** What `assessInk` measures on a sampled buffer. */
export interface InkAssessment {
  /** Fraction of sampled pixels darker than page white by `INK_LUMA_DELTA`. */
  readonly inkRatio: number
  /** Population variance of sampled luma. */
  readonly variance: number
  /** Distinct `LUMA_BUCKET_SIZE`-wide luminance buckets present. */
  readonly distinctLuma: number
  /** The round-trip gate's blank rule: low variance AND too few buckets. */
  readonly blank: boolean
  readonly sampleCount: number
}

/** A decoded PNG, measured twice: from the bitmap and from the IHDR bytes. */
export interface InspectedPng {
  readonly decoded: PngDimensions
  readonly header: PngDimensions
  readonly ink: InkAssessment
}
