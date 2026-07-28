/**
 * PEN-STROKE SEMANTICS — `docs/export-format.md` §4.5.
 *
 * Role and target are COMPUTED at export and never stored: they are derived from
 * geometry, and geometry moves. A stroke drawn inside an image slot that the client
 * later drags away is no longer an image sketch, and a stored role would say it
 * still is.
 *
 * The 60% rule is pure geometry — `assetId` plays no part. What an imageSketch
 * MEANS branches on the slot's `assetId` at narration time ([N7]), which is a
 * different question asked in a different module.
 */

import { simplifyPoints } from '../canvas/penThinning.ts'
import type { PenPoint, PenStroke } from '../canvas/types.ts'

import type { ExportBlock, ExportPenStroke, Frame } from './types.ts'

/** §4.5 — a stroke whose bbox lies at least this far inside one slot is a sketch of it. */
export const IMAGE_SKETCH_AREA_RATIO = 0.6

/** §4.5 — an annotation with no overlap looks this far for a block to guess at. */
export const NEAREST_BLOCK_RADIUS_PX = 200

/**
 * §4.5 — the export's own RDP pass. Commit-time thinning already ran at ε = 0.5px
 * (`src/canvas/penThinning.ts`), so this is near-idempotent by design; it exists so
 * the export contract holds even if the editor's parameters ever drift.
 */
export const EXPORT_RDP_EPSILON_PX = 0.75

/** §2.9 — points are rounded to one decimal to cap the payload. */
const POINT_DECIMALS = 1

export interface Bbox {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

export function strokeBbox(points: readonly PenPoint[]): Bbox | null {
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

function overlap1D(aStart: number, aSize: number, bStart: number, bSize: number): number {
  return Math.max(0, Math.min(aStart + aSize, bStart + bSize) - Math.max(aStart, bStart))
}

function intersectionArea(box: Bbox, frame: Frame): number {
  return (
    overlap1D(box.x, box.w, frame.x, frame.w) * overlap1D(box.y, box.h, frame.y, frame.h)
  )
}

/**
 * How much of the stroke's bbox lies inside `frame`, as a ratio of the bbox's area.
 *
 * A perfectly straight stroke has a zero-area bbox, which would make every ratio
 * `0/0`. Such a stroke is treated by its EXTENT instead — the 1-D overlap fraction
 * along whichever axis has length — so a straight line drawn across a photo still
 * reads as a sketch of it rather than falling through to "annotation".
 */
export function containedRatio(box: Bbox, frame: Frame): number {
  const area = box.w * box.h
  if (area > 0) return intersectionArea(box, frame) / area

  if (box.w > 0) return overlap1D(box.x, box.w, frame.x, frame.w) / box.w
  if (box.h > 0) return overlap1D(box.y, box.h, frame.y, frame.h) / box.h

  // A single dot: inside or not, no fraction about it.
  const inside =
    box.x >= frame.x && box.x <= frame.x + frame.w && box.y >= frame.y && box.y <= frame.y + frame.h
  return inside ? 1 : 0
}

function centerDistance(box: Bbox, frame: Frame): number {
  const dx = box.x + box.w / 2 - (frame.x + frame.w / 2)
  const dy = box.y + box.h / 2 - (frame.y + frame.h / 2)
  return Math.hypot(dx, dy)
}

export interface StrokeRole {
  readonly role: 'annotation' | 'imageSketch'
  readonly targetBlockId: string | null
}

/**
 * §4.5 per-stroke role. `blocks` are the page's EXPORT blocks, so the returned
 * `targetBlockId` is already a public `blk_NNNN` id — the remap and the role
 * derivation cannot disagree because they read the same list.
 */
export function strokeRole(box: Bbox | null, blocks: readonly ExportBlock[]): StrokeRole {
  if (box === null) return { role: 'annotation', targetBlockId: null }

  const slot = blocks.find(
    (block) => block.type === 'imageSlot' && containedRatio(box, block.frame) >= IMAGE_SKETCH_AREA_RATIO,
  )
  if (slot) return { role: 'imageSketch', targetBlockId: slot.id }

  let bestOverlap: { id: string; area: number } | null = null
  for (const block of blocks) {
    const area = intersectionArea(box, block.frame)
    if (area <= 0) continue
    if (bestOverlap === null || area > bestOverlap.area) bestOverlap = { id: block.id, area }
  }
  if (bestOverlap) return { role: 'annotation', targetBlockId: bestOverlap.id }

  let nearest: { id: string; distance: number } | null = null
  for (const block of blocks) {
    const distance = centerDistance(box, block.frame)
    if (distance > NEAREST_BLOCK_RADIUS_PX) continue
    if (nearest === null || distance < nearest.distance) nearest = { id: block.id, distance }
  }
  return { role: 'annotation', targetBlockId: nearest?.id ?? null }
}

function roundCoordinate(value: number): number {
  const factor = 10 ** POINT_DECIMALS
  return Math.round(value * factor) / factor
}

/** §4.5 point geometry as it reaches the package: RDP at ε = 0.75px, 1 decimal. */
export function exportPoints(points: readonly PenPoint[]): (readonly [number, number])[] {
  return simplifyPoints(points, EXPORT_RDP_EPSILON_PX).map(
    (point) => [roundCoordinate(point.x), roundCoordinate(point.y)] as const,
  )
}

/** One document stroke as its `site.json` form, given the page's export blocks. */
export function toExportStroke(
  stroke: PenStroke,
  exportId: string,
  blocks: readonly ExportBlock[],
): ExportPenStroke {
  const points = exportPoints(stroke.points)
  const { role, targetBlockId } = strokeRole(
    strokeBbox(points.map(([x, y]) => ({ x, y }))),
    blocks,
  )

  return {
    id: exportId,
    points,
    color: stroke.color,
    width: stroke.width,
    role,
    targetBlockId,
  }
}
