/**
 * PEN CLUSTERS AND THEIR NARRATION — `docs/export-format.md` §4.4 [N7], §4.5
 * (clusters are a brief-only derivation) and §3.2's three normative branch texts.
 *
 * The imageSketch branch splits on the target slot's `assetId` because the two
 * cases mean opposite things: on an EMPTY slot the drawing depicts the desired
 * image; on a FILLED slot it is an instruction ABOUT the upload (framing, crop,
 * emphasis) and never a request to replace it.
 */

import type { ExportBlock, ExportPage, ExportPenStroke, ImageSlotBlock } from '../types.ts'

import { PROSE_TYPE_LABEL, referenceText } from './narration.ts'
import { frameTuple, quote, quoteTruncated } from './text.ts'

/** [N7] two strokes join when their bboxes, each expanded by this, intersect. */
export const CLUSTER_EXPAND_PX = 40

interface Bbox {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

function bboxOf(strokes: readonly ExportPenStroke[]): Bbox {
  const xs = strokes.flatMap((stroke) => stroke.points.map((point) => point[0]))
  const ys = strokes.flatMap((stroke) => stroke.points.map((point) => point[1]))
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  }
}

/** [N7] intersection is INCLUSIVE (v2.3): expanded boxes that merely touch join. */
function boxesIntersect(a: Bbox, b: Bbox, expand: number): boolean {
  return (
    a.minX - expand <= b.maxX + expand &&
    b.minX - expand <= a.maxX + expand &&
    a.minY - expand <= b.maxY + expand &&
    b.minY - expand <= a.maxY + expand
  )
}

export interface Cluster {
  readonly strokes: readonly ExportPenStroke[]
  readonly bbox: Bbox
  /** [N7] `imageSketch` iff every member is an imageSketch targeting the same slot. */
  readonly role: 'annotation' | 'imageSketch'
  /** The slot for an imageSketch cluster; the guessed nearest block for an annotation. */
  readonly targetBlockId: string | null
}

/** [N7] Union-find over a page's strokes; clusters ordered by cluster-bbox top edge. */
export function clustersOf(page: ExportPage): Cluster[] {
  const strokes = page.penStrokes.filter((stroke) => stroke.points.length > 0)
  if (strokes.length === 0) return []

  const parent = strokes.map((_, index) => index)
  const find = (index: number): number => {
    let root = index
    while ((parent[root] ?? root) !== root) root = parent[root] ?? root
    return root
  }

  const boxes = strokes.map((stroke) => bboxOf([stroke]))
  for (let i = 0; i < strokes.length; i += 1) {
    for (let j = i + 1; j < strokes.length; j += 1) {
      const boxA = boxes[i]
      const boxB = boxes[j]
      if (boxA === undefined || boxB === undefined) continue
      if (!boxesIntersect(boxA, boxB, CLUSTER_EXPAND_PX)) continue
      const rootA = find(i)
      const rootB = find(j)
      if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB)
    }
  }

  const buckets = new Map<number, ExportPenStroke[]>()
  strokes.forEach((stroke, index) => {
    const root = find(index)
    const bucket = buckets.get(root)
    if (bucket) bucket.push(stroke)
    else buckets.set(root, [stroke])
  })

  return [...buckets.values()]
    .map((members): Cluster => {
      const first = members[0]
      const allSketch =
        first !== undefined &&
        first.targetBlockId !== null &&
        members.every(
          (stroke) =>
            stroke.role === 'imageSketch' && stroke.targetBlockId === first.targetBlockId,
        )

      return {
        strokes: members,
        bbox: bboxOf(members),
        role: allSketch ? 'imageSketch' : 'annotation',
        // v2.3: for a multi-stroke ANNOTATION cluster the printed guess is that of
        // the first stroke in draw order with a non-null target; if no member has
        // one, the guess clause is omitted entirely.
        targetBlockId: allSketch
          ? (first?.targetBlockId ?? null)
          : (members.find((stroke) => stroke.targetBlockId !== null)?.targetBlockId ?? null),
      }
    })
    .sort((a, b) => a.bbox.minY - b.bbox.minY)
}

/** [N7] "Annotation bboxes print as `(x, y, w, h)` rounded to integers." */
function bboxTuple(bbox: Bbox): string {
  return (
    `(${String(Math.round(bbox.minX))}, ${String(Math.round(bbox.minY))}, ` +
    `${String(Math.round(bbox.maxX - bbox.minX))}, ${String(Math.round(bbox.maxY - bbox.minY))})`
  )
}

/**
 * [N7] The nearest-block guess names the block's type, its REFERENCE TEXT
 * (truncated raw to 40, then escaped) and THE BLOCK'S OWN FRAME — never the stroke
 * bbox, which would tell the builder the mark is where it isn't.
 */
function guessClause(target: ExportBlock): string {
  return (
    ` — the nearest block is the ${PROSE_TYPE_LABEL[target.type]} ` +
    `${quoteTruncated(referenceText(target))} ${frameTuple(target.frame)}, but the mark may be ` +
    `about something else`
  )
}

/** §3.2 — the three normative pen-cluster branch texts, one bullet each. */
export function clusterBullet(cluster: Cluster, page: ExportPage): string {
  const count = cluster.strokes.length
  const target = page.blocks.find((block) => block.id === cluster.targetBlockId)

  if (cluster.role === 'imageSketch' && target !== undefined && target.type === 'imageSlot') {
    const slot: ImageSlotBlock = target
    if (slot.assetId === null) {
      // §3.2's empty-slot branch quotes the description IN FULL: [N7]'s
      // truncate-to-40 applies only to the nearest-block guess.
      const withWords =
        slot.description === null ? '' : `, alongside their words: ${quote(slot.description)}`
      return (
        `- Inside the empty image slot at ${frameTuple(slot.frame)}: the client *drew what the ` +
        `image should contain* — ${String(count)} stroke(s). Look at \`${page.screenshot}\` and treat the ` +
        `drawing as a picture of the desired image${withWords}.`
      )
    }
    return (
      `- Drawn on top of the uploaded photo in the image slot at ${frameTuple(slot.frame)}: ` +
      `${String(count)} stroke(s). **Keep the uploaded photo** — the drawing is an instruction about it ` +
      `(framing, crop, emphasis), never a replacement. Read it in \`${page.screenshot}\` and ` +
      `record your reading in BUILD_NOTES.md.`
    )
  }

  const guess = target === undefined ? '' : guessClause(target)
  return (
    `- A handwritten annotation, ${String(count)} stroke(s), bounding box ${bboxTuple(cluster.bbox)}` +
    `${guess}. **Read it in \`${page.screenshot}\`** — it may be words, an arrow, or an emphasis ` +
    `mark. If legible, follow it (it outranks everything — see Your role) and log it under ` +
    `"Pen instructions followed"; if not, build what the JSON/PNG show and log it under ` +
    `"Pen marks I could not read" with the page and coordinates.`
  )
}
