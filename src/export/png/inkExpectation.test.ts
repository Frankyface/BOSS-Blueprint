import { describe, expect, it } from 'vitest'

import { MAX_PAGE_HEIGHT_PX, MIN_PAGE_HEIGHT_PX } from '../../canvas/constants.ts'
import type { PenStroke } from '../../canvas/types.ts'

import { expectedInkAreaPx, expectsVisibleInk } from './inkExpectation.ts'

/**
 * WHAT THE STROKES PROMISE — the guard that decides whether the V6 ink floor is
 * allowed to judge a pen-only page at all.
 *
 * The floor answers "did the capture come back empty". That question is only
 * answerable when we know there SHOULD have been ink: hold a page with one small
 * mark to it and the client gets "export hiccup, try again" for a page that
 * rendered perfectly, which is advice they cannot act on.
 */

/** A horizontal stroke of exactly `length` px, `width` px thick. */
function mark(length: number, width = 4): PenStroke {
  return {
    id: `stroke-${String(length)}x${String(width)}`,
    points: [
      { x: 100, y: 300 },
      { x: 100 + length, y: 300 },
    ],
    color: '#16202f',
    width,
  }
}

describe('expectedInkAreaPx', () => {
  it('measures a stroke as its drawn length times its width', () => {
    expect(expectedInkAreaPx([mark(100)])).toBeCloseTo(400)
  })

  it('follows every segment of a polyline, not just end to end', () => {
    // 3-4-5 triangle: out 30 across and 40 down, then back to the start. A rule
    // that measured first-to-last point would call this zero.
    const zigzag: PenStroke = {
      id: 'stroke-zigzag',
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 40 },
        { x: 0, y: 0 },
      ],
      color: '#16202f',
      width: 2,
    }

    expect(expectedInkAreaPx([zigzag])).toBeCloseTo(200)
  })

  it('adds the strokes up', () => {
    expect(expectedInkAreaPx([mark(100), mark(50)])).toBeCloseTo(600)
  })

  it('reads no strokes, and a stroke that never moved, as no ink', () => {
    expect(expectedInkAreaPx([])).toBe(0)
    expect(expectedInkAreaPx([mark(0)])).toBe(0)
  })

  it('reads a stroke too pale for the gate to count as no ink either', () => {
    // `assessInk` only counts a pixel as ink once it sits INK_LUMA_DELTA below page
    // white, so a near-white stroke paints a great many pixels and not one of them
    // registers. Predicting ink from it would BLOCK a page that rendered perfectly.
    // The pen palette is all dark, but an imported `.blueprint` file carries
    // whatever `#rrggbb` it likes.
    expect(expectedInkAreaPx([{ ...mark(400), color: '#fffffe' }])).toBe(0)
    expect(expectedInkAreaPx([{ ...mark(400), color: '#2f6df6' }])).toBeGreaterThan(0)
  })

  it('reads a colour it cannot parse as no ink — never as a reason to judge', () => {
    expect(expectedInkAreaPx([{ ...mark(400), color: 'rebeccapurple' }])).toBe(0)
  })
})

describe('expectsVisibleInk', () => {
  /**
   * The floor is 0.01% of a 1200 × 1600 page = 192px of ink, and the safety factor
   * asks for several times that before it trusts the check. In stroke terms a 4px
   * pen has to have travelled a few hundred pixels — a real mark, not a tick.
   */
  it('does not expect visible ink from one small mark', () => {
    expect(expectsVisibleInk([mark(30)], MIN_PAGE_HEIGHT_PX)).toBe(false)
    expect(expectsVisibleInk([mark(180)], MIN_PAGE_HEIGHT_PX)).toBe(false)
  })

  it('expects it from a stroke long enough to be unmistakable', () => {
    expect(expectsVisibleInk([mark(400)], MIN_PAGE_HEIGHT_PX)).toBe(true)
  })

  it('adds sparse marks up — a page of them is still a drawn page', () => {
    const scribble = [mark(150), mark(150), mark(150)]

    expect(expectsVisibleInk([mark(150)], MIN_PAGE_HEIGHT_PX)).toBe(false)
    expect(expectsVisibleInk(scribble, MIN_PAGE_HEIGHT_PX)).toBe(true)
  })

  it('asks the same ABSOLUTE amount of ink however tall the page is', () => {
    // The floor is scaled by page height for exactly this reason, so the stroke
    // that clears it on the shortest page clears it on the tallest one too.
    for (const height of [MIN_PAGE_HEIGHT_PX, MAX_PAGE_HEIGHT_PX]) {
      expect(expectsVisibleInk([mark(400)], height)).toBe(true)
      expect(expectsVisibleInk([mark(30)], height)).toBe(false)
    }
  })

  it('counts a thick stroke as the ink it is', () => {
    // Same distance travelled, four times the nib: four times the ink.
    expect(expectsVisibleInk([mark(150)], MIN_PAGE_HEIGHT_PX)).toBe(false)
    expect(expectsVisibleInk([mark(150, 16)], MIN_PAGE_HEIGHT_PX)).toBe(true)
  })

  it('expects nothing from a page with no strokes at all', () => {
    expect(expectsVisibleInk([], MIN_PAGE_HEIGHT_PX)).toBe(false)
  })
})
