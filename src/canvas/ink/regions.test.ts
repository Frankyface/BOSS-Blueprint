import { describe, expect, it } from 'vitest'

import { linePoints, penStroke, printWordStrokes, roundedBoxPoints } from '../../test/inkFixtures.ts'
import type { PenStroke } from '../types.ts'

import { SIBLING_GAP_TOL_PX } from './constants.ts'
import { inkRegions } from './classify.ts'
import { atLeast, atMost, marginOf, worstMargin } from './margins.ts'
import { toInkBlockKind } from './types.ts'

/**
 * STAGES 4 AND 5 — the constructs that turn a set of classified marks into a
 * BUILDABLE page: one component used twice, a stable nesting depth, and an order and
 * numbering that two exports of the same drawing agree on to the byte.
 */

const card = (id: string, x: number, y: number, w = 300, h = 240): PenStroke =>
  penStroke(id, roundedBoxPoints({ x, y, w, h, gap: 20 }))

describe('sibling sets — one component, instantiated N times', () => {
  it('numbers a row left to right', () => {
    const regions = inkRegions([], [card('c', 900, 300), card('a', 100, 300), card('b', 500, 300)])
    expect(regions.map((region) => region.setIndex)).toEqual([0, 1, 2])
    expect(new Set(regions.map((region) => region.setId))).toEqual(new Set(['set_0001']))
    expect(regions.map((region) => region.strokeIds[0])).toEqual(['a', 'b', 'c'])
  })

  it('numbers a column top to bottom', () => {
    const regions = inkRegions([], [card('top', 100, 100), card('bottom', 100, 500)])
    expect(regions.map((region) => region.setIndex)).toEqual([0, 1])
  })

  it('needs more than similar sizes: an unaligned card is not a sibling', () => {
    const regions = inkRegions([], [card('a', 100, 100), card('b', 600, 600)])
    expect(regions.map((region) => region.setId)).toEqual([null, null])
  })

  it('splits an irregular run, keeping the regular part and dropping the outlier', () => {
    const regions = inkRegions(
      [],
      [card('a', 100, 300, 200), card('b', 400, 300, 200), card('c', 900, 300, 200)],
    )
    expect(regions.map((region) => region.setId)).toEqual(['set_0001', 'set_0001', null])
    expect(regions.map((region) => region.setIndex)).toEqual([0, 1, null])
  })

  it('keeps a three-card row together while its gaps agree', () => {
    const drift = SIBLING_GAP_TOL_PX - 4
    const regions = inkRegions(
      [],
      [card('a', 100, 300, 200), card('b', 400, 300, 200), card('c', 700 + drift, 300, 200)],
    )
    expect(regions.map((region) => region.setIndex)).toEqual([0, 1, 2])
  })

  it('continues a site-wide set numbering when the caller seeds it', () => {
    const regions = inkRegions([], [card('a', 100, 300), card('b', 500, 300)], {
      firstSetOrdinal: 4,
    })
    expect(regions[0]?.setId).toBe('set_0004')
  })

  it('sets ALL FOUR cards of a 2×2 grid, numbered row-major (Fix H)', () => {
    const grid = [
      card('tl', 100, 100),
      card('tr', 500, 100),
      card('bl', 100, 500),
      card('br', 500, 500),
    ]
    const regions = inkRegions([], grid)
    const byStroke = new Map(regions.map((region) => [region.strokeIds[0], region]))
    expect(regions.map((region) => region.setId)).toEqual([
      'set_0001',
      'set_0001',
      'set_0001',
      'set_0001',
    ])
    expect(byStroke.get('tl')?.setIndex).toBe(0)
    expect(byStroke.get('tr')?.setIndex).toBe(1)
    expect(byStroke.get('bl')?.setIndex).toBe(2)
    expect(byStroke.get('br')?.setIndex).toBe(3)
  })

  it('numbers a 2×3 grid row-major, left-to-right then top-to-bottom (Fix H)', () => {
    const grid = [
      card('r0c0', 100, 100),
      card('r0c1', 500, 100),
      card('r0c2', 900, 100),
      card('r1c0', 100, 500),
      card('r1c1', 500, 500),
      card('r1c2', 900, 500),
    ]
    const byStroke = new Map(
      inkRegions([], grid).map((region) => [region.strokeIds[0], region.setIndex]),
    )
    expect([
      byStroke.get('r0c0'),
      byStroke.get('r0c1'),
      byStroke.get('r0c2'),
      byStroke.get('r1c0'),
      byStroke.get('r1c1'),
      byStroke.get('r1c2'),
    ]).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('never drops a grid card even when the grid is too irregular to set (Fix H fallback)', () => {
    // Bottom row shifted so the columns no longer line up — grid detection fails and
    // the single-axis run takes over. No card is lost; each still emits as a panel.
    const wonky = [
      card('a', 100, 100),
      card('b', 520, 100),
      card('c', 100, 500),
      card('d', 460, 500),
    ]
    const regions = inkRegions([], wonky)
    expect(regions.filter((region) => region.kind === 'panel')).toHaveLength(4)
    expect(regions.every((region) => region.kind === 'panel')).toBe(true)
  })
})

describe('containment depth is capped, and nothing falls out when it is', () => {
  const nested = [
    card('b0', 100, 100, 700, 600),
    card('b1', 140, 140, 620, 520),
    card('b2', 180, 180, 540, 440),
    card('b3', 220, 220, 460, 360),
  ]

  it('re-parents the deepest box rather than nesting it a fourth level down', () => {
    const regions = inkRegions([], nested)
    const byStroke = new Map(regions.map((region) => [region.strokeIds[0], region]))
    expect(byStroke.get('b1')?.parentId).toBe(byStroke.get('b0')?.id)
    expect(byStroke.get('b2')?.parentId).toBe(byStroke.get('b1')?.id)
    expect(byStroke.get('b3')?.parentId).toBe(byStroke.get('b1')?.id)
  })

  it('still emits every box exactly once, depth-first', () => {
    const regions = inkRegions([], nested)
    expect(regions.map((region) => region.strokeIds[0])).toEqual(['b0', 'b1', 'b2', 'b3'])
  })
})

describe('an underline belongs to the writing above it', () => {
  const word = printWordStrokes({
    idPrefix: 'w',
    x: 100,
    y: 300,
    glyphHeight: 30,
    glyphWidth: 14,
    pitch: 22,
    count: 6,
  })

  it('names the writing region it sits beneath', () => {
    const regions = inkRegions([], [...word, penStroke('rule', linePoints(100, 360, 200, 0))])
    const writing = regions.find((region) => region.kind === 'writing')
    const rule = regions.find((region) => region.kind === 'rule')
    expect(rule?.variant).toBe('underline')
    expect(rule?.attachedToId).toBe(writing?.id)
  })

  it('attaches to nothing when the writing is too far above', () => {
    const regions = inkRegions([], [...word, penStroke('rule', linePoints(100, 500, 200, 0))])
    expect(regions.find((region) => region.kind === 'rule')?.attachedToId).toBeNull()
  })

  it('attaches to nothing when the rule sits beside the writing, not under it', () => {
    const regions = inkRegions([], [...word, penStroke('rule', linePoints(600, 360, 200, 0))])
    expect(regions.find((region) => region.kind === 'rule')?.attachedToId).toBeNull()
  })
})

describe('writing is aligned against its own scope, not the page', () => {
  it('calls a word centred in its card `center`, though it is left of the page centre', () => {
    const strokes = [
      card('box', 100, 100, 600, 400),
      ...printWordStrokes({
        idPrefix: 'w',
        x: 338,
        y: 250,
        glyphHeight: 30,
        glyphWidth: 14,
        pitch: 22,
        count: 6,
      }),
    ]
    const writing = inkRegions([], strokes).find((region) => region.kind === 'writing')
    expect(writing?.align).toBe('center')
  })

  it('calls a word at the left of the page `left`', () => {
    const writing = inkRegions(
      [],
      printWordStrokes({
        idPrefix: 'w',
        x: 60,
        y: 250,
        glyphHeight: 30,
        glyphWidth: 14,
        pitch: 22,
        count: 6,
      }),
    ).find((region) => region.kind === 'writing')
    expect(writing?.align).toBe('left')
  })
})

describe('margins are relative, and a failed gate is `null` not a negative number', () => {
  it('scales to its own limit, so one confidence rule can govern every classifier', () => {
    expect(marginOf(atLeast(12, 6))).toBe(1)
    expect(marginOf(atMost(0.05, 0.1))).toBeCloseTo(0.5, 9)
  })

  it('reads a value exactly on its limit as passed, but with no margin at all', () => {
    expect(worstMargin([atLeast(6, 6)])).toBe(0)
    expect(worstMargin([atMost(6, 6)])).toBe(0)
  })

  it('reports the weakest gate, never an average that could hide it', () => {
    expect(worstMargin([atLeast(120, 6), atMost(5.9, 6)])).toBeCloseTo(1 / 60, 9)
  })

  it('returns null the moment any gate fails', () => {
    expect(worstMargin([atLeast(120, 6), atLeast(5, 6)])).toBeNull()
  })

  it('falls back to absolute units when the limit has no scale to be relative to', () => {
    expect(marginOf(atLeast(3, 0))).toBe(3)
  })

  it('is a passing no-op when there is nothing to gate', () => {
    expect(worstMargin([])).toBe(0)
  })
})

describe('block kinds map from both callers’ vocabularies', () => {
  it('reads the export spelling and the editor spelling as the same slot', () => {
    expect(toInkBlockKind('imageSlot')).toBe('imageSlot')
    expect(toInkBlockKind('image')).toBe('imageSlot')
  })

  it('keeps sections distinct, since they are exempt from the veto', () => {
    expect(toInkBlockKind('section')).toBe('section')
  })

  it('falls back to the VETO-ELIGIBLE kind for anything it does not recognise', () => {
    expect(toInkBlockKind('navBar')).toBe('block')
    expect(toInkBlockKind('nav-bar')).toBe('block')
    expect(toInkBlockKind('something-added-later')).toBe('block')
  })
})
