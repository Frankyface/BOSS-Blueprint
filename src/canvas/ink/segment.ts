/**
 * STAGES 1 AND 2 — EXCLUSION AND SEGMENTATION.
 *
 * Stage 1 asks which ink is NOT design. Both of its rules are POSITIVE reasons rather
 * than heuristics: ink inside a photo slot is a sketch OF the photo (§4.5), and ink
 * touching a real block is a note ABOUT that block. What survives is the CANDIDATE set.
 *
 * Stage 2 groups the candidates into atoms — a scope, a colour family, a stroke set
 * and a box — in four passes, each of which exists because the one before it cannot
 * do its job:
 *
 *   A. COLOUR is the only signal that separates two ink objects whose boxes OVERLAP,
 *      where every proximity constant is powerless because the gap is zero. It costs
 *      nothing: `PenStroke.color` is already a required, already-serialized field.
 *   B. ENCLOSURES (`enclosure.ts`) are found next, because a container changes what
 *      "near" means for everything inside it.
 *   C. CONTAINMENT gives every mark a scope, and two scopes never compare — which is
 *      what makes two pricing cards independent no matter how narrow the gutter.
 *   D. PROXIMITY then clusters only within one scope and one family.
 *
 * Pure and total: every candidate ends up in exactly one atom.
 */

import type { PenStroke } from '../types.ts'

import {
  CLUSTER_GAP_X_PX,
  CLUSTER_GAP_Y_PX,
  CONTAINMENT_RATIO,
  INK_IMAGE_SKETCH_AREA_RATIO,
  INK_MAX_STROKES,
  MAX_CONTAINMENT_DEPTH,
} from './constants.ts'
import { enclosuresOfFamily } from './enclosure.ts'
import {
  boxesOverlapInclusive,
  containedRatio,
  frameGapX,
  frameGapY,
  framesOfMembers,
  strokeMetrics,
} from './metrics.ts'
import type { InkAtom, InkBlock, InkFrame, StrokeMetrics } from './types.ts'

/**
 * §4.5's IMAGE-SLOT LOCK, as a pure predicate. A stroke this far inside a photo slot
 * is a sketch of the photo; the export already narrates it that way, and promoting it
 * to a region would tell a builder to construct the client's doodle.
 */
export function isImageSlotSketch(box: InkFrame, blocks: readonly InkBlock[]): boolean {
  return blocks.some(
    (block) =>
      block.type === 'imageSlot' && containedRatio(box, block.frame) >= INK_IMAGE_SKETCH_AREA_RATIO,
  )
}

/**
 * THE BLOCK-OVERLAP VETO, as a pure predicate. One rule doing three jobs:
 *
 *  - it keeps "circle this button to emphasise it" an annotation — the classic case a
 *    wrong build would ruin;
 *  - it is far NARROWER than a nearest-block radius, so a card drawn 100px below a
 *    real block is STILL a region. A radius rule would delete the client's drawn cards
 *    on any page that also has blocks;
 *  - it is what keeps the frozen export byte-neutral: on the normative §7.1 fixture
 *    the button and the annotation overlap by 3920 px², so the annotation leaves here.
 *
 * Overlap is `boxesOverlapInclusive`, NOT a raw `intersectionArea > 0`: a stroke drawn
 * dead-straight across a block has a bbox of zero height (or width), so its area — and
 * hence its `intersectionArea` with anything — is 0. That stroke is still a note ABOUT
 * the block it crosses, and the veto now catches it instead of shipping it as a `rule`.
 *
 * SECTIONS ARE EXEMPT, for the same reason §4.5 exempts them from the annotation
 * guess: a full-width band always overlaps, so vetoing on one would veto the page.
 */
export function isBlockOverlapVetoed(box: InkFrame, blocks: readonly InkBlock[]): boolean {
  return blocks.some((block) => block.type !== 'section' && boxesOverlapInclusive(box, block.frame))
}

