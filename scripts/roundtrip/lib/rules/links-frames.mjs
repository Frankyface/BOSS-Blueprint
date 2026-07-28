/**
 * export-format.md §5 rules over links, frames, pen strokes and export identity:
 * V11, V15, V17, V18, V22, V23, V23f, V24, V25, plus the §4.1 slug and §4.5 pen-target
 * convention checks (C03, C04).
 */

import { check } from '../report.mjs';
import { pagesOf, blocksOf, strokesOf, eachBlock, eachLink, frameOf } from './walk.mjs';
import { clusterStrokes, PAGE_WIDTH } from '../geometry.mjs';

const pad2 = (n) => String(n).padStart(2, '0');
const pad4 = (n) => String(n).padStart(4, '0');

/** V11 — FIX invariant: every external URL ships already starting http(s)://. */
export function v11ExternalUrls(site, ctx) {
  const problems = [];
  for (const { link, where } of eachLink(site)) {
    if (link?.kind !== 'external') continue;
    if (typeof link.url !== 'string' || !/^https?:\/\//.test(link.url)) {
      problems.push(`${where}: external url "${link.url}" does not start http:// or https://`);
    }
  }
  return check({
    id: 'V11',
    title: 'FIX invariant: every external link URL starts http(s)://',
    ref: 'export-format §5 V11 (FIX)',
    cls: 'FIX',
    problems,
    ...ctx,
  });
}

