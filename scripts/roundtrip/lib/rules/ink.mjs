/**
 * export-format.md §5 V28-V31 — the rules that arrived with `penRegions`.
 *
 * THE HARNESS TWIN of `src/export/validate/rules/inkRegions.ts` (V28),
 * `warnings.ts` (V29, V31) and `briefCrossCheck.ts` (V30). The gate is a deliberately independent program: it has
 * its own lockfile and imports no app code, so a rule that exists only on the app
 * side is a rule a shipped zip was never checked against. The two implementations
 * must agree clause for clause; where they cannot, the difference is stated in a
 * comment rather than left to be discovered by a red gate twelve minutes after a
 * green unit suite.
 */

import { check } from '../report.mjs';
import { pagesOf, blocksOf, strokesOf, regionsOf } from './walk.mjs';
import { BUILD_FROM_INK_RE, countMatches } from '../brief-parse.mjs';
import { strokeBbox, boxesIntersectInclusive } from '../geometry.mjs';

/** §4.2 — the page height cap the editor and the schema both enforce. */
const MAX_PAGE_HEIGHT = 8000;

/** §4.2 — the floor, the 8px grid, and the padding below the lowest content. */
const MIN_PAGE_HEIGHT = 1600;
const GRID = 8;
const PAGE_BOTTOM_PADDING = 160;

/** §4.3 — a page PNG's long edge as the builder's reader receives it. */
const VISION_LONG_EDGE = 2576;

/** Below this, in the pixels actually delivered, handwriting stops resolving. */
const READABLE_MIN_PX = 24;

/** §0.2 — the design width of a page, and therefore its short edge. */
const PAGE_WIDTH = 1200;

/**
 * `src/canvas/ink/segment.ts` caps an enclosure chain at 2 ancestors, and loose ink
 * hangs one level below the deepest enclosure that claims it. Three is the
 * producer's real ceiling.
 */
const MAX_ANCESTORS = 3;

const MIN_SET_MEMBERS = 2;

/** §4.9.10 — the two `panel` sub-kinds. Restated, not imported: no app code here. */
const PANEL_CARD_VARIANT = 'card';
const PANEL_MEDIA_VARIANT = 'mediaBox';

function intersectionArea(a, b) {
  const overlap = (aStart, aSize, bStart, bSize) =>
    Math.max(0, Math.min(aStart + aSize, bStart + bSize) - Math.max(aStart, bStart));
  return overlap(a.x, a.w, b.x, b.w) * overlap(a.y, a.h, b.y, b.h);
}

/**
 * The block-overlap veto, re-proved on the shipped geometry — robust to a zero-extent
 * stroke.
 *
 * A dead-straight stroke has a zero-extent axis and therefore zero AREA, so an
 * area-only test (`intersectionArea(...) > 0`) can never fire on it — the single most
 * common thing a client draws slipped the re-proof, so a producer that leaked a region
 * built from such a stroke over a block went uncaught here too. The predicate now
 * follows the house pattern (`src/canvas/ink/metrics.ts` `containedRatio`): where the
 * bbox has area, the area test is unchanged; where it does not, the overlap is read
 * one axis at a time, INCLUSIVELY (`boxesIntersectInclusive`). Behaviour changes only
 * for zero-area bboxes; every non-degenerate stroke is untouched.
 */
function overlapsFrame(box, frame) {
  if (box.w * box.h > 0) return intersectionArea(box, frame) > 0;
  return boxesIntersectInclusive(box, frame);
}

/**
 * Every citation resolves, nothing is claimed twice, and §4.5's exclusions held.
 * The first two also make §2.9's scope rule well-founded — `role` describes only
 * the ink no region claimed, so "claimed" must be a property of each stroke and not
 * a judgement call about which region a consumer looked at first.
 */
