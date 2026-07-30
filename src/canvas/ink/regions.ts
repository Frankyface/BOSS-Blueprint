/**
 * STAGES 4 AND 5 — SIBLING SETS, ORDER AND IDS.
 *
 * Stage 4 is the only construct in the whole module that turns two drawn boxes into
 * the RIGHT website: ONE component, instantiated twice, with identical styling —
 * rather than two boxes that happen to look alike and get built twice by hand.
 *
 * Stage 5 is what makes the output diffable. Regions come out depth-first — a panel
 * immediately followed by everything inside it — ordered by position and broken by
 * draw order, and numbered as dense ordinals, so two exports of an unchanged drawing
 * are byte-identical and a diff shows a change in the DRAWING rather than churn.
 */

import {
  CONFIDENCE_MARGIN,
  INK_ORDINAL_DIGITS,
  INK_REGION_ID_PREFIX,
  INK_SET_ID_PREFIX,
  SIBLING_ALIGN_TOL_PX,
  SIBLING_GAP_TOL_PX,
  SIBLING_MIN_MEMBERS,
  SIBLING_SIZE_TOL,
  UNDERLINE_ATTACH_PX,
} from './constants.ts'
import type { InkConfidence, InkDraft, InkFrame, InkRegion, InkRegionOptions } from './types.ts'

function ordinalId(prefix: string, ordinal: number): string {
  return `${prefix}_${String(ordinal).padStart(INK_ORDINAL_DIGITS, '0')}`
}

function centreX(frame: InkFrame): number {
  return frame.x + frame.w / 2
}

function centreY(frame: InkFrame): number {
  return frame.y + frame.h / 2
}

/** Two hand-drawn boxes are the same component when they match in size and share a line. */
function areSiblings(a: InkFrame, b: InkFrame): boolean {
  const sameWidth = Math.abs(a.w - b.w) <= SIBLING_SIZE_TOL * Math.max(a.w, b.w)
  const sameHeight = Math.abs(a.h - b.h) <= SIBLING_SIZE_TOL * Math.max(a.h, b.h)
  const aligned =
    Math.abs(centreY(a) - centreY(b)) <= SIBLING_ALIGN_TOL_PX ||
    Math.abs(centreX(a) - centreX(b)) <= SIBLING_ALIGN_TOL_PX
  return sameWidth && sameHeight && aligned
}

/**
 * The longest run of consecutive members whose gaps are all within
 * `SIBLING_GAP_TOL_PX` of each other.
 *
 * For three or more, size alone is a coincidence waiting to happen — a repeated
 * component is EVENLY spaced. Stating the rule as "the largest regular run" rather
 * than as a standard deviation over the whole set is what gives it an unambiguous
 * answer when one member is out of step: the run wins, the outlier becomes a lone
 * panel, and nothing depends on which member happened to be drawn first.
 */
function longestRegularRun(gaps: readonly number[]): { start: number; length: number } {
  if (gaps.length === 0) return { start: 0, length: 1 }

  let best = { start: 0, length: 2 }
  for (let start = 0; start < gaps.length; start += 1) {
    let low = gaps[start] ?? 0
    let high = low
    for (let end = start; end < gaps.length; end += 1) {
      const gap = gaps[end] ?? 0
      low = Math.min(low, gap)
      high = Math.max(high, gap)
      if (high - low > SIBLING_GAP_TOL_PX) break
      const length = end - start + 2
      if (length > best.length) best = { start, length }
    }
  }
  return best
}

function rightEdge(draft: InkDraft): number {
  return draft.atom.frame.x + draft.atom.frame.w
}

function bottomEdge(draft: InkDraft): number {
  return draft.atom.frame.y + draft.atom.frame.h
}

/** max − min of a set, or 0 when there is nothing to spread. How even a run is. */
function spread(values: readonly number[]): number {
  return values.length < 2 ? 0 : Math.max(...values) - Math.min(...values)
}

/**
 * Members clustered along one centre axis: sorted, then cut wherever two adjacent
 * centres sit more than the alignment tolerance apart. One row of a grid shares a
 * centreY; one column shares a centreX.
 */
function clusterByCentre(
  group: readonly InkDraft[],
  centre: (draft: InkDraft) => number,
): InkDraft[][] {
  const sorted = [...group].sort((a, b) => centre(a) - centre(b) || a.atom.ordinal - b.atom.ordinal)
  const clusters: InkDraft[][] = []
  for (const draft of sorted) {
    const last = clusters[clusters.length - 1]
    const previous = last?.[last.length - 1]
    if (last && previous && centre(draft) - centre(previous) <= SIBLING_ALIGN_TOL_PX) last.push(draft)
    else clusters.push([draft])
  }
  return clusters
}

