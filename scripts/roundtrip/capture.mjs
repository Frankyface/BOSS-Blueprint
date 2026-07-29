/**
 * SEG-5 — built-site capture (R6).
 *
 * Serves `site/` with the committed `static-server.mjs` (never `npx`: ruling 5), crawls
 * the nav graph, collects console errors and failed requests, takes a full-page
 * screenshot per page at 1200×900, and extracts a reading-order DOM digest per page.
 *
 * The 1200px viewport is not a preference: it is the design width, so a shot and its
 * sketch PNG are directly comparable and S1/S2/S4 can be asked the same question about
 * both. `deviceScaleFactor: 1` for the same reason.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from '@playwright/test';

import { SHOT_VIEWPORT } from './thresholds.mjs';
import { startStaticServer } from './static-server.mjs';

/**
 * @param {object} input
 * @param {string} input.siteDir the builder's `site/`
 * @param {string} input.outDir  `<runDir>/shots/`
 * @param {object} input.site    parsed site.json (for the page list)
 * @returns {Promise<{ crawl: object, console: object, pages: object[], problems: string[] }>}
 */
export async function captureSite({ siteDir, outDir, site }) {
  await mkdir(outDir, { recursive: true });
  const server = await startStaticServer({ root: siteDir });
  const browser = await chromium.launch();
  const problems = [];

  try {
    const context = await browser.newContext({
      viewport: { width: SHOT_VIEWPORT.width, height: SHOT_VIEWPORT.height },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });

    const consoleLog = {};
    const captured = [];
    const crawl = [];

    for (const [index, sitePage] of (site.pages ?? []).entries()) {
      const slug = sitePage.slug;
      const url = index === 0 ? `${server.url}/` : `${server.url}/${slug}`;
      const page = await context.newPage();

      const messages = [];
      page.on('console', (msg) => messages.push({ type: msg.type(), text: msg.text() }));
      page.on('requestfailed', (req) =>
        messages.push({ type: 'requestfailed', text: `${req.url()} — ${req.failure()?.errorText ?? 'failed'}` }),
      );
      page.on('response', (res) => {
        if (res.status() >= 400) messages.push({ type: 'httperror', text: `${res.status()} ${res.url()}` });
      });

      const response = await page.goto(url, { waitUntil: 'networkidle' }).catch(() => null);
      if (!response || response.status() >= 400) {
        problems.push(`page "${slug}" did not load from ${url} (${response?.status() ?? 'no response'})`);
      }
      await page.waitForTimeout(250);

      await page.screenshot({ path: path.join(outDir, `${slug}.png`), fullPage: true });

      const digest = await extractDigest(page);
      await writeFile(path.join(outDir, `${slug}.dom.json`), `${JSON.stringify(digest, null, 2)}\n`, 'utf8');

      consoleLog[slug] = messages;
      captured.push({ slug, url, resolvedAs: server.resolutions.get(new URL(url).pathname) ?? 'unknown' });
      for (const link of digest.links) crawl.push({ from: slug, label: link.text, to: link.href });

      const errors = messages.filter((m) => m.type === 'error' || m.type === 'requestfailed' || m.type === 'httperror');
      if (errors.length > 0) {
        problems.push(`page "${slug}": ${errors.length} console error(s) / failed request(s)`);
      }
      await page.close();
    }

    await writeFile(
      path.join(outDir, 'crawl.json'),
      `${JSON.stringify({ pages: captured, edges: crawl }, null, 2)}\n`,
      'utf8',
    );
    await writeFile(path.join(outDir, 'console.json'), `${JSON.stringify(consoleLog, null, 2)}\n`, 'utf8');

    return { crawl: { pages: captured, edges: crawl }, console: consoleLog, pages: captured, problems };
  } finally {
    await browser.close();
    await server.close();
  }
}

/**
 * R6.6 — the reading-order digest each deterministic check reads.
 *
 * This is the ONE place the harness runs script in a page, and it is a pure read of the
 * BUILDER's output, not of the app under test. R2.2's ban is on injecting state into the
 * product; extracting geometry from a static site the builder wrote is the measurement.
 */
async function extractDigest(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const rect = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x + window.scrollX), y: Math.round(r.y + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const text = (el) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

    const nodes = [];
    for (const el of document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,a,button,img,svg')) {
      if (!visible(el)) continue;
      const tag = el.tagName.toLowerCase();
      const kind = /^h[1-6]$/.test(tag)
        ? 'heading'
        : tag === 'p' || tag === 'li'
          ? 'text'
          : tag === 'a' || tag === 'button'
            ? 'link'
            : 'image';
      nodes.push({
        kind,
        tag,
        text: kind === 'image' ? (el.getAttribute('alt') ?? '') : text(el),
        href: el.getAttribute('href'),
        src: el.getAttribute('src'),
        box: box(el),
      });
    }
    nodes.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);

    // The rendered page's TRUE height, so a placement check can normalise against the
    // surface the image actually sits on. Before this existed, S4 used the bottom edge of
    // the lowest image as a stand-in, which made the top third unreachable whenever a page
    // rendered a single image (docs/decisions.md, 2026-07-29).
    //
    // Guard against a pathological scrollHeight (0 on a not-yet-laid-out document, or a
    // collapsed body): floor at the viewport height AND at the tallest element's bottom,
    // so the denominator is never smaller than the content it has to measure.
    const viewportHeight = window.innerHeight || 0;
    const contentBottom = nodes.length === 0 ? 0 : Math.max(...nodes.map((n) => n.box.y + n.box.h));
    const documentHeight = Math.max(
      document.documentElement?.scrollHeight ?? 0,
      document.body?.scrollHeight ?? 0,
      viewportHeight,
      contentBottom,
    );

    return {
      title: document.title,
      bodyText: (document.body.textContent ?? '').replace(/\s+/g, ' ').trim(),
      documentHeight,
      viewportHeight,
      contentBottom,
      nodes,
      links: nodes.filter((n) => n.kind === 'link').map((n) => ({ text: n.text, href: n.href })),
      images: nodes.filter((n) => n.kind === 'image').map((n) => ({ src: n.src, alt: n.text, box: n.box })),
    };
  });
}