function strokeProblems(page) {
  const problems = [];
  const byId = new Map(strokesOf(page).map((s) => [s?.id, s]));
  const vetoing = blocksOf(page).filter((b) => b?.type !== 'section');
  const claimedBy = new Map();

  for (const region of regionsOf(page)) {
    for (const strokeId of Array.isArray(region?.strokeIds) ? region.strokeIds : []) {
      const stroke = byId.get(strokeId);
      if (stroke === undefined) {
        problems.push(`${region.id} cites ${strokeId}, which is not a stroke on ${page.id}`);
        continue;
      }

      const owner = claimedBy.get(strokeId);
      if (owner === undefined) claimedBy.set(strokeId, region.id);
      else problems.push(`${strokeId} is claimed by both ${owner} and ${region.id}`);

      if (stroke.role === 'imageSketch') {
        problems.push(
          `${region.id} claims ${strokeId}, whose role is imageSketch — §4.5 ink about a photo is never a region`,
        );
      }

      const box = strokeBbox(stroke);
      const hit = box === null ? undefined : vetoing.find((b) => b?.frame && overlapsFrame(box, b.frame));
      if (hit !== undefined) {
        problems.push(
          `${region.id} claims ${strokeId}, which overlaps ${hit.id} — the block-overlap veto should have left it an annotation`,
        );
      }
    }
  }
  return problems;
}

function ancestorDepth(region, byId) {
  const seen = new Set([region.id]);
  let cursor = region.parentRegionId ?? null;
  let depth = 0;
  while (cursor !== null) {
    if (seen.has(cursor)) return null;
    seen.add(cursor);
    depth += 1;
    cursor = byId.get(cursor)?.parentRegionId ?? null;
  }
  return depth;
}

/** Resolvable on this page, not itself, not a cycle, not deeper than the cap. */
function parentProblems(page) {
  const regions = regionsOf(page);
  const byId = new Map(regions.map((r) => [r?.id, r]));
  const problems = [];

  for (const region of regions) {
    const parentId = region?.parentRegionId ?? null;
    if (parentId === null) continue;
    if (parentId === region.id) {
      problems.push(`${region.id} is its own parent`);
      continue;
    }
    if (!byId.has(parentId)) {
      problems.push(`${region.id} names parent ${parentId}, which is not a region on ${page.id}`);
      continue;
    }
    const depth = ancestorDepth(region, byId);
    if (depth === null) problems.push(`${region.id} sits in a parent cycle`);
    else if (depth > MAX_ANCESTORS) {
      problems.push(`${region.id} nests ${depth} deep; the containment cap admits at most ${MAX_ANCESTORS}`);
    }
  }
  return problems;
}

/** A `setId` is "one component, N instances" — a hole in the list is a broken build. */
function setProblems(page) {
  const problems = [];
  const members = new Map();

  for (const region of regionsOf(page)) {
    const setId = region?.setId ?? null;
    if (setId === null) {
      if (region?.setIndex !== null && region?.setIndex !== undefined) {
        problems.push(`${region.id} has setIndex ${region.setIndex} but no setId`);
      }
      continue;
    }
    members.set(setId, [...(members.get(setId) ?? []), region.setIndex ?? null]);
  }

  for (const [setId, indexes] of members) {
    if (indexes.length < MIN_SET_MEMBERS) {
      problems.push(
        `${setId} has ${indexes.length} member(s); a repeated component needs at least ${MIN_SET_MEMBERS}`,
      );
      continue;
    }
    const dense = indexes.map((_, position) => position).join(', ');
    const actual = [...indexes].sort((a, b) => (a ?? -1) - (b ?? -1)).join(', ');
    if (actual !== dense) {
      problems.push(`${setId} is indexed [${actual}]; a set of ${indexes.length} must be [${dense}]`);
    }
  }
  return problems;
}

/**
 * A panel's sub-kind against the tree it sits in (§4.9.10). `card` and `mediaBox`
 * are the same kind and the same shape; whether anything is drawn inside is the
 * only thing separating a drawn card from an empty box, and [N14] builds the two as
 * different elements. Checked as a CONTRADICTION, never as a required value —
 * `variant` is a free producer string (§6.2), so an unknown one is silence here.
 */
