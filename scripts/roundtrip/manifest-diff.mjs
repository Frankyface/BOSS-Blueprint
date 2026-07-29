/**
 * Protocol §2 step 4 — the EXPECTED-MANIFEST DIFF. Stage 4's half of the package gate.
 *
 * This is the sketch-fidelity check: it proves the UI RECORDED what the client did.
 * Steps 1–3 of the gate (layout, ajv, validator replay) prove the package is
 * well-formed; only this step can tell you the client dragged a button to the hero and
 * the store wrote it down.
 *
 * It diffs `site.json` against the scenario file, ignoring minted ids, timestamps and
 * exact stroke geometry — everything that legitimately varies run to run — and nothing
 * else. Any mismatch fails H1 and the run stops before spending builder tokens.
 *
 * The scenario file is the single source of truth (R1.1): the driver executed it, this
 * diffs against it, and the evaluator receives it. Three consumers, one file.
 */

import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { POSITION_TOLERANCE_PX } from './thresholds.mjs';

/* ───────────────────────────── helpers ───────────────────────────── */

const PAGE_WIDTH_PX = 1200;
const MAX_ASSET_LONG_EDGE = 1600;

function frameOf(block) {
  return [block.frame.x, block.frame.y, block.frame.w, block.frame.h];
}

/** All four edges within tolerance. R2.4's constant, shared with the driver. */
function frameWithinTolerance(actual, expected, tolerance = POSITION_TOLERANCE_PX) {
  const [ax, ay, aw, ah] = actual;
  const [ex, ey, ew, eh] = expected;
  return (
    Math.abs(ax - ex) <= tolerance &&
    Math.abs(ay - ey) <= tolerance &&
    Math.abs(ax + aw - (ex + ew)) <= tolerance &&
    Math.abs(ay + ah - (ey + eh)) <= tolerance
  );
}

function frameDistance(actual, expected) {
  const [ax, ay, aw, ah] = actual;
  const [ex, ey, ew, eh] = expected;
  return (
    Math.abs(ax - ex) + Math.abs(ay - ey) + Math.abs(ax + aw - (ex + ew)) + Math.abs(ay + ah - (ey + eh))
  );
}

function countByType(items) {
  const counts = {};
  for (const item of items) counts[item.type] = (counts[item.type] ?? 0) + 1;
  return counts;
}

function normaliseWhitespace(value) {
  return String(value ?? '').replace(/\r\n/g, '\n');
}

/* ─────────────────── R1.2b · the template-fixture lookup ─────────────────── */

/**
 * The expected text/copyMode of an untouched filler block is READ FROM the committed
 * template fixture, never re-typed into the scenario. A template edit can then never
 * leave a stale duplicate in the harness — the diff simply starts expecting the new
 * words. Node's native type stripping makes the app's own `src/templates/` importable
 * here, so the harness reads THE SAME data the product seeded.
 */
export async function loadTemplateBlock(repoRoot, templateId, blockId) {
  const indexPath = path.join(repoRoot, 'src', 'templates', 'index.ts');
  const mod = await import(pathToFileURL(indexPath).href);
  const template = mod.templateById(templateId);
  if (!template) throw new Error(`no starter template with id "${templateId}"`);
  for (const page of template.pages) {
    const block = page.blocks.find((b) => b.id === blockId);
    if (block) return block;
  }
  throw new Error(`template "${templateId}" has no block "${blockId}"`);
}

/* ───────────────────────────── the diff ───────────────────────────── */

/**
 * @param {object} input
 * @param {object} input.site parsed site.json
 * @param {object} input.scenario parsed, schema-valid scenario file
 * @param {string} input.repoRoot for the template-fixture lookup
 * @returns {Promise<{ ok: boolean, problems: string[], matched: object[], notes: string[] }>}
 */
