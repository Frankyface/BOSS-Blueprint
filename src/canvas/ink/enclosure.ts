/**
 * PASS B — IS THIS INK A CONTAINER?
 *
 * An enclosure is the one primitive that changes the meaning of everything near it:
 * once a box exists, the marks inside it are its contents rather than its neighbours,
 * and two boxes' contents never compare. So this pass runs before proximity, not after.
 *
 * The closure test is DELIBERATELY THE MOST TOLERANT of the three considered. The
 * defect in the product owner's own drawing is an outline that overshoots and leaves
 * gaps at the corners; a `netTurn ≥ 5 rad` plus corner-count gate fails on exactly
 * that shape, because a rounded corner spreads 90° over roughly 47px of arc and a
 * 12px resample step therefore sees ~22° per sample and counts ZERO corners.
 * `perimeterRatio` is the honest rectangle/blob discriminator without them: a
 * rectangle measures ≈1.0, an inscribed ellipse ≈0.79, and the traced cat outline
 * — ears, four legs and a curled tail — measures 1.79, clear of the 1.6 ceiling.
 */

import type { PenPoint } from '../types.ts'

import {
  EDGE_COVERAGE_DIAG_RATIO,
  EDGE_COVERAGE_MAX_TOL_PX,
  EDGE_COVERAGE_MIN_TOL_PX,
  EDGE_COVERAGE_SAMPLES,
  ENCLOSURE_CLOSE_GAP_PX,
  ENCLOSURE_CLOSE_GAP_RATIO,
  ENCLOSURE_EDGE_COVERAGE,
  ENCLOSURE_JOIN_GAP_PX,
  ENCLOSURE_MAX_STROKES,
  ENCLOSURE_MIN_H_PX,
  ENCLOSURE_MIN_W_PX,
  ENCLOSURE_PERIMETER_MAX,
  ENCLOSURE_SUBSET_BUDGET,
} from './constants.ts'
import { atLeast, atMost, worstMargin } from './margins.ts'
import { bboxOfPoints, frameGapX, frameGapY, framesOfMembers } from './metrics.ts'
import type { InkFrame, StrokeMetrics } from './types.ts'

function pointToSegment(point: PenPoint, from: PenPoint, to: PenPoint): number {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y)

  const t = Math.max(
    0,
    Math.min(1, ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared),
  )
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy))
}

interface NearPath {
  readonly points: readonly PenPoint[]
  readonly box: InkFrame
}

/** How far a point is from a box: 0 inside it. The cheap test that skips a whole path. */
function pointToBox(point: PenPoint, box: InkFrame): number {
  const dx = Math.max(box.x - point.x, 0, point.x - (box.x + box.w))
  const dy = Math.max(box.y - point.y, 0, point.y - (box.y + box.h))
  return Math.hypot(dx, dy)
}

function isNearAnyPath(point: PenPoint, paths: readonly NearPath[], tolerance: number): boolean {
  for (const path of paths) {
    // A stroke whose whole BOX is out of range cannot have a segment in range, and
    // skipping it here skips every one of its segments. On the traced pricing cards
    // that is the difference between a hundred segment tests per sample and two.
    if (pointToBox(point, path.box) > tolerance) continue
    if (path.points.length === 1) {
      const only = path.points[0]
      if (only && Math.hypot(point.x - only.x, point.y - only.y) <= tolerance) return true
      continue
    }
    for (let index = 1; index < path.points.length; index += 1) {
      const from = path.points[index - 1]
      const to = path.points[index]
      if (!from || !to) continue
      if (pointToSegment(point, from, to) <= tolerance) return true
    }
  }
  return false
}

/**
 * The fraction of each of the four box edges that has ink near it — reported as the
 * MINIMUM of the four, because three good edges and one empty one is a bracket, not a
 * box.
 *
 * Distance is measured to the path's SEGMENTS rather than to a densified copy of its
 * points: that is the exact value densification approximates, without inventing a
 * densification step whose size would quietly become another threshold.
 *
 * Used ONLY by the multi-stroke enclosure test. A single stroke's closure is settled
 * by its closure gap and perimeter ratio, which need no edge sampling.
 *
 * `floor` is an OPTIMISATION, not a rule: pass the threshold the caller is about to
 * compare against and this stops as soon as an edge can no longer reach it, returning
 * some value below the floor instead of the exact one. Left at 0 the answer is exact,
 * which is how the tests call it. The search below offers this function thousands of
 * subsets and nearly all of them fail on their first edge.
 */
