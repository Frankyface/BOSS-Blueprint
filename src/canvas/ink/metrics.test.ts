import { describe, expect, it } from 'vitest'

import { IMAGE_SKETCH_AREA_RATIO, containedRatio as exportContainedRatio, strokeBbox } from '../../export/penRoles.ts'
import {
  INK_BLUE,
  circlePoints,
  cursivePoints,
  linePoints,
  penStroke,
  squarePoints,
  wavePoints,
} from '../../test/inkFixtures.ts'
import { PAGE_WIDTH_PX } from '../constants.ts'
import type { PenPoint } from '../types.ts'

import { EDGE_COVERAGE_SAMPLES, INK_IMAGE_SKETCH_AREA_RATIO, RESAMPLE_STEP_PX } from './constants.ts'
import { edgeCoverage } from './enclosure.ts'
import {
  absoluteTurning,
  bboxOfPoints,
  chordDeviation,
  containedRatio,
  convexHullArea,
  inflatedFrame,
  intersectionArea,
  pathLengthOf,
  resamplePath,
  strokeMetrics,
} from './metrics.ts'

/**
 * STAGE 0 — the per-stroke measures, against shapes whose answers are arithmetic
 * rather than opinion. If any of these drifts, every classifier above it is deciding
 * on a number that no longer means what its threshold was chosen against.
 */

const metricsOf = (points: readonly PenPoint[], width = 4) =>
  strokeMetrics(penStroke('s1', points, INK_BLUE, width), 0)

describe('a traced 100×100 square — the reference shape', () => {
  const square = metricsOf(squarePoints(0, 0, 100, 100))

  it('has a path exactly as long as its own perimeter', () => {
    expect(square.pathLength).toBeCloseTo(400, 9)
    expect(square.perimeterRatio).toBeCloseTo(1, 9)
  })

  it('fills its own convex hull and its own bounding box', () => {
    expect(convexHullArea(squarePoints(0, 0, 100, 100))).toBeCloseTo(10000, 6)
    expect(square.hullFill).toBeCloseTo(1, 9)
  })

  it('closes: the last point is the first point', () => {
    expect(square.closureGap).toBe(0)
  })

  it('has ink along every edge of its box', () => {
    expect(edgeCoverage(square.bbox, [squarePoints(0, 0, 100, 100)])).toBe(1)
  })
})

describe('an inscribed circle — π/4 of its box, by construction', () => {
  const circle = metricsOf(circlePoints(50, 50, 50))

  it('has a hull fill of π/4 ≈ 0.785, well under the enclosure blob ceiling', () => {
    expect(circle.hullFill).toBeCloseTo(Math.PI / 4, 3)
  })

  it('has a perimeter ratio of π/4 too — an ellipse, not a rectangle', () => {
    expect(circle.perimeterRatio).toBeCloseTo(Math.PI / 4, 3)
  })

  it('has a bounding box of exactly the diameter on both axes', () => {
    expect(circle.bbox).toEqual({ x: 0, y: 0, w: 100, h: 100 })
  })
})

describe('a straight horizontal rule — the ZERO-EXTENT case', () => {
  const rule = metricsOf(linePoints(100, 400, 600, 0))

  it('really does have a bounding box of height exactly 0', () => {
    expect(rule.bbox.h).toBe(0)
  })

  it('produces no NaN and no Infinity in any measure', () => {
    const measures = [
      rule.pathLength,
      rule.closureGap,
      rule.perimeterRatio,
      rule.chordDev,
      rule.tiltDeg,
      rule.hullFill,
      rule.absTurn,
      rule.aspect,
    ]
    for (const measure of measures) expect(Number.isFinite(measure)).toBe(true)
  })

  it('reads as dead straight, dead level and unturned', () => {
    expect(rule.chordDev).toBe(0)
    expect(rule.tiltDeg).toBe(0)
    expect(rule.absTurn).toBe(0)
    expect(rule.hullFill).toBe(0)
  })

  it('reads its aspect off the guarded denominator, not off zero', () => {
    expect(rule.aspect).toBe(600)
  })

  it('measures a vertical rule the same way with the axes swapped', () => {
    const vertical = metricsOf(linePoints(400, 100, 0, 600))
    expect(vertical.bbox.w).toBe(0)
    expect(vertical.tiltDeg).toBeCloseTo(90, 9)
    expect(Number.isFinite(vertical.aspect)).toBe(true)
  })
})

describe('turning is the change in a SMOOTHED direction, not a sum over vertices', () => {
  it('is zero along a straight line at any length', () => {
    expect(absoluteTurning(linePoints(0, 0, 900, 0))).toBe(0)
  })

  it('is exactly a right angle across a single L corner', () => {
    const corner: PenPoint[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
    ]
    expect(absoluteTurning(corner)).toBeCloseTo(Math.PI / 2, 6)
  })

  it('is scale-invariant: the same L at 4× measures the same', () => {
    const small: PenPoint[] = [
      { x: 0, y: 0 },
      { x: 200, y: 0 },
      { x: 200, y: 200 },
    ]
    const large: PenPoint[] = small.map((point) => ({ x: point.x * 4, y: point.y * 4 }))
    expect(absoluteTurning(large)).toBeCloseTo(absoluteTurning(small), 3)
  })

  it('is huge for a scribble — over 15 radians of accumulated wander', () => {
    const scribble = wavePoints({ x: 0, y: 0, width: 600, amplitude: 60, cycles: 6 })
    expect(absoluteTurning(scribble)).toBeGreaterThan(15)
  })

  it('is over the cursive floor for a looping wordmark', () => {
    expect(absoluteTurning(cursivePoints({ x: 0, y: 0, w: 260, h: 56, loops: 4 }))).toBeGreaterThan(
      9,
    )
  })
})

