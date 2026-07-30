import { describe, expect, it } from 'vitest'

import {
  INK_BLUE,
  INK_RED,
  catStrokes,
  inkBlock,
  linePoints,
  penStroke,
  printWordStrokes,
  roundedBoxPoints,
  specPageBlocks,
  specPageStrokes,
  squarePoints,
  wavePoints,
} from '../../test/inkFixtures.ts'
import type { PenStroke } from '../types.ts'

import {
  CLUSTER_GAP_X_PX,
  CLUSTER_GAP_Y_PX,
  ENCLOSURE_JOIN_GAP_PX,
  INK_MAX_STROKES,
} from './constants.ts'
import { intersectionArea, strokeMetrics } from './metrics.ts'
import {
  inkAtoms,
  inkCandidates,
  isBlockOverlapVetoed,
  isImageSlotSketch,
  segmentInk,
} from './segment.ts'
import type { InkAtom } from './types.ts'

/**
 * STAGES 1 AND 2 — which ink leaves the pipeline, and how what remains is grouped.
 *
 * The first block of tests is the highest-priority one in the whole feature: the
 * export contract is frozen, and the §7.1 fixture's committed brief calls both of its
 * strokes annotations. If either becomes a region, the package changes.
 */

const bboxOf = (stroke: PenStroke) => strokeMetrics(stroke, 0).bbox
const keysOf = (atoms: readonly InkAtom[]) => atoms.map((atom) => atom.members.map((m) => m.id))

describe('THE BYTE-NEUTRALITY GUARD — the normative §7.1 page yields no regions', () => {
  const blocks = specPageBlocks()
  const strokes = specPageStrokes()

  it('produces zero atoms, so the brief for that page cannot change', () => {
    expect(inkAtoms(blocks, strokes)).toEqual([])
  })

  it('removes stk_0001 by the image-slot lock', () => {
    const sketch = strokes[0]
    expect(sketch?.id).toBe('stk_0001')
    expect(sketch && isImageSlotSketch(bboxOf(sketch), blocks)).toBe(true)
  })

  it('removes stk_0002 by the block-overlap veto, over 3920 px² of the button', () => {
    const annotation = strokes[1]
    expect(annotation?.id).toBe('stk_0002')
    const button = blocks.find((block) => block.id === 'blk_0006')
    expect(annotation && button && intersectionArea(bboxOf(annotation), button.frame)).toBeCloseTo(
      3920,
      6,
    )
    expect(annotation && isBlockOverlapVetoed(bboxOf(annotation), blocks)).toBe(true)
  })
})

describe('the block-overlap veto — narrow on purpose', () => {
  const button = inkBlock('blk_0006', 'block', 80, 432, 200, 56)
  const band = inkBlock('blk_0001', 'section', 0, 80, 1200, 520)

  it('vetoes ink that so much as clips a real block', () => {
    const circled = penStroke('s', squarePoints(70, 420, 220, 80))
    expect(isBlockOverlapVetoed(bboxOf(circled), [button])).toBe(true)
  })

  it('does NOT veto ink that merely touches a block edge — zero area is zero', () => {
    const beside = penStroke('s', squarePoints(280, 432, 100, 56))
    expect(intersectionArea(bboxOf(beside), button.frame)).toBe(0)
    expect(isBlockOverlapVetoed(bboxOf(beside), [button])).toBe(false)
  })

  it('EXEMPTS sections, or a full-width band would veto the whole page', () => {
    const drawn = penStroke('s', squarePoints(200, 200, 300, 200))
    expect(intersectionArea(bboxOf(drawn), band.frame)).toBeGreaterThan(0)
    expect(isBlockOverlapVetoed(bboxOf(drawn), [band])).toBe(false)
  })

  it('leaves a card drawn clear of every block alone — the delete-Cam’s-cards failure', () => {
    const card = penStroke('s', roundedBoxPoints({ x: 80, y: 600, w: 320, h: 260, gap: 20 }))
    expect(isBlockOverlapVetoed(bboxOf(card), [button, band])).toBe(false)
    expect(inkAtoms([button, band], [card])).toHaveLength(1)
  })
})

