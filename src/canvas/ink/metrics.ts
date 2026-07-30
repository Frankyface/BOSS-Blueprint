/**
 * STAGE 0 — PER-STROKE MEASUREMENT.
 *
 * Everything above this file decides; this file only measures. Each measure is
 * dimensionless or in page pixels, and each was chosen because a threshold on it
 * separates two things a client actually draws — not because it was easy to compute.
 *
 * THE ZERO-EXTENT AXIS IS THE HAZARD HERE. A straight horizontal rule drawn with a
 * mouse has a bounding box of height EXACTLY 0, so its area is 0, its aspect ratio
 * would be `w / 0` and its contained ratio would be `0 / 0`. Every ratio below either
 * guards its denominator or answers the degenerate case explicitly. A `NaN` reaching
 * a classifier is worse than a wrong answer: `NaN <= threshold` is false for every
 * threshold, so the ink would silently fall out of every branch.
 */

import { PAGE_WIDTH_PX } from '../constants.ts'
import type { PenPoint, PenStroke } from '../types.ts'

import { RESAMPLE_STEP_PX, TURN_LEVER_SAMPLES } from './constants.ts'
import type { InkFrame, StrokeMetrics } from './types.ts'

/** Bounding box of a point list, or `null` when there are no points to bound. */
export function bboxOfPoints(points: readonly PenPoint[]): InkFrame | null {
  if (points.length === 0) return null

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  for (const point of points) {
    minX = Math.min(minX, point.x)
    minY = Math.min(minY, point.y)
    maxX = Math.max(maxX, point.x)
    maxY = Math.max(maxY, point.y)
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

export const EMPTY_FRAME: InkFrame = { x: 0, y: 0, w: 0, h: 0 }

export function unionFrame(a: InkFrame, b: InkFrame): InkFrame {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  }
}

/**
 * The two boxes of a set of strokes: the union of their raw point boxes, and the
 * union of their INK boxes. Both are needed and they are not the same question — the
 * first is what geometry is measured against, the second is where a builder must
 * actually leave room.
 */
export function framesOfMembers(
  members: readonly { readonly bbox: InkFrame; readonly inkBbox: InkFrame }[],
): { bbox: InkFrame; frame: InkFrame } {
  const first = members[0]
  if (!first) return { bbox: EMPTY_FRAME, frame: EMPTY_FRAME }
  return members.slice(1).reduce(
    (carried, member) => ({
      bbox: unionFrame(carried.bbox, member.bbox),
      frame: unionFrame(carried.frame, member.inkBbox),
    }),
    { bbox: first.bbox, frame: first.inkBbox },
  )
}

function overlap1D(aStart: number, aSize: number, bStart: number, bSize: number): number {
  return Math.max(0, Math.min(aStart + aSize, bStart + bSize) - Math.max(aStart, bStart))
}

/** The TRUE gap between two boxes on one axis: 0 when they overlap or touch. */
function gap1D(aStart: number, aSize: number, bStart: number, bSize: number): number {
  return Math.max(0, Math.max(aStart, bStart) - Math.min(aStart + aSize, bStart + bSize))
}

export function frameGapX(a: InkFrame, b: InkFrame): number {
  return gap1D(a.x, a.w, b.x, b.w)
}

export function frameGapY(a: InkFrame, b: InkFrame): number {
  return gap1D(a.y, a.h, b.y, b.h)
}

export function intersectionArea(a: InkFrame, b: InkFrame): number {
  return overlap1D(a.x, a.w, b.x, b.w) * overlap1D(a.y, a.h, b.y, b.h)
}

/** Two closed intervals meet, TOUCH INCLUSIVE: `[a0,a1]` and `[b0,b1]` iff a0≤b1 ∧ b0≤a1. */
function intervalsIntersect(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 <= b1 && b0 <= a1
}

/**
 * Whether `box` overlaps `frame`, with the ZERO-EXTENT axis solved the way
 * `containedRatio` above solves it rather than left to `intersectionArea`.
 *
 * `intersectionArea` multiplies two 1-D overlaps, so a dead-straight stroke — a bbox
 * whose height OR width is EXACTLY 0, which a constant-clientY (or constant-clientX)
 * mouse drag produces — has one overlap factor of 0 and a product of 0, and reads as
 * touching nothing. A rule laid straight across a button would slip the block-overlap
 * veto and ship as a buildable region. The question "does the box meet the frame" is
 * one BOTH axes answer, so for a zero-area box it is read per axis as an INCLUSIVE
 * interval test (a rule lying on a block's edge is ON the block, not beside it).
 *
 * The `w·h > 0` guard means this is the EXACT `intersectionArea > 0` test for every
 * non-degenerate box, so no real drawn shape changes answer — only the zero-area case
 * that was silently wrong. `src/export/validate/rules/inkRegions.ts` re-proves the veto
 * on the shipped geometry and must apply this identical predicate.
 */
export function boxesOverlapInclusive(box: InkFrame, frame: InkFrame): boolean {
  if (box.w * box.h > 0) return intersectionArea(box, frame) > 0
  return (
    intervalsIntersect(box.x, box.x + box.w, frame.x, frame.x + frame.w) &&
    intervalsIntersect(box.y, box.y + box.h, frame.y, frame.y + frame.h)
  )
}

/**
 * The fraction of one axis of the box that lies within the frame's span on that axis.
 * A zero-extent axis has no fraction to take: its single coordinate is either within
 * the span or it is not.
 */
function axisContainedRatio(
  start: number,
  size: number,
  frameStart: number,
  frameSize: number,
): number {
  if (size > 0) return overlap1D(start, size, frameStart, frameSize) / size
  return start >= frameStart && start <= frameStart + frameSize ? 1 : 0
}

/**
 * How much of `box` lies inside `frame`, as a ratio of the box's area.
 *
 * THE HOUSE SOLUTION, mirrored from `src/export/penRoles.ts` (§4.5) rather than
 * imported: `src/canvas` is the inner layer and `src/export` imports it, so importing
 * back would invert that. Duplication is only safe while it is provably identical,
 * and `metrics.test.ts` proves it against the export's own function on a table that
 * includes both zero-extent axes.
 *
 * The reasoning: a zero-area box would make this `0 / 0`. The question "how much of
 * the box is inside" is one BOTH axes answer, so the degenerate case is read per axis
 * and the two fractions multiplied. Where both axes have length the product IS the
 * area ratio (`(ovX·ovY)/(w·h) = (ovX/w)·(ovY/h)`), so this is the same rule read one
 * axis at a time — not a second one.
 */
export function containedRatio(box: InkFrame, frame: InkFrame): number {
  const area = box.w * box.h
  if (area > 0) return intersectionArea(box, frame) / area

  return (
    axisContainedRatio(box.x, box.w, frame.x, frame.w) *
    axisContainedRatio(box.y, box.h, frame.y, frame.h)
  )
}

/** The middle value, or the mean of the middle two. Robust where a mean is not. */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? 0
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
}