/**
 * A REGULAR GRID of identical cards read row-major, or `null` when the group is a
 * single row/column or an irregular scatter — those fall through to `singleAxisRun`.
 *
 * A grid of N identical cards is still ONE component used N times: a 2×2 features grid
 * or a 2×3 pricing grid is the same claim as two cards side by side, just tiled. The
 * single-axis run below can only ever keep one row or one column of a grid, so without
 * this the other cells lose their `setId` and get built as unrelated panels. Fires ONLY
 * for a true two-dimensional grid — more than one row AND more than one column, every
 * row the same width, columns aligned across rows, and both the row and column gaps
 * evenly spaced — so every one-row / one-column set, which is every case the existing
 * tests pin, still takes the unchanged single-axis path.
 */
function gridOrder(group: readonly InkDraft[]): readonly InkDraft[] | null {
  const rows = clusterByCentre(group, (draft) => centreY(draft.atom.frame))
  const cols = clusterByCentre(group, (draft) => centreX(draft.atom.frame))
  if (rows.length < 2 || cols.length < 2) return null
  if (rows.length * cols.length !== group.length) return null

  const width = cols.length
  const rowsByX = rows.map((row) =>
    [...row].sort(
      (a, b) => centreX(a.atom.frame) - centreX(b.atom.frame) || a.atom.ordinal - b.atom.ordinal,
    ),
  )
  if (rowsByX.some((row) => row.length !== width)) return null

  // Columns line up across every row — a real grid, not a staggered scatter.
  for (let column = 0; column < width; column += 1) {
    const centres = rowsByX.flatMap((row) => {
      const cell = row[column]
      return cell ? [centreX(cell.atom.frame)] : []
    })
    if (spread(centres) > SIBLING_ALIGN_TOL_PX) return null
  }

  // "A repeated component is evenly spaced", one axis each: column gaps from the top
  // row, row gaps from the left column.
  const top = rowsByX[0] ?? []
  const colGaps = top.slice(1).flatMap((cell, index) => {
    const previous = top[index]
    return previous ? [cell.atom.frame.x - rightEdge(previous)] : []
  })
  const left = rowsByX.flatMap((row) => (row[0] ? [row[0]] : []))
  const rowGaps = left.slice(1).flatMap((cell, index) => {
    const previous = left[index]
    return previous ? [cell.atom.frame.y - bottomEdge(previous)] : []
  })
  if (spread(colGaps) > SIBLING_GAP_TOL_PX || spread(rowGaps) > SIBLING_GAP_TOL_PX) return null

  return rowsByX.flat()
}

/**
 * The single row-or-column reduction: order the group along its long axis, then keep
 * the longest evenly-spaced run (dropping an outlier that breaks the rhythm). This is
 * the whole of the pre-grid behaviour, extracted unchanged so the grid path sits beside
 * it rather than replacing it.
 */
function singleAxisRun(group: readonly InkDraft[]): readonly InkDraft[] {
  const isRow =
    Math.max(...group.map((panel) => centreY(panel.atom.frame))) -
      Math.min(...group.map((panel) => centreY(panel.atom.frame))) <=
    SIBLING_ALIGN_TOL_PX
  const ordered = [...group].sort((a, b) =>
    isRow
      ? a.atom.frame.x - b.atom.frame.x || a.atom.ordinal - b.atom.ordinal
      : a.atom.frame.y - b.atom.frame.y || a.atom.ordinal - b.atom.ordinal,
  )

  const gaps = ordered.slice(1).map((panel, index) => {
    const previous = ordered[index]?.atom.frame
    if (!previous) return 0
    return isRow
      ? panel.atom.frame.x - (previous.x + previous.w)
      : panel.atom.frame.y - (previous.y + previous.h)
  })
  const run = ordered.length > 2 ? longestRegularRun(gaps) : { start: 0, length: ordered.length }
  return ordered.slice(run.start, run.start + run.length)
}

interface SetMembership {
  readonly setId: string
  readonly setIndex: number
}

/** Stage 4 over the page's TOP-LEVEL panels. Nested cards are their parent's business. */
function siblingSets(
  panels: readonly InkDraft[],
  firstSetOrdinal: number,
): ReadonlyMap<string, SetMembership> {
  const parent = panels.map((_, index) => index)
  const find = (index: number): number => {
    let root = index
    while ((parent[root] ?? root) !== root) root = parent[root] ?? root
    return root
  }

  for (let i = 0; i < panels.length; i += 1) {
    for (let j = i + 1; j < panels.length; j += 1) {
      const a = panels[i]
      const b = panels[j]
      if (!a || !b || !areSiblings(a.atom.frame, b.atom.frame)) continue
      const rootA = find(i)
      const rootB = find(j)
      if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB)
    }
  }

  const groups = new Map<number, InkDraft[]>()
  panels.forEach((panel, index) => {
    const root = find(index)
    const group = groups.get(root)
    if (group) group.push(panel)
    else groups.set(root, [panel])
  })

  const membership = new Map<string, SetMembership>()
  let ordinal = firstSetOrdinal

  for (const group of groups.values()) {
    if (group.length < SIBLING_MIN_MEMBERS) continue

    // A true 2-D grid keeps all N cells; anything else reduces to one regular row/column.
    const regular = gridOrder(group) ?? singleAxisRun(group)
    if (regular.length < SIBLING_MIN_MEMBERS) continue

    const setId = ordinalId(INK_SET_ID_PREFIX, ordinal)
    ordinal += 1
    regular.forEach((panel, index) => {
      membership.set(panel.atom.key, { setId, setIndex: index })
    })
  }

  return membership
}