function variantProblems(page) {
  const regions = regionsOf(page);
  const withContents = new Set(regions.map((r) => r?.parentRegionId ?? null).filter((id) => id !== null));

  return regions.flatMap((region) => {
    if (region?.kind !== 'panel') return [];
    const hasContents = withContents.has(region.id);

    if (region.variant === PANEL_CARD_VARIANT && !hasContents) {
      return [`${region.id} is variant ${PANEL_CARD_VARIANT} but no region sits inside it; a box drawn empty is variant ${PANEL_MEDIA_VARIANT} — the brief builds it as a media placeholder`];
    }
    if (region.variant === PANEL_MEDIA_VARIANT && hasContents) {
      return [`${region.id} is variant ${PANEL_MEDIA_VARIANT} but regions sit inside it; a box with contents is a ${PANEL_CARD_VARIANT}`];
    }
    return [];
  });
}

/**
 * Depth first — a parent immediately followed by everything inside it. Replaying
 * the walk over the array's OWN sibling order pins the tree shape without
 * re-deriving the producer's reading-order sort, which belongs to the ink module.
 * Skipped when the parent graph is already broken: the replay could not cover
 * every region, and the resulting message would be a second symptom of a cause
 * already reported.
 */
function orderProblems(page) {
  const regions = regionsOf(page);
  if (regions.length === 0 || parentProblems(page).length > 0) return [];

  const children = new Map();
  for (const region of regions) {
    const key = region?.parentRegionId ?? '';
    children.set(key, [...(children.get(key) ?? []), region]);
  }

  const walked = [];
  const walk = (key) => {
    for (const child of children.get(key) ?? []) {
      walked.push(child.id);
      walk(child.id);
    }
  };
  walk('');

  const actual = regions.map((r) => r?.id);
  return walked.join(',') === actual.join(',')
    ? []
    : [
        `penRegions are not in depth-first order: [${actual.join(', ')}] should walk as [${walked.join(', ')}]`,
      ];
}

/** V28 — penRegions integrity: referential, structural, and §4.5-consistent. */
export function v28PenRegions(site, ctx) {
  const problems = [];
  let regionCount = 0;
  for (const page of pagesOf(site)) {
    regionCount += regionsOf(page).length;
    for (const problem of [
      ...strokeProblems(page),
      ...parentProblems(page),
      ...setProblems(page),
      ...variantProblems(page),
      ...orderProblems(page),
    ]) {
      problems.push(`page ${page.id}: ${problem}`);
    }
  }
  return check({
    id: 'V28',
    title: 'penRegions are referentially sound, correctly nested, set, sub-kinded and depth-first',
    ref: 'export-format §5 V28 / §2.5 / §4.5 / §4.9.10',
    cls: 'BLOCK',
    problems,
    detail: `${regionCount} region(s) across ${pagesOf(site).length} page(s)`,
    ...ctx,
  });
}

/** V29 — drawn words the builder would be asked to read below readable size. */
export function v29InkTooSmallToRead(site, ctx) {
  const problems = [];
  let measured = 0;

  for (const page of pagesOf(site)) {
    const height = typeof page?.height === 'number' ? page.height : PAGE_WIDTH;
    const scale = Math.min(1, VISION_LONG_EDGE / Math.max(PAGE_WIDTH, height));
    for (const region of regionsOf(page)) {
      if (region?.kind !== 'writing' && region?.kind !== 'navRow') continue;
      const text = region?.text;
      if (!text || typeof text.glyphHeight !== 'number') continue;
      measured += 1;

      const effective = text.glyphHeight * scale;
      if (effective >= READABLE_MIN_PX) continue;
      problems.push(
        `page ${page.id} ${region.id}: ${Math.round(text.glyphHeight)}px handwriting on a ${height}px page ` +
          `reaches the builder at ${Math.round(effective * 10) / 10}px, under the ${READABLE_MIN_PX}px floor`,
      );
    }
  }
  return check({
    id: 'V29',
    title: 'no drawn writing is downscaled below readable size on the way to the builder',
    ref: 'export-format §5 V29 (v2.5) / §4.3',
    cls: 'WARN',
    problems,
    detail: `${measured} region(s) carrying words`,
    ...ctx,
  });
}