export function edgeCoverage(
  frame: InkFrame,
  paths: readonly (readonly PenPoint[])[],
  floor = 0,
): number {
  const tolerance = Math.min(
    EDGE_COVERAGE_MAX_TOL_PX,
    Math.max(EDGE_COVERAGE_MIN_TOL_PX, EDGE_COVERAGE_DIAG_RATIO * Math.hypot(frame.w, frame.h)),
  )
  const near: NearPath[] = paths.map((points) => ({
    points,
    box: bboxOfPoints(points) ?? { x: 0, y: 0, w: 0, h: 0 },
  }))

  const right = frame.x + frame.w
  const bottom = frame.y + frame.h
  const edges: readonly (readonly [PenPoint, PenPoint])[] = [
    [{ x: frame.x, y: frame.y }, { x: right, y: frame.y }],
    [{ x: right, y: frame.y }, { x: right, y: bottom }],
    [{ x: right, y: bottom }, { x: frame.x, y: bottom }],
    [{ x: frame.x, y: bottom }, { x: frame.x, y: frame.y }],
  ]
  const affordableMisses = Math.floor((1 - floor) * EDGE_COVERAGE_SAMPLES)

  let weakest = 1
  for (const edge of edges) {
    const [from, to] = edge
    let hits = 0
    let misses = 0
    for (let sample = 0; sample < EDGE_COVERAGE_SAMPLES; sample += 1) {
      const t = sample / (EDGE_COVERAGE_SAMPLES - 1)
      const at = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }
      if (isNearAnyPath(at, near, tolerance)) {
        hits += 1
        continue
      }
      misses += 1
      if (misses > affordableMisses) return hits / EDGE_COVERAGE_SAMPLES
    }
    weakest = Math.min(weakest, hits / EDGE_COVERAGE_SAMPLES)
  }
  return weakest
}

/** One stroke that closes on itself well enough to be a container. */
export function singleEnclosureMargin(member: StrokeMetrics): number | null {
  const allowance = Math.max(
    ENCLOSURE_CLOSE_GAP_PX,
    ENCLOSURE_CLOSE_GAP_RATIO * member.pathLength,
  )
  return worstMargin([
    atLeast(member.bbox.w, ENCLOSURE_MIN_W_PX),
    atLeast(member.bbox.h, ENCLOSURE_MIN_H_PX),
    atMost(member.closureGap, allowance),
    atMost(member.perimeterRatio, ENCLOSURE_PERIMETER_MAX),
  ])
}

/**
 * Several strokes that together run along all four edges of their own box.
 *
 * THE CHEAP GATES RUN FIRST, and that ordering is load-bearing rather than cosmetic.
 * Edge coverage costs 204 point-to-path distance sweeps, and the search below offers
 * this function thousands of subsets; measured on the traced pricing-cards page,
 * testing coverage before the size and perimeter gates made one call take over a
 * second. The size gates reject a row of glyphs in a few arithmetic operations.
 *
 * The perimeter FLOOR is an exact consequence of the coverage gate, not a new rule:
 * ink cannot be within `tol` of 80% of every edge unless its path is roughly that
 * fraction of the perimeter long. Stated as a cheap gate it prunes the same subsets
 * that coverage would have rejected, for none of the cost.
 */
export function fusedEnclosureMargin(members: readonly StrokeMetrics[]): number | null {
  const { bbox } = framesOfMembers(members)
  const pathLength = members.reduce((total, member) => total + member.pathLength, 0)
  const perimeterRatio = pathLength / Math.max(2 * (bbox.w + bbox.h), 1)

  const cheap = worstMargin([
    atLeast(bbox.w, ENCLOSURE_MIN_W_PX),
    atLeast(bbox.h, ENCLOSURE_MIN_H_PX),
    atMost(perimeterRatio, ENCLOSURE_PERIMETER_MAX),
  ])
  if (cheap === null) return null
  if (perimeterRatio < ENCLOSURE_EDGE_COVERAGE) return null

  const coverage = worstMargin([
    atLeast(
      edgeCoverage(
        bbox,
        members.map((member) => member.points),
        ENCLOSURE_EDGE_COVERAGE,
      ),
      ENCLOSURE_EDGE_COVERAGE,
    ),
  ])
  return coverage === null ? null : Math.min(cheap, coverage)
}

