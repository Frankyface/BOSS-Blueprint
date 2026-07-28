/**
 * export-format.md §5 rules that need the actual bytes in the zip:
 * V4 (asset bijection), V6 (PNG set / decode / dims / variance), V10 (zip size),
 * V16 (extension ↔ mimeType), V21 (manifest ↔ staged file).
 */

import { check } from '../report.mjs';
import { pagesOf, assetsOf, eachBlock } from './walk.mjs';
import { readImageHeader, MIME_TO_EXT, FORMAT_TO_MIME } from '../image-header.mjs';
import { inspectPng, BLANK_VARIANCE_FLOOR } from '../png-inspect.mjs';

const PAGE_WIDTH = 1200;

/**
 * V4 — asset bijection, both directions:
 *   manifest entry -> staged file (BLOCK on missing file)
 *   staged file    -> manifest entry (BLOCK: an unmanifested file is an extra entry)
 *   manifest entry -> referenced by >= 1 imageSlot (FIX invariant: strip unreferenced)
 */
export function v4AssetBijection(pkg, ctx) {
  const site = pkg.site;
  const problems = [];
  const assets = assetsOf(site);
  const referenced = new Set(
    eachBlock(site)
      .map(({ block }) => (block?.type === 'imageSlot' ? block.assetId : null))
      .filter((id) => typeof id === 'string'),
  );

  const manifestPaths = new Set();
  for (const asset of assets) {
    if (typeof asset?.path !== 'string') {
      problems.push(`asset ${asset?.id}: missing path`);
      continue;
    }
    manifestPaths.add(asset.path);
    if (!pkg.files.has(asset.path)) problems.push(`asset ${asset.id}: manifest entry has no staged file at "${asset.path}"`);
    if (!referenced.has(asset.id)) {
      problems.push(`asset ${asset.id} ("${asset.path}") is referenced by zero imageSlots — V4's FIX should have stripped it`);
    }
  }

  for (const name of pkg.entryNames) {
    if (!name.startsWith('assets/')) continue;
    if (!manifestPaths.has(name)) problems.push(`staged file "${name}" has no assets[] manifest entry`);
  }

  return check({
    id: 'V04',
    title: 'asset bijection: manifest ↔ staged files ↔ imageSlot references',
    ref: 'export-format §5 V4',
    cls: 'BLOCK',
    problems,
    detail: `${assets.length} manifest entries, ${referenced.size} referenced ids`,
    ...ctx,
  });
}

/** V16 — asset.path extension equals the §4.6 mapping of asset.mimeType. */
export function v16Extension(site, ctx) {
  const problems = [];
  for (const asset of assetsOf(site)) {
    const wantExt = MIME_TO_EXT[asset?.mimeType];
    if (!wantExt) {
      problems.push(`asset ${asset?.id}: mimeType "${asset?.mimeType}" is outside the §4.6 mapping`);
      continue;
    }
    const gotExt = typeof asset.path === 'string' ? asset.path.split('.').pop() : '';
    if (gotExt !== wantExt) {
      problems.push(`asset ${asset.id}: path "${asset.path}" has .${gotExt} but mimeType ${asset.mimeType} maps to .${wantExt}`);
    }
    if (asset.path !== `assets/${asset.id}.${wantExt}`) {
      problems.push(`asset ${asset.id}: path "${asset.path}" != "assets/${asset.id}.${wantExt}" (§4.6)`);
    }
  }
  return check({
    id: 'V16',
    title: 'every asset.path extension equals the §4.6 mapping of its mimeType',
    ref: 'export-format §5 V16 / §4.6',
    cls: 'BLOCK',
    problems,
    ...ctx,
  });
}

