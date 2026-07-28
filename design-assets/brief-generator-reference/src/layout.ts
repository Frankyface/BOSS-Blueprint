/**
 * Spatial narration algorithms.
 * docs/export-format.md §4.4 [N1] grouping, [N2] rows/columns, [N4] position
 * phrases, [N5] overlap suffix, [N13] right-overflow marker.
 */

import type { Block, Page, SectionBlock } from './types.ts';
import { frameTuple, quoteTruncated } from './text.ts';

/** §0.2 fixed constants. */
export const PAGE_WIDTH = 1200;

/** §4.4 [N4] width buckets. */
export const W_FULL_MIN = 1120;
export const W_WIDE_MIN = 960;
export const W_HALF_MIN = 600;
/** §4.4 [N4] "centered" tolerance on |leftGap − rightGap|. */
export const CENTER_TOLERANCE = 24;
/** §4.4 [N2] union thresholds. */
export const ROW_OVERLAP_RATIO = 0.5;
export const COLUMN_OVERLAP_RATIO = 0.5;
/** §4.4 [N13] — a frame crossing this x is clipped in the PNG (§4.3). */
export const RIGHT_CLIP_X = 1200;

export type GroupKind = 'nav' | 'section' | 'outside';

export interface Group {
  kind: GroupKind;
  /** The section band this group narrates (kind === 'section' only). */
  section: SectionBlock | null;
  /** Top edge used for group ordering (§4.4 [N1] "in order of their top edge"). */
  top: number;
  /** Non-section blocks in the group, unordered here — [N2] orders them. */
  blocks: Block[];
}

const isSection = (b: Block): b is SectionBlock => b.type === 'section';
const centerY = (b: Block): number => b.frame.y + b.frame.h / 2;

/* ------------------------------------------------------------------ [N1] */

/**
 * [N1] Section grouping. Sections sorted by `frame.y`; every other block joins
 * the FIRST section whose `[y, y+h)` contains its center-y; a navBar whose
 * center-y is above the first section is captioned "Nav bar"; blocks in no
 * section band form the single "Outside any section" group; groups are emitted
 * in order of their top edge.
 */
export function groupBlocks(page: Page): Group[] {
  const sections = page.blocks.filter(isSection).slice().sort((a, b) => a.frame.y - b.frame.y);
  // README D8: with zero sections there is no "first section" to be above, so
  // the nav caption would never apply. Treating the boundary as +Infinity keeps
  // the "Nav bar:" caption on a section-less page, which is what a builder needs.
  const firstSectionTop = sections.length > 0 ? sections[0].frame.y : Number.POSITIVE_INFINITY;

  const navBlocks: Block[] = [];
  const outsideBlocks: Block[] = [];
  const bySection = new Map<string, Block[]>();
  for (const s of sections) bySection.set(s.id, []);

  for (const block of page.blocks) {
    if (isSection(block)) continue;
    if (block.type === 'navBar' && centerY(block) < firstSectionTop) {
      navBlocks.push(block);
      continue;
    }
    const owner = sections.find(
      (s) => centerY(block) >= s.frame.y && centerY(block) < s.frame.y + s.frame.h,
    );
    if (owner) bySection.get(owner.id)!.push(block);
    else outsideBlocks.push(block);
  }

  const groups: Group[] = [];
  if (navBlocks.length > 0) {
    groups.push({
      kind: 'nav',
      section: null,
      top: Math.min(...navBlocks.map((b) => b.frame.y)),
      blocks: navBlocks,
    });
  }
  for (const s of sections) {
    // README D9: a section band with no blocks still gets its header — DoD item
    // 2 requires the builder to build every band.
    groups.push({ kind: 'section', section: s, top: s.frame.y, blocks: bySection.get(s.id)! });
  }
  if (outsideBlocks.length > 0) {
    groups.push({
      kind: 'outside',
      section: null,
      top: Math.min(...outsideBlocks.map((b) => b.frame.y)),
      blocks: outsideBlocks,
    });
  }
  return groups.slice().sort((a, b) => a.top - b.top);
}

/* ------------------------------------------------------------------ [N2] */

class UnionFind {
  private readonly parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root];
    return root;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

function components(blocks: Block[], shouldJoin: (a: Block, b: Block) => boolean): Block[][] {
  const uf = new UnionFind(blocks.length);
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      if (shouldJoin(blocks[i], blocks[j])) uf.union(i, j);
    }
  }
  const buckets = new Map<number, Block[]>();
  blocks.forEach((block, i) => {
    const root = uf.find(i);
    const bucket = buckets.get(root);
    if (bucket) bucket.push(block);
    else buckets.set(root, [block]);
  });
  return [...buckets.values()];
}

