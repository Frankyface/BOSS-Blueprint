/**
 * BRAND ASSET FACTORY — the raster files in `public/` are generated, not drawn.
 *
 * `public/favicon.svg` is the ONE source of the mark. The `.ico` and the
 * Apple touch icon are rasterisations of it, and the social card is laid out with
 * the same three tokens the app uses (`src/styles/theme.css`), so a brand change
 * is one SVG edit plus one run of this script rather than four files to keep in
 * step by hand.
 *
 * It is a design-time tool, deliberately NOT wired into `npm run build`: the
 * outputs are committed bytes that a test asserts on, and a build step that
 * regenerated them would bless whatever it produced instead of failing.
 *
 *   node scripts/brand/make-brand-assets.mjs
 *
 * Rasterising needs a renderer. Playwright's chromium is already a dev dependency
 * of this repo (the E2E suite), so this adds nothing to install — and it renders
 * the card with the same engine the app is designed against.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const PUBLIC_DIR = join(REPO_ROOT, 'public');

/** Kept in step with `src/styles/theme.css`. */
const INK = '#0b1220';
const ACCENT = '#f4b23e';
const TEXT_INVERT = '#f7f9fc';
const MUTED = '#b9c3d6';
const FONT = "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";

/** Open Graph's own recommendation, and what every card renderer crops to. */
const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;

/** Apple's home-screen icon size; iOS downsamples from it for everything smaller. */
const TOUCH_ICON_SIZE = 180;

/** One 32px entry is enough: every browser that reads .ico at all upscales it. */
const ICO_SIZE = 32;

const markSvg = readFileSync(join(PUBLIC_DIR, 'favicon.svg'), 'utf8');

/**
 * The card. Flat colour, one hairline grid and three lines of type — it has to
 * stay legible at the 240px-wide thumbnail a chat client actually shows.
 */
function cardHtml() {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body {
    width: ${CARD_WIDTH}px; height: ${CARD_HEIGHT}px;
    font-family: ${FONT};
    color: ${TEXT_INVERT};
    background-color: ${INK};
    background-image:
      repeating-linear-gradient(0deg, transparent 0 47px, rgba(247,249,252,0.055) 47px 48px),
      repeating-linear-gradient(90deg, transparent 0 47px, rgba(247,249,252,0.055) 47px 48px);
    display: flex; flex-direction: column; justify-content: center;
    padding: 0 96px;
    overflow: hidden;
  }
  /* Inverted, so the mark reads as the app header's accent tile rather than
     dissolving into a background that is the same ink as its own backplate. */
  .mark { width: 112px; height: 112px; margin-bottom: 44px; }
  .mark svg { width: 112px; height: 112px; }
  .mark rect { fill: ${ACCENT}; }
  .mark path { fill: ${INK}; }
  h1 { font-size: 92px; font-weight: 800; letter-spacing: -0.015em; line-height: 1; }
  p { margin-top: 28px; font-size: 40px; font-weight: 400; color: ${MUTED}; }
  .rule { margin-top: 52px; width: 220px; height: 10px; background: ${ACCENT}; border-radius: 5px; }
  .by { margin-top: 30px; font-size: 30px; font-weight: 600; color: ${ACCENT}; }
</style></head>
<body>
  <div class="mark">${markSvg}</div>
  <h1>BOSS Blueprint</h1>
  <p>Sketch your website page by page. We build it.</p>
  <div class="rule"></div>
  <div class="by">bossolutions.pro</div>
</body></html>`;
}

/** The mark alone, centred on transparency, for the icon rasterisations. */
function iconHtml(size) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; background: transparent; }
  body { width: ${size}px; height: ${size}px; }
  svg { display: block; width: ${size}px; height: ${size}px; }
</style></head><body>${markSvg}</body></html>`;
}

/**
 * An ICO wrapping a single PNG. The PNG-payload form (rather than the legacy
 * BMP one) has been read by every shipping browser since IE11, and it keeps the
 * transparency the BMP form mangles.
 */
function icoWrapping(pngBytes) {
  const HEADER_BYTES = 6;
  const ENTRY_BYTES = 16;
  const header = Buffer.alloc(HEADER_BYTES + ENTRY_BYTES);

  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image

  header.writeUInt8(ICO_SIZE, 6); // width
  header.writeUInt8(ICO_SIZE, 7); // height
  header.writeUInt8(0, 8); // palette size: none
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(pngBytes.length, 14);
  header.writeUInt32LE(HEADER_BYTES + ENTRY_BYTES, 18);

  return Buffer.concat([header, pngBytes]);
}

async function shoot(page, html, width, height, options = {}) {
  await page.setViewportSize({ width, height });
  await page.setContent(html, { waitUntil: 'load' });
  return page.screenshot({ omitBackground: options.omitBackground === true });
}

async function main() {
  const browser = await chromium.launch();
  // dpr 1, exactly like the PNG export renderer: a retina card would silently
  // ship at 2400x1260 and fail the dimension assertion for a confusing reason.
  const page = await browser.newPage({ deviceScaleFactor: 1 });

  try {
    const card = await shoot(page, cardHtml(), CARD_WIDTH, CARD_HEIGHT);
    writeFileSync(join(PUBLIC_DIR, 'og-card.png'), card);

    const touch = await shoot(page, iconHtml(TOUCH_ICON_SIZE), TOUCH_ICON_SIZE, TOUCH_ICON_SIZE);
    writeFileSync(join(PUBLIC_DIR, 'apple-touch-icon.png'), touch);

    const small = await shoot(page, iconHtml(ICO_SIZE), ICO_SIZE, ICO_SIZE, {
      omitBackground: true,
    });
    writeFileSync(join(PUBLIC_DIR, 'favicon.ico'), icoWrapping(small));
  } finally {
    await browser.close();
  }

  console.log('Wrote og-card.png (1200x630), apple-touch-icon.png (180x180), favicon.ico (32x32)');
}

await main();
