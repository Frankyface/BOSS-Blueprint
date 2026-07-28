/**
 * SPATIAL NARRATION — `docs/export-format.md` §4.4 [N1] grouping, [N2] rows and
 * columns, [N4] position phrases, [N5] overlap suffix, [N13] right-overflow marker.
 *
 * [N2] is the brief's ONLY ordering rule for blocks: there is no flat (y, x) sort
 * anywhere in the walkthrough. Rows and columns are union-find components, which is
 * what makes a tall hero block pull the whole stack beside it into one row.
 */

import { EXPORT_PAGE_WIDTH, type ExportBlock, type ExportPage, type Frame, type SectionBlock } from '../types.ts'

import { quoteTruncated } from './text.ts'

/** §4.4 [N4] width buckets. */
export const W_FULL_MIN = 1120
export const W_WIDE_MIN = 960
export const W_HALF_MIN = 600

/** §4.4 [N4] — "centered" tolerance on |leftGap − rightGap|. */
export const CENTER_TOLERANCE = 24

/** §4.4 [N2] union thresholds, as fractions of the shorter/narrower block. */
export const ROW_OVERLAP_RATIO = 0.5
export const COLUMN_OVERLAP_RATIO = 0.5

/** §4.4 [N13] — a frame crossing this x is clipped out of the PNG (§4.3). */
export const RIGHT_CLIP_X = EXPORT_PAGE_WIDTH

/** §4.4 [N13] — the marker string, verbatim. Right edge only; negative x is V18's. */
export const OVERFLOW_MARKER =
  ' (extends past the right page edge — clipped at x=1200 in the sketch PNG; site.json has the true width)'

export type GroupKind = 'nav' | 'section' | 'outside'

export interface Group {
  readonly kind: GroupKind
  /** The section band this group narrates (`kind === 'section'` only). */
  readonly section: SectionBlock | null
  /** Top edge used for group ordering — [N1] "in order of their top edge". */
  readonly top: number
  /** Non-section members, unordered here: [N2] does the ordering. */
  readonly blocks: readonly ExportBlock[]
}

const isSection = (block: ExportBlock): block is SectionBlock => block.type === 'section'
const centerY = (block: ExportBlock): number => block.frame.y + block.frame.h / 2

/* --------------------------------------------------------------------- [N1] */

/**
 * [N1] Section grouping. Sections sorted by `frame.y`; every other block joins the
 * FIRST section whose `[y, y+h)` contains its center-y; a navBar whose center-y is
 * above the first section is captioned "Nav bar"; the rest form one "Outside any
 * section" group; groups are emitted in order of their top edge.
 *
 * v2.3 pins the two cases the rule used not to reach: a page with NO sections
 * treats the first-section boundary as +∞ (so a nav bar still gets its caption),
 * and a section band containing no blocks still emits its header, because DoD #2
 * makes the builder build every band.
 */
export function groupBlocks(page: ExportPage): Group[] {
  const sections = page.blocks.filter(isSection).slice().sort((a, b) => a.frame.y - b.frame.y)
  const firstSection = sections[0]
  const firstSectionTop = firstSection === undefined ? Number.POSITIVE_INFINITY : firstSection.frame.y

  const navBlocks: ExportBlock[] = []
  const outsideBlocks: ExportBlock[] = []
  const bySection = new Map<string, ExportBlock[]>()
  for (const section of sections) bySection.set(section.id, [])

  for (const block of page.blocks) {
    if (isSection(block)) continue
    if (block.type === 'navBar' && centerY(block) < firstSectionTop) {
      navBlocks.push(block)
      continue
    }
    const owner = sections.find(
      (section) =>
        centerY(block) >= section.frame.y && centerY(block) < section.frame.y + section.frame.h,
    )
    const bucket = owner === undefined ? undefined : bySection.get(owner.id)
    if (bucket) bucket.push(block)
    else outsideBlocks.push(block)
  }

  const groups: Group[] = []
  if (navBlocks.length > 0) {
    groups.push({
      kind: 'nav',
      section: null,
      top: Math.min(...navBlocks.map((block) => block.frame.y)),
      blocks: navBlocks,
    })
  }
  for (const section of sections) {
    groups.push({
      kind: 'section',
      section,
      top: section.frame.y,
      blocks: bySection.get(section.id) ?? [],
    })
  }
  if (outsideBlocks.length > 0) {
    groups.push({
      kind: 'outside',
      section: null,
      top: Math.min(...outsideBlocks.map((block) => block.frame.y)),
      blocks: outsideBlocks,
    })
  }
  return groups.sort((a, b) => a.top - b.top)
}

/* --------------------------------------------------------------------- [N2] */

/** Union-find over an index range; the smaller index always wins so roots are stable. */
function componentsOf(
  blocks: readonly ExportBlock[],
  shouldJoin: (a: ExportBlock, b: ExportBlock) => boolean,
): ExportBlock[][] {
  const parent = blocks.map((_, index) => index)

  const find = (index: number): number => {
    let root = index
    while ((parent[root] ?? root) !== root) root = parent[root] ?? root
    return root
  }

  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const a = blocks[i]
      const b = blocks[j]
      if (a === undefined || b === undefined || !shouldJoin(a, b)) continue
      const rootA = find(i)
      const rootB = find(j)
      if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB)
    }
  }

  const buckets = new Map<number, ExportBlock[]>()
  blocks.forEach((block, index) => {
    const root = find(index)
    const bucket = buckets.get(root)
    if (bucket) bucket.push(block)
    else buckets.set(root, [block])
  })
  return [...buckets.values()]
}