/** V21 — manifest width/height/bytes match the staged file, and the format matches mimeType. */
export function v21ManifestMatchesFile(pkg, ctx) {
  const problems = [];
  const details = [];
  for (const asset of assetsOf(pkg.site)) {
    const buf = typeof asset?.path === 'string' ? pkg.files.get(asset.path) : undefined;
    if (!buf) continue; // V4 already reports the missing file
    if (buf.length !== asset.bytes) {
      problems.push(`asset ${asset.id}: manifest bytes ${asset.bytes} != staged file ${buf.length} bytes`);
    }
    let header;
    try {
      header = readImageHeader(buf);
    } catch (err) {
      problems.push(`asset ${asset.id}: staged file does not decode — ${err.message}`);
      continue;
    }
    if (header.width !== asset.width || header.height !== asset.height) {
      problems.push(
        `asset ${asset.id}: manifest ${asset.width}x${asset.height} != staged file ${header.width}x${header.height}`,
      );
    }
    const fileMime = FORMAT_TO_MIME[header.format];
    if (fileMime !== asset.mimeType) {
      problems.push(`asset ${asset.id}: staged file is ${fileMime} but the manifest declares ${asset.mimeType}`);
    }
    details.push(`${asset.id} ${header.width}x${header.height} ${buf.length}B`);
  }
  return check({
    id: 'V21',
    title: 'every asset entry’s width/height/bytes/format match the staged file',
    ref: 'export-format §5 V21',
    cls: 'BLOCK',
    problems,
    detail: details.join(', '),
    ...ctx,
  });
}

/**
 * V6 — PNG set: count equals page count, each pairs with its page.screenshot,
 * every PNG decodes, is exactly 1200 x page.height, and is non-blank.
 */
export function v6PageRenders(pkg, ctx) {
  const problems = [];
  const details = [];
  const site = pkg.site;
  const pages = pagesOf(site);
  const pngEntries = pkg.entryNames.filter((n) => n.startsWith('pages/'));

  if (pngEntries.length !== pages.length) {
    problems.push(`zip has ${pngEntries.length} page PNG(s) but site.json declares ${pages.length} page(s)`);
  }

  for (const page of pages) {
    const path = page?.screenshot;
    const buf = typeof path === 'string' ? pkg.files.get(path) : undefined;
    if (!buf) {
      problems.push(`page ${page?.id}: no PNG staged at "${path}"`);
      continue;
    }
    let png;
    try {
      png = inspectPng(buf);
    } catch (err) {
      problems.push(`page ${page.id} "${path}": PNG does not decode — ${err.message}`);
      continue;
    }
    if (png.width !== PAGE_WIDTH || png.height !== page.height) {
      problems.push(
        `page ${page.id} "${path}": PNG is ${png.width}x${png.height}, must be exactly ${PAGE_WIDTH}x${page.height}`,
      );
    }
    if (png.blank) {
      problems.push(
        `page ${page.id} "${path}": PNG looks blank (luma variance ${png.variance.toFixed(2)} < ${BLANK_VARIANCE_FLOOR}, ` +
          `${png.distinctLuma} distinct luma bucket(s))`,
      );
    }
    details.push(`${path} ${png.width}x${png.height} var=${png.variance.toFixed(1)}`);
  }

  return check({
    id: 'V06',
    title: 'every page PNG decodes, is exactly 1200 × page.height, and is non-blank',
    ref: 'export-format §5 V6 / §4.3',
    cls: 'BLOCK',
    problems,
    detail: details.join('; '),
    ...ctx,
  });
}

/** V10 — zip size budget. */
export function v10ZipSize(pkg, maxMb, ctx) {
  const mb = pkg.zipBytes / (1024 * 1024);
  const problems = mb > maxMb ? [`zip is ${mb.toFixed(2)} MB, over the ${maxMb} MB budget`] : [];
  return check({
    id: 'V10',
    title: `zip size within the ${maxMb} MB budget`,
    ref: 'export-format §5 V10',
    cls: 'WARN',
    problems,
    detail: `${mb.toFixed(2)} MB`,
    ...ctx,
  });
}