/** Population standard deviation — the spread of a set of gaps around their own mean. */
export function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  const variance = values.reduce((total, value) => total + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

export function pathLengthOf(points: readonly PenPoint[]): number {
  let total = 0
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    if (!previous || !current) continue
    total += Math.hypot(current.x - previous.x, current.y - previous.y)
  }
  return total
}

/**
 * The polyline walked at a fixed spacing, keeping both endpoints.
 *
 * Commit-time thinning (`penThinning.ts`) keeps whichever vertices the RDP pass
 * thought were interesting, which depends on how fast the client's hand moved. Any
 * measure summed PER VERTEX would therefore depend on the client's hand speed.
 * Resampling is what makes the turning measure below a property of the SHAPE.
 */
export function resamplePath(points: readonly PenPoint[], step: number): PenPoint[] {
  const first = points[0]
  if (!first) return []
  if (step <= 0) return [...points]

  const walked: PenPoint[] = [first]
  let carry = 0

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]
    const to = points[index]
    if (!from || !to) continue

    const segment = Math.hypot(to.x - from.x, to.y - from.y)
    if (segment === 0) continue

    let travelled = step - carry
    while (travelled <= segment) {
      const t = travelled / segment
      walked.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t })
      travelled += step
    }
    carry = segment - (travelled - step)
  }

  const last = points[points.length - 1]
  const tail = walked[walked.length - 1]
  if (last && tail && (tail.x !== last.x || tail.y !== last.y)) walked.push(last)
  return walked
}

function wrapToPi(angle: number): number {
  let wrapped = angle
  while (wrapped > Math.PI) wrapped -= 2 * Math.PI
  while (wrapped < -Math.PI) wrapped += 2 * Math.PI
  return wrapped
}

/**
 * Σ|change in direction| along the resampled polyline, in radians.
 *
 * DIRECTION IS SMOOTHED OVER A ±2-SAMPLE LEVER ARM, and the sum is over the change
 * BETWEEN CONSECUTIVE directions. Both halves of that sentence matter:
 *
 *  - the lever arm (a 24px chord at the default step) is what stops sampling jitter
 *    from reading as curvature — a ±1 arm measures the noise between two adjacent
 *    samples rather than the shape;
 *  - summing the CHANGE, rather than the angle between the two chords at each sample,
 *    is what stops the measure double-counting. Overlapping windows would inflate
 *    every result by roughly the lever length, so a closed convex outline would read
 *    as several revolutions. As written, a traced square reads one revolution's worth
 *    of turn (a little under, since the first and last few samples have no arm), a
 *    straight line reads 0, and an arrow's two bends read 2–3 rad — which is what the
 *    artwork floor was chosen against.
 */
