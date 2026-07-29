import { describe, expect, it } from 'vitest'

import type { PenPoint } from '../canvas/types.ts'

import {
  EXPORT_RDP_EPSILON_PX,
  IMAGE_SKETCH_AREA_RATIO,
  NEAREST_BLOCK_RADIUS_PX,
  containedRatio,
  exportPoints,
  strokeBbox,
  strokeRole,
  toExportStroke,
} from './penRoles.ts'
import type { ExportBlock } from './types.ts'

/** `docs/export-format.md` §4.5 — role, target and point geometry at export. */

const slot = (id: string, x: number, y: number, w: number, h: number): ExportBlock => ({
  id,
  type: 'imageSlot',
  z: 0,
  frame: { x, y, w, h },
  assetId: null,
  fit: 'cover',
  description: 'a slot',
})

const heading = (id: string, x: number, y: number, w: number, h: number, z = 1): ExportBlock => ({
  id,
  type: 'heading',
  z,
  frame: { x, y, w, h },
  copyMode: 'real',
  text: id,
  generateDescription: null,
  lengthHint: null,
})

const band = (id: string, y: number, h: number): ExportBlock => ({
  id,
  type: 'section',
  z: 0,
  frame: { x: 0, y, w: 1200, h },
  background: null,
})

/** A stroke bbox of exactly 100×100 at the origin, for clean ratio arithmetic. */
const box = { x: 0, y: 0, w: 100, h: 100 }

describe(`§4.5 the ${String(IMAGE_SKETCH_AREA_RATIO * 100)}% imageSketch boundary`, () => {
  it('is a sketch at exactly 60% inside the slot', () => {
    const target = slot('blk_0001', 0, 0, 60, 100)
    expect(containedRatio(box, target.frame)).toBeCloseTo(0.6, 10)
    expect(strokeRole(box, [target])).toEqual({ role: 'imageSketch', targetBlockId: 'blk_0001' })
  })

  it('is an annotation at 59.9% inside the slot', () => {
    const target = slot('blk_0001', 0, 0, 59.9, 100)
    expect(strokeRole(box, [target])).toEqual({ role: 'annotation', targetBlockId: 'blk_0001' })
  })

  it('is a sketch at 60.1%', () => {
    const target = slot('blk_0001', 0, 0, 60.1, 100)
    expect(strokeRole(box, [target]).role).toBe('imageSketch')
  })

  it('ignores whether the slot holds an upload — the rule is pure geometry', () => {
    const filled: ExportBlock = { ...slot('blk_0001', 0, 0, 100, 100), assetId: 'img_001' } as ExportBlock
    expect(strokeRole(box, [filled]).role).toBe('imageSketch')
  })
})

describe('§4.5 the annotation target guess', () => {
  it('picks the block it overlaps most', () => {
    const small = heading('blk_0001', 0, 0, 20, 100)
    const large = heading('blk_0002', 0, 0, 80, 100, 2)
    expect(strokeRole(box, [small, large]).targetBlockId).toBe('blk_0002')
  })

  it('never picks a section band, which would always win on area', () => {
    // The band covers the whole bbox; the heading covers a fifth of it.
    expect(strokeRole(box, [band('blk_0001', 0, 400), heading('blk_0002', 0, 0, 20, 100)]).targetBlockId).toBe(
      'blk_0002',
    )
  })

  it(`falls back to the nearest center within ${String(NEAREST_BLOCK_RADIUS_PX)}px`, () => {
    const near = heading('blk_0001', 200, 40, 20, 20)
    expect(strokeRole(box, [near]).targetBlockId).toBe('blk_0001')
  })

  it('returns null when nothing overlaps and nothing is near', () => {
    const far = heading('blk_0001', 900, 900, 20, 20)
    expect(strokeRole(box, [far]).targetBlockId).toBeNull()
  })
})

/**
 * §4.5 asks how much of the bbox lies inside the slot — a question BOTH axes answer.
 * A perfectly straight stroke has a zero-extent axis and therefore zero area, so the
 * ratio needs a fallback; a fallback that reads only the axis with length classifies a
 * line that misses the photo entirely as a sketch of it. Found by the Stage 4 harness
 * dry-run (2026-07-29) with a straight annotation line drawn clear of a photo.
 */
