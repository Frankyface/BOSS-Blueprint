import {
  GRID_SIZE_PX,
  MAX_BLOCK_HEIGHT_PX,
  MAX_PAGE_HEIGHT_PX,
  MAX_PAGE_SCALE,
  MIN_ON_PAGE_PX,
  MIN_PAGE_HEIGHT_PX,
  MIN_PAGE_SCALE,
  PAGE_BOTTOM_PADDING_PX,
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
 * Keep a block reachable: it may hang off the left/right edge of the page, but at
 * least MIN_ON_PAGE_PX of it stays on. The top of the page is a hard edge — a web
 * page has nothing above its first pixel — and the bottom is capped by the max page.
 */
export function clampPosition(rect: BlockRect, pageWidth: number = PAGE_WIDTH_PX): BlockRect {
  const visibleX = Math.min(MIN_ON_PAGE_PX, rect.width)
  const visibleY = Math.min(MIN_ON_PAGE_PX, rect.height)

  return {
    ...rect,
    x: clamp(rect.x, visibleX - rect.width, pageWidth - visibleX),
    y: clamp(rect.y, 0, MAX_PAGE_HEIGHT_PX - visibleY),
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
 * HOW TALL THE PAGE IS — the single definition, for the editor and for the Stage 3
 * PNG render (`docs/export-format.md` §4.2).
 *
 *     bottom = max(every block's bottom edge, every pen point's y)
 *     height = clamp(1600, ceilToGrid(bottom + 160), 8000)
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
 */
export function pageHeightForContent(
  rects: readonly BlockRect[],
  strokes: readonly PenStroke[] = [],
): number {
  const blockBottom = rects.reduce((lowest, rect) => Math.max(lowest, rect.y + rect.height), 0)

  const strokeBottom = strokes.reduce(
    (lowest, stroke) => stroke.points.reduce((low, point) => Math.max(low, point.y), lowest),
    0,
  )

  const desired = ceilToGrid(Math.max(blockBottom, strokeBottom) + PAGE_BOTTOM_PADDING_PX)
  return clamp(desired, MIN_PAGE_HEIGHT_PX, MAX_PAGE_HEIGHT_PX)
}

/**
 * Fit-to-window zoom: shrink the 1200px page until it fits the canvas viewport,
 * never enlarging past 1:1. A zero width means "not measured yet" (first paint, or
 * jsdom in unit tests) — render at 1:1 rather than collapsing to the minimum.
 */
export function pageScaleForViewport(viewportWidth: number): number {
  if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return MAX_PAGE_SCALE

  const available = viewportWidth - PAGE_MARGIN_PX * 2
  const factor = 10 ** PAGE_SCALE_DECIMALS
  const rounded = Math.floor((available / PAGE_WIDTH_PX) * factor) / factor

  return clamp(rounded, MIN_PAGE_SCALE, MAX_PAGE_SCALE)
}