export async function diffManifest({ site, scenario, repoRoot }) {
  const problems = [];
  const notes = [];
  const matched = [];

  const pages = Array.isArray(site?.pages) ? site.pages : [];
  const expectedPages = scenario.pages;

  /* -- page count, names, slugs, order — exact -------------------------------- */
  if (pages.length !== expectedPages.length) {
    problems.push(
      `page count: expected ${expectedPages.length} (${expectedPages.map((p) => p.name).join(' · ')}), ` +
        `got ${pages.length} (${pages.map((p) => p.name).join(' · ')})`,
    );
  }
  const pairCount = Math.min(pages.length, expectedPages.length);
  for (let i = 0; i < pairCount; i += 1) {
    if (pages[i].name !== expectedPages[i].name) {
      problems.push(`page ${i + 1} name: expected "${expectedPages[i].name}", got "${pages[i].name}"`);
    }
    if (pages[i].slug !== expectedPages[i].slug) {
      problems.push(`page ${i + 1} slug: expected "${expectedPages[i].slug}", got "${pages[i].slug}"`);
    }
  }

  /* -- site settings verbatim ------------------------------------------------- */
  const settings = site?.siteSettings ?? {};
  for (const [key, expected] of Object.entries(scenario.settings)) {
    if (key === 'colors') continue;
    const actual = settings[key] ?? null;
    const want = expected ?? null;
    if (normaliseWhitespace(actual) !== normaliseWhitespace(want)) {
      problems.push(`siteSettings.${key}: expected ${JSON.stringify(want)}, got ${JSON.stringify(actual)}`);
    }
  }
  const expectedColors = scenario.settings.colors ?? [];
  const actualColors = (settings.colors ?? []).map((c) => String(c).toLowerCase());
  if (JSON.stringify(actualColors) !== JSON.stringify(expectedColors.map((c) => c.toLowerCase()))) {
    problems.push(
      `siteSettings.colors: expected ${JSON.stringify(expectedColors)}, got ${JSON.stringify(actualColors)}`,
    );
  }

  /* -- submission.client matches the form input -------------------------------- */
  const client = site?.submission?.client ?? {};
  if (client.name !== scenario.submit.name) {
    problems.push(`submission.client.name: expected "${scenario.submit.name}", got "${client.name ?? ''}"`);
  }
  if (client.email !== scenario.submit.email) {
    problems.push(`submission.client.email: expected "${scenario.submit.email}", got "${client.email ?? ''}"`);
  }

  /* -- per page ---------------------------------------------------------------- */
  const pageIdToName = new Map(pages.map((p) => [p.id, p.name]));
  const refToExportId = new Map();

  for (let i = 0; i < pairCount; i += 1) {
    const page = pages[i];
    const want = expectedPages[i];
    const where = `page ${i + 1} "${want.name}"`;
    const blocks = Array.isArray(page.blocks) ? page.blocks : [];

    // block multiset by type — exact
    const gotCounts = countByType(blocks);
    const wantCounts = countByType(want.blocks);
    for (const type of new Set([...Object.keys(gotCounts), ...Object.keys(wantCounts)])) {
      if ((gotCounts[type] ?? 0) !== (wantCounts[type] ?? 0)) {
        problems.push(
          `${where}: ${type} block count: expected ${wantCounts[type] ?? 0}, got ${gotCounts[type] ?? 0}`,
        );
      }
    }

    // R1.2a — section bands are full width and at the BACK of the paint order.
    const sectionIndices = blocks.map((b, idx) => (b.type === 'section' ? idx : -1)).filter((n) => n >= 0);
    const expectedSections = want.blocks.filter((b) => b.type === 'section').length;
    if (expectedSections > 0) {
      for (const idx of sectionIndices) {
        const band = blocks[idx];
        if (band.frame.x !== 0 || band.frame.w !== PAGE_WIDTH_PX) {
          problems.push(
            `${where}: section "${band.id}" is not full width (x=${band.frame.x}, w=${band.frame.w})`,
          );
        }
      }
      /**
       * "At the back" means behind every piece of CONTENT, not literally index 0.
       * A nav bar is the other full-width stacked block and legitimately sits furthest
       * back (`src/templates/layout.ts` invariant 3, `src/constants/blockTypes.ts`
       * `placement: 'stacked'`), so the assertion is that no content block paints
       * behind a band — which is the property the §4.4 row grouping depends on.
       */
      const firstContent = blocks.findIndex((b) => b.type !== 'section' && b.type !== 'navBar');
      const lastSection = sectionIndices[sectionIndices.length - 1];
      if (firstContent !== -1 && lastSection > firstContent) {
        problems.push(
          `${where}: a section band paints in front of content — bands at [${sectionIndices.join(', ')}], ` +
            `first content block at index ${firstContent} (${blocks[firstContent].type} ${blocks[firstContent].id})`,
        );
      }
      if (sectionIndices.length !== expectedSections) {
        problems.push(
          `${where}: expected ${expectedSections} section band(s), found ${sectionIndices.length}`,
        );
      }
    }

    // bijection: each scenario block ↔ one exported block of the same type, frame within tolerance
    const remaining = new Set(blocks.keys());
    for (const wantBlock of want.blocks) {
      const candidates = [...remaining]
        .filter((idx) => blocks[idx].type === wantBlock.type)
        .filter((idx) => frameWithinTolerance(frameOf(blocks[idx]), wantBlock.frame))
        .sort((a, b) => frameDistance(frameOf(blocks[a]), wantBlock.frame) - frameDistance(frameOf(blocks[b]), wantBlock.frame));

      if (candidates.length === 0) {
        const nearest = [...remaining]
          .filter((idx) => blocks[idx].type === wantBlock.type)
          .sort((a, b) => frameDistance(frameOf(blocks[a]), wantBlock.frame) - frameDistance(frameOf(blocks[b]), wantBlock.frame))[0];
        problems.push(
          `${where}: no ${wantBlock.type} within ±${POSITION_TOLERANCE_PX}px of ${wantBlock.ref} ` +
            `frame [${wantBlock.frame.join(', ')}]` +
            (nearest === undefined ? '' : ` (nearest: ${blocks[nearest].id} [${frameOf(blocks[nearest]).join(', ')}])`),
        );
        continue;
      }

      const idx = candidates[0];
      remaining.delete(idx);
      const got = blocks[idx];
      refToExportId.set(wantBlock.ref, got.id);
      matched.push({ ref: wantBlock.ref, exportId: got.id, page: want.name, frame: frameOf(got) });

      problems.push(...(await compareBlock({ where, wantBlock, got, pageIdToName, repoRoot })));
    }

    for (const idx of remaining) {
      problems.push(`${where}: unexpected extra ${blocks[idx].type} block ${blocks[idx].id} in the export`);
    }

    // pen: count per page — exact
    const strokes = Array.isArray(page.penStrokes) ? page.penStrokes : [];
    const wantStrokes = (want.pen ?? []).flatMap((cluster) =>
      cluster.strokes.map(() => ({ role: cluster.role, target: cluster.target, ref: cluster.ref })),
    );
    if (strokes.length !== wantStrokes.length) {
      problems.push(`${where}: pen stroke count: expected ${wantStrokes.length}, got ${strokes.length}`);
    }
    for (const cluster of want.pen ?? []) {
      const targetId = refToExportId.get(cluster.target) ?? null;
      const inCluster = strokes.filter((s) => s.targetBlockId === targetId && s.role === cluster.role);
      if (inCluster.length !== cluster.strokes.length) {
        problems.push(
          `${where}: pen cluster "${cluster.ref}": expected ${cluster.strokes.length} stroke(s) with ` +
            `role "${cluster.role}" targeting ${cluster.target} (${targetId ?? 'unmatched'}), got ${inCluster.length}` +
            ` — actual roles/targets: ${strokes.map((s) => `${s.role}→${s.targetBlockId ?? 'null'}`).join(', ')}`,
        );
      }
    }
  }

  /* -- assets: count, mimeTypes, first-use numbering order, dims --------------- */
  const assets = Array.isArray(site?.assets) ? site.assets : [];
  const expectedUploads = expectedPages.flatMap((p) =>
    p.blocks.filter((b) => b.type === 'imageSlot' && b.upload).map((b) => ({ ref: b.ref, upload: b.upload })),
  );
  if (assets.length !== expectedUploads.length) {
    problems.push(`assets: expected ${expectedUploads.length}, got ${assets.length}`);
  }
  assets.forEach((asset, index) => {
    const expectedId = `img_${String(index + 1).padStart(3, '0')}`;
    if (asset.id !== expectedId) {
      problems.push(`assets[${index}]: first-use numbering expected "${expectedId}", got "${asset.id}"`);
    }
    if (Math.max(asset.width, asset.height) > MAX_ASSET_LONG_EDGE) {
      problems.push(
        `asset ${asset.id}: long edge ${Math.max(asset.width, asset.height)}px exceeds ${MAX_ASSET_LONG_EDGE}px`,
      );
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(asset.mimeType)) {
      problems.push(`asset ${asset.id}: unexpected mimeType "${asset.mimeType}"`);
    }
  });

  /* -- R1.2b · the untouched-filler expectation, stated as a count -------------- */
  const declaredFiller = expectedPages.flatMap((p) => p.blocks.filter((b) => b.expect === 'untouched-filler'));
  const copyBearing = new Set(['heading', 'text', 'button', 'imageSlot']);
  const flaggedInExport = pages.flatMap((p) =>
    p.blocks.filter((b) => b.fromTemplate === true && copyBearing.has(b.type)).map((b) => `${p.name}/${b.id}`),
  );
  if (flaggedInExport.length !== declaredFiller.length) {
    problems.push(
      `fromTemplate leakage: expected exactly ${declaredFiller.length} copy-bearing block(s) still flagged ` +
        `(${declaredFiller.map((b) => b.ref).join(', ') || 'none'}), got ${flaggedInExport.length} ` +
        `(${flaggedInExport.join(', ') || 'none'})`,
    );
  }
  if (declaredFiller.length > 0) {
    notes.push(
      `R1.2b: ${declaredFiller.length} untouched filler block(s) declared — V23's WARN path is expected to fire ` +
        'and the package is expected to ship anyway.',
    );
  }

  return { ok: problems.length === 0, problems, matched, notes };
}