/**
 * The first connected subset of 2..`ENCLOSURE_MAX_STROKES` strokes that measures like
 * a box, searched in draw order so the answer depends on nothing but the drawing.
 */
function findFusion(pool: readonly StrokeMetrics[]): readonly StrokeMetrics[] | null {
  const neighbours = pool.map((member, index) =>
    pool
      .map((other, otherIndex) => ({ other, otherIndex }))
      .filter(
        (pair) =>
          pair.otherIndex !== index &&
          frameGapX(member.bbox, pair.other.bbox) <= ENCLOSURE_JOIN_GAP_PX &&
          frameGapY(member.bbox, pair.other.bbox) <= ENCLOSURE_JOIN_GAP_PX,
      )
      .map((pair) => pair.otherIndex),
  )

  let budget = ENCLOSURE_SUBSET_BUDGET
  const tested = new Set<string>()
  const pick = (subset: readonly number[]): StrokeMetrics[] =>
    subset.map((index) => pool[index]).filter((member): member is StrokeMetrics => !!member)

  const grow = (subset: readonly number[]): readonly number[] | null => {
    if (budget <= 0) return null
    if (subset.length >= 2) {
      // The walk can reach one subset by several insertion orders; testing each of
      // them again would cost up to six times the work and spend the budget on
      // answers already known.
      const signature = [...subset].sort((a, b) => a - b).join(',')
      if (!tested.has(signature)) {
        tested.add(signature)
        budget -= 1
        if (fusedEnclosureMargin(pick(subset)) !== null) return subset
      }
    }
    if (subset.length >= ENCLOSURE_MAX_STROKES) return null

    const seed = subset[0] ?? 0
    const reachable = [...new Set(subset.flatMap((index) => neighbours[index] ?? []))]
      .filter((index) => index > seed && !subset.includes(index))
      .sort((a, b) => a - b)

    for (const next of reachable) {
      const found = grow([...subset, next])
      if (found) return found
    }
    return null
  }

  for (let seed = 0; seed < pool.length; seed += 1) {
    const found = grow([seed])
    if (found) return pick(found)
  }
  return null
}

export interface FoundEnclosure {
  readonly members: readonly StrokeMetrics[]
  readonly margin: number
}

/**
 * Every enclosure in one colour family, plus the strokes left loose.
 *
 * STROKES THAT ARE ALREADY BOXES ON THEIR OWN ARE NOT FUSION CANDIDATES. Without that
 * rule two pricing cards 30px apart fuse into one enclosure spanning both: their union
 * runs along 95% of every edge of its own box and its combined path is barely longer
 * than that box's perimeter, so every fusion gate passes and the client's two cards
 * become one. A box is a box; two boxes side by side are two boxes.
 */
export function enclosuresOfFamily(family: readonly StrokeMetrics[]): {
  enclosures: readonly FoundEnclosure[]
  loose: readonly StrokeMetrics[]
} {
  const enclosures: FoundEnclosure[] = []
  const unboxed: StrokeMetrics[] = []

  for (const member of family) {
    const margin = singleEnclosureMargin(member)
    if (margin === null) unboxed.push(member)
    else enclosures.push({ members: [member], margin })
  }

  let pool: readonly StrokeMetrics[] = unboxed
  for (;;) {
    const fused = findFusion(pool)
    if (!fused) break
    enclosures.push({
      members: [...fused].sort((a, b) => a.ordinal - b.ordinal),
      margin: fusedEnclosureMargin(fused) ?? 0,
    })
    const used = new Set(fused.map((member) => member.id))
    pool = pool.filter((member) => !used.has(member.id))
  }

  return { enclosures, loose: pool }
}
