import { describe, expect, it } from 'vitest'

import {
  GRID_SIZE_PX,
  MAX_PAGE_HEIGHT_PX,
  MIN_ON_PAGE_PX,
  MIN_PAGE_HEIGHT_PX,
  MIN_PAGE_SCALE,
  PAGE_BOTTOM_PADDING_PX,
  PAGE_WIDTH_PX,
} from './constants.ts'
import {
  clamp,
  clampPosition,
  moveRect,
  pageHeightForContent,
  pageScaleForViewport,
  resizeRect,
  snapToGrid,
} from './geometry.ts'
import type { BlockRect, PenStroke, Size } from './types.ts'

const HEADING_RECT: BlockRect = { x: 80, y: 120, width: 640, height: 72 }
const HEADING_MIN: Size = { width: 96, height: 40 }

describe('clamp', () => {
  it('returns the value when it is already inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5)
  })

  it('pins to the nearest bound outside the range', () => {
    expect(clamp(-4, 0, 10)).toBe(0)
    expect(clamp(99, 0, 10)).toBe(10)
  })

  it('returns the minimum when the range is inverted rather than NaN-ing', () => {
    expect(clamp(5, 10, 0)).toBe(10)
  })
})

describe('snapToGrid', () => {
  it('rounds to the nearest 8px grid line', () => {
    expect(snapToGrid(0)).toBe(0)
    expect(snapToGrid(3)).toBe(0)
    expect(snapToGrid(5)).toBe(8)
    expect(snapToGrid(117)).toBe(120)
    expect(snapToGrid(1195)).toBe(1192)
  })

  it('snaps negative coordinates too', () => {
    expect(snapToGrid(-5)).toBe(-8)
    expect(snapToGrid(-11)).toBe(-8)
  })

  it('accepts a custom grid size', () => {
    expect(snapToGrid(17, 10)).toBe(20)
  })

  it('passes the value through when the grid size is not usable', () => {
    expect(snapToGrid(17, 0)).toBe(17)
    expect(snapToGrid(17, -8)).toBe(17)
  })

  it('leaves an already-aligned value untouched', () => {
    expect(snapToGrid(GRID_SIZE_PX * 13)).toBe(GRID_SIZE_PX * 13)
  })
})

describe('clampPosition', () => {
  it('leaves an on-page block alone', () => {
    expect(clampPosition(HEADING_RECT)).toEqual(HEADING_RECT)
  })

  it('keeps a sliver of the block on the page when dragged off the left', () => {
    const clamped = clampPosition({ ...HEADING_RECT, x: -5000 })
    expect(clamped.x).toBe(MIN_ON_PAGE_PX - HEADING_RECT.width)
  })

  it('keeps a sliver of the block on the page when dragged off the right', () => {
    const clamped = clampPosition({ ...HEADING_RECT, x: 5000 })
    expect(clamped.x).toBe(PAGE_WIDTH_PX - MIN_ON_PAGE_PX)
  })

  it('treats the top of the page as a hard edge', () => {
    expect(clampPosition({ ...HEADING_RECT, y: -400 }).y).toBe(0)
  })

  it('caps the bottom at the maximum page height', () => {
    expect(clampPosition({ ...HEADING_RECT, y: 99_999 }).y).toBe(MAX_PAGE_HEIGHT_PX - MIN_ON_PAGE_PX)
  })

  it('never changes the size', () => {
    const clamped = clampPosition({ ...HEADING_RECT, x: -5000, y: -5000 })
    expect(clamped.width).toBe(HEADING_RECT.width)
    expect(clamped.height).toBe(HEADING_RECT.height)
  })

  it('returns a new object rather than mutating the input', () => {
    const input: BlockRect = { ...HEADING_RECT, x: -5000 }
    const result = clampPosition(input)
    expect(result).not.toBe(input)
    expect(input.x).toBe(-5000)
  })
})

