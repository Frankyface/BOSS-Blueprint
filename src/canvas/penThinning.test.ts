import { describe, expect, it } from 'vitest'

import {
  MIN_STROKE_POINTS,
  PEN_THINNING_EPSILON_PX,
  roundCoordinate,
  simplifyPoints,
  thinStroke,
  withoutTinySteps,
} from './penThinning.ts'
import type { PenPoint } from './types.ts'

/** A straight run of `count` samples from (0,0) to (count-1, 0). */
function straightLine(count: number): PenPoint[] {
  return Array.from({ length: count }, (_, index) => ({ x: index, y: 0 }))
}

describe('simplifyPoints', () => {
  it('keeps a two-point stroke exactly as it is', () => {
    const points: PenPoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ]

    expect(simplifyPoints(points)).toEqual(points)
  })

  it('collapses a dense straight line to its two endpoints', () => {
    const simplified = simplifyPoints(straightLine(50))

    expect(simplified).toEqual([
      { x: 0, y: 0 },
      { x: 49, y: 0 },
    ])
  })

  it('keeps the corner of an L, because dropping it would change the shape', () => {
    const points: PenPoint[] = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 100, y: 100 },
    ]

    expect(simplifyPoints(points)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ])
  })

  it('never moves the first or last point', () => {
    const points: PenPoint[] = [
      { x: 3, y: 7 },
      { x: 12, y: 40 },
      { x: 20, y: 9 },
      { x: 90, y: 91 },
    ]

    const simplified = simplifyPoints(points, 100)

    expect(simplified[0]).toEqual(points[0])
    expect(simplified[simplified.length - 1]).toEqual(points[points.length - 1])
  })

  it('drops a wobble smaller than epsilon but keeps one larger than it', () => {
    const barelyOff: PenPoint[] = [
      { x: 0, y: 0 },
      { x: 50, y: PEN_THINNING_EPSILON_PX / 2 },
      { x: 100, y: 0 },
    ]
    const clearlyOff: PenPoint[] = [
      { x: 0, y: 0 },
      { x: 50, y: PEN_THINNING_EPSILON_PX * 4 },
      { x: 100, y: 0 },
    ]

    expect(simplifyPoints(barelyOff)).toHaveLength(2)
    expect(simplifyPoints(clearlyOff)).toHaveLength(3)
  })

  it('survives 10,000 samples without blowing the stack', () => {
    // Recursive RDP recurses once per point on an almost-straight run like this;
    // the explicit stack is what makes it safe.
    const nearlyStraight = Array.from({ length: 10_000 }, (_, index) => ({
      x: index,
      y: index % 2 === 0 ? 0 : 0.2,
    }))

    expect(() => simplifyPoints(nearlyStraight)).not.toThrow()
    expect(simplifyPoints(nearlyStraight).length).toBeGreaterThanOrEqual(MIN_STROKE_POINTS)
  })
})

describe('withoutTinySteps', () => {
  it('drops sub-pixel jitter and keeps the shape', () => {
    const jittery = Array.from({ length: 400 }, (_, index) => ({ x: index / 10, y: 0 }))

    const sampled = withoutTinySteps(jittery)

    expect(sampled.length).toBeLessThan(jittery.length / 4)
    expect(sampled[0]).toEqual({ x: 0, y: 0 })
    expect(sampled[sampled.length - 1]).toEqual({ x: 39.9, y: 0 })
  })

  it('never drops the point the client lifted their hand at', () => {
    const points: PenPoint[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      // A last sample a hair past the previous one: still the end of the stroke.
      { x: 100.01, y: 0 },
    ]

    expect(withoutTinySteps(points)[2]).toEqual({ x: 100.01, y: 0 })
  })

  it('leaves a short stroke alone', () => {
    const points: PenPoint[] = [
      { x: 0, y: 0 },
      { x: 0.1, y: 0 },
    ]

    expect(withoutTinySteps(points)).toBe(points)
  })
})

describe('roundCoordinate', () => {
  it('rounds to one decimal, matching the export contract', () => {
    expect(roundCoordinate(12.3456)).toBe(12.3)
    expect(roundCoordinate(12.35)).toBe(12.4)
    expect(roundCoordinate(-0.04)).toBe(-0)
  })
})

describe('thinStroke', () => {
  it('rounds every stored coordinate to one decimal', () => {
    const thinned = thinStroke([
      { x: 1.234, y: 5.678 },
      { x: 40.111, y: 2.999 },
    ])

    expect(thinned).toEqual([
      { x: 1.2, y: 5.7 },
      { x: 40.1, y: 3 },
    ])
  })

  it('turns a tap (one sample) into a two-point dot the export schema accepts', () => {
    const thinned = thinStroke([{ x: 10, y: 10 }])

    expect(thinned).toHaveLength(MIN_STROKE_POINTS)
    expect(thinned[0]).toEqual({ x: 10, y: 10 })
    expect(thinned[1]).toEqual({ x: 10, y: 10 })
  })

  it('turns a held tap (many identical samples) into the same two-point dot', () => {
    const held = Array.from({ length: 30 }, () => ({ x: 4.02, y: 9.01 }))

    expect(thinStroke(held)).toEqual([
      { x: 4, y: 9 },
      { x: 4, y: 9 },
    ])
  })

  it('drops points that rounding made duplicates of their neighbour', () => {
    const thinned = thinStroke([
      { x: 0, y: 0 },
      { x: 0.01, y: 0.01 },
      { x: 0.02, y: 0.02 },
      { x: 60, y: 60 },
    ])

    expect(thinned).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 60 },
    ])
  })

  it('returns nothing at all for no samples', () => {
    expect(thinStroke([])).toEqual([])
  })

  it('commits a huge scribble fast enough that pointerup does not stall', () => {
    // 8,000 samples along a 900px looping path — a far longer single stroke than a
    // hand actually draws, at a sampling rate above any real pointer.
    const scribble = Array.from({ length: 8_000 }, (_, index) => ({
      x: 600 + Math.cos(index / 90) * 450,
      y: 800 + Math.sin(index / 55) * 450,
    }))

    const startedAt = performance.now()
    const thinned = thinStroke(scribble)
    const elapsedMs = performance.now() - startedAt

    expect(thinned.length).toBeLessThan(scribble.length / 4)
    expect(elapsedMs).toBeLessThan(250)
  })

  it('cuts a realistic 240-sample scribble down by an order of magnitude', () => {
    // A smooth arc sampled at ~120Hz for two seconds: the case the epsilon is for.
    const arc = Array.from({ length: 240 }, (_, index) => ({
      x: index * 1.5,
      y: 200 + Math.sin(index / 40) * 60,
    }))

    const thinned = thinStroke(arc)

    expect(thinned.length).toBeLessThan(arc.length / 5)
    expect(thinned[0]).toEqual({ x: 0, y: 200 })
  })
})