/** V15 — every page reachable from pages[0] by walking button / navBar links. */
export function v15Reachability(site, ctx) {
  const pages = pagesOf(site);
  if (pages.length === 0) {
    return check({ id: 'V15', title: 'every page reachable from pages[0]', ref: 'export-format §5 V15', cls: 'WARN', skipped: true, ...ctx });
  }
  const outgoing = new Map(pages.map((p) => [p.id, new Set()]));
  for (const { page, link } of eachLink(site)) {
    if (link?.kind === 'page' && outgoing.has(page.id)) outgoing.get(page.id).add(link.pageId);
  }
  const seen = new Set([pages[0].id]);
  const queue = [pages[0].id];
  while (queue.length > 0) {
    const id = queue.shift();
    for (const next of outgoing.get(id) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  const problems = pages
    .filter((p) => !seen.has(p.id))
    .map((p) => `page ${p.id} ("${p.name}", \`${p.slug}\`) is not reachable from the homepage by any link`);
  return check({
    id: 'V15',
    title: 'every page reachable from pages[0] via button / navBar links',
    ref: 'export-format §5 V15',
    cls: 'WARN',
    problems,
    detail: `${seen.size}/${pages.length} pages reachable`,
    ...ctx,
  });
}

/** V17 — FIX invariant: page.screenshot equals pages/<pad2(i+1)>-<slug>.png. */
export function v17ScreenshotPaths(site, ctx) {
  const problems = [];
  pagesOf(site).forEach((page, i) => {
    const expected = `pages/${pad2(i + 1)}-${page?.slug}.png`;
    if (page?.screenshot !== expected) {
      problems.push(`page ${page?.id} (position ${i + 1}): screenshot "${page?.screenshot}" != "${expected}"`);
    }
  });
  return check({
    id: 'V17',
    title: 'FIX invariant: page.screenshot equals pages/<NN>-<slug>.png for its position',
    ref: 'export-format §5 V17 (FIX)',
    cls: 'FIX',
    problems,
    ...ctx,
  });
}

/** Page slugs are derived fresh from names (§4.1) — a CONV-class cross-check for V17's inputs. */
export function slugDerivationCheck(site, expectedSlugs, ctx) {
  const problems = [];
  pagesOf(site).forEach((page, i) => {
    if (page?.slug !== expectedSlugs[i]) {
      problems.push(`page ${page?.id} ("${page?.name}"): slug "${page?.slug}" != slugify(name) = "${expectedSlugs[i]}"`);
    }
  });
  return check({
    id: 'C03',
    title: 'every page.slug equals §4.1 slugify(page.name) with the uniqueness pass',
    ref: 'export-format §4.1',
    cls: 'CONV',
    problems,
    ...ctx,
  });
}

/** V18 — block frames substantially off-page (content clipped out of the PNG). */
export function v18OffPage(site, ctx) {
  const problems = [];
  for (const { block, page } of eachBlock(site)) {
    const f = frameOf(block);
    if (!f) continue;
    const reasons = [];
    if (f.y + f.h <= 0) reasons.push('entirely above y=0');
    if (f.y < -40) reasons.push(`y=${f.y} is more than 40px above the page top`);
    if (f.x + f.w <= 0) reasons.push('entirely left of x=0');
    if (f.x > PAGE_WIDTH) reasons.push(`x=${f.x} starts past the right page edge`);
    if (reasons.length > 0) {
      problems.push(`page ${page.id} block ${block.id}: ${reasons.join('; ')} — clipped from the PNG (§4.3)`);
    }
  }
  return check({
    id: 'V18',
    title: 'no block frame is substantially off-page',
    ref: 'export-format §5 V18',
    cls: 'WARN',
    problems,
    ...ctx,
  });
}

/** V25 — right-overflow: frame.x + frame.w > 1200 is clipped at x=1200 in the PNG. */
export function v25RightOverflow(site, ctx) {
  const overflowing = overflowingBlocks(site);
  const problems = overflowing.map(
    ({ page, block, right }) =>
      `page ${page.id} block ${block.id}: extends to x=${right} (> 1200) — clipped in the sketch PNG`,
  );
  return check({
    id: 'V25',
    title: 'no block extends past the right page edge (x + w > 1200)',
    ref: 'export-format §5 V25 (v2.1)',
    cls: 'WARN',
    problems,
    ...ctx,
  });
}

export function overflowingBlocks(site) {
  const out = [];
  for (const { block, page } of eachBlock(site)) {
    const f = frameOf(block);
    if (!f) continue;
    if (f.x + f.w > PAGE_WIDTH) out.push({ page, block, right: f.x + f.w });
  }
  return out;
}

/**
 * V22 (v2.4 scope) — an **annotation** cluster likely illegible: bbox < 40x20px, or
 * fewer than 12 total points. `imageSketch` clusters are EXEMPT: "a tiny drawing inside
 * an image slot is a legitimate sketch, and its meaning never depends on handwriting
 * legibility".
 */
export function v22Legibility(site, ctx) {
  const problems = [];
  let annotationClusters = 0;
  let exempt = 0;
  for (const page of pagesOf(site)) {
    for (const cluster of clusterStrokes(strokesOf(page))) {
      if (cluster.role !== 'annotation') {
        exempt += 1;
        continue;
      }
      annotationClusters += 1;
      const { bbox, points } = cluster;
      const tiny = bbox.w < 40 || bbox.h < 20;
      const sparse = points < 12;
      if (tiny || sparse) {
        const why = [tiny ? `bbox ${round1(bbox.w)}x${round1(bbox.h)} < 40x20` : null, sparse ? `${points} points < 12` : null]
          .filter(Boolean)
          .join(', ');
        problems.push(
          `page ${page.id}: annotation cluster of ${cluster.strokes.length} stroke(s) likely illegible (${why})`,
        );
      }
    }
  }
  return check({
    id: 'V22',
    title: 'no annotation cluster is too small or too sparse to read (imageSketch exempt)',
    ref: 'export-format §5 V22 (v2.4 scope) / §4.5 / [N7]',
    cls: 'WARN',
    problems,
    detail: `${annotationClusters} annotation cluster(s), ${exempt} imageSketch cluster(s) exempt`,
    ...ctx,
  });
}

/**
 * §4.5 (v2.4) pen-target sanity: `section` blocks are excluded from annotation
 * targeting entirely, and an `imageSketch` stroke must target an `imageSlot`.
 * No V-number owns this, so it reports as a convention check.
 */
export function penTargetCheck(site, ctx) {
  const problems = [];
  for (const page of pagesOf(site)) {
    const byId = new Map(blocksOf(page).map((b) => [b?.id, b]));
    for (const stroke of strokesOf(page)) {
      const target = byId.get(stroke?.targetBlockId);
      if (stroke?.role === 'imageSketch') {
        if (!target) continue; // V2 already reports an unresolvable target
        if (target.type !== 'imageSlot') {
          problems.push(
            `page ${page.id} stroke ${stroke.id}: role "imageSketch" targets ${target.id} (${target.type}), not an imageSlot`,
          );
        }
        continue;
      }
      if (stroke?.role === 'annotation' && target?.type === 'section') {
        problems.push(
          `page ${page.id} stroke ${stroke.id}: annotation targets section ${target.id} — ` +
            '§4.5 (v2.4) excludes sections from annotation targeting entirely',
        );
      }
    }
  }
  return check({
    id: 'C04',
    title: 'pen targets obey §4.5: annotations never target a section; imageSketch targets an imageSlot',
    ref: 'export-format §4.5 (v2.4)',
    cls: 'CONV',
    problems,
    ...ctx,
  });
}

/**
 * V23 (v2.4 scope) — untouched template filler reaching the export, counting
 * **non-section** blocks only. A flagged `section` is a different finding (V23f).
 */
export function v23TemplateFiller(site, ctx) {
  const problems = [];
  for (const { block, page } of eachBlock(site)) {
    if (block?.fromTemplate === true && block.type !== 'section') {
      problems.push(`page ${page.id} block ${block.id} (${block.type}): fromTemplate: true — untouched template filler`);
    }
  }
  return check({
    id: 'V23',
    title: 'no content-bearing block still carries fromTemplate: true',
    ref: 'export-format §5 V23 (v2.4 scope) / §2.6',
    cls: 'WARN',
    problems,
    ...ctx,
  });
}

/**
 * V23's FIX branch — §2.6 (v2.3) scope rule: producers never set `fromTemplate` on a
 * `section`, and V23 "defensively ignores (FIX-class strips) the flag on any section
 * block that carries it anyway". A shipped package has already been through that strip,
 * so a surviving flag is a producer defect.
 */
export function v23SectionFlagStripped(site, ctx) {
  const problems = [];
  for (const { block, page } of eachBlock(site)) {
    if (block?.type === 'section' && block.fromTemplate !== undefined) {
      problems.push(
        `page ${page.id} block ${block.id}: section carries fromTemplate: ${block.fromTemplate} — ` +
          "V23's FIX should have stripped it (§2.6 scope rule)",
      );
    }
  }
  return check({
    id: 'V23f',
    title: 'FIX invariant: no section block ships carrying fromTemplate',
    ref: 'export-format §5 V23 (FIX branch) / §2.6 (v2.3)',
    cls: 'FIX',
    problems,
    ...ctx,
  });
}

/**
 * V24 — identity remap complete (§4.8): every id matches its schema pattern AND
 * equals the ordinal for its document position; no internal id survives.
 *
 * The ordinal half is fully checkable from the package alone. The leak half is
 * only exactly checkable when --internal-ids supplies the app's id inventory;
 * without it the gate proves the weaker (but still decisive) property that every
 * id-typed field is an ordinal id.
 */
export function v24IdentityRemap(site, briefText, internalIds, ctx) {
  const problems = [];
  const pages = pagesOf(site);

  pages.forEach((page, i) => {
    const want = `pg_${pad4(i + 1)}`;
    if (page?.id !== want) problems.push(`page at position ${i + 1}: id "${page?.id}" != §4.8 ordinal "${want}"`);
  });

  let blockN = 0;
  let navN = 0;
  let strokeN = 0;
  for (const page of pages) {
    for (const block of blocksOf(page)) {
      blockN += 1;
      const want = `blk_${pad4(blockN)}`;
      if (block?.id !== want) problems.push(`page ${page.id} block #${blockN} in document order: id "${block?.id}" != "${want}"`);
    }
    for (const block of blocksOf(page)) {
      if (block?.type !== 'navBar' || !Array.isArray(block.items)) continue;
      for (const item of block.items) {
        navN += 1;
        const want = `nav_${pad4(navN)}`;
        if (item?.id !== want) problems.push(`nav item #${navN} in document order: id "${item?.id}" != "${want}"`);
      }
    }
    for (const stroke of strokesOf(page)) {
      strokeN += 1;
      const want = `stk_${pad4(strokeN)}`;
      if (stroke?.id !== want) problems.push(`stroke #${strokeN} in draw order: id "${stroke?.id}" != "${want}"`);
    }
  }

  if (internalIds && internalIds.length > 0) {
    const siteText = JSON.stringify(site);
    for (const id of internalIds) {
      if (siteText.includes(id)) problems.push(`internal app id "${id}" leaked into site.json (§4.8 rule 3)`);
      if (briefText && briefText.includes(id)) problems.push(`internal app id "${id}" leaked into brief.md (§4.8 rule 3)`);
    }
  }

  return check({
    id: 'V24',
    title: 'identity remap complete: every id is its §4.8 ordinal; no internal id leaked',
    ref: 'export-format §5 V24 / §4.8',
    cls: 'BLOCK',
    problems,
    detail:
      `${pages.length} pg, ${blockN} blk, ${navN} nav, ${strokeN} stk` +
      (internalIds && internalIds.length > 0 ? `; leak-scanned ${internalIds.length} internal ids` : '; leak scan: ordinal-only (no --internal-ids)'),
    ...ctx,
  });
}

function round1(n) {
  return Math.round(n * 10) / 10;
}
