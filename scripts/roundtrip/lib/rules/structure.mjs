/**
 * export-format.md §5 rules that read site.json's structure and content:
 * V1, V2, V3, V5, V8, V9, V13, V14, V19, V20, V26, V27.
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { check } from '../report.mjs';
import { checkKeyOrder } from '../key-order.mjs';
import { pagesOf, assetsOf, blocksOf, strokesOf, eachBlock, eachLink, blockLabel } from './walk.mjs';

const UUID_V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

/** V1 — ajv v8 + ajv-formats, { allErrors: true, strict: true }, draft-07. */
export function v1Schema(pkg, schema, ctx) {
  if (pkg.site === null) {
    return check({
      id: 'V01',
      title: 'site.json validates against the §2.2 JSON Schema (ajv draft-07 + formats)',
      ref: 'export-format §5 V1',
      cls: 'BLOCK',
      problems: [`site.json could not be parsed: ${pkg.siteParseError ?? 'entry missing'}`],
      ...ctx,
    });
  }
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (err) {
    return check({
      id: 'V01',
      title: 'site.json validates against the §2.2 JSON Schema (ajv draft-07 + formats)',
      ref: 'export-format §5 V1',
      cls: 'BLOCK',
      problems: [`schema failed to compile: ${err.message}`],
      ...ctx,
    });
  }
  const ok = validate(pkg.site);
  const problems = ok
    ? []
    : (validate.errors ?? []).map((e) => {
        const at = e.instancePath || '(root)';
        const extra = e.params && Object.keys(e.params).length ? ` ${JSON.stringify(e.params)}` : '';
        return `${at} ${e.message}${extra}`;
      });
  return check({
    id: 'V01',
    title: 'site.json validates against the §2.2 JSON Schema (ajv draft-07 + formats)',
    ref: 'export-format §5 V1',
    cls: 'BLOCK',
    problems: problems.slice(0, 40),
    detail: ok ? 'schemaVersion 1, 0 errors' : `${problems.length} ajv errors`,
    ...ctx,
  });
}

/** V2 — referential integrity of link.pageId, imageSlot.assetId, penStroke.targetBlockId. */
export function v2Referential(site, ctx) {
  const problems = [];
  const pageIds = new Set(pagesOf(site).map((p) => p?.id));
  const assetIds = new Set(assetsOf(site).map((a) => a?.id));

  for (const { link, where } of eachLink(site)) {
    if (link?.kind === 'page' && !pageIds.has(link.pageId)) {
      problems.push(`${where}: link.pageId "${link.pageId}" is not a page in pages[]`);
    }
  }
  for (const { block } of eachBlock(site)) {
    if (block?.type === 'imageSlot' && typeof block.assetId === 'string' && !assetIds.has(block.assetId)) {
      problems.push(`block ${block.id}: assetId "${block.assetId}" is not in assets[]`);
    }
  }
  for (const page of pagesOf(site)) {
    const onPage = new Set(blocksOf(page).map((b) => b?.id));
    for (const stroke of strokesOf(page)) {
      if (typeof stroke?.targetBlockId === 'string' && !onPage.has(stroke.targetBlockId)) {
        problems.push(
          `page ${page.id} stroke ${stroke.id}: targetBlockId "${stroke.targetBlockId}" is not a block on this page`,
        );
      }
    }
  }
  return check({
    id: 'V02',
    title: 'every link.pageId / imageSlot.assetId / penStroke.targetBlockId resolves',
    ref: 'export-format §5 V2',
    cls: 'BLOCK',
    problems,
    ...ctx,
  });
}

