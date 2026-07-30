import { describe, expect, it } from 'vitest'

import {
  GRID_SIZE_PX,
  MAX_PAGE_HEIGHT_PX,
  MIN_PAGE_HEIGHT_PX,
  PAGE_EXTRA_SPACE_MAX_PX,
  PAGE_EXTRA_SPACE_STEP_PX,
} from './constants.ts'
import { clampExtraSpace, pageHeightForContent } from './geometry.ts'
import type { BlockRect, PenStroke } from './types.ts'

/**
 * "ADD SPACE" AND "TRIM" — the arithmetic behind the client's page-length control
 * (F2: "you cannot add empty space to the bottom of a page and then crop it back").
 *
 * Split out of `geometry.test.ts` only because that file is already near the 600-line
 * test budget; everything here is about the third argument of the one shared
 * `pageHeightForContent`.
 *
 * The load-bearing test in this file is the LAST one. Everything else describes what
 * the control does; that one proves what it can never do — make the page shorter than
 * the client's own work.
 */

const SHORT_BLOCK: BlockRect = { x: 80, y: 120, width: 640, height: 72 }
const TALL_BLOCK: BlockRect = { x: 0, y: 1500, width: 100, height: 300 }

/** A stroke whose lowest point sits at `bottom`. */
const markAt = (bottom: number): PenStroke => ({
  id: 'stroke-1',
  points: [
    { x: 100, y: Math.max(0, bottom - 40) },
    { x: 200, y: bottom },
  ],
  color: '#d92d20',
  width: 4,
})

describe('clampExtraSpace', () => {
  it('keeps a sensible amount exactly as asked', () => {
    expect(clampExtraSpace(PAGE_EXTRA_SPACE_STEP_PX)).toBe(PAGE_EXTRA_SPACE_STEP_PX)
    expect(clampExtraSpace(PAGE_EXTRA_SPACE_MAX_PX)).toBe(PAGE_EXTRA_SPACE_MAX_PX)
  })

  it('reads every rubbish value as "no extra space", never as a fault', () => {
    for (const rubbish of [0, -1, -4000, Number.NaN, Number.POSITIVE_INFINITY, -0]) {
      expect(clampExtraSpace(rubbish)).toBe(0)
    }
  })

  it('caps a runaway amount rather than trusting it', () => {
    expect(clampExtraSpace(PAGE_EXTRA_SPACE_MAX_PX + 10_000)).toBe(PAGE_EXTRA_SPACE_MAX_PX)
  })

  /**
   * `page.height` is contract-bound to a multiple of 8 (`docs/export-format.md`
   * §2.5), and the extra is added to an already-aligned content height — so an
   * off-grid drag has to be snapped HERE or it writes an off-grid height into
   * `site.json`. One rule, applied wherever the number enters the app.
   */
  it('snaps an off-grid drag onto the 8px design grid', () => {
    for (const raw of [3, 137, 401, 999.6]) {
      expect(clampExtraSpace(raw) % GRID_SIZE_PX).toBe(0)
    }
    expect(clampExtraSpace(137)).toBe(136)
  })
})