describe('chord deviation — how far the ink bows off its own chord', () => {
  it('is zero for a straight segment', () => {
    expect(chordDeviation(linePoints(0, 0, 400, 0))).toBe(0)
  })

  it('is amplitude ÷ width for a single-cycle wave', () => {
    const wave = wavePoints({ x: 0, y: 0, width: 240, amplitude: 12, cycles: 1 })
    expect(chordDeviation(wave)).toBeCloseTo(12 / 240, 3)
  })
})

describe('resampling — what makes turning independent of how the points were thinned', () => {
  it('spaces every interior sample at the step, and keeps both ends', () => {
    const resampled = resamplePath(linePoints(0, 0, 100, 0), RESAMPLE_STEP_PX)
    expect(resampled[0]).toEqual({ x: 0, y: 0 })
    expect(resampled[resampled.length - 1]).toEqual({ x: 100, y: 0 })
    expect(resampled[1]?.x).toBeCloseTo(RESAMPLE_STEP_PX, 9)
  })

  it('survives a degenerate path of one repeated point', () => {
    const repeated: PenPoint[] = [
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ]
    expect(resamplePath(repeated, RESAMPLE_STEP_PX)).toHaveLength(1)
    expect(absoluteTurning(repeated)).toBe(0)
    expect(pathLengthOf(repeated)).toBe(0)
  })
})

describe('edge coverage — the minimum of four edges, not the average', () => {
  const bracket: PenPoint[] = [
    { x: 100, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 100 },
    { x: 100, y: 100 },
  ]

  it('reports the missing edge, not the three good ones', () => {
    const frame = { x: 0, y: 0, w: 100, h: 100 }
    expect(edgeCoverage(frame, [bracket])).toBeLessThan(0.55)
  })

  it('fuses two L-shaped halves of a box into full coverage', () => {
    const left: PenPoint[] = [
      { x: 200, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 200 },
    ]
    const right: PenPoint[] = [
      { x: 0, y: 200 },
      { x: 200, y: 200 },
      { x: 200, y: 0 },
    ]
    expect(edgeCoverage({ x: 0, y: 0, w: 200, h: 200 }, [left, right])).toBe(1)
  })

  it('samples an odd number of positions, so an edge midpoint is always tested', () => {
    expect(EDGE_COVERAGE_SAMPLES % 2).toBe(1)
  })
})

describe('the ink box is where the ink IS, not where the points are', () => {
  it('inflates by half the pen width on all four sides', () => {
    const fat = metricsOf(linePoints(400, 400, 200, 0), 20)
    expect(fat.inkBbox).toEqual({ x: 390, y: 390, w: 220, h: 20 })
  })

  it('clamps to the page rather than handing a builder coordinates off it', () => {
    expect(inflatedFrame({ x: 2, y: 2, w: 1196, h: 40 }, 10)).toEqual({
      x: 0,
      y: 0,
      w: PAGE_WIDTH_PX,
      h: 52,
    })
  })
})

/**
 * THE ANTI-DRIFT GUARD. `containedRatio` and the bbox are reimplemented here rather
 * than imported from `src/export/penRoles.ts`, because the canvas layer must not
 * depend on the export layer. Duplication is only safe while it is provably
 * identical, so this is where that gets proven — including on the zero-extent axis,
 * which is the whole reason the export's version is written the way it is.
 */
describe('parity with the shipped §4.5 geometry', () => {
  const frame = { x: 50, y: 50, w: 200, h: 100 }
  const cases = [
    { x: 0, y: 0, w: 100, h: 100 },
    { x: 60, y: 60, w: 100, h: 20 },
    { x: 100, y: 100, w: 0, h: 0 },
    { x: 100, y: 400, w: 120, h: 0 },
    { x: 400, y: 60, w: 0, h: 40 },
    { x: 500, y: 500, w: 10, h: 10 },
  ]

  it('agrees with the export on every contained ratio, zero-extent axes included', () => {
    for (const box of cases) {
      expect(containedRatio(box, frame)).toBe(exportContainedRatio(box, frame))
    }
  })

  it('agrees with the export on the bounding box of a stroke', () => {
    const points = wavePoints({ x: 10, y: 20, width: 300, amplitude: 30, cycles: 2 })
    expect(bboxOfPoints(points)).toEqual(strokeBbox(points))
  })

  it('holds the slot-lock ratio equal to the export contract it mirrors', () => {
    expect(INK_IMAGE_SKETCH_AREA_RATIO).toBe(IMAGE_SKETCH_AREA_RATIO)
  })

  it('reports no bounding box at all for an empty point list', () => {
    expect(bboxOfPoints([])).toBeNull()
  })
})

describe('intersection area is a plain rectangle overlap', () => {
  it('is zero when the boxes only touch', () => {
    expect(intersectionArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 })).toBe(0)
  })

  it('multiplies the two overlaps', () => {
    expect(intersectionArea({ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 })).toBe(25)
  })
})