/** Depth-first: a parent, then everything it contains, then the next parent. */
function orderDrafts(drafts: readonly InkDraft[]): readonly InkDraft[] {
  const byParent = new Map<string, InkDraft[]>()
  for (const draft of drafts) {
    const key = draft.atom.parentKey ?? ''
    const siblings = byParent.get(key)
    if (siblings) siblings.push(draft)
    else byParent.set(key, [draft])
  }

  const inReadingOrder = (group: readonly InkDraft[]): InkDraft[] =>
    [...group].sort(
      (a, b) =>
        a.atom.frame.y - b.atom.frame.y ||
        a.atom.frame.x - b.atom.frame.x ||
        a.atom.ordinal - b.atom.ordinal,
    )

  const emitted: InkDraft[] = []
  const seen = new Set<string>()
  const walk = (parentKey: string): void => {
    for (const draft of inReadingOrder(byParent.get(parentKey) ?? [])) {
      if (seen.has(draft.atom.key)) continue
      seen.add(draft.atom.key)
      emitted.push(draft)
      walk(draft.atom.key)
    }
  }
  walk('')

  // A child whose parent is missing would otherwise vanish from the walk, and losing
  // the client's work is the one unacceptable outcome. Anything unvisited is appended
  // in reading order rather than dropped.
  const orphans = inReadingOrder(drafts.filter((draft) => !seen.has(draft.atom.key)))
  return [...emitted, ...orphans]
}

function confidenceOf(draft: InkDraft): InkConfidence {
  if (draft.forcedClear) return 'clear'
  if (draft.forcedUnsure) return 'unsure'
  if (draft.margin === null) return 'unsure'
  return draft.margin >= CONFIDENCE_MARGIN ? 'clear' : 'unsure'
}

/** Stages 4 and 5: drafts in, the page's finished regions out. */
export function emitRegions(
  drafts: readonly InkDraft[],
  options: InkRegionOptions,
): readonly InkRegion[] {
  const ordered = orderDrafts(drafts)
  const sets = siblingSets(
    ordered.filter((draft) => draft.kind === 'panel' && draft.atom.parentKey === null),
    options.firstSetOrdinal ?? 1,
  )

  const idOf = new Map<string, string>()
  ordered.forEach((draft, index) => {
    idOf.set(draft.atom.key, ordinalId(INK_REGION_ID_PREFIX, (options.firstRegionOrdinal ?? 1) + index))
  })

  const regions = ordered.map((draft): InkRegion => {
    const membership = sets.get(draft.atom.key)
    return {
      id: idOf.get(draft.atom.key) ?? '',
      kind: draft.kind,
      variant: draft.variant,
      frame: draft.atom.frame,
      color: draft.atom.color,
      strokeIds: draft.atom.members.map((member) => member.id),
      parentId: draft.atom.parentKey ? (idOf.get(draft.atom.parentKey) ?? null) : null,
      confidence: confidenceOf(draft),
      setId: membership?.setId ?? null,
      setIndex: membership?.setIndex ?? null,
      align: draft.align,
      words: draft.words?.length ?? null,
      lines: draft.lines,
      glyphHeight: draft.glyphHeight,
      attachedToId: null,
    }
  })

  return attachUnderlines(regions)
}

/**
 * An underline belongs to the writing it sits beneath. Resolved last, because it is
 * the one field that names another region and therefore needs the ids to exist.
 */
function attachUnderlines(regions: readonly InkRegion[]): readonly InkRegion[] {
  return regions.map((region) => {
    if (region.kind !== 'rule' || region.variant !== 'underline') return region

    let nearest: InkRegion | null = null
    for (const other of regions) {
      if (other.kind !== 'writing' && other.kind !== 'navRow') continue
      const above = region.frame.y - (other.frame.y + other.frame.h)
      if (above < 0 || above > UNDERLINE_ATTACH_PX) continue
      const overlaps =
        Math.min(region.frame.x + region.frame.w, other.frame.x + other.frame.w) >
        Math.max(region.frame.x, other.frame.x)
      if (!overlaps) continue
      if (nearest === null || above < region.frame.y - (nearest.frame.y + nearest.frame.h)) {
        nearest = other
      }
    }
    return nearest === null ? region : { ...region, attachedToId: nearest.id }
  })
}