export function absoluteTurning(points: readonly PenPoint[]): number {
  const path = resamplePath(points, RESAMPLE_STEP_PX)
  const first = TURN_LEVER_SAMPLES
  const last = path.length - 1 - TURN_LEVER_SAMPLES
  if (last <= first) return 0

  let total = 0
  let previous: number | null = null

  for (let index = first; index <= last; index += 1) {
    const back = path[index - TURN_LEVER_SAMPLES]
    const ahead = path[index + TURN_LEVER_SAMPLES]
    if (!back || !ahead) continue

    const dx = ahead.x - back.x
    const dy = ahead.y - back.y
    if (dx === 0 && dy === 0) continue

    const direction = Math.atan2(dy, dx)
    if (previous !== null) total += Math.abs(wrapToPi(direction - previous))
    previous = direction
  }

  return total
}

/** Max perpendicular distance from the first→last chord, as a fraction of that chord. */
export function chordDeviation(points: readonly PenPoint[]): number {
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return 0

  const dx = last.x - first.x
  const dy = last.y - first.y
  const chord = Math.hypot(dx, dy)

  let farthest = 0
  for (const point of points) {
    const distance =
      chord > 0
        ? Math.abs((point.x - first.x) * dy - (point.y - first.y) * dx) / chord
        : Math.hypot(point.x - first.x, point.y - first.y)
    farthest = Math.max(farthest, distance)
  }

  // A closed shape has a chord near zero, so this deliberately reads as a huge
  // deviation — which is the truth: it is nothing like a straight line.
  return farthest / Math.max(chord, 1)
}

/** The first→last chord's angle away from horizontal, folded into 0..90 degrees. */
export function chordTiltDeg(points: readonly PenPoint[]): number {
  const first = points[0]
  const last = points[points.length - 1]
  if (!first || !last) return 0

  const degrees = (Math.atan2(Math.abs(last.y - first.y), Math.abs(last.x - first.x)) * 180) / Math.PI
  return degrees
}

/** Monotone-chain convex hull area. Collinear or degenerate input has area 0. */
export function convexHullArea(points: readonly PenPoint[]): number {
  if (points.length < 3) return 0

  const sorted = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x))
  const cross = (o: PenPoint, a: PenPoint, b: PenPoint): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const build = (source: readonly PenPoint[]): PenPoint[] => {
    const chain: PenPoint[] = []
    for (const point of source) {
      for (;;) {
        const top = chain[chain.length - 1]
        const below = chain[chain.length - 2]
        if (!top || !below || cross(below, top, point) > 0) break
        chain.pop()
      }
      chain.push(point)
    }
    chain.pop()
    return chain
  }

  const hull = [...build(sorted), ...build([...sorted].reverse())]
  if (hull.length < 3) return 0

  let twiceArea = 0
  for (let index = 0; index < hull.length; index += 1) {
    const current = hull[index]
    const next = hull[(index + 1) % hull.length]
    if (!current || !next) continue
    twiceArea += current.x * next.y - next.x * current.y
  }
  return Math.abs(twiceArea) / 2
}

/**
 * The box grown by `by` on all four sides and clamped to the page.
 *
 * perfect-freehand paints a filled OUTLINE roughly half the pen width beyond every
 * point (`penPath.ts`), so the raw point box UNDERSTATES where the ink actually is
 * and would hand a builder coordinates that clip the mark. The page's height is
 * variable, so only the three fixed edges clamp.
 */
export function inflatedFrame(frame: InkFrame, by: number): InkFrame {
  const left = Math.max(0, frame.x - by)
  const right = Math.min(PAGE_WIDTH_PX, frame.x + frame.w + by)
  const top = Math.max(0, frame.y - by)
  const bottom = frame.y + frame.h + by
  return { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) }
}

/** Every Stage 0 measure for one stroke. `ordinal` is its position in draw order. */
export function strokeMetrics(stroke: PenStroke, ordinal: number): StrokeMetrics {
  const points = stroke.points
  const bbox = bboxOfPoints(points) ?? EMPTY_FRAME
  const first = points[0]
  const last = points[points.length - 1]
  const pathLength = pathLengthOf(points)

  return {
    id: stroke.id,
    ordinal,
    color: stroke.color,
    width: stroke.width,
    points,
    bbox,
    inkBbox: inflatedFrame(bbox, stroke.width / 2),
    pathLength,
    closureGap: first && last ? Math.hypot(last.x - first.x, last.y - first.y) : 0,
    perimeterRatio: pathLength / Math.max(2 * (bbox.w + bbox.h), 1),
    chordDev: chordDeviation(points),
    tiltDeg: chordTiltDeg(points),
    hullFill: convexHullArea(points) / Math.max(bbox.w * bbox.h, 1),
    absTurn: absoluteTurning(points),
    aspect: bbox.w / Math.max(bbox.h, 1),
  }
}
