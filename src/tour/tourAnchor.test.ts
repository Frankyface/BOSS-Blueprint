import { describe, expect, it } from 'vitest'

import {
  anchorBubble,
  samePoint,
  TOUR_BUBBLE_GAP_PX,
  TOUR_VIEWPORT_MARGIN_PX,
} from './tourAnchor.ts'
import type { AnchorRect, AnchorSize, TourPlacement } from './tourAnchor.ts'

const VIEWPORT: AnchorSize = { width: 1440, height: 900 }
const BUBBLE: AnchorSize = { width: 288, height: 160 }

/** The left-hand palette column: tall, against the left edge. */
const PALETTE: AnchorRect = { left: 0, top: 64, width: 240, height: 836 }
/** The right-hand details panel. */
const PANEL: AnchorRect = { left: 1136, top: 64, width: 304, height: 836 }
/** A small control in the top-right of the header, like Submit. */
const SUBMIT: AnchorRect = { left: 1300, top: 12, width: 130, height: 40 }
/** The same control on a wider window, where nothing needs clamping. */
const HEADER_BUTTON: AnchorRect = { left: 1000, top: 12, width: 130, height: 40 }

function place(
  target: AnchorRect,
  placement: TourPlacement,
  viewport: AnchorSize = VIEWPORT,
): { left: number; top: number } {
  return anchorBubble(target, BUBBLE, viewport, placement)
}

function isInsideViewport(
  point: { left: number; top: number },
  viewport: AnchorSize = VIEWPORT,
): boolean {
  return (
    point.left >= 0 &&
    point.top >= 0 &&
    point.left + BUBBLE.width <= viewport.width &&
    point.top + BUBBLE.height <= viewport.height
  )
}

describe('anchoring a pointer bubble', () => {
  it('sits beside its target, on the side the placement asks for', () => {
    expect(place(PALETTE, 'right-end').left).toBe(PALETTE.left + PALETTE.width + TOUR_BUBBLE_GAP_PX)
    expect(place(PANEL, 'left-start').left).toBe(PANEL.left - BUBBLE.width - TOUR_BUBBLE_GAP_PX)
    expect(place(HEADER_BUTTON, 'below-end').top).toBe(
      HEADER_BUTTON.top + HEADER_BUTTON.height + TOUR_BUBBLE_GAP_PX,
    )
    expect(place(HEADER_BUTTON, 'below-end').left).toBe(
      HEADER_BUTTON.left + HEADER_BUTTON.width - BUBBLE.width,
    )
  })

  it('gives up the alignment before it gives up the window edge', () => {
    // Submit sits hard against the right of the header: right-aligning the bubble
    // to it would put 2px off-screen, so the clamp wins and it slides left.
    expect(place(SUBMIT, 'below-end').left).toBe(
      VIEWPORT.width - BUBBLE.width - TOUR_VIEWPORT_MARGIN_PX,
    )
  })

  it('keeps the middle of the canvas clear', () => {
    // `right-end` parks the palette pointer LOW, not in the centre of the window
    // where a new block lands and where the non-blocking probe clicks.
    const point = place(PALETTE, 'right-end')

    expect(point.top + BUBBLE.height).toBeLessThanOrEqual(PALETTE.top + PALETTE.height)
    expect(point.top).toBeGreaterThan(VIEWPORT.height / 2)
  })

  it('centres an inside-top bubble on a wide target, just under its top edge', () => {
    const canvas: AnchorRect = { left: 240, top: 150, width: 896, height: 750 }

    const point = place(canvas, 'inside-top')

    expect(point.left).toBe(canvas.left + (canvas.width - BUBBLE.width) / 2)
    expect(point.top).toBe(canvas.top + TOUR_BUBBLE_GAP_PX)
  })

  it('never renders off-screen, whatever the placement asks for', () => {
    const placements: TourPlacement[] = [
      'right-end',
      'inside-top',
      'below-start',
      'below-end',
      'left-start',
    ]
    // Targets hard against every edge — each one would push a bubble out.
    const targets: AnchorRect[] = [
      { left: 0, top: 0, width: 40, height: 40 },
      { left: 1400, top: 0, width: 40, height: 40 },
      { left: 0, top: 860, width: 40, height: 40 },
      { left: 1400, top: 860, width: 40, height: 40 },
      PALETTE,
      PANEL,
      SUBMIT,
    ]

    for (const placement of placements) {
      for (const target of targets) {
        const point = place(target, placement)
        expect(isInsideViewport(point), `${placement} at ${String(target.left)}`).toBe(true)
        expect(point.left).toBeGreaterThanOrEqual(TOUR_VIEWPORT_MARGIN_PX)
        expect(point.top).toBeGreaterThanOrEqual(TOUR_VIEWPORT_MARGIN_PX)
      }
    }
  })

  it('pins to the top-left margin when the window is smaller than the bubble', () => {
    const tiny: AnchorSize = { width: 200, height: 120 }

    const point = place(PALETTE, 'right-end', tiny)

    expect(point).toEqual({ left: TOUR_VIEWPORT_MARGIN_PX, top: TOUR_VIEWPORT_MARGIN_PX })
  })

  it('recognises an unchanged position, so a scroll tick cannot thrash React', () => {
    expect(samePoint({ left: 10, top: 20 }, { left: 10, top: 20 })).toBe(true)
    expect(samePoint({ left: 10, top: 20 }, { left: 10, top: 21 })).toBe(false)
    expect(samePoint(null, { left: 10, top: 20 })).toBe(false)
  })
})
