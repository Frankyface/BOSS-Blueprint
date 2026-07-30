import {
  GRID_SIZE_PX,
  MAX_BLOCK_HEIGHT_PX,
  MAX_PAGE_HEIGHT_PX,
  MAX_PAGE_SCALE,
  MIN_PAGE_HEIGHT_PX,
  MIN_PAGE_SCALE,
  PAGE_BOTTOM_PADDING_PX,
  PAGE_EXTRA_SPACE_MAX_PX,
  PAGE_MARGIN_PX,
  PAGE_SCALE_DECIMALS,
  PAGE_WIDTH_PX,
} from './constants.ts'
import type { BlockRect, PenStroke, ResizeHandle, Size } from './types.ts'

/**
 * Every piece of canvas geometry lives here as a pure function: no React, no store,
 * no DOM. The drag/resize gesture previews and the store actions call exactly these,
 * so what you see mid-gesture is what gets committed.
 */

export function clamp(value: number, min: number, max: number): number {
  if (max < min) return min
  return Math.min(Math.max(value, min), max)
}

/** Round a page coordinate onto the 8px design grid. */
export function snapToGrid(value: number, gridSize: number = GRID_SIZE_PX): number {
  if (gridSize <= 0) return value
  return Math.round(value / gridSize) * gridSize
}

/**
 * Round UP onto the grid. Used where rounding down would eat something — the page
 * height, where `snapToGrid` could quietly shave up to 4px off the bottom padding.
 */
export function ceilToGrid(value: number, gridSize: number = GRID_SIZE_PX): number {
  if (gridSize <= 0) return value
  return Math.ceil(value / gridSize) * gridSize
}

/**
 * THE PAGE EDGE STOPS A BLOCK, LIKE THE EDGE OF A SLIDE — on all four sides.
 *
 * This used to allow a block to hang off the left or right edge as long as a 24px
 * sliver stayed on the page. The UX audit (MAJOR-2) caught what that costs: one
 * fast drag left parked a 200px-wide button at x=-176, where the only part still on
 * the page is a 24px strip at the extreme edge — under the palette's shadow, too
 * narrow to aim at, and with the block's own centre off the page entirely (neither
 * Playwright nor a client can click a box by a strip they cannot see). Dragging
 * right was as unbounded, at x=1176.
 *
 * Two more reasons the sliver rule was wrong, beyond reachability:
 *  · The PNG/site export renders exactly the 1200px page (`docs/export-format.md`
 *    §4.2). Whatever hangs off the edge is cropped out of the deliverable — so a
 *    "successful" drag could silently delete the client's words from their brief.
 *  · `resizeRect` has ALWAYS kept a block fully inside the page (the west handle
 *    stops at 0, the east edge at `pageWidth`). Moving was the one gesture that
 *    could put a block somewhere resizing never could.
 *
 * The top of the page is a hard edge — a web page has nothing above its first
 * pixel — and the bottom keeps the whole block inside the tallest page we allow.
 *
 * A block wider (or taller) than the page cannot satisfy both bounds; `clamp`
 * returns the minimum when the range inverts, so it pins to the top-left corner.
 */
export function clampPosition(rect: BlockRect, pageWidth: number = PAGE_WIDTH_PX): BlockRect {
  return {
    ...rect,
    x: clamp(rect.x, 0, pageWidth - rect.width),
    y: clamp(rect.y, 0, MAX_PAGE_HEIGHT_PX - rect.height),
  }
}

/** Move a block by a page-pixel delta, snapping the destination onto the grid. */
export function moveRect(
  rect: BlockRect,
  deltaX: number,
  deltaY: number,
  pageWidth: number = PAGE_WIDTH_PX,
): BlockRect {
  return clampPosition(
    { ...rect, x: snapToGrid(rect.x + deltaX), y: snapToGrid(rect.y + deltaY) },
    pageWidth,
  )
}

/**
 * Resize from one of the eight handles.
 *
 * Rules, in order: snap the dragged edge to the grid → keep it inside the page →
 * enforce the type's minimum size by pinning the *opposite* edge (so a west drag
 * that hits the minimum stops dead instead of sliding the block sideways).
 *
 * When the minimum size and the page's right edge genuinely conflict — a block
 * already sitting at x=1176 has only 24px of page left, but no type is allowed to
 * be narrower than 64 — the PAGE EDGE WINS and the block slides left so that both
 * hold. Applying the minimum last used to silently override the page clamp and
 * leave the block's right edge at 1272, past the 1200px export width.
 */