describe('the veto reaches a ZERO-AREA stroke drawn across a block (Fix B)', () => {
  const button = inkBlock('blk_0006', 'block', 100, 400, 200, 56)

  it('vetoes a dead-straight HORIZONTAL stroke laid across a block — height 0 is not overlap 0', () => {
    // The exact case: a constant-clientY mouse drag from x 80→320 at y 428.
    const across = penStroke('across', linePoints(80, 428, 240, 0))
    expect(bboxOf(across).h).toBe(0)
    // `intersectionArea` multiplies the two 1-D overlaps, so the zero-height axis
    // zeroes the product — the very trap the veto used to fall into.
    expect(intersectionArea(bboxOf(across), button.frame)).toBe(0)
    expect(isBlockOverlapVetoed(bboxOf(across), [button])).toBe(true)
    expect(inkAtoms([button], [across])).toEqual([])
  })

  it('vetoes a dead-straight VERTICAL stroke laid across a block, axes swapped', () => {
    const down = penStroke('down', linePoints(200, 380, 0, 100))
    expect(bboxOf(down).w).toBe(0)
    expect(isBlockOverlapVetoed(bboxOf(down), [button])).toBe(true)
    expect(inkAtoms([button], [down])).toEqual([])
  })

  it('still leaves a genuine full-width rule that clears every block a candidate', () => {
    const rule = penStroke('rule', linePoints(100, 900, 800, 0))
    expect(isBlockOverlapVetoed(bboxOf(rule), [button])).toBe(false)
    expect(inkAtoms([button], [rule])).toHaveLength(1)
  })

  it('still EXEMPTS a section band from the veto, even for a flat stroke on it', () => {
    const band = inkBlock('blk_0001', 'section', 0, 80, 1200, 520)
    const flat = penStroke('flat', linePoints(100, 300, 900, 0))
    expect(isBlockOverlapVetoed(bboxOf(flat), [band])).toBe(false)
  })

  it('still removes the §7.1 image-slot sketch — that page yields no regions', () => {
    expect(inkAtoms(specPageBlocks(), specPageStrokes())).toEqual([])
  })
})

describe('colour families — the only thing that separates OVERLAPPING ink', () => {
  const strokes = [
    penStroke('wave', wavePoints({ x: 60, y: 400, width: 1080, amplitude: 45, cycles: 3 }), INK_RED),
    ...catStrokes(),
  ]

  it('has genuinely overlapping boxes, so no proximity constant could help', () => {
    const wave = strokes[0]
    const cat = strokes[1]
    expect(wave && cat && intersectionArea(bboxOf(wave), bboxOf(cat))).toBeGreaterThan(0)
  })

  it('splits them into two atoms, one per pen colour', () => {
    const atoms = inkAtoms([], strokes)
    expect(atoms).toHaveLength(2)
    expect(atoms.map((atom) => atom.color).sort()).toEqual([INK_BLUE, INK_RED])
  })
})

describe('enclosures', () => {
  it('detects a rounded box whose trace stops 20px short of closing', () => {
    const box = penStroke('box', roundedBoxPoints({ x: 100, y: 100, w: 320, h: 260, gap: 20 }))
    const atoms = inkAtoms([], [box])
    expect(atoms).toHaveLength(1)
    expect(atoms[0]?.isEnclosure).toBe(true)
  })

  it('fuses a box drawn as two L-shaped pen-downs into ONE enclosure', () => {
    const left = penStroke('l', [
      { x: 300, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 300 },
    ])
    const right = penStroke('r', [
      { x: 100, y: 300 },
      { x: 300, y: 300 },
      { x: 300, y: 100 },
    ])
    const atoms = inkAtoms([], [left, right])
    expect(atoms).toHaveLength(1)
    expect(atoms[0]?.isEnclosure).toBe(true)
    expect(atoms[0]?.members.map((m) => m.id)).toEqual(['l', 'r'])
  })

  it('never fuses two boxes into one, even inside the join gap — the gutter case', () => {
    const gutter = ENCLOSURE_JOIN_GAP_PX - 2
    const first = penStroke('a', roundedBoxPoints({ x: 100, y: 100, w: 300, h: 240, gap: 20 }))
    const second = penStroke(
      'b',
      roundedBoxPoints({ x: 400 + gutter, y: 100, w: 300, h: 240, gap: 20 }),
    )
    const atoms = inkAtoms([], [first, second])
    expect(atoms).toHaveLength(2)
    expect(atoms.every((atom) => atom.isEnclosure)).toBe(true)
  })

  it('rejects a bracket: three good edges and one empty one is not a box', () => {
    const bracket = penStroke('bracket', [
      { x: 300, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 300 },
      { x: 300, y: 300 },
    ])
    const tick = penStroke('tick', linePoints(280, 180, 0, 40))
    expect(inkAtoms([], [bracket, tick])[0]?.isEnclosure).toBe(false)
  })

  it('rejects a shape too small to hold anything', () => {
    const tiny = penStroke('tiny', squarePoints(100, 100, 50, 30))
    expect(inkAtoms([], [tiny])[0]?.isEnclosure).toBe(false)
  })
})