/** Stage 1 — the strokes that are still candidates to BE something, in draw order. */
export function inkCandidates(
  blocks: readonly InkBlock[],
  strokes: readonly PenStroke[],
): readonly StrokeMetrics[] {
  return strokes
    .map((stroke, ordinal) => strokeMetrics(stroke, ordinal))
    .filter((measured) => measured.points.length > 0)
    .filter((measured) => !isImageSlotSketch(measured.bbox, blocks))
    .filter((measured) => !isBlockOverlapVetoed(measured.bbox, blocks))
}

interface Primitive {
  readonly key: string
  readonly members: readonly StrokeMetrics[]
  readonly bbox: InkFrame
  readonly frame: InkFrame
  readonly color: string
  readonly ordinal: number
  readonly margin: number
}

/** `atom_<lowest member ordinal>` is unique because atoms partition the candidates. */
function primitiveOf(members: readonly StrokeMetrics[], margin: number): Primitive {
  const ordinal = Math.min(...members.map((member) => member.ordinal))
  const { bbox, frame } = framesOfMembers(members)
  return {
    key: `atom_${String(ordinal)}`,
    members,
    bbox,
    frame,
    color: members[0]?.color ?? '',
    ordinal,
    margin,
  }
}

function area(frame: InkFrame): number {
  return frame.w * frame.h
}

/**
 * Pass C — the smallest enclosure that holds enough of a box claims it.
 *
 * CLAIMING DELIBERATELY CROSSES COLOUR FAMILIES even though DETECTION does not: a red
 * box legitimately holds blue writing, and a client who switched pens mid-sketch has
 * not changed what is inside what. This is the one place the family rule is crossed,
 * and it is crossed on purpose.
 *
 * Only a STRICTLY LARGER enclosure may claim, so two boxes of equal area can never
 * claim each other and no cycle can form. Ties in size go to the earlier draw.
 */
function claimant(box: InkFrame, own: string, enclosures: readonly Primitive[]): string | null {
  let best: Primitive | null = null
  for (const enclosure of enclosures) {
    if (enclosure.key === own) continue
    if (area(enclosure.bbox) <= area(box)) continue
    if (containedRatio(box, enclosure.bbox) < CONTAINMENT_RATIO) continue
    if (
      best === null ||
      area(enclosure.bbox) < area(best.bbox) ||
      (area(enclosure.bbox) === area(best.bbox) && enclosure.ordinal < best.ordinal)
    ) {
      best = enclosure
    }
  }
  return best?.key ?? null
}

/** Nesting past the cap collapses onto the deepest ancestor still inside it. */
function cappedParents(
  enclosures: readonly Primitive[],
  rawParent: ReadonlyMap<string, string | null>,
): ReadonlyMap<string, string | null> {
  const chainOf = (key: string): string[] => {
    const chain: string[] = []
    let cursor = rawParent.get(key) ?? null
    while (cursor !== null && !chain.includes(cursor)) {
      chain.push(cursor)
      cursor = rawParent.get(cursor) ?? null
    }
    return chain
  }

  const capped = new Map<string, string | null>()
  for (const enclosure of enclosures) {
    const chain = chainOf(enclosure.key)
    // `chain[0]` is the immediate parent, so a chain of length N means depth N.
    // Keeping the ancestor at `length - cap` puts this one at exactly the cap.
    const keep = chain.length <= MAX_CONTAINMENT_DEPTH ? 0 : chain.length - MAX_CONTAINMENT_DEPTH
    capped.set(enclosure.key, chain[keep] ?? null)
  }
  return capped
}

/**
 * Pass D — union-find within one (scope, family), on the TRUE bbox gap.
 *
 * ANISOTROPIC, and the asymmetry is the point. This is a DIFFERENT function from the
 * shipped `boxesIntersect` in `src/export/brief/pen.ts`, which expands BOTH boxes and
 * therefore tolerates 80px of true gap in every direction. Letters and words must join
 * sideways readily; a heading must NOT swallow the nav row drawn 40px beneath it.
 */
