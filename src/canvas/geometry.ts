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
import type { BlockRect, ResizeHandle, Size } from './types.ts'

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
    width = Math.min(snapToGrid(rect.width + deltaX), pageWidth - x)
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

/** The page grows to fit its content and never shrinks below the empty-page height. */
export function pageHeightForRects(rects: readonly BlockRect[]): number {
  const contentBottom = rects.reduce((lowest, rect) => Math.max(lowest, rect.y + rect.height), 0)
  const desired = snapToGrid(contentBottom + PAGE_BOTTOM_PADDING_PX)
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