/** V3 — id uniqueness site-wide + z unique per page + blocks[] sorted by z ascending. */
export function v3Uniqueness(site, ctx) {
  const problems = [];
  const dupe = (label, values) => {
    const seen = new Set();
    for (const v of values) {
      if (seen.has(v)) problems.push(`duplicate ${label} "${v}"`);
      seen.add(v);
    }
  };

  dupe('page id', pagesOf(site).map((p) => p?.id));
  dupe('page slug', pagesOf(site).map((p) => p?.slug));
  dupe('block id', eachBlock(site).map(({ block }) => block?.id));
  dupe('asset id', assetsOf(site).map((a) => a?.id));
  dupe('asset path', assetsOf(site).map((a) => a?.path));
  dupe('stroke id', pagesOf(site).flatMap((p) => strokesOf(p).map((s) => s?.id)));

  for (const { block } of eachBlock(site)) {
    if (block?.type === 'navBar' && Array.isArray(block.items)) {
      dupe(`nav item id in ${block.id}`, block.items.map((i) => i?.id));
    }
  }

  for (const page of pagesOf(site)) {
    const zs = blocksOf(page).map((b) => b?.z);
    const seen = new Set();
    for (const z of zs) {
      if (seen.has(z)) problems.push(`page ${page.id}: duplicate z ${z} (z is unique per page)`);
      seen.add(z);
    }
    for (let i = 1; i < zs.length; i += 1) {
      if (typeof zs[i] === 'number' && typeof zs[i - 1] === 'number' && zs[i] < zs[i - 1]) {
        problems.push(
          `page ${page.id}: blocks[] not sorted by z ascending (index ${i - 1} z=${zs[i - 1]} > index ${i} z=${zs[i]})` +
            ' — FIX invariant must already hold in a shipped package',
        );
        break;
      }
    }
  }

  return check({
    id: 'V03',
    title: 'ids unique site-wide; z unique per page and blocks[] sorted by z ascending',
    ref: 'export-format §5 V3 (BLOCK on collision, FIX invariant on z)',
    cls: 'BLOCK',
    problems,
    ...ctx,
  });
}

/** V5 — every copyMode "generate" block carries a non-empty generateDescription. */
export function v5GenerateDescription(site, ctx) {
  const problems = [];
  for (const { block, page } of eachBlock(site)) {
    if (block?.copyMode !== 'generate') continue;
    const desc = block.generateDescription;
    if (typeof desc !== 'string' || desc.trim() === '') {
      problems.push(`page ${page.id} block ${block.id} (${block.type}): copyMode "generate" with empty generateDescription`);
    }
  }
  return check({
    id: 'V05',
    title: 'every copyMode "generate" block has a non-empty generateDescription',
    ref: 'export-format §5 V5',
    cls: 'BLOCK',
    problems,
    ...ctx,
  });
}

/** V8 — submission identity: name, email, well-formed v4 UUID. */
export function v8Submission(site, ctx) {
  const problems = [];
  const sub = site?.submission;
  const name = sub?.client?.name;
  const email = sub?.client?.email;
  if (typeof name !== 'string' || name.trim() === '') problems.push('submission.client.name is blank');
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) problems.push(`submission.client.email "${email}" is not plausibly an email`);
  if (typeof sub?.id !== 'string' || !UUID_V4_RE.test(sub.id)) problems.push(`submission.id "${sub?.id}" is not a well-formed v4 UUID`);
  return check({
    id: 'V08',
    title: 'submission.client.name / .email present and submission.id is a v4 UUID',
    ref: 'export-format §5 V8',
    cls: 'BLOCK',
    problems,
    detail: typeof sub?.id === 'string' ? sub.id : '',
    ...ctx,
  });
}

/** V9 — >=1 page; every page >=1 block; homepage has >=1 non-section block. (WARN half is separate.) */
export function v9Population(site, ctx) {
  const problems = [];
  const pages = pagesOf(site);
  if (pages.length === 0) problems.push('site has zero pages');
  const home = pages[0];
  if (home && blocksOf(home).filter((b) => b?.type !== 'section').length === 0) {
    problems.push(`homepage ${home.id} has no non-section block`);
  }
  return check({
    id: 'V09',
    title: 'at least one page; the homepage has at least one non-section block',
    ref: 'export-format §5 V9 (BLOCK half)',
    cls: 'BLOCK',
    problems,
    detail: `${pages.length} pages`,
    ...ctx,
  });
}

/** V9 WARN half — an individual near-empty page. */
export function v9NearEmpty(site, ctx) {
  const problems = pagesOf(site)
    .filter((p) => blocksOf(p).length === 0)
    .map((p) => `page ${p.id} ("${p.name}") has zero blocks`);
  return check({
    id: 'V09w',
    title: 'no individual page is empty',
    ref: 'export-format §5 V9 (WARN half)',
    cls: 'WARN',
    problems,
    ...ctx,
  });
}

/** V13 — duplicate page.name values site-wide. */
export function v13DuplicateNames(site, ctx) {
  const seen = new Map();
  for (const p of pagesOf(site)) seen.set(p?.name, (seen.get(p?.name) ?? 0) + 1);
  const problems = [...seen.entries()]
    .filter(([, n]) => n > 1)
    .map(([name, n]) => `page name "${name}" used ${n} times — the brief's nav map becomes ambiguous`);
  return check({
    id: 'V13',
    title: 'no duplicate page.name values site-wide',
    ref: 'export-format §5 V13',
    cls: 'WARN',
    problems,
    ...ctx,
  });
}