describe('moveRect', () => {
  it('snaps the destination onto the grid', () => {
    expect(moveRect(HEADING_RECT, 37, 21)).toEqual({ ...HEADING_RECT, x: 120, y: 144 })
  })

  it('snaps down when the delta lands in the lower half of a cell', () => {
    expect(moveRect(HEADING_RECT, 3, 3)).toEqual({ ...HEADING_RECT, x: 80, y: 120 })
  })

  it('handles negative deltas', () => {
    expect(moveRect(HEADING_RECT, -37, -21)).toEqual({ ...HEADING_RECT, x: 40, y: 96 })
  })

  it('cannot drag a block fully off the page', () => {
    const offLeft = moveRect(HEADING_RECT, -9000, 0)
    const offRight = moveRect(HEADING_RECT, 9000, 0)

    expect(offLeft.x + offLeft.width).toBeGreaterThanOrEqual(MIN_ON_PAGE_PX)
    expect(offRight.x).toBeLessThanOrEqual(PAGE_WIDTH_PX - MIN_ON_PAGE_PX)
  })

  it('is a no-op for a zero delta', () => {
    expect(moveRect(HEADING_RECT, 0, 0)).toEqual(HEADING_RECT)
  })
})

describe('resizeRect', () => {
  it('grows from the south-east handle without moving the origin', () => {
    expect(resizeRect(HEADING_RECT, 'se', 40, 40, HEADING_MIN)).toEqual({
      x: 80,
      y: 120,
      width: 680,
      height: 112,
    })
  })

  it('snaps the dragged edge onto the grid', () => {
    expect(resizeRect(HEADING_RECT, 'e', 37, 0, HEADING_MIN).width).toBe(680)
    expect(resizeRect(HEADING_RECT, 's', 21, 0, HEADING_MIN).height).toBe(72)
    expect(resizeRect(HEADING_RECT, 's', 0, 21, HEADING_MIN).height).toBe(96)
  })

  it('moves the origin when dragging the north-west handle', () => {
    expect(resizeRect(HEADING_RECT, 'nw', -40, -40, HEADING_MIN)).toEqual({
      x: 40,
      y: 80,
      width: 680,
      height: 112,
    })
  })

  it('clamps to the minimum size from the south-east handle', () => {
    expect(resizeRect(HEADING_RECT, 'se', -5000, -5000, HEADING_MIN)).toEqual({
      x: 80,
      y: 120,
      width: HEADING_MIN.width,
      height: HEADING_MIN.height,
    })
  })

  it('clamps to the minimum size from the north-west handle with the far corner pinned', () => {
    const right = HEADING_RECT.x + HEADING_RECT.width
    const bottom = HEADING_RECT.y + HEADING_RECT.height

    expect(resizeRect(HEADING_RECT, 'nw', 5000, 5000, HEADING_MIN)).toEqual({
      x: right - HEADING_MIN.width,
      y: bottom - HEADING_MIN.height,
      width: HEADING_MIN.width,
      height: HEADING_MIN.height,
    })
  })

  it('cannot drag the west edge past the left edge of the page', () => {
    const resized = resizeRect(HEADING_RECT, 'w', -400, 0, HEADING_MIN)
    expect(resized.x).toBe(0)
    expect(resized.width).toBe(720)
  })

  it('cannot drag the east edge past the right edge of the page', () => {
    const nearRightEdge: BlockRect = { x: 1000, y: 0, width: 160, height: 72 }
    const resized = resizeRect(nearRightEdge, 'e', 400, 0, HEADING_MIN)

    expect(resized.width).toBe(PAGE_WIDTH_PX - nearRightEdge.x)
    expect(resized.x + resized.width).toBe(PAGE_WIDTH_PX)
  })

  /**
   * Regression (review LOW-1): the minimum-size clamp used to run AFTER the
   * page-edge clamp and silently override it, so a block parked at the right edge
   * could be resized to a right edge of 1272 — 72px outside the 1200px page that
   * Stage 3 renders. When the two genuinely conflict the page edge must win and
   * the block slides left so BOTH hold.
   */
  describe('minimum size versus the page edge', () => {
    /** x = 1176 is the furthest right clampPosition allows (1200 - MIN_ON_PAGE_PX). */
    const AT_RIGHT_EDGE: BlockRect = { x: 1176, y: 0, width: 96, height: 72 }

    it('slides a block at x=1176 left instead of growing it past 1200', () => {
      const resized = resizeRect(AT_RIGHT_EDGE, 'e', 80, 0, HEADING_MIN)

      expect(resized.width).toBe(HEADING_MIN.width)
      expect(resized.x).toBe(PAGE_WIDTH_PX - HEADING_MIN.width)
      expect(resized.x + resized.width).toBe(PAGE_WIDTH_PX)
    })

    it.each(['e', 'ne', 'se'] as const)(
      'holds for the %s handle, which all own the east edge',
      (handle) => {
        const resized = resizeRect(AT_RIGHT_EDGE, handle, 400, 40, HEADING_MIN)

        expect(resized.width).toBeGreaterThanOrEqual(HEADING_MIN.width)
        expect(resized.x + resized.width).toBeLessThanOrEqual(PAGE_WIDTH_PX)
      },
    )

    it('also pulls the block back when the east handle is dragged inward', () => {
      const resized = resizeRect(AT_RIGHT_EDGE, 'e', -40, 0, HEADING_MIN)

      expect(resized.width).toBe(HEADING_MIN.width)
      expect(resized.x + resized.width).toBe(PAGE_WIDTH_PX)
    })

    it('leaves x alone for an ordinary shrink to the minimum away from the edge', () => {
      const resized = resizeRect(HEADING_RECT, 'e', -5000, 0, HEADING_MIN)

      expect(resized.width).toBe(HEADING_MIN.width)
      expect(resized.x).toBe(HEADING_RECT.x)
    })

    it('never pushes a block off the left edge when the minimum exceeds the page', () => {
      const wideMinimum: Size = { width: PAGE_WIDTH_PX + 400, height: 40 }
      const resized = resizeRect(AT_RIGHT_EDGE, 'e', 80, 0, wideMinimum)

      expect(resized.x).toBe(0)
    })

    it('leaves the west handle free to keep a block that already overhangs', () => {
      // Dragging the WEST edge of an overhanging block must not teleport it back
      // onto the page — only the east edge is clamped to the page's right edge.
      const overhanging: BlockRect = { x: 1104, y: 0, width: 400, height: 72 }
      const resized = resizeRect(overhanging, 'w', -40, 0, HEADING_MIN)

      expect(resized.x).toBe(1064)
      expect(resized.width).toBe(440)
      // Still overhanging on purpose: only the east edge is clamped to the page.
      expect(resized.x + resized.width).toBeGreaterThan(PAGE_WIDTH_PX)
    })
  })

  it('cannot drag the north edge above the top of the page', () => {
    const resized = resizeRect({ x: 0, y: 40, width: 400, height: 200 }, 'n', -400, -400, HEADING_MIN)
    expect(resized.y).toBe(0)
    expect(resized.height).toBe(240)
  })

  it('only touches the axis its handle owns', () => {
    const eastOnly = resizeRect(HEADING_RECT, 'e', 80, 999, HEADING_MIN)
    expect(eastOnly.height).toBe(HEADING_RECT.height)
    expect(eastOnly.y).toBe(HEADING_RECT.y)

    const southOnly = resizeRect(HEADING_RECT, 's', 999, 80, HEADING_MIN)
    expect(southOnly.width).toBe(HEADING_RECT.width)
    expect(southOnly.x).toBe(HEADING_RECT.x)
  })

  it('returns a new object rather than mutating the input', () => {
    const result = resizeRect(HEADING_RECT, 'se', 40, 40, HEADING_MIN)
    expect(result).not.toBe(HEADING_RECT)
    expect(HEADING_RECT).toEqual({ x: 80, y: 120, width: 640, height: 72 })
  })
})

