/**
 * §5 V28 — `penRegions` INTEGRITY.
 *
 * A bug-class BLOCK, in its own module because it is the only §5 rule that walks a
 * whole sub-structure rather than checking a field: five independent halves — the
 * strokes a region cites, the parent it names, the set it belongs to, the sub-kind
 * it claims, and the order the array is in — each of which can fail on its own and
 * each of which names exactly what drifted.
 *
 * Nothing here is anything a client did. Every clause restates a property the
 * producer guarantees by construction, which is precisely the point:
 * `src/canvas/ink/` and `src/export/penRegions.ts` are the only things that can
 * break them, and a package that shipped one broken would tell a builder to
 * construct something `site.json` does not describe.
 */

import { PANEL_CARD_VARIANT, PANEL_MEDIA_VARIANT } from '../../penRegions.ts'
import { intersectionArea, strokeBbox, type Bbox } from '../../penRoles.ts'
import type { ExportPage, ExportPenRegion, Frame } from '../../types.ts'
import { finding, type Finding, type PackageBundle } from '../types.ts'

/** Inclusive interval intersection: `[aStart, aEnd] ∩ [bStart, bEnd] ≠ ∅`, touching counts. */
function intervalsIntersect(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

/**
 * The block-overlap predicate, re-proving the §4.5 veto on the shipped geometry —
 * robust to a zero-extent stroke.
 *
 * A dead-straight stroke has a bbox with one axis of length 0, so its AREA is 0 and
 * `intersectionArea(...) > 0` can NEVER fire on it — the single most common thing a
 * client draws slipped past the re-proof, so a producer that leaked a region built
 * from such a stroke over a block went uncaught here too. The predicate now follows
 * `metrics.ts`/`penRoles.ts` `containedRatio`'s house pattern: where the bbox has
 * area, the area test is unchanged; where it does not, the overlap is read one axis at
 * a time, inclusively. This changes behaviour ONLY for zero-area bboxes, so every
 * non-degenerate stroke — and therefore §7.1 — is byte-identical.
 */
function overlapsFrame(box: Bbox, frame: Frame): boolean {
  if (box.w * box.h > 0) return intersectionArea(box, frame) > 0
  return (
    intervalsIntersect(box.x, box.x + box.w, frame.x, frame.x + frame.w) &&
    intervalsIntersect(box.y, box.y + box.h, frame.y, frame.y + frame.h)
  )
}

/**
 * V28 — how deep a region may sit, DERIVED rather than chosen.
 *
 * `src/canvas/ink/segment.ts` caps an enclosure's ancestor chain at
 * `MAX_CONTAINMENT_DEPTH` (2) — a card inside a section, and no further. Loose ink
 * is then parented to the DEEPEST enclosure that claims it, without a cap of its
 * own, so handwriting inside that innermost card sits one level below it. Three
 * ancestors is therefore the producer's real ceiling; anything past it is a bug in
 * the parent graph, not a client who nested boxes enthusiastically.
 */
export const MAX_REGION_ANCESTORS = 3

/** A repeated component is at least two instances; one instance is just a panel. */
const MIN_SET_MEMBERS = 2

/** How many ancestors a region has, or `null` when the chain loops. */
function ancestorDepth(
  region: ExportPenRegion,
  byId: ReadonlyMap<string, ExportPenRegion>,
): number | null {
  const seen = new Set<string>([region.id])
  let cursor = region.parentRegionId
  let depth = 0

  while (cursor !== null) {
    if (seen.has(cursor)) return null
    seen.add(cursor)
    depth += 1
    cursor = byId.get(cursor)?.parentRegionId ?? null
  }
  return depth
}

/**
 * The strokes half: every citation resolves, nothing is claimed twice, and no
 * region was built from ink §4.5 already ruled out. The last two clauses re-prove
 * the image-slot lock and the block-overlap veto ON THE SHIPPED GEOMETRY, which is
 * the only place they can be checked without trusting the producer that ran them.
 *
 * The first two are also what make §2.9's scope rule well-founded — `role` and
 * `targetBlockId` describe only the ink no region claimed, so "claimed" must be a
 * property of each stroke and not a judgement call. A dangling citation or a stroke
 * claimed twice would leave a mark whose reading depends on which region a consumer
 * happened to look at first.
 */
function strokeProblems(page: ExportPage): string[] {
  const problems: string[] = []
  const strokeById = new Map(page.penStrokes.map((stroke) => [stroke.id, stroke]))
  const vetoing = page.blocks.filter((block) => block.type !== 'section')
  const claimedBy = new Map<string, string>()

  for (const region of page.penRegions ?? []) {
    for (const strokeId of region.strokeIds) {
      const stroke = strokeById.get(strokeId)
      if (stroke === undefined) {
        problems.push(`${region.id} cites ${strokeId}, which is not a stroke on ${page.id}`)
        continue
      }

      const owner = claimedBy.get(strokeId)
      if (owner === undefined) claimedBy.set(strokeId, region.id)
      else problems.push(`${strokeId} is claimed by both ${owner} and ${region.id}`)

      if (stroke.role === 'imageSketch') {
        problems.push(`${region.id} claims ${strokeId}, whose role is imageSketch — §4.5 ink about a photo is never a region`)
      }

      const box = strokeBbox(stroke.points.map(([x, y]) => ({ x, y })))
      const hit = box === null ? undefined : vetoing.find((block) => overlapsFrame(box, block.frame))
      if (hit !== undefined) {
        problems.push(`${region.id} claims ${strokeId}, which overlaps ${hit.id} — the block-overlap veto should have left it an annotation`)
      }
    }
  }
  return problems
}

/** The parent half: resolvable, not self, not cyclic, not deeper than the cap. */
function parentProblems(page: ExportPage): string[] {
  const regions = page.penRegions ?? []
  const byId = new Map(regions.map((region) => [region.id, region]))

  return regions.flatMap((region) => {
    const parentId = region.parentRegionId
    if (parentId === null) return []
    if (parentId === region.id) return [`${region.id} is its own parent`]
    if (!byId.has(parentId)) return [`${region.id} names parent ${parentId}, which is not a region on ${page.id}`]

    const depth = ancestorDepth(region, byId)
    if (depth === null) return [`${region.id} sits in a parent cycle`]
    return depth > MAX_REGION_ANCESTORS
      ? [`${region.id} nests ${String(depth)} deep; the containment cap admits at most ${String(MAX_REGION_ANCESTORS)}`]
      : []
  })
}

/**
 * The set half. A `setId` is the whole reason this feature exists — "ONE component,
 * instantiated N times" — so a malformed one is worse than none: it would have a
 * builder emit a component with a hole in its instance list.
 */
function setProblems(page: ExportPage): string[] {
  const problems: string[] = []
  const members = new Map<string, (number | null)[]>()

  for (const region of page.penRegions ?? []) {
    if (region.setId === null) {
      if (region.setIndex !== null) problems.push(`${region.id} has setIndex ${String(region.setIndex)} but no setId`)
      continue
    }
    members.set(region.setId, [...(members.get(region.setId) ?? []), region.setIndex])
  }

  for (const [setId, indexes] of members) {
    if (indexes.length < MIN_SET_MEMBERS) {
      problems.push(`${setId} has ${String(indexes.length)} member(s); a repeated component needs at least ${String(MIN_SET_MEMBERS)}`)
      continue
    }
    const dense = indexes.map((_, position) => position).join(', ')
    const actual = [...indexes].sort((a, b) => (a ?? -1) - (b ?? -1)).join(', ')
    if (actual !== dense) problems.push(`${setId} is indexed [${actual}]; a set of ${String(indexes.length)} must be [${dense}]`)
  }
  return problems
}

/**
 * The variant half (§4.9.10) — a `panel`'s sub-kind against the tree it sits in.
 *
 * `card` and `mediaBox` are the same `kind`, the same shape and the same geometry:
 * the ONE thing that separates a drawn pricing card from an empty drawn box is
 * whether anything is drawn inside it, and [N14] builds them as two different
 * elements — a styled container, or an `<img>` placeholder the builder has to
 * source a picture for. A producer that mislabelled one would put a photo where
 * the client wrote their prices, and nothing else in the package would notice.
 *
 * Stated as a CONTRADICTION check, not as a required value: `variant` is a free
 * producer string (§6.2) and a consumer must tolerate one it does not know, so an
 * unknown variant — or none — is silence here, exactly as it is for a consumer.
 */
function variantProblems(page: ExportPage): string[] {
  const regions = page.penRegions ?? []
  const withContents = new Set(
    regions.flatMap((region) => (region.parentRegionId === null ? [] : [region.parentRegionId])),
  )

  return regions.flatMap((region) => {
    if (region.kind !== 'panel') return []
    const hasContents = withContents.has(region.id)

    if (region.variant === PANEL_CARD_VARIANT && !hasContents) {
      return [
        `${region.id} is variant ${PANEL_CARD_VARIANT} but no region sits inside it; a box drawn empty is variant ${PANEL_MEDIA_VARIANT} — the brief builds it as a media placeholder`,
      ]
    }
    if (region.variant === PANEL_MEDIA_VARIANT && hasContents) {
      return [
        `${region.id} is variant ${PANEL_MEDIA_VARIANT} but regions sit inside it; a box with contents is a ${PANEL_CARD_VARIANT}`,
      ]
    }
    return []
  })
}

/**
 * The order half — depth first, a parent immediately followed by everything inside
 * it. Checked by replaying the walk over the array's OWN sibling order and
 * comparing: that pins the tree shape (parents first, subtrees contiguous) without
 * re-deriving the producer's reading-order sort, which is the ink module's business
 * and would be a second implementation of it here.
 *
 * Skipped when the parent graph is already broken — the replay could not cover
 * every region, and "out of order" would be a misleading second symptom of a cause
 * `parentProblems` has already named.
 */
function orderProblems(page: ExportPage): string[] {
  const regions = page.penRegions ?? []
  if (parentProblems(page).length > 0) return []

  const children = new Map<string, ExportPenRegion[]>()
  for (const region of regions) {
    const key = region.parentRegionId ?? ''
    children.set(key, [...(children.get(key) ?? []), region])
  }

  const walked: string[] = []
  const walk = (key: string): void => {
    for (const child of children.get(key) ?? []) {
      walked.push(child.id)
      walk(child.id)
    }
  }
  walk('')

  const actual = regions.map((region) => region.id)
  return walked.join(',') === actual.join(',')
    ? []
    : [`penRegions are not in depth-first order: [${actual.join(', ')}] should walk as [${walked.join(', ')}]`]
}

/**
 * V28 — `penRegions` integrity, page by page.
 *
 * DELIBERATELY REFERENTIAL, not a total partition of the page's ink. The ink
 * module emits nothing at all past its 400-stroke performance bound, and a
 * "every stroke belongs to a region" invariant would turn that deliberate,
 * documented silence into a client-facing BLOCK. Nothing is lost by the weaker
 * rule: every unclaimed stroke is still narrated by the [N7] cluster bullets,
 * which cover the rest of the page by construction.
 */
export function v28PenRegions({ site }: PackageBundle): Finding[] {
  return site.pages.flatMap((page) =>
    [
      ...strokeProblems(page),
      ...parentProblems(page),
      ...setProblems(page),
      ...variantProblems(page),
      ...orderProblems(page),
    ].map((problem) => finding('V28', 'BLOCK', 'bug', `${page.id}: ${problem}`, [page.id])),
  )
}
