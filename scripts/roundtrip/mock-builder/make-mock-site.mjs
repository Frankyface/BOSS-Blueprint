#!/usr/bin/env node
/**
 * A MOCK BUILDER — for proving the pipeline, never for producing a verdict.
 *
 *   node scripts/roundtrip/mock-builder/make-mock-site.mjs --package <extracted pkg> --out <dir>
 *
 * It reads `site.json` and emits the static site a competent builder would have written:
 * one page per slug, the homepage at `index.html`, real copy verbatim, uploaded assets on
 * their own pages, a shared nav, in-region placeholders for empty slots, and a
 * `BUILD_NOTES.md`. That is exactly enough for SEG-4, SEG-5 and SEG-6's deterministic
 * layer to run end to end for zero tokens.
 *
 * It is NOT a builder: it reads `site.json` directly, which is the one thing the real
 * builder is being tested on NOT needing to do. Any run that uses it is recorded as
 * `cached: true`, and R10.4 bars a cached run from the ship gate.
 */

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const escapeHtml = (value) =>
  String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function linkHref(link, pages) {
  if (!link || link.kind === 'none') return null;
  if (link.kind === 'external') return link.url;
  const target = pages.find((p) => p.id === link.pageId);
  if (!target) return null;
  return pages.indexOf(target) === 0 ? 'index.html' : `${target.slug}.html`;
}

function renderBlock(block, pages, assets) {
  if (block.type === 'section') return '';
  if (block.type === 'navBar') {
    const items = block.items
      .map((item) => {
        const href = linkHref(item.link, pages);
        return `<a href="${escapeHtml(href ?? '#')}">${escapeHtml(item.label)}</a>`;
      })
      .join('\n      ');
    return `    <nav class="nav">\n      ${items}\n    </nav>`;
  }
  if (block.type === 'heading') {
    const text = block.copyMode === 'real' ? block.text : mockCopy(block.generateDescription);
    return `    <h2>${escapeHtml(text)}</h2>`;
  }
  if (block.type === 'text') {
    const text = block.copyMode === 'real' ? block.text : mockCopy(block.generateDescription);
    const paragraphs = String(text).split('\n').filter((line) => line.trim() !== '');
    return paragraphs.map((line) => `    <p>${escapeHtml(line)}</p>`).join('\n');
  }
  if (block.type === 'button') {
    const href = linkHref(block.link, pages);
    return href === null
      ? `    <button type="button" class="cta">${escapeHtml(block.label)}</button>`
      : `    <a class="cta" href="${escapeHtml(href)}">${escapeHtml(block.label)}</a>`;
  }
  // imageSlot
  const asset = assets.find((a) => a.id === block.assetId);
  const alt = escapeHtml(block.description ?? '');
  if (asset) {
    return `    <img src="assets/${path.basename(asset.path)}" alt="${alt}" width="640" />`;
  }
  return (
    `    <svg class="placeholder" width="640" height="360" role="img" aria-label="${alt}">` +
    `<title>${alt}</title><rect width="640" height="360" fill="#e6e2d8"/>` +
    `<path d="M80 280 L240 140 L360 240 L440 180 L560 280 Z" fill="#2f5233"/></svg>`
  );
}

/** Deterministic stand-in copy: on-topic by construction, never lorem ipsum. */
function mockCopy(description) {
  const trimmed = String(description ?? '').replace(/\s+/g, ' ').trim();
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)} — written for this business, in its own words.`;
}

function renderPage(page, site) {
  const colours = site.siteSettings.colors ?? [];
  const body = page.blocks.map((block) => renderBlock(block, site.pages, site.assets)).filter(Boolean).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(page.name)} — ${escapeHtml(site.siteSettings.businessName)}</title>
<style>
  :root { --ink: ${colours[0] ?? '#1f2937'}; --sand: ${colours[1] ?? '#f4f1ea'}; }
  body { margin: 0; font-family: Georgia, "Times New Roman", serif; color: #1f2937; background: var(--sand); }
  main { max-width: 1200px; margin: 0 auto; padding: 32px; }
  .nav { display: flex; gap: 24px; padding: 16px 0; border-bottom: 4px solid var(--ink); }
  .nav a { color: var(--ink); font-weight: 700; text-decoration: none; }
  h1, h2 { color: var(--ink); }
  .cta { display: inline-block; background: var(--ink); color: #fff; padding: 12px 20px; border: 0; border-radius: 999px; text-decoration: none; }
  img, .placeholder { max-width: 100%; height: auto; display: block; margin: 16px 0; }
</style>
</head>
<body>
  <main>
    <h1>${escapeHtml(site.siteSettings.businessName)}</h1>
${body}
  </main>
</body>
</html>
`;
}

async function main() {
  const argv = process.argv.slice(2);
  const packageDir = path.resolve(argv[argv.indexOf('--package') + 1]);
  const outDir = path.resolve(argv[argv.indexOf('--out') + 1]);
  const site = JSON.parse(await readFile(path.join(packageDir, 'site.json'), 'utf8'));

  const siteDir = path.join(outDir, 'site');
  await mkdir(path.join(siteDir, 'assets'), { recursive: true });

  for (const [index, page] of site.pages.entries()) {
    const file = index === 0 ? 'index.html' : `${page.slug}.html`;
    await writeFile(path.join(siteDir, file), renderPage(page, site), 'utf8');
  }
  for (const asset of site.assets ?? []) {
    await copyFile(path.join(packageDir, asset.path), path.join(siteDir, 'assets', path.basename(asset.path)));
  }

  const notes = [
    '# Build notes',
    '',
    `Built ${String(site.pages.length)} page(s) from the brief.`,
    '',
    '- The pen mark beside the heading reads as "make this bigger", so the heading is the largest element on the page.',
    '- One image slot had no photo, so it carries a clearly-swappable inline SVG placeholder derived from its description.',
    '- A button was left unlinked in the design; I made it inert rather than guessing a target.',
    '',
    'Run it by opening `site/index.html`, or serve the folder statically.',
  ].join('\n');
  await writeFile(path.join(outDir, 'BUILD_NOTES.md'), `${notes}\n`, 'utf8');

  process.stdout.write(`mock site written to ${outDir}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`make-mock-site: ${err.message}\n`);
    process.exit(1);
  });
}