describe('pageHeightForContent', () => {
  /** A stroke whose lowest point sits at `bottom`. */
  const markAt = (bottom: number): PenStroke => ({
    id: 'stroke-1',
    points: [
      { x: 100, y: bottom - 40 },
      { x: 200, y: bottom },
    ],
    color: '#d92d20',
    width: 4,
  })

  it('uses the minimum page height when the page is empty', () => {
    expect(pageHeightForContent([])).toBe(MIN_PAGE_HEIGHT_PX)
  })

  it('stays at the minimum while the content is short', () => {
    expect(pageHeightForContent([HEADING_RECT])).toBe(MIN_PAGE_HEIGHT_PX)
  })

  it('grows past the lowest block plus padding', () => {
    expect(pageHeightForContent([{ x: 0, y: 1500, width: 100, height: 300 }])).toBe(1960)
  })

  it('caps at the maximum page height', () => {
    expect(pageHeightForContent([{ x: 0, y: 7000, width: 100, height: 2000 }])).toBe(
      MAX_PAGE_HEIGHT_PX,
    )
  })

  /**
   * REGRESSION (review MEDIUM-1): a mark below the lowest block used to fall off
   * the bottom of the sheet the moment that block was deleted.
   */
  it('keeps the page open for a pen mark below every block', () => {
    expect(pageHeightForContent([], [markAt(1800)])).toBe(1960)
  })

  it('keeps the page open when the block that held it open is deleted', () => {
    const block = { x: 0, y: 1500, width: 100, height: 300 }
    const mark = markAt(1700)

    // With both, the block is lower and sets the height.
    expect(pageHeightForContent([block], [mark])).toBe(1960)
    // Delete the block and the mark still holds the page open past it.
    expect(pageHeightForContent([], [mark])).toBe(1864)
  })

  it('takes whichever is lower, block or mark', () => {
    const block = { x: 0, y: 1500, width: 100, height: 300 }

    expect(pageHeightForContent([block], [markAt(1000)])).toBe(1960)
    expect(pageHeightForContent([block], [markAt(2000)])).toBe(2160)
  })

  it('reads every point of every stroke, not just the first or last', () => {
    const dip: PenStroke = {
      id: 'stroke-2',
      points: [
        { x: 0, y: 200 },
        { x: 100, y: 1900 },
        { x: 200, y: 200 },
      ],
      color: '#d92d20',
      width: 4,
    }

    expect(pageHeightForContent([], [dip])).toBe(2064)
  })

  it('always lands on the 8px grid, rounding UP so the padding is never eaten', () => {
    // bottom 1701 + 160 = 1861, which is not a multiple of 8: 1864, never 1856.
    expect(pageHeightForContent([], [markAt(1701)])).toBe(1864)
    expect(pageHeightForContent([], [markAt(1701)]) % GRID_SIZE_PX).toBe(0)

    for (const bottom of [1441, 1500.5, 1777, 2003.9, 4001]) {
      const height = pageHeightForContent([{ x: 0, y: bottom, width: 10, height: 0 }])
      expect(height % GRID_SIZE_PX).toBe(0)
      expect(height).toBeGreaterThanOrEqual(bottom + PAGE_BOTTOM_PADDING_PX)
    }
  })

  it('caps a mark drawn absurdly far down, exactly as it caps a block', () => {
    expect(pageHeightForContent([], [markAt(20_000)])).toBe(MAX_PAGE_HEIGHT_PX)
  })

  it('ignores an empty stroke list', () => {
    expect(pageHeightForContent([HEADING_RECT], [])).toBe(MIN_PAGE_HEIGHT_PX)
  })
})

describe('pageScaleForViewport', () => {
  it('renders 1:1 when the viewport has not been measured yet', () => {
    expect(pageScaleForViewport(0)).toBe(1)
    expect(pageScaleForViewport(Number.NaN)).toBe(1)
  })

  it('never enlarges past 1:1 on a wide screen', () => {
    expect(pageScaleForViewport(2400)).toBe(1)
  })

  it('shrinks the page to fit a narrow viewport', () => {
    expect(pageScaleForViewport(800)).toBe(0.613)
  })

  it('never shrinks past the minimum scale', () => {
    expect(pageScaleForViewport(100)).toBe(MIN_PAGE_SCALE)
  })

  it('leaves the page fitting inside the viewport with its margins', () => {
    const viewportWidth = 900
    expect(pageScaleForViewport(viewportWidth) * PAGE_WIDTH_PX).toBeLessThanOrEqual(viewportWidth)
  })
})
