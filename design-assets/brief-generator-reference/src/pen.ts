/**
 * Pen clusters and their narration.
 * docs/export-format.md §4.4 [N7], §4.5 (clusters, brief only), §3.2 template
 * (the three normative cluster branch texts).
 */

import type { Block, ImageSlotBlock, Page, PenStroke } from './types.ts';
import { frameTuple, quote, quoteTruncated } from './text.ts';
import { PROSE_TYPE_LABEL, blockDisplayText } from './narration.ts';

/** [N7] union-find joins two strokes whose bboxes, each expanded by this, intersect. */
export const CLUSTER_EXPAND_PX = 40;

interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function bboxOf(strokes: PenStroke[]): Bbox {
  const xs = strokes.flatMap((s) => s.points.map((p) => p[0]));
  const ys = strokes.flatMap((s) => s.points.map((p) => p[1]));
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

/**
 * README D14: "intersect" is taken inclusively (touching expanded boxes join).
 * The spec does not pin the boundary; the fixture's two clusters are 128px apart
 * so it cannot discriminate.
 */
function boxesIntersect(a: Bbox, b: Bbox, expand: number): boolean {
  return (
    a.minX - expand <= b.maxX + expand &&
    b.minX - expand <= a.maxX + expand &&
    a.minY - expand <= b.maxY + expand &&
    b.minY - expand <= a.maxY + expand
  );
}

export interface Cluster {
  strokes: PenStroke[];
  bbox: Bbox;
  /** [N7] `imageSketch` iff every member stroke is imageSketch targeting the same slot. */
  role: 'annotation' | 'imageSketch';
  /** The slot for an imageSketch cluster; the (guessed) nearest block for an annotation. */
  targetBlockId: string | null;
}

/** [N7] Union-find over a page's strokes; clusters ordered by cluster-bbox top edge. */
export function clustersOf(page: Page): Cluster[] {
  const strokes = page.penStrokes;
  if (strokes.length === 0) return [];
  const parent = strokes.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r];
    return r;
  };
  const boxes = strokes.map((s) => bboxOf([s]));
  for (let i = 0; i < strokes.length; i += 1) {
    for (let j = i + 1; j < strokes.length; j += 1) {
      if (!boxesIntersect(boxes[i], boxes[j], CLUSTER_EXPAND_PX)) continue;
      const ri = find(i);
      const rj = find(j);
      if (ri !== rj) parent[Math.max(ri, rj)] = Math.min(ri, rj);
    }
  }
  const buckets = new Map<number, PenStroke[]>();
  strokes.forEach((stroke, i) => {
    const root = find(i);
    const bucket = buckets.get(root);
    if (bucket) bucket.push(stroke);
    else buckets.set(root, [stroke]);
  });

  const clusters: Cluster[] = [...buckets.values()].map((members) => {
    const first = members[0];
    const allSketch =
      members.every((s) => s.role === 'imageSketch') &&
      members.every((s) => s.targetBlockId === first.targetBlockId) &&
      first.targetBlockId !== null;
    return {
      strokes: members,
      bbox: bboxOf(members),
      role: allSketch ? 'imageSketch' : 'annotation',
      // README D15: for a multi-stroke annotation cluster the spec does not say
      // which member's guess to print; the first stroke in draw order with a
      // non-null target is used.
      targetBlockId: allSketch
        ? first.targetBlockId
        : (members.find((s) => s.targetBlockId !== null)?.targetBlockId ?? null),
    };
  });
  return clusters.sort((a, b) => a.bbox.minY - b.bbox.minY);
}

/** [N7] "Annotation bboxes print as `(x, y, w, h)` rounded to integers." */
function bboxTuple(bbox: Bbox): string {
  return (
    `(${Math.round(bbox.minX)}, ${Math.round(bbox.minY)}, ` +
    `${Math.round(bbox.maxX - bbox.minX)}, ${Math.round(bbox.maxY - bbox.minY)})`
  );
}

/** §3.2 — the three normative pen-cluster branch texts, as one bullet each. */
export function clusterBullet(cluster: Cluster, page: Page): string {
  const count = cluster.strokes.length;
  const target = page.blocks.find((b) => b.id === cluster.targetBlockId);

  if (cluster.role === 'imageSketch' && target && target.type === 'imageSlot') {
    const slot: ImageSlotBlock = target;
    if (slot.assetId === null) {
      // §3.2 empty-slot branch quotes «{{description}}» in full: [N7]'s
      // truncate-to-40 clause applies only to the nearest-block guess.
      const withWords = slot.description
        ? `, alongside their words: ${quote(slot.description)}`
        : '';
      return (
        `- Inside the empty image slot at ${frameTuple(slot.frame)}: the client *drew what the ` +
        `image should contain* — ${count} stroke(s). Look at \`${page.screenshot}\` and treat the ` +
        `drawing as a picture of the desired image${withWords}.`
      );
    }
    return (
      `- Drawn on top of the uploaded photo in the image slot at ${frameTuple(slot.frame)}: ` +
      `${count} stroke(s). **Keep the uploaded photo** — the drawing is an instruction about it ` +
      `(framing, crop, emphasis), never a replacement. Read it in \`${page.screenshot}\` and ` +
      `record your reading in BUILD_NOTES.md.`
    );
  }

  const guess = target ? guessClause(target) : '';
  return (
    `- A handwritten annotation, ${count} stroke(s), bounding box ${bboxTuple(cluster.bbox)}` +
    `${guess}. **Read it in \`${page.screenshot}\`** — it may be words, an arrow, or an emphasis ` +
    `mark. If legible, follow it (it outranks everything — see Your role) and log it under ` +
    `"Pen instructions followed"; if not, build what the JSON/PNG show and log it under ` +
    `"Pen marks I could not read" with the page and coordinates.`
  );
}

/**
 * [N7] "the nearest-block guess names the target block's type, its text/label
 * (escaped, truncated 40), and **the block's own frame** — never conflating it
 * with the stroke bbox".
 */
function guessClause(target: Block): string {
  return (
    ` — the nearest block is the ${PROSE_TYPE_LABEL[target.type]} ` +
    `${quoteTruncated(blockDisplayText(target))} ${frameTuple(target.frame)}, but the mark may be ` +
    `about something else`
  );
}