describe('containment scopes', () => {
  const box = (id: string, x: number, color = INK_BLUE) =>
    penStroke(id, roundedBoxPoints({ x, y: 300, w: 320, h: 260, gap: 20 }), color)

  it('keeps two cards’ contents in separate scopes, so no gutter width can fuse them', () => {
    const strokes = [
      box('a', 120),
      box('b', 480),
      ...printWordStrokes({ idPrefix: 'a-w', x: 150, y: 340, glyphHeight: 30, glyphWidth: 14, pitch: 22, count: 6 }),
      ...printWordStrokes({ idPrefix: 'b-w', x: 510, y: 340, glyphHeight: 30, glyphWidth: 14, pitch: 22, count: 6 }),
    ]
    const atoms = inkAtoms([], strokes)
    const scoped = atoms.filter((atom) => !atom.isEnclosure)
    expect(scoped).toHaveLength(2)
    expect(new Set(scoped.map((atom) => atom.parentKey)).size).toBe(2)
  })

  it('lets a RED box claim BLUE writing — detection is per family, claiming is not', () => {
    const strokes = [
      box('red-box', 120, INK_RED),
      ...printWordStrokes({ idPrefix: 'w', x: 150, y: 340, glyphHeight: 30, glyphWidth: 14, pitch: 22, count: 6 }),
    ]
    const atoms = inkAtoms([], strokes)
    const writing = atoms.find((atom) => !atom.isEnclosure)
    const enclosure = atoms.find((atom) => atom.isEnclosure)
    expect(writing?.color).toBe(INK_BLUE)
    expect(enclosure?.color).toBe(INK_RED)
    expect(writing?.parentKey).toBe(enclosure?.key)
  })
})

describe('anisotropic proximity — sideways readily, downwards reluctantly', () => {
  const mark = (id: string, x: number, y: number) => penStroke(id, squarePoints(x, y, 20, 20))

  it(`joins two marks ${String(CLUSTER_GAP_X_PX)}px apart across`, () => {
    const atoms = inkAtoms([], [mark('a', 0, 0), mark('b', 20 + CLUSTER_GAP_X_PX, 0)])
    expect(keysOf(atoms)).toEqual([['a', 'b']])
  })

  it(`does NOT join two marks ${String(CLUSTER_GAP_X_PX + 1)}px apart across`, () => {
    const atoms = inkAtoms([], [mark('a', 0, 0), mark('b', 21 + CLUSTER_GAP_X_PX, 0)])
    expect(keysOf(atoms)).toEqual([['a'], ['b']])
  })

  it(`joins two marks ${String(CLUSTER_GAP_Y_PX)}px apart down`, () => {
    const atoms = inkAtoms([], [mark('a', 0, 0), mark('b', 0, 20 + CLUSTER_GAP_Y_PX)])
    expect(keysOf(atoms)).toEqual([['a', 'b']])
  })

  it('does NOT let a heading swallow a nav row drawn 40px beneath it', () => {
    const atoms = inkAtoms([], [mark('a', 0, 0), mark('b', 0, 60)])
    expect(keysOf(atoms)).toEqual([['a'], ['b']])
  })
})

describe('the perf bound is deterministic and total', () => {
  const scatter = (count: number): PenStroke[] =>
    Array.from({ length: count }, (_, index) =>
      penStroke(`s${String(index)}`, squarePoints((index % 20) * 60, Math.floor(index / 20) * 60, 10, 10)),
    )

  it(`returns nothing past ${String(INK_MAX_STROKES)} candidate strokes`, () => {
    expect(inkAtoms([], scatter(INK_MAX_STROKES + 1))).toEqual([])
  })

  it('still segments at one stroke under the bound', () => {
    expect(inkAtoms([], scatter(INK_MAX_STROKES - 1))).toHaveLength(INK_MAX_STROKES - 1)
  })
})

describe('nothing that survives Stage 1 is ever lost', () => {
  it('partitions every candidate into exactly one atom', () => {
    const strokes = [
      ...catStrokes(),
      penStroke('wave', wavePoints({ x: 60, y: 700, width: 900, amplitude: 30, cycles: 2 }), INK_RED),
      penStroke('rule', linePoints(60, 900, 900, 0)),
    ]
    const candidates = inkCandidates([], strokes)
    const placed = segmentInk(candidates).flatMap((atom) => atom.members.map((m) => m.id))
    expect([...placed].sort()).toEqual(candidates.map((c) => c.id).sort())
    expect(new Set(placed).size).toBe(placed.length)
  })

  it('drops strokes with no points rather than inventing a box for them', () => {
    expect(inkCandidates([], [penStroke('empty', [])])).toEqual([])
  })
})