function clusterLoose(group: readonly StrokeMetrics[]): readonly (readonly StrokeMetrics[])[] {
  const parent = group.map((_, index) => index)
  const find = (index: number): number => {
    let root = index
    while ((parent[root] ?? root) !== root) root = parent[root] ?? root
    return root
  }

  for (let i = 0; i < group.length; i += 1) {
    for (let j = i + 1; j < group.length; j += 1) {
      const a = group[i]
      const b = group[j]
      if (!a || !b) continue
      if (frameGapX(a.bbox, b.bbox) > CLUSTER_GAP_X_PX) continue
      if (frameGapY(a.bbox, b.bbox) > CLUSTER_GAP_Y_PX) continue
      const rootA = find(i)
      const rootB = find(j)
      if (rootA !== rootB) parent[Math.max(rootA, rootB)] = Math.min(rootA, rootB)
    }
  }

  const buckets = new Map<number, StrokeMetrics[]>()
  group.forEach((member, index) => {
    const root = find(index)
    const bucket = buckets.get(root)
    if (bucket) bucket.push(member)
    else buckets.set(root, [member])
  })
  return [...buckets.values()]
}

/** Stage 2 — candidates in, atoms out. Empty past the perf bound, by design. */
export function segmentInk(candidates: readonly StrokeMetrics[]): readonly InkAtom[] {
  if (candidates.length === 0 || candidates.length > INK_MAX_STROKES) return []

  const families = new Map<string, StrokeMetrics[]>()
  for (const candidate of candidates) {
    const family = families.get(candidate.color)
    if (family) family.push(candidate)
    else families.set(candidate.color, [candidate])
  }

  const enclosures: Primitive[] = []
  const loose: StrokeMetrics[] = []
  for (const family of families.values()) {
    const split = enclosuresOfFamily(family)
    for (const found of split.enclosures) enclosures.push(primitiveOf(found.members, found.margin))
    loose.push(...split.loose)
  }
  enclosures.sort((a, b) => a.ordinal - b.ordinal)

  const parents = cappedParents(
    enclosures,
    new Map(
      enclosures.map((enclosure) => [
        enclosure.key,
        claimant(enclosure.bbox, enclosure.key, enclosures),
      ]),
    ),
  )

  const scoped = new Map<string, { scope: string | null; members: StrokeMetrics[] }>()
  for (const member of loose) {
    const scope = claimant(member.bbox, '', enclosures)
    // `|` separates the two halves of the key: an atom key is `atom_<digits>` and a
    // colour is `#rrggbb`, so neither can contain it and two scopes can never collide.
    const key = `${scope ?? ''}|${member.color}`
    const bucket = scoped.get(key)
    if (bucket) bucket.members.push(member)
    else scoped.set(key, { scope, members: [member] })
  }

  const atoms: InkAtom[] = enclosures.map((enclosure) => ({
    key: enclosure.key,
    color: enclosure.color,
    members: enclosure.members,
    bbox: enclosure.bbox,
    frame: enclosure.frame,
    isEnclosure: true,
    enclosureMargin: enclosure.margin,
    parentKey: parents.get(enclosure.key) ?? null,
    ordinal: enclosure.ordinal,
  }))

  for (const { scope, members } of scoped.values()) {
    for (const cluster of clusterLoose(members)) {
      const ordered = [...cluster].sort((a, b) => a.ordinal - b.ordinal)
      const primitive = primitiveOf(ordered, 0)
      atoms.push({
        key: primitive.key,
        color: primitive.color,
        members: ordered,
        bbox: primitive.bbox,
        frame: primitive.frame,
        isEnclosure: false,
        enclosureMargin: 0,
        parentKey: scope,
        ordinal: primitive.ordinal,
      })
    }
  }

  return atoms.sort((a, b) => a.ordinal - b.ordinal)
}

/** Stages 1 and 2 together: a page's blocks and strokes in, atoms out. */
export function inkAtoms(
  blocks: readonly InkBlock[],
  strokes: readonly PenStroke[],
): readonly InkAtom[] {
  return segmentInk(inkCandidates(blocks, strokes))
}
