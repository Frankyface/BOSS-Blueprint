import { clamp } from '../canvas/geometry.ts'

/**
 * WHERE A POINTER'S BUBBLE GOES — pure arithmetic over four rectangles, so the
 * cross-engine question ("can a bubble ever render off-screen?") is answered by a
 * unit test rather than by three browsers.
 *
 * Two rules, in this order:
 *  1. Sit beside the thing you are pointing at, on the side that keeps the middle
 *     of the canvas clear — the client has to be able to carry on working.
 *  2. Never leave the window. Clamping wins over placement every time: a bubble
 *     half off the right edge teaches nothing at all.
 */

export type TourPlacement =
  /** Right of the target, bottom edges aligned. Tall left-hand columns. */
  | 'right-end'
  /** Horizontally centred inside the target, tucked under its top edge. */
  | 'inside-top'
  /** Below the target, left edges aligned. */
  | 'below-start'
  /** Below the target, right edges aligned. Top-right controls. */
  | 'below-end'
  /** Left of the target, top edges aligned. Tall right-hand columns. */
  | 'left-start'

export interface AnchorRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

export interface AnchorSize {
  readonly width: number
  readonly height: number
}

export interface AnchorPoint {
  readonly left: number
  readonly top: number
}

/** Breathing room between a bubble and the thing it points at. */
export const TOUR_BUBBLE_GAP_PX = 12

/** …and between a bubble and the edge of the window. */
export const TOUR_VIEWPORT_MARGIN_PX = 12

function preferredPoint(
  target: AnchorRect,
  bubble: AnchorSize,
  placement: TourPlacement,
): AnchorPoint {
  switch (placement) {
    case 'right-end':
      return {
        left: target.left + target.width + TOUR_BUBBLE_GAP_PX,
        top: target.top + target.height - bubble.height - TOUR_BUBBLE_GAP_PX,
      }
    case 'inside-top':
      return {
        left: target.left + (target.width - bubble.width) / 2,
        top: target.top + TOUR_BUBBLE_GAP_PX,
      }
    case 'below-start':
      return { left: target.left, top: target.top + target.height + TOUR_BUBBLE_GAP_PX }
    case 'below-end':
      return {
        left: target.left + target.width - bubble.width,
        top: target.top + target.height + TOUR_BUBBLE_GAP_PX,
      }
    case 'left-start':
      return {
        left: target.left - bubble.width - TOUR_BUBBLE_GAP_PX,
        top: target.top + TOUR_BUBBLE_GAP_PX,
      }
  }
}

/**
 * Top-left corner for the bubble, in viewport coordinates (it is `position:
 * fixed`, so that is the whole story — no scroll offsets to add).
 *
 * `clamp` returns its minimum when the range inverts, so a bubble larger than the
 * window pins to the top-left margin instead of producing a negative position.
 */
export function anchorBubble(
  target: AnchorRect,
  bubble: AnchorSize,
  viewport: AnchorSize,
  placement: TourPlacement,
): AnchorPoint {
  const point = preferredPoint(target, bubble, placement)

  return {
    left: clamp(
      point.left,
      TOUR_VIEWPORT_MARGIN_PX,
      viewport.width - bubble.width - TOUR_VIEWPORT_MARGIN_PX,
    ),
    top: clamp(
      point.top,
      TOUR_VIEWPORT_MARGIN_PX,
      viewport.height - bubble.height - TOUR_VIEWPORT_MARGIN_PX,
    ),
  }
}

/** Rounded to whole pixels so a sub-pixel jitter cannot thrash React. */
export function rectOfElement(element: Element): AnchorRect {
  const box = element.getBoundingClientRect()
  return {
    left: Math.round(box.left),
    top: Math.round(box.top),
    width: Math.round(box.width),
    height: Math.round(box.height),
  }
}

export function samePoint(a: AnchorPoint | null, b: AnchorPoint): boolean {
  return a !== null && a.left === b.left && a.top === b.top
}
