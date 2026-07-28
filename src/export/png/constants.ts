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
 * can produce today comes near this. It is the *formula's* worst case if that clamp were ever
 * relaxed: `clampPosition` allows `y ≤ MAX_PAGE_HEIGHT_PX − MIN_ON_PAGE_PX`
 * (7976) and a block may be `MAX_BLOCK_HEIGHT_PX` tall (4000), so
 * `bottom ≤ 11976` and §4.2's `+160` then grid-ceil gives 12136 — plus one 8px
 * grid row of slack = 12160. 1200 × 12160 = 14.6 Mpx, inside every desktop
 * engine's canvas limits but not by a wide margin on WebKit.
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
 * Ink floor for a page that has at least one block.
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
 * Tolerance band for the cross-engine ink-ratio comparison (the assertion no
 * per-engine baseline can make). Chromium, Firefox and WebKit legitimately
 * differ on anti-aliasing and font hinting, which moves the ink ratio by a few
 * percent; "WebKit rendered half the page" moves it by tens of percent.
 * Expressed as a fraction of the median across engines.
 */
export const CROSS_ENGINE_INK_TOLERANCE = 0.25

/** The three attempts of the ladder: primary → primary retry → fallback engine. */
export const MAX_RENDER_ATTEMPTS = 3