/** V14 — empty image slot with a null/blank description. */
export function v14EmptySlotDescription(site, ctx) {
  const problems = [];
  for (const { block, page } of eachBlock(site)) {
    if (block?.type !== 'imageSlot' || block.assetId !== null) continue;
    const d = block.description;
    if (typeof d !== 'string' || d.trim() === '') {
      problems.push(`page ${page.id} block ${block.id}: empty image slot with no description (the sourcing prompt)`);
    }
  }
  return check({
    id: 'V14',
    title: 'every empty image slot carries a non-blank description',
    ref: 'export-format §5 V14',
    cls: 'BLOCK',
    problems,
    ...ctx,
  });
}

/** V19 — copyMode "real" with blank/whitespace-only text. */
export function v19BlankRealText(site, ctx) {
  const problems = [];
  for (const { block, page } of eachBlock(site)) {
    if (block?.copyMode !== 'real') continue;
    if (typeof block.text !== 'string' || block.text.trim() === '') {
      problems.push(`page ${page.id} block ${block.id} (${block.type}): copyMode "real" with blank text`);
    }
  }
  return check({
    id: 'V19',
    title: 'no copyMode "real" block has blank/whitespace-only text',
    ref: 'export-format §5 V19',
    cls: 'BLOCK',
    problems,
    ...ctx,
  });
}

/** V20 — FIX invariant: copyMode "real" must ship with generateDescription null. */
export function v20StrandedDescription(site, ctx) {
  const problems = [];
  for (const { block, page } of eachBlock(site)) {
    if (block?.copyMode !== 'real') continue;
    if (block.generateDescription !== null && block.generateDescription !== undefined) {
      problems.push(
        `page ${page.id} block ${block.id}: copyMode "real" with stranded generateDescription ` +
          `"${String(block.generateDescription).slice(0, 40)}" — V20's FIX should have nulled it`,
      );
    }
  }
  return check({
    id: 'V20',
    title: 'FIX invariant: copyMode "real" blocks ship with generateDescription = null',
    ref: 'export-format §5 V20 (FIX)',
    cls: 'FIX',
    problems,
    ...ctx,
  });
}

/** V26 — blank button label, or a navBar with zero items. */
export function v26LabelsAndNav(site, ctx) {
  const problems = [];
  for (const { block, page } of eachBlock(site)) {
    if (block?.type === 'button' && (typeof block.label !== 'string' || block.label.trim() === '')) {
      problems.push(`page ${page.id} block ${block.id}: button has no label text`);
    }
    if (block?.type === 'navBar') {
      const items = Array.isArray(block.items) ? block.items : [];
      if (items.length === 0) problems.push(`page ${page.id} block ${block.id}: nav bar has zero items`);
      items.forEach((item, i) => {
        if (typeof item?.label !== 'string' || item.label.trim() === '') {
          problems.push(`page ${page.id} block ${block.id} nav item ${i + 1} (${item?.id}): blank label`);
        }
      });
    }
  }
  return check({
    id: 'V26',
    title: 'no blank button label and no empty nav bar',
    ref: 'export-format §5 V26 (v2.1)',
    cls: 'BLOCK',
    problems,
    ...ctx,
  });
}

/**
 * V27 (v2.4) — `site.json` key order equals the normative §7.1 order everywhere (§2.1).
 * The canonical table is DERIVED from §7.1 (see lib/key-order.mjs), so the spec stays
 * the source of truth. Without the spec (e.g. `--schema` given and the spec unreadable)
 * there is no canon to compare against and the check reports SKIP.
 */
export function v27KeyOrder(site, canonical, ctx) {
  if (!canonical || canonical.table.size === 0) {
    return check({
      id: 'V27',
      title: 'site.json key order equals the normative §7.1 order',
      ref: 'export-format §5 V27 / §2.1 (v2.4)',
      cls: 'WARN',
      skipped: true,
      detail: 'no §7.1 canon available (spec not readable)',
      ...ctx,
    });
  }
  const problems = [...canonical.conflicts, ...checkKeyOrder(site, canonical.table)];
  return check({
    id: 'V27',
    title: 'site.json key order equals the normative §7.1 order everywhere',
    ref: 'export-format §5 V27 / §2.1 (v2.4)',
    cls: 'WARN',
    problems: problems.slice(0, 30),
    detail: `${canonical.table.size} node kinds derived from §7.1`,
    ...ctx,
  });
}

export { blockLabel };
