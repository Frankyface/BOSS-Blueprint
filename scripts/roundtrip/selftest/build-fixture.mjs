/**
 * Build the synthetic MINIMAL valid package straight out of the spec:
 *   site.json  = docs/export-format.md §7.1, verbatim
 *   brief.md   = docs/export-format.md §7.2, verbatim
 *   pages/*.png = generated at exactly 1200 x page.height
 *   assets/img_001.jpg = generated at 1600x1200 and padded to exactly 214733 bytes
 *                        so the §7.1 manifest holds byte-for-byte
 *
 * Nothing here is hand-authored JSON — if the spec changes, the fixture changes.
 */

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { extractExampleSiteJson, extractExampleBrief } from '../lib/schema-extract.mjs';
import { renderPagePng, makeJpeg } from './render.mjs';
import { slugifyBusinessName } from '../lib/slug.mjs';

/**
 * @param {string} specPath docs/export-format.md
 * @returns {Promise<{ files: Map<string,Buffer>, order: string[], site: object, filename: string }>}
 */
export async function buildFixtureParts(specPath) {
  const specText = await readFile(specPath, 'utf8');
  const { text: siteText, json: site } = extractExampleSiteJson(specText);
  const briefText = extractExampleBrief(specText);

  // §7.1's fenced block is formatted for READING (multiple keys per line). §1's file
  // convention is 2-space pretty-print, so the fixture emits the contract's form.
  // Key order is preserved by JSON.parse/stringify, so §7.1 still dictates it.
  const emittedSiteText = `${JSON.stringify(site, null, 2)}\n`;

  const files = new Map();
  const order = ['site.json', 'brief.md'];
  files.set('site.json', Buffer.from(emittedSiteText, 'utf8'));
  files.set('brief.md', Buffer.from(briefText, 'utf8'));

  for (const page of site.pages) {
    files.set(page.screenshot, renderPagePng(page));
    order.push(page.screenshot);
  }

  for (const asset of site.assets) {
    files.set(asset.path, makeJpeg(asset.width, asset.height, asset.bytes));
    order.push(asset.path);
  }

  const filename = `blueprint_${slugifyBusinessName(site.siteSettings.businessName)}_${site.submission.id.slice(0, 8)}.zip`;
  return { files, order, site, filename, siteText: emittedSiteText, briefText };
}

/** Write a zip from an ordered file map. §1: entries in site.json, brief.md, pages, assets order. */
export async function writeZip(outPath, files, order) {
  const zip = new AdmZip({ noSort: true });
  for (const name of order) {
    const buf = files.get(name);
    if (buf === undefined) continue;
    zip.addFile(name, buf);
  }
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, zip.toBuffer());
  return outPath;
}

export async function buildGreenPackage(specPath, outDir) {
  const parts = await buildFixtureParts(specPath);
  const outPath = path.join(outDir, parts.filename);
  await writeZip(outPath, parts.files, parts.order);
  return { ...parts, outPath };
}