const overlap = (aStart: number, aSize: number, bStart: number, bSize: number): number =>
  Math.max(0, Math.min(aStart + aSize, bStart + bSize) - Math.max(aStart, bStart));

/** [N2] two blocks share a row if their vertical ranges overlap by ≥50% of the shorter height. */
export function sharesRow(a: Block, b: Block): boolean {
  const shorter = Math.min(a.frame.h, b.frame.h);
  return overlap(a.frame.y, a.frame.h, b.frame.y, b.frame.h) >= ROW_OVERLAP_RATIO * shorter;
}

/** [N2] two blocks share a column if their horizontal ranges overlap by ≥50% of the narrower width. */
export function sharesColumn(a: Block, b: Block): boolean {
  const narrower = Math.min(a.frame.w, b.frame.w);
  return overlap(a.frame.x, a.frame.w, b.frame.x, b.frame.w) >= COLUMN_OVERLAP_RATIO * narrower;
}

/**
 * [N2] Rows within a group, emitted "in order of row top edge (min `y` of
 * members)". Ties are broken by the members' document position (z order, since
 * `blocks[]` is sorted by z — §2.5) so the output stays deterministic.
 */
export function rowsOf(groupBlocksIn: Block[]): Block[][] {
  const order = new Map(groupBlocksIn.map((b, i) => [b.id, i]));
  const rows = components(groupBlocksIn, sharesRow);
  const key = (row: Block[]) => ({
    top: Math.min(...row.map((b) => b.frame.y)),
    idx: Math.min(...row.map((b) => order.get(b.id)!)),
  });
  return rows.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka.top - kb.top || ka.idx - kb.idx;
  });
}

/**
 * [N2] Columns within a row: "order columns by min `x`; order blocks within a
 * column by `(y, then x)`".
 */
export function columnsOf(row: Block[]): Block[][] {
  const order = new Map(row.map((b, i) => [b.id, i]));
  const columns = components(row, sharesColumn).map((col) =>
    col
      .slice()
      .sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x || order.get(a.id)! - order.get(b.id)!),
  );
  const key = (col: Block[]) => ({
    left: Math.min(...col.map((b) => b.frame.x)),
    idx: Math.min(...col.map((b) => order.get(b.id)!)),
  });
  return columns.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka.left - kb.left || ka.idx - kb.idx;
  });
}

/** [N2] leftmost column is "left", rightmost "right", any others "middle". */
export function columnPlacement(index: number, count: number): string {
  if (index === 0) return 'left';
  if (index === count - 1) return 'right';
  return 'middle';
}

/* ------------------------------------------------------------------ [N4] */

/** [N4] Position phrase: width bucket, then horizontal placement (omitted when full-width). */
export function positionPhrase(frame: Block['frame']): string {
  const { x, w } = frame;
  if (w >= W_FULL_MIN) return 'spanning the full width';
  const width = w >= W_WIDE_MIN ? 'wide' : w >= W_HALF_MIN ? 'about half the width' : 'narrow';
  const leftGap = x;
  const rightGap = PAGE_WIDTH - (x + w);
  const horizontal =
    Math.abs(leftGap - rightGap) <= CENTER_TOLERANCE
      ? 'centered'
      : leftGap < rightGap
        ? 'on the left'
        : 'on the right';
  return `${width}, ${horizontal}`;
}

/* ------------------------------------------------------------- [N5]/[N13] */

const intersects = (a: Block, b: Block): boolean =>
  overlap(a.frame.x, a.frame.w, b.frame.x, b.frame.w) > 0 &&
  overlap(a.frame.y, a.frame.h, b.frame.y, b.frame.h) > 0;

/**
 * [N5] Overlap suffix. Sections are exempt (everything sits on them by design).
 *
 * README D10: [N5] is written in the singular ("append `(overlaps «X»)`") and
 * does not say what to do when a block overlaps several lower blocks. This
 * implementation appends one suffix per overlapped block, nearest paint-neighbour
 * first (descending z), which loses no information and keeps rule 2's regex happy.
 */
export function overlapSuffix(block: Block, page: Page, textOf: (b: Block) => string): string {
  if (block.type === 'section') return '';
  const lower = page.blocks
    .filter((b) => b.type !== 'section' && b.id !== block.id && b.z < block.z && intersects(b, block))
    .sort((a, b) => b.z - a.z);
  return lower.map((b) => ` (overlaps ${quoteTruncated(textOf(b))})`).join('');
}

/** [N13] Right-overflow marker (v2.1) — inert on any block fully inside the page. */
export function overflowMarker(frame: Block['frame']): string {
  if (frame.x + frame.w <= RIGHT_CLIP_X) return '';
  return ' (extends past the right page edge — clipped at x=1200 in the sketch PNG; site.json has the true width)';
}

/** Re-exported for callers that build bullets. */
export { frameTuple };