describe('§4.5 degenerate bboxes — perfectly straight strokes', () => {
  /** A photo occupying x 100–500, y 100–400. */
  const photo = slot('blk_0001', 100, 100, 400, 300)

  it('is a sketch when a horizontal line lies inside the slot', () => {
    const line = { x: 150, y: 250, w: 300, h: 0 }
    expect(containedRatio(line, photo.frame)).toBe(1)
    expect(strokeRole(line, [photo])).toEqual({ role: 'imageSketch', targetBlockId: 'blk_0001' })
  })

  it('is a sketch when a vertical line lies inside the slot', () => {
    const line = { x: 300, y: 150, w: 0, h: 200 }
    expect(containedRatio(line, photo.frame)).toBe(1)
    expect(strokeRole(line, [photo])).toEqual({ role: 'imageSketch', targetBlockId: 'blk_0001' })
  })

  it('is an annotation when a horizontal line sits below the slot it lines up with', () => {
    // Horizontally within the photo's span, 200px clear of its bottom edge.
    const line = { x: 150, y: 600, w: 300, h: 0 }
    expect(containedRatio(line, photo.frame)).toBe(0)
    expect(strokeRole(line, [photo]).role).toBe('annotation')
  })

  it('is an annotation when a vertical line sits clear of the slot it lines up with', () => {
    // The harness repro: vertically within the photo's span, 100px clear of its right edge.
    const line = { x: 600, y: 150, w: 0, h: 200 }
    expect(containedRatio(line, photo.frame)).toBe(0)
    expect(strokeRole(line, [photo]).role).toBe('annotation')
  })

  it('applies the 60% rule along the axis that has length', () => {
    // 400 wide, 200 of it over the photo → 50%: not enough.
    expect(containedRatio({ x: 300, y: 250, w: 400, h: 0 }, photo.frame)).toBeCloseTo(0.5, 10)
    expect(strokeRole({ x: 300, y: 250, w: 400, h: 0 }, [photo]).role).toBe('annotation')
    // 300 wide, 250 of it over the photo → 83%: enough.
    expect(containedRatio({ x: 250, y: 250, w: 300, h: 0 }, photo.frame)).toBeCloseTo(250 / 300, 10)
    expect(strokeRole({ x: 250, y: 250, w: 300, h: 0 }, [photo]).role).toBe('imageSketch')
  })

  it('treats a single dot as inside or outside, with no fraction about it', () => {
    const dot = { x: 50, y: 50, w: 0, h: 0 }
    expect(containedRatio(dot, { x: 0, y: 0, w: 100, h: 100 })).toBe(1)
    expect(containedRatio(dot, { x: 200, y: 0, w: 100, h: 100 })).toBe(0)
    expect(containedRatio(dot, { x: 0, y: 200, w: 100, h: 100 })).toBe(0)
  })
})

describe(`§4.5 point geometry at ε = ${String(EXPORT_RDP_EPSILON_PX)}px`, () => {
  it('drops collinear interior points and keeps both endpoints', () => {
    const straight: PenPoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ]
    expect(exportPoints(straight)).toEqual([
      [0, 0],
      [30, 0],
    ])
  })

  it('keeps a point that deviates by more than epsilon', () => {
    const bent: PenPoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 3 },
      { x: 20, y: 0 },
    ]
    expect(exportPoints(bent)).toHaveLength(3)
  })

  it('rounds coordinates to one decimal', () => {
    const noisy: PenPoint[] = [
      { x: 0.123_45, y: 1.987_65 },
      { x: 10.55, y: 20.44 },
    ]
    expect(exportPoints(noisy)).toEqual([
      [0.1, 2],
      [10.6, 20.4],
    ])
  })

  it('is near-idempotent on already-committed strokes (§4.5 v2.2)', () => {
    const committed: PenPoint[] = [
      { x: 810, y: 210.5 },
      { x: 905.2, y: 188 },
      { x: 1010.4, y: 236.7 },
      { x: 1078.9, y: 330.2 },
      { x: 988.1, y: 402.6 },
      { x: 842.3, y: 388.9 },
    ]
    expect(exportPoints(committed)).toHaveLength(committed.length)
  })

  it('computes a bbox and returns null for an empty stroke', () => {
    expect(strokeBbox([{ x: 5, y: 6 }, { x: 15, y: 26 }])).toEqual({ x: 5, y: 6, w: 10, h: 20 })
    expect(strokeBbox([])).toBeNull()
  })
})

describe('toExportStroke', () => {
  it('carries the export id, colour and width, and derives role and target', () => {
    const stroke = toExportStroke(
      {
        id: 'internal-stroke',
        points: [
          { x: 10, y: 10 },
          { x: 50, y: 40 },
          { x: 90, y: 90 },
        ],
        color: '#D94F30',
        width: 4,
      },
      'stk_0001',
      [slot('blk_0001', 0, 0, 100, 100)],
    )
    expect(stroke).toMatchObject({
      id: 'stk_0001',
      color: '#D94F30',
      width: 4,
      role: 'imageSketch',
      targetBlockId: 'blk_0001',
    })
    expect(stroke.points.length).toBeGreaterThanOrEqual(2)
  })
})