describe('pageHeightForContent with client-added space', () => {
  /**
   * THE COMPATIBILITY GUARD. Every existing caller passes two arguments, and the
   * absent third has to mean "exactly what this function did before F2" — not
   * approximately, and not for empty pages only.
   */
  it('is identical to the content-only height when no space was asked for', () => {
    const cases: readonly (readonly [readonly BlockRect[], readonly PenStroke[]])[] = [
      [[], []],
      [[SHORT_BLOCK], []],
      [[TALL_BLOCK], []],
      [[TALL_BLOCK], [markAt(2400)]],
      [[], [markAt(1697)]],
    ]

    for (const [rects, strokes] of cases) {
      const before = pageHeightForContent(rects, strokes)
      expect(pageHeightForContent(rects, strokes, 0)).toBe(before)
      expect(pageHeightForContent(rects, strokes, undefined)).toBe(before)
    }
  })

  /**
   * ADDED TO THE FLOORED HEIGHT, NOT TO THE CONTENT BOTTOM. Adding the term before
   * the 1600 floor would make the first few clicks on a near-empty page do NOTHING
   * VISIBLE (a heading's bottom + 400 + 160 is still under 1600), which is exactly
   * the button that makes a client think the app is broken.
   */
  it('adds exactly the room asked for, however short the page was', () => {
    expect(pageHeightForContent([])).toBe(MIN_PAGE_HEIGHT_PX)
    expect(pageHeightForContent([], [], PAGE_EXTRA_SPACE_STEP_PX)).toBe(
      MIN_PAGE_HEIGHT_PX + PAGE_EXTRA_SPACE_STEP_PX,
    )

    expect(pageHeightForContent([SHORT_BLOCK], [], PAGE_EXTRA_SPACE_STEP_PX)).toBe(
      MIN_PAGE_HEIGHT_PX + PAGE_EXTRA_SPACE_STEP_PX,
    )

    // A page already grown past the floor grows by the same amount again.
    expect(pageHeightForContent([TALL_BLOCK])).toBe(1960)
    expect(pageHeightForContent([TALL_BLOCK], [], PAGE_EXTRA_SPACE_STEP_PX)).toBe(2360)
  })

  it('adds the room on top of a stroke-driven height too', () => {
    expect(pageHeightForContent([], [markAt(1800)])).toBe(1960)
    expect(pageHeightForContent([], [markAt(1800)], 800)).toBe(2760)
  })

  it('caps the room asked for, and then caps the page as it always did', () => {
    expect(pageHeightForContent([], [], PAGE_EXTRA_SPACE_MAX_PX + 5000)).toBe(
      MIN_PAGE_HEIGHT_PX + PAGE_EXTRA_SPACE_MAX_PX,
    )
    expect(pageHeightForContent([TALL_BLOCK], [], PAGE_EXTRA_SPACE_MAX_PX)).toBe(5960)
    expect(pageHeightForContent([{ x: 0, y: 7000, width: 10, height: 800 }], [], 4000)).toBe(
      MAX_PAGE_HEIGHT_PX,
    )
  })

  it('treats a negative, a NaN and an infinity as no extra space at all', () => {
    for (const bad of [-400, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(pageHeightForContent([TALL_BLOCK], [], bad)).toBe(pageHeightForContent([TALL_BLOCK]))
    }
  })

  it('always lands on the 8px grid, whatever amount it was handed', () => {
    for (const extra of [0, 3, 137, 400, 999.6, 4000, 40_000]) {
      expect(pageHeightForContent([TALL_BLOCK], [markAt(1234)], extra) % GRID_SIZE_PX).toBe(0)
    }
  })

  /**
   * THE MACHINE PROOF THAT "TRIM" CANNOT DESTROY THE CLIENT'S WORK.
   *
   * The export root clips with `overflow: hidden`, so a height shorter than the
   * content bottom would cut blocks and strokes out of the deliverable — the same
   * silent-data-loss class `clampPosition` already argues against on the horizontal
   * axis. Making the term PURELY ADDITIVE removes that failure mode by construction
   * instead of warning about it, and this is the assertion that holds it there: for
   * every content shape and every amount of space (including hostile ones), the
   * height is never below the height the same content gets with no space at all.
   */
  it('never returns less than the content-only height, for any content and any amount', () => {
    const bottoms = [0, 200, 1440, 1600.5, 3333, 7999, 12_000]
    const extras = [0, 1, 8, 137, 400, 4000, 99_999, -5, Number.NaN]

    for (const bottom of bottoms) {
      for (const markBottom of bottoms) {
        const rects: readonly BlockRect[] = [{ x: 0, y: bottom, width: 10, height: 0 }]
        const strokes: readonly PenStroke[] = [markAt(markBottom)]
        const contentOnly = pageHeightForContent(rects, strokes)

        for (const extra of extras) {
          expect(pageHeightForContent(rects, strokes, extra)).toBeGreaterThanOrEqual(contentOnly)
        }
      }
    }
  })
})
