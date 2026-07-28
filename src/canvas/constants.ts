/**
 * Named geometry constants for the virtual page. No magic numbers anywhere else
 * in the canvas code — every value a test asserts on lives here.
 */

/**
 * Fixed design width of the virtual page, in CSS pixels.
 * This is ALSO the Stage 3 PNG/site export render width — never fork the two.
 */
export const PAGE_WIDTH_PX = 1200

/** Everything snaps to this grid when dragged or resized. */
export const GRID_SIZE_PX = 8

/** The page is at least this tall even when empty, and grows to fit its content. */
export const MIN_PAGE_HEIGHT_PX = 1600

/** Hard ceiling so a runaway drag can't produce a megapixel export. */
export const MAX_PAGE_HEIGHT_PX = 8000

/** Breathing room kept below the lowest block as the page grows. */
export const PAGE_BOTTOM_PADDING_PX = 160

/**
 * Ceiling for a single block's height — deliberately half of MAX_PAGE_HEIGHT_PX,
 * so one runaway resize can never eat the whole page budget on its own.
 */
export const MAX_BLOCK_HEIGHT_PX = 4000

/** Each extra free-floating block of a type lands this far down-and-right of the last. */
export const CASCADE_STEP_PX = 24

/** After this many cascaded blocks of one type the offset wraps back to the start. */
export const CASCADE_WRAP_COUNT = 8

/** Gap between the canvas viewport edge and the page at fit-to-window zoom. */
export const PAGE_MARGIN_PX = 32

/** Fit-to-window never shrinks past this, and never enlarges past 1:1. */
export const MIN_PAGE_SCALE = 0.25
export const MAX_PAGE_SCALE = 1

/** Scale is rounded to this many decimals so a 1px viewport jitter can't thrash React. */
export const PAGE_SCALE_DECIMALS = 3
