/**
 * Named constants for the page PNG renderer. Every number the sanity gate or a
 * test asserts on lives here — `docs/export-format.md` §4.3 and §5 V6.
 */

/** The one PNG format. Lossless always — a PNG is a PNG (§4.3). */
export const PNG_MIME = 'image/png'

/**
 * The page white every render sits on (§4.3 "white page background beneath the
 * blocks"). Literal rather than `var(--boss-surface)` so a stylesheet that has
 * not loaded yet cannot silently produce a transparent capture; the two values
 * are the same colour and `src/styles/theme.css` is the other half of that pair.
 */
export const PAGE_BACKGROUND = '#ffffff'

/**
 * Hard ceiling on a renderable page height.
 *
 * DERIVATION. `pageHeightForContent` (§4.2) already clamps to
 * `MAX_PAGE_HEIGHT_PX` (8000, `src/canvas/constants.ts`), so nothing the editor
 * can produce today comes near this. It is the *formula's* worst case if that
 * clamp were ever relaxed. `clampPosition` now enforces FULL CONTAINMENT
 * (`y ≤ MAX_PAGE_HEIGHT_PX − height`), so a block's bottom edge cannot pass 8000
 * however tall it is, and §4.2's `+160` then grid-ceil gives 8160 — 4000px of
 * headroom under this ceiling.
 *
 * The ceiling itself is kept at the OLDER, more generous figure: containment
 * replaced a rule that let a block hang off the bottom on a 24px sliver, under
 * which the worst case was `7976 + 4000 + 160` → grid-ceil 12136, plus one 8px
 * grid row of slack = 12160. Keeping it is the safe direction — it only ever
 * refuses a page that genuinely cannot be rendered, and it means tightening the
 * position rule did not quietly tighten the render ceiling with it.
 * 1200 × 12160 = 14.6 Mpx, inside every desktop engine's canvas limits but not
 * by a wide margin on WebKit.
 *
 * Exceeding it fails sanity → V6, which is honest. Silently truncating is not.
 * `sanity.test.ts` asserts the derivation against the shipped formula so the two
 * cannot drift apart.
 */
export const MAX_SAFE_RENDER_HEIGHT_PX = 12_160

/** Every 4th pixel in each axis: 1/16 the work, and no glyph is 4px wide. */
export const INK_SAMPLE_DIVISOR = 4

/**
 * Luma bucket width and the blank thresholds, taken VERBATIM from the round-trip
 * gate (`scripts/roundtrip/README.md` note 5 and
 * `scripts/roundtrip/lib/png-inspect.mjs`) so the app and the Stage 4 harness
 * cannot disagree about what "blank" means: a page is blank iff its luminance
 * variance is below the floor AND it has fewer than three distinct buckets.
 */
export const LUMA_BUCKET_SIZE = 8
export const BLANK_VARIANCE_FLOOR = 1.0
export const MIN_DISTINCT_LUMA = 3

/**
 * The always-on half of the gate: two distinct buckets, even for a page with no
 * blocks at all. A solid non-white rectangle has exactly one bucket and would
 * otherwise sail through on variance alone.
 */
export const MIN_DISTINCT_LUMA_ALWAYS = 2

/** How far a sampled pixel's luma must sit below page white to count as ink. */
export const INK_LUMA_DELTA = 8

/**
 * Ink floor for a page that has content on it — at least one block, or at least
 * one pen stroke.
 *
 * DERIVATION: the smallest block the editor allows is 96 × 40 (`blockTypes.ts`
 * `minSize`), i.e. 3840 px on the smallest page (1200 × 1600 = 1.92 Mpx) — 0.2%
 * of it. Glyph coverage inside a text block is roughly a sixth of its box, so
 * the sparsest legitimate page lands near 0.03%. The floor is set three times
 * below that: it exists to catch "the capture came back white", not to punish a
 * sparse page (which is V9's WARN, not a renderer failure).
 */
export const MIN_INK_RATIO = 0.0001

/**
 * The page height `MIN_INK_RATIO` was derived against — the shortest page the
 * editor can produce (`MIN_PAGE_HEIGHT_PX`, `src/canvas/constants.ts`).
 *
 * WHY THE FLOOR NEEDS A REFERENCE HEIGHT: it is a RATIO over the whole page, so
 * the same handful of pen marks on a page five times as tall reads as a fifth of
 * the ink. Nothing about that render is worse — the page is just longer — but an
 * unscaled floor would fail it and hand the client V6's "export hiccup, try
 * again", which is advice they cannot act on. Scaling by
 * `INK_FLOOR_REFERENCE_HEIGHT_PX / page height` keeps the floor an ABSOLUTE
 * expectation about ink PIXELS, which is what "almost nothing rendered" actually
 * means — a page that came back uniformly white is caught earlier and separately,
 * by the blank rule. The scale is capped at 1, so a page SHORTER than the
 * reference is never held to a higher bar than the derivation above justifies.
 *
 * `sanity.test.ts` asserts this equals `MIN_PAGE_HEIGHT_PX` so the two cannot
 * drift apart: if the editor's minimum page ever changes, the derivation has to
 * be redone rather than silently inherited.
 */
export const INK_FLOOR_REFERENCE_HEIGHT_PX = 1600

/**
 * How much more ink a page's PEN STROKES must promise than the floor asks for
 * before the floor is allowed to judge that page (`inkExpectation.ts`).
 *
 * WHY A MARGIN AT ALL: the ink floor answers one question — "did the capture come
 * back empty?" — and it can only answer it where we KNOW there should have been
 * ink. On a page whose only content is a small pen mark we do not: the prediction
 * (stroke length × nib width) is a geometric IDEAL, and the measurement it is
 * compared against is systematically lower than that ideal. Get it wrong in that
 * direction and a page that rendered perfectly is BLOCKed with V6's "export
 * hiccup, try again" — advice the client cannot act on, for a page that is fine.
 *
 * DERIVATION — two independent halves, each worth about 2×:
 *  · ANTI-ALIASING AND TAPER. `perfect-freehand` narrows a stroke towards both
 *    ends, and the feathered edge pixels land within `INK_LUMA_DELTA` of page
 *    white, so they are not counted as ink at all. A nominally 4px nib routinely
 *    measures nearer 2px of countable core.
 *  · SAMPLE ALIGNMENT. The gate reads every `INK_SAMPLE_DIVISOR`-th pixel on each
 *    axis. A stroke no wider than the divisor can fall between sampled columns or
 *    rows for part of its length — unbiased on average, but a single short mark is
 *    one sample away from reading as nothing.
 *
 * The error is deliberately one-sided: over-estimating only means a sparse pen
 * page keeps the behaviour it has today (no ink check, exactly as when the floor
 * was blocks-only), while under-estimating costs a client their submission. In
 * stroke terms this asks a 4px pen for roughly 190px of travel on any page —
 * about a finger's width of drawing — before its render is held to the floor.
 */
export const INK_EXPECTATION_SAFETY_FACTOR = 4

/**
 * Tolerance band for the cross-engine ink-ratio comparison (the assertion no
 * per-engine baseline can make). Chromium, Firefox and WebKit legitimately
 * differ on anti-aliasing and font hinting, which moves the ink ratio by a few
 * percent; "WebKit rendered half the page" moves it by tens of percent.
 * Expressed as a fraction of the median across engines.
 */
export const CROSS_ENGINE_INK_TOLERANCE = 0.25

/** The three attempts of the ladder: primary → primary retry → fallback engine. */
export const MAX_RENDER_ATTEMPTS = 3