const overlap = (aStart: number, aSize: number, bStart: number, bSize: number): number =>
  Math.max(0, Math.min(aStart + aSize, bStart + bSize) - Math.max(aStart, bStart))

/** [N2] Two blocks share a row if their vertical ranges overlap by ≥50% of the SHORTER height. */
export function sharesRow(a: ExportBlock, b: ExportBlock): boolean {
  const shorter = Math.min(a.frame.h, b.frame.h)
  return overlap(a.frame.y, a.frame.h, b.frame.y, b.frame.h) >= ROW_OVERLAP_RATIO * shorter
}

/** [N2] Two blocks share a column if their horizontal ranges overlap by ≥50% of the NARROWER width. */
export function sharesColumn(a: ExportBlock, b: ExportBlock): boolean {
  const narrower = Math.min(a.frame.w, b.frame.w)
  return overlap(a.frame.x, a.frame.w, b.frame.x, b.frame.w) >= COLUMN_OVERLAP_RATIO * narrower
}

/**
 * [N2] Rows within a group, "in order of row top edge (min y of members)". Ties
 * break on document position (which is `z` order — §2.5), so the output stays
 * deterministic when two rows start at the same y.
 */
export function rowsOf(blocks: readonly ExportBlock[]): ExportBlock[][] {
  const position = new Map(blocks.map((block, index) => [block.id, index]))
  const key = (row: readonly ExportBlock[]) => ({
    top: Math.min(...row.map((block) => block.frame.y)),
    index: Math.min(...row.map((block) => position.get(block.id) ?? 0)),
  })

  return componentsOf(blocks, sharesRow).sort((a, b) => {
    const keyA = key(a)
    const keyB = key(b)
    return keyA.top - keyB.top || keyA.index - keyB.index
  })
}

/** [N2] Columns within a row: ordered by min x; blocks inside a column by (y, then x). */
export function columnsOf(row: readonly ExportBlock[]): ExportBlock[][] {
  const position = new Map(row.map((block, index) => [block.id, index]))
  const columns = componentsOf(row, sharesColumn).map((column) =>
    column
      .slice()
      .sort(
        (a, b) =>
          a.frame.y - b.frame.y ||
          a.frame.x - b.frame.x ||
          (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0),
      ),
  )
  const key = (column: readonly ExportBlock[]) => ({
    left: Math.min(...column.map((block) => block.frame.x)),
    index: Math.min(...column.map((block) => position.get(block.id) ?? 0)),
  })

  return columns.sort((a, b) => {
    const keyA = key(a)
    const keyB = key(b)
    return keyA.left - keyB.left || keyA.index - keyB.index
  })
}

/** [N2] Leftmost column is "left", rightmost "right", any others "middle". */
export function columnPlacement(index: number, count: number): string {
  if (index === 0) return 'left'
  if (index === count - 1) return 'right'
  return 'middle'
}

/* --------------------------------------------------------------------- [N4] */

/**
 * [N4] Position phrase: a width bucket, then a horizontal placement — omitted when
 * the block spans the full width, where "left" and "right" would be meaningless.
 * The exact frame numbers always follow, so no information is lost to the phrase.
 */
export function positionPhrase(frame: Frame): string {
  if (frame.w >= W_FULL_MIN) return 'spanning the full width'

  const width =
    frame.w >= W_WIDE_MIN ? 'wide' : frame.w >= W_HALF_MIN ? 'about half the width' : 'narrow'
  const leftGap = frame.x
  const rightGap = EXPORT_PAGE_WIDTH - (frame.x + frame.w)
  const horizontal =
    Math.abs(leftGap - rightGap) <= CENTER_TOLERANCE
      ? 'centered'
      : leftGap < rightGap
        ? 'on the left'
        : 'on the right'

  return `${width}, ${horizontal}`
}

/* -------------------------------------------------------------- [N5]/[N13] */

const framesIntersect = (a: ExportBlock, b: ExportBlock): boolean =>
  overlap(a.frame.x, a.frame.w, b.frame.x, b.frame.w) > 0 &&
  overlap(a.frame.y, a.frame.h, b.frame.y, b.frame.h) > 0

/**
 * [N5] Overlap suffix. Sections are exempt — everything sits on them by design.
 *
 * A block overlapping several lower blocks emits ONE SUFFIX PER OVERLAPPED BLOCK,
 * nearest paint-neighbour first (descending z) — v2.3. `X` is the overlapped
 * block's reference text (§4.4 preamble), truncated raw to 40 and escaped after.
 */
export function overlapSuffix(
  block: ExportBlock,
  page: ExportPage,
  referenceTextOf: (block: ExportBlock) => string,
): string {
  if (block.type === 'section') return ''

  return page.blocks
    .filter(
      (other) =>
        other.type !== 'section' &&
        other.id !== block.id &&
        other.z < block.z &&
        framesIntersect(other, block),
    )
    .sort((a, b) => b.z - a.z)
    .map((other) => ` (overlaps ${quoteTruncated(referenceTextOf(other))})`)
    .join('')
}

/** [N13] Right-overflow marker (v2.1) — inert on any block fully inside the page. */
export function overflowMarker(frame: Frame): string {
  return frame.x + frame.w > RIGHT_CLIP_X ? OVERFLOW_MARKER : ''
}