/**
 * §4.2 content-only page height — `pageHeightForContent(blocks, penStrokes, 0)`
 * replicated (the gate imports no app code). Bottom of the lowest block or pen point,
 * padded, ceiled onto the grid, clamped to the 1600..8000 band.
 */
function contentOnlyHeight(page) {
  const ceilToGrid = (v) => Math.ceil(v / GRID) * GRID;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  const blockBottom = blocksOf(page).reduce(
    (lo, b) => (b?.frame ? Math.max(lo, b.frame.y + b.frame.h) : lo),
    0,
  );
  const strokeBottom = strokesOf(page).reduce((lo, s) => {
    const pts = Array.isArray(s?.points) ? s.points : [];
    return pts.reduce((m, p) => (Array.isArray(p) && typeof p[1] === 'number' ? Math.max(m, p[1]) : m), lo);
  }, 0);

  const desired = ceilToGrid(Math.max(blockBottom, strokeBottom) + PAGE_BOTTOM_PADDING);
  return clamp(desired, MIN_PAGE_HEIGHT, MAX_PAGE_HEIGHT);
}

/**
 * V31 — space the client added that the §4.2 height cap actually truncated.
 *
 * The cap clamps `height` AFTER adding the client's room, so on a page whose content
 * already fills the sheet only part of the added space lands. Truncation happened iff
 * the client asked for more than the gap between the page's height and its content-only
 * height — never at the boundary where a page merely lands on the cap with every
 * requested pixel applied (the false positive this rule used to emit).
 */
export function v31TruncatedPageSpace(site, ctx) {
  const problems = [];
  for (const page of pagesOf(site)) {
    const requested = typeof page?.extraBottomPx === 'number' ? page.extraBottomPx : 0;
    if (requested <= 0) continue;
    const applied = Math.max(0, (typeof page?.height === 'number' ? page.height : 0) - contentOnlyHeight(page));
    if (requested > applied) {
      problems.push(
        `page ${page.id} ("${page.name}"): asked for ${requested}px of bottom space but only ${applied}px fit before the ${MAX_PAGE_HEIGHT} cap — ${requested - applied}px was truncated`,
      );
    }
  }
  return check({
    id: 'V31',
    title: 'no page asked for bottom space the height cap threw away',
    ref: 'export-format §5 V31 (v2.5) / §4.2',
    cls: 'WARN',
    problems,
    ...ctx,
  });
}

/**
 * V30 (v2.5) — exactly one `**BUILD THIS FROM INK**` marker per TOP-LEVEL region,
 * site-wide. The same count invariant V7 runs for WRITE THIS COPY and SOURCE AN
 * IMAGE, and it matters more: since [N7] clusters now form over UNCLAIMED strokes,
 * a region the brief forgot is ink that reaches the builder in no form at all.
 *
 * Top-level only — a nested writing region is described inside its parent's bullet,
 * so counting it would demand a bullet that must not exist.
 */
export function v30BuildFromInkMarkers(pkg, ctx) {
  const brief = pkg.briefText?.text ?? null;
  const site = pkg.site;
  const expected = pagesOf(site)
    .flatMap((page) => regionsOf(page))
    .filter((region) => (region?.parentRegionId ?? null) === null).length;

  if (brief === null) {
    return check({
      id: 'V30',
      title: 'one BUILD THIS FROM INK marker per top-level penRegion',
      ref: 'export-format §5 V30 (v2.5) / §3.3 rule 2',
      cls: 'BLOCK',
      skipped: expected === 0,
      problems: expected === 0 ? [] : ['brief.md is missing — nothing describes the drawn regions'],
      ...ctx,
    });
  }

  const actual = countMatches(brief, BUILD_FROM_INK_RE);
  return check({
    id: 'V30',
    title: 'one BUILD THIS FROM INK marker per top-level penRegion',
    ref: 'export-format §5 V30 (v2.5) / §3.3 rule 2',
    cls: 'BLOCK',
    problems:
      actual === expected
        ? []
        : [`BUILD THIS FROM INK markers: brief has ${actual}, site.json has ${expected} top-level pen region(s)`],
    detail: `${actual} marker(s), ${expected} top-level region(s)`,
    ...ctx,
  });
}