/* ─────────────────── per-block field comparison ─────────────────── */

async function compareBlock({ where, wantBlock, got, pageIdToName, repoRoot }) {
  const problems = [];
  const at = `${where} · ${wantBlock.ref} (${got.id})`;

  // fromTemplate is a PER-BLOCK expectation (R1.2b), never a blanket rule.
  const actualFlag = got.fromTemplate === true;
  if (actualFlag !== wantBlock.fromTemplate) {
    problems.push(`${at}: fromTemplate expected ${wantBlock.fromTemplate}, got ${actualFlag}`);
  }

  let expectedText = wantBlock.text;
  let expectedCopyMode = wantBlock.copyMode;
  if (wantBlock.textFromFixture) {
    try {
      const fixture = await loadTemplateBlock(
        repoRoot,
        wantBlock.textFromFixture.template,
        wantBlock.textFromFixture.blockId,
      );
      expectedText = fixture.text;
      expectedCopyMode = fixture.copyMode;
    } catch (err) {
      problems.push(`${at}: could not read the template fixture — ${err.message}`);
      return problems;
    }
  }

  if (wantBlock.type === 'heading' || wantBlock.type === 'text') {
    if (got.copyMode !== expectedCopyMode) {
      problems.push(`${at}: copyMode expected "${expectedCopyMode}", got "${got.copyMode}"`);
    }
    if (expectedCopyMode === 'real') {
      if (normaliseWhitespace(got.text) !== normaliseWhitespace(expectedText)) {
        problems.push(
          `${at}: text expected ${JSON.stringify(expectedText)}, got ${JSON.stringify(got.text)}`,
        );
      }
    } else {
      if ((got.generateDescription ?? null) !== (wantBlock.generateDescription ?? null)) {
        problems.push(
          `${at}: generateDescription expected ${JSON.stringify(wantBlock.generateDescription ?? null)}, ` +
            `got ${JSON.stringify(got.generateDescription ?? null)}`,
        );
      }
      if ((got.lengthHint ?? null) !== (wantBlock.lengthHint ?? null)) {
        problems.push(
          `${at}: lengthHint expected ${JSON.stringify(wantBlock.lengthHint ?? null)}, ` +
            `got ${JSON.stringify(got.lengthHint ?? null)}`,
        );
      }
    }
  }

  if (wantBlock.type === 'imageSlot') {
    const wantsAsset = Boolean(wantBlock.upload);
    const hasAsset = typeof got.assetId === 'string';
    if (wantsAsset !== hasAsset) {
      problems.push(`${at}: assetId presence expected ${wantsAsset}, got ${hasAsset} (${got.assetId ?? 'null'})`);
    }
    if (got.fit !== wantBlock.fit) {
      problems.push(`${at}: fit expected "${wantBlock.fit}", got "${got.fit}"`);
    }
    if (normaliseWhitespace(got.description) !== normaliseWhitespace(wantBlock.description)) {
      problems.push(
        `${at}: description expected ${JSON.stringify(wantBlock.description)}, got ${JSON.stringify(got.description)}`,
      );
    }
  }

  if (wantBlock.type === 'button') {
    if (got.label !== wantBlock.label) {
      problems.push(`${at}: label expected ${JSON.stringify(wantBlock.label)}, got ${JSON.stringify(got.label)}`);
    }
    problems.push(...compareLink(at, wantBlock.link, got.link, pageIdToName));
  }

  if (wantBlock.type === 'navBar') {
    const items = Array.isArray(got.items) ? got.items : [];
    if (items.length !== wantBlock.items.length) {
      problems.push(`${at}: nav item count expected ${wantBlock.items.length}, got ${items.length}`);
    } else {
      wantBlock.items.forEach((wantItem, index) => {
        if (items[index].label !== wantItem.label) {
          problems.push(
            `${at}: nav item ${index + 1} label expected ${JSON.stringify(wantItem.label)}, ` +
              `got ${JSON.stringify(items[index].label)}`,
          );
        }
        problems.push(...compareLink(`${at} nav ${index + 1}`, wantItem.link, items[index].link, pageIdToName));
      });
    }
  }

  return problems;
}

/** Links are compared RESOLVED — page name / URL / none — never by minted id. */
function compareLink(at, wantLink, gotLink, pageIdToName) {
  const problems = [];
  const kind = gotLink?.kind ?? 'none';
  if (kind !== wantLink.kind) {
    problems.push(`${at}: link kind expected "${wantLink.kind}", got "${kind}"`);
    return problems;
  }
  if (kind === 'page') {
    const gotName = pageIdToName.get(gotLink.pageId) ?? `<unresolved ${gotLink.pageId}>`;
    if (gotName !== wantLink.page) {
      problems.push(`${at}: link target expected page "${wantLink.page}", got "${gotName}"`);
    }
  }
  if (kind === 'external' && gotLink.url !== wantLink.url) {
    problems.push(`${at}: link url expected "${wantLink.url}", got "${gotLink.url}"`);
  }
  return problems;
}
