import type { PenPoint } from './types.ts'

/**
 * POINT THINNING — how a raw pointer trail becomes a storable stroke.
 *
 * A 2-second scribble at 120Hz is ~240 samples, most of them a fraction of a pixel
 * apart. Left alone they bloat every autosave (localStorage gives us ~5MB total)
 * and every exported `site.json`. Ramer–Douglas–Peucker drops the points that lie
 * on the line their neighbours already describe, which is exactly the redundancy
 * hand-drawn input produces.
 *
 * WHERE THIS HAPPENS, plainly: a stroke is thinned ONCE, on pointerup, before it
 * reaches the document. There is no second, fatter copy anywhere — the in-memory
 * strokes ARE the thinned strokes, and so are the autosaved, exported and
 * PNG-rendered ones.
 *
 * `docs/export-format.md` §4.5 runs RDP again at package time with ε = 0.75px.
 * Because we already thinned tighter here (ε = 0.5px), that second pass is
 * near-idempotent rather than a real reduction — measured on a real drawn stroke:
 * 93 points in, 94 out (RDP is not monotone in the number of points it keeps, so
 * a wider epsilon can pick a different, marginally larger, subset). Nothing a
 * client could see at 1:1 is lost at either step.
 *
 * Pure: points in, points out, no store and no DOM.
 */

/** Perpendicular distance below which a point is redundant. See the note above. */
export const PEN_THINNING_EPSILON_PX = 0.5

/**
 * Samples closer together than this are dropped BEFORE the RDP pass.
 *
 * Two reasons, and the second one matters more than it looks. (1) A high-rate
 * pointer emits many sub-pixel samples that survive RDP as near-duplicates and
 * then collapse anyway at the rounding step. (2) RDP is O(n log n) on typical
 * input but O(n²) in the worst case, and it runs on pointerup while the client
 * waits. This pre-pass bounds `n` by the stroke's LENGTH IN PIXELS rather than by
 * how fast their hardware sampled — so a slow tablet and a 1000Hz gaming mouse
 * cost the same, and a stroke long enough to be slow is one no hand can draw.
 */
export const MIN_SAMPLE_DISTANCE_PX = 0.75

/** Coordinates are rounded to this many decimals, matching the export (§2.9). */
export const PEN_POINT_DECIMALS = 1

const DECIMAL_BASE = 10

/** The export schema requires at least two points, so a tap is stored as a dot. */
export const MIN_STROKE_POINTS = 2

/** Squared perpendicular distance from `point` to the segment `start`–`end`. */
function squaredDistanceToSegment(point: PenPoint, start: PenPoint, end: PenPoint): number {
  const dx = end.x - start.x
  const dy = end.y - start.y

  // A zero-length segment: fall back to the distance to its single endpoint.
  const lengthSquared = dx * dx + dy * dy
  const projection =
    lengthSquared === 0 ? 0 : ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared

  const clamped = projection < 0 ? 0 : projection > 1 ? 1 : projection
  const offsetX = point.x - (start.x + clamped * dx)
  const offsetY = point.y - (start.y + clamped * dy)

  return offsetX * offsetX + offsetY * offsetY
}

/**
 * Ramer–Douglas–Peucker, iteratively.
 *
 * An EXPLICIT STACK rather than recursion: a long stroke that happens to be nearly
 * straight recurses once per point in the worst case, and blowing the JS stack
 * mid-gesture would lose the client's mark.
 */
export function simplifyPoints(
  points: readonly PenPoint[],
  epsilon: number = PEN_THINNING_EPSILON_PX,
): readonly PenPoint[] {
  if (points.length <= MIN_STROKE_POINTS) return points

  const keep = new Array<boolean>(points.length).fill(false)
  const lastIndex = points.length - 1
  keep[0] = true
  keep[lastIndex] = true

  const toleranceSquared = epsilon * epsilon
  const stack: [number, number][] = [[0, lastIndex]]

  while (stack.length > 0) {
    const segment = stack.pop()
    if (!segment) break

    const [from, to] = segment
    const start = points[from]
    const end = points[to]
    if (!start || !end) continue

    let furthest = -1
    let furthestDistance = 0

    for (let index = from + 1; index < to; index += 1) {
      const candidate = points[index]
      if (!candidate) continue

      const distance = squaredDistanceToSegment(candidate, start, end)
      if (distance > furthestDistance) {
        furthest = index
        furthestDistance = distance
      }
    }

    if (furthest < 0 || furthestDistance <= toleranceSquared) continue

    keep[furthest] = true
    stack.push([from, furthest], [furthest, to])
  }

  return points.filter((_, index) => keep[index] === true)
}

/**
 * Drop samples that land within `minDistance` of the last one kept. The first and
 * last points always survive: a stroke has to start and end where the client's
 * hand did.
 */
export function withoutTinySteps(
  points: readonly PenPoint[],
  minDistance: number = MIN_SAMPLE_DISTANCE_PX,
): readonly PenPoint[] {
  if (points.length <= MIN_STROKE_POINTS) return points

  const minimumSquared = minDistance * minDistance
  const kept: PenPoint[] = []
  let anchor = points[0]
  if (!anchor) return points
  kept.push(anchor)

  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]
    if (!point) continue

    const dx = point.x - anchor.x
    const dy = point.y - anchor.y
    if (dx * dx + dy * dy < minimumSquared) continue

    kept.push(point)
    anchor = point
  }

  const last = points[points.length - 1]
  if (last) kept.push(last)
  return kept
}

export function roundCoordinate(value: number, decimals: number = PEN_POINT_DECIMALS): number {
  const factor = DECIMAL_BASE ** decimals
  return Math.round(value * factor) / factor
}

function roundPoint(point: PenPoint): PenPoint {
  return { x: roundCoordinate(point.x), y: roundCoordinate(point.y) }
}

/** Drop points that rounding has just made identical to the one before them. */
function withoutRepeats(points: readonly PenPoint[]): readonly PenPoint[] {
  return points.filter((point, index) => {
    const previous = points[index - 1]
    return !previous || previous.x !== point.x || previous.y !== point.y
  })
}

/**
 * The whole commit-time pipeline: drop sub-pixel samples, simplify, round,
 * de-duplicate, and guarantee the two points the export schema requires. A single
 * tap becomes a two-point dot rather than being thrown away — a deliberate mark is
 * still a mark.
 */
export function thinStroke(
  points: readonly PenPoint[],
  epsilon: number = PEN_THINNING_EPSILON_PX,
): readonly PenPoint[] {
  if (points.length === 0) return []

  const sampled = withoutTinySteps(points)
  const thinned = withoutRepeats(simplifyPoints(sampled, epsilon).map(roundPoint))

  const last = thinned[thinned.length - 1]
  if (thinned.length >= MIN_STROKE_POINTS || !last) return thinned

  return [...thinned, last]
}