export function resizeRect(
  rect: BlockRect,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
  minSize: Size,
  pageWidth: number = PAGE_WIDTH_PX,
): BlockRect {
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height

  let { x, y, width, height } = rect

  if (handle.includes('e')) {
    // Room between the anchored west edge and the page's right edge.
    const available = pageWidth - x
    width = Math.min(snapToGrid(rect.width + deltaX), available)

    if (width < minSize.width) {
      width = minSize.width
      // Only when the PAGE EDGE — not the client's own drag — is what made the
      // minimum unreachable do we give up the anchored edge and slide left.
      // An ordinary shrink-to-minimum must leave x exactly where it was.
      if (available < minSize.width) x = Math.max(0, pageWidth - width)
    }
  } else if (handle.includes('w')) {
    x = Math.max(0, snapToGrid(rect.x + deltaX))
    width = right - x
  }

  if (handle.includes('s')) {
    height = snapToGrid(rect.height + deltaY)
  } else if (handle.includes('n')) {
    y = Math.max(0, snapToGrid(rect.y + deltaY))
    height = bottom - y
  }

  width = clamp(width, minSize.width, Math.max(minSize.width, pageWidth))
  height = clamp(height, minSize.height, Math.max(minSize.height, MAX_BLOCK_HEIGHT_PX))

  // The anchored edge never moves, so recover x/y from it after clamping.
  if (handle.includes('w')) x = right - width
  if (handle.includes('n')) y = bottom - height

  return { x, y, width, height }
}

/**
 * THE ROOM THE CLIENT ASKED FOR, normalised — the one place the stored amount is
 * bounded, so the store action, the parser, the canvas and the export all agree
 * about what a given number means.
 *
 * ON THE GRID, not merely rounded: `page.height` is contract-bound to a multiple of
 * 8 (`docs/export-format.md` §2.5) and the amount is added to an already-aligned
 * content height, so an off-grid drag left unsnapped here would write an off-grid
 * height straight into `site.json` and fail V-checks on the way out.
 *
 * Every nonsense value — negative, NaN, Infinity, a hand-edited 99999 — reads as an
 * amount of empty space rather than as a fault. There is nothing a bad number here
 * can cost the client except whitespace.
 */
export function clampExtraSpace(extraBottomPx: number): number {
  if (!Number.isFinite(extraBottomPx) || extraBottomPx <= 0) return 0
  return clamp(snapToGrid(extraBottomPx), 0, PAGE_EXTRA_SPACE_MAX_PX)
}

/**
 * HOW TALL THE PAGE IS — the single definition, for the editor and for the Stage 3
 * PNG render (`docs/export-format.md` §4.2).
 *
 *     bottom  = max(every block's bottom edge, every pen point's y)
 *     content = clamp(1600, ceilToGrid(bottom + 160), 8000)
 *     height  = clamp(1600, content + extraBottomPx, 8000)
 *
 * PEN MARKS COUNT AS CONTENT (review MEDIUM-1). They used not to: the height came
 * from the blocks alone, so a mark drawn below the lowest block kept its page
 * coordinates but fell off the bottom of the white sheet the moment the block
 * holding the page open was deleted — still painted (the overlay does not clip),
 * but hanging in the grey below the page, and off the exported PNG entirely. A
 * stroke is the client's work exactly as much as a block is, so it holds the page
 * open exactly as much.
 *
 * Rounding is UP: `snapToGrid` would round 1961 down to 1960 and quietly eat 1px of
 * the bottom padding.
 *
 * `extraBottomPx` IS THE CLIENT'S "ADD SPACE" (F2), and two things about where it
 * enters the formula are load-bearing:
 *
 *  · It is ADDITIVE to the content height, never a replacement for it. The page can
 *    therefore never be shorter than the client's own work, which makes "Trim"
 *    geometrically incapable of cropping a block or a stroke out of the deliverable
 *    — the export root clips with `overflow: hidden`, so a too-short height would
 *    be the same silent-data-loss class `clampPosition` argues against above, and
 *    removing the failure mode beats warning about it.
 *  · It is added AFTER the 1600 floor, not before it. Added before, the first click
 *    on a near-empty page would do nothing visible at all (a heading's bottom + 400
 *    + 160 is still under 1600) — a button that appears not to work, which is
 *    exactly what a non-technical client reads as "this app is broken".
 *
 * Absent (the default 0) reproduces the pre-F2 answer exactly, for every input.
 */
export function pageHeightForContent(
  rects: readonly BlockRect[],
  strokes: readonly PenStroke[] = [],
  extraBottomPx = 0,
): number {
  const blockBottom = rects.reduce((lowest, rect) => Math.max(lowest, rect.y + rect.height), 0)

  const strokeBottom = strokes.reduce(
    (lowest, stroke) => stroke.points.reduce((low, point) => Math.max(low, point.y), lowest),
    0,
  )

  const desired = ceilToGrid(Math.max(blockBottom, strokeBottom) + PAGE_BOTTOM_PADDING_PX)
  const content = clamp(desired, MIN_PAGE_HEIGHT_PX, MAX_PAGE_HEIGHT_PX)

  return clamp(content + clampExtraSpace(extraBottomPx), MIN_PAGE_HEIGHT_PX, MAX_PAGE_HEIGHT_PX)
}

/**
 * Fit-to-window zoom: shrink the 1200px page until it fits the canvas viewport,
 * never enlarging past 1:1. A zero width means "not measured yet" (first paint, or
 * jsdom in unit tests) — render at 1:1 rather than collapsing to the minimum.
 *
 * ZOOMING IN MUST MAKE THE SKETCH BIGGER (UX audit MAJOR-7). Browser zoom shrinks
 * the viewport measured in CSS pixels — at 150% a 1440px window reports 960 — so
 * fitting to that number alone made Ctrl+= shrink the page instead of enlarging it
 * (measured 0.69 → 0.45 → 0.29 at 100/125/150%). The client asked to see MORE
 * detail and got less, which is exactly backwards, and it hits hardest the older
 * eyes most likely to reach for zoom in the first place.
 *
 * `zoomFactor` is how far the browser has been zoomed SINCE THE APP LOADED
 * (`usePageScale` reads it off `devicePixelRatio`). Multiplying the measured width
 * by it undoes the zoom's effect on this calculation, so the fit scale stays put
 * and the page grows and shrinks physically with everything else on screen — which
 * is what "zoom" means everywhere else in the browser. A real window resize leaves
 * `zoomFactor` at 1 and fit-to-window behaves exactly as it always has.
 *
 * The 32px margin is NOT scaled with it: it is chrome, and it stays 32 CSS pixels
 * at every zoom level, so it is subtracted after the zoom is undone.
 */
export function pageScaleForViewport(viewportWidth: number, zoomFactor = 1): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return MAX_PAGE_SCALE

  const zoom = Number.isFinite(zoomFactor) && zoomFactor > 0 ? zoomFactor : 1
  const available = viewportWidth * zoom - PAGE_MARGIN_PX * 2
  const factor = 10 ** PAGE_SCALE_DECIMALS
  const rounded = Math.floor((available / PAGE_WIDTH_PX) * factor) / factor

  return clamp(rounded, MIN_PAGE_SCALE, MAX_PAGE_SCALE)
}

/**
 * A scroller within this many pixels of its end counts as "at the end".
 *
 * Sub-pixel: fractional layout, a device pixel ratio that is not a whole number
 * and the engines' own rounding all mean `scrollTop + clientHeight` lands a
 * fraction short of `scrollHeight` at the very bottom. Without the tolerance the
 * "there is more below" cue would never quite switch off.
 */
export const SCROLL_END_TOLERANCE_PX = 2

/**
 * Is there still page below the fold? (UX audit P5.)
 *
 * The audit's client scrolled the canvas only by accident: a 1200x1600 page in a
 * 700px viewport gave no visual sign that anything continued past the bottom
 * edge, so the parts of her own sketch below the fold might as well not have
 * existed. `CanvasArea` fades the bottom edge while this is true.
 *
 * Pure arithmetic on three numbers the DOM already knows, so the rule is unit
 * tested rather than eyeballed in three browsers.
 */
export function hasContentBelow(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
): boolean {
  if (![scrollTop, clientHeight, scrollHeight].every((value) => Number.isFinite(value))) return false
  return scrollHeight - (scrollTop + clientHeight) > SCROLL_END_TOLERANCE_PX
}
