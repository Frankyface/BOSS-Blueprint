/**
 * SEG-6 — the DETERMINISTIC layer (R8).
 *
 * Everything checkable by code is checked by code; LLM judgment is reserved for the
 * four genuinely perceptual questions (S2, the eval halves of S3/S5, and S6). That split
 * is what stops the verdict from being an opinion: H4–H7 and the det halves of
 * S1/S3/S4/S5 give the same answer every time they are run over the same artefacts.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import {
  DELTA_E_MAX,
  DHASH_MAX_HAMMING,
  S1_MEAN_FLOOR,
  S1_PAGE_FLOOR,
  S4_FLOOR,
  SCORE_WEIGHTS,
  S5_DET_POINTS,
} from './thresholds.mjs';
import { dHash, decodeImage, dominantColours, hamming, isGrayscale, nearestDeltaE } from './lib/image-metrics.mjs';

const LOREM = /lorem ipsum|dolor sit amet/i;
const PLACEHOLDER = /\[|\bTODO\b|placeholder/i;

/* ───────────────────────── reading order (S1) ───────────────────────── */

/**
 * §4.4 grouping: sections by top edge, then their contents by (y, x).
 *
 * A nav bar EXPANDS into one token per item, because that is what actually renders and
 * what a reader actually meets. A `generate` block becomes a WILDCARD: its words are the
 * builder's to write, so demanding a text prefix would score S1 on copy quality, which is
 * S3's job — the only thing S1 asks of a generate block is that some text landed there,
 * in that position.
 */
export function expectedReadingOrder(sitePage) {
  const blocks = (sitePage.blocks ?? []).filter((b) => b.type !== 'section');
  return [...blocks]
    .sort((a, b) => a.frame.y - b.frame.y || a.frame.x - b.frame.x)
    .flatMap(tokensOf);
}

const WILDCARD = '*';

function tokensOf(block) {
  if (block.type === 'navBar') {
    return (block.items ?? []).map((item) => `link:${normalise(item.label).slice(0, 12)}`);
  }
  if (block.type === 'imageSlot') return [`image:${WILDCARD}`];
  if (block.type === 'button') return [`link:${normalise(block.label).slice(0, 12)}`];
  const kind = block.type === 'heading' ? 'heading' : 'text';
  if (block.copyMode === 'generate') return [`${kind}:${WILDCARD}`];
  return [`${kind}:${normalise(block.text).slice(0, 12)}`];
}

function builtReadingOrder(digest) {
  return digest.nodes.map((node) => `${node.kind}:${normalise(node.text).slice(0, 12)}`);
}

/** An expected token matches a built one on kind plus a text prefix, or on kind alone. */
function tokensMatch(expected, built) {
  const [wantKind, wantText] = splitToken(expected);
  const [gotKind, gotText] = splitToken(built);
  if (wantKind !== gotKind) return false;
  if (wantText === WILDCARD) return true;
  return gotText.startsWith(wantText) || wantText.startsWith(gotText);
}

function splitToken(token) {
  const at = token.indexOf(':');
  return [token.slice(0, at), token.slice(at + 1)];
}

function normalise(value) {
  return String(value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Longest common subsequence length — order-sensitive and gap-tolerant, which is exactly
 * the shape of the question: a builder may add its own chrome (an `<h1>` with the business
 * name, a footer) without that counting against the ORDER it put the client's blocks in.
 */
export function lcsLength(a, b, equal = (x, y) => x === y) {
  const rows = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      rows[i][j] = equal(a[i - 1], b[j - 1]) ? rows[i - 1][j - 1] + 1 : Math.max(rows[i - 1][j], rows[i][j - 1]);
    }
  }
  return rows[a.length][b.length];
}

/* ───────────────────────── the deterministic pass ───────────────────────── */

/**
 * @param {object} input
 * @param {object} input.site parsed site.json
 * @param {object} input.scenario
 * @param {string} input.shotsDir
 * @param {string} input.packageDir extracted package (for assets/)
 * @param {object} input.crawl
 * @returns {Promise<object>} the `evaluate.json` payload
 */
export async function evaluateDeterministic({ site, scenario, shotsDir, packageDir, crawl }) {
  const digests = new Map();
  for (const sitePage of site.pages ?? []) {
    const raw = await readFile(path.join(shotsDir, `${sitePage.slug}.dom.json`), 'utf8').catch(() => null);
    digests.set(sitePage.slug, raw === null ? null : JSON.parse(raw));
  }

  const gates = {};
  gates.H4 = checkPageInventory(site, crawl);
  gates.H5 = checkNavGraph(site, digests);
  gates.H6 = checkVerbatimCopy(site, digests);
  gates.H7 = await checkAssets(site, digests, shotsDir, packageDir);

  const s1 = scoreReadingOrder(site, digests);
  const s3 = checkGenerateSanity(site, digests);
  const s4 = scoreImagePlacement(site, digests);
  const s5 = await scoreStyle(site, shotsDir);

  return {
    gates,
    dimensions: { S1: s1, S3: s3, S4: s4, S5: s5 },
    scenario: scenario.id,
  };
}

/* ───────────────────────── hard gates ───────────────────────── */

function checkPageInventory(site, crawl) {
  const problems = [];
  const wanted = (site.pages ?? []).map((p) => p.slug);
  const got = (crawl?.pages ?? []).map((p) => p.slug);
  for (const slug of wanted) if (!got.includes(slug)) problems.push(`no route served for slug "${slug}"`);
  for (const slug of got) if (!wanted.includes(slug)) problems.push(`extra top-level page "${slug}"`);
  const home = crawl?.pages?.[0];
  if (home && home.slug !== wanted[0]) problems.push(`pages[0] "${wanted[0]}" is not the homepage route`);
  return { ok: problems.length === 0, problems };
}

/**
 * The homepage is reachable by several spellings the brief explicitly permits
 * (`docs/export-format.md` §3.2 DoD item 1): `/`, `index.html`, `./`, or a bare `.`.
 * A nav check that only accepted `<slug>.html` would fail every correct build.
 */
function reachesPage(href, slug, isHome) {
  const value = String(href ?? '').trim();
  if (value === '') return false;
  if (isHome && ['/', './', '.', 'index.html', './index.html', '/index.html'].includes(value)) return true;
  const withoutHash = value.split('#')[0].split('?')[0];
  const leaf = withoutHash.replace(/\/$/, '').split('/').pop() ?? '';
  return leaf === slug || leaf === `${slug}.html` || leaf === `${slug}.htm`;
}

function checkNavGraph(site, digests) {
  const problems = [];
  const pages = site.pages ?? [];
  const slugByPageId = new Map(pages.map((p) => [p.id, p.slug]));
  const homeSlug = pages[0]?.slug;

  for (const sitePage of pages) {
    const digest = digests.get(sitePage.slug);
    if (!digest) {
      problems.push(`no DOM digest for "${sitePage.slug}"`);
      continue;
    }
    const hrefs = digest.links.map((l) => String(l.href ?? ''));
    for (const block of sitePage.blocks ?? []) {
      for (const link of linksOfBlock(block)) {
        if (link.kind === 'page') {
          const slug = slugByPageId.get(link.pageId);
          if (!hrefs.some((h) => reachesPage(h, slug, slug === homeSlug))) {
            problems.push(`${sitePage.slug}: no link reaches page "${slug}"`);
          }
        }
        if (link.kind === 'external' && !hrefs.some((h) => h === link.url)) {
          problems.push(`${sitePage.slug}: external link ${link.url} is missing`);
        }
      }
    }
  }
  return { ok: problems.length === 0, problems };
}

function linksOfBlock(block) {
  const links = [];
  if (block.link) links.push(block.link);
  for (const item of block.items ?? []) links.push(item.link);
  return links;
}

/**
 * H6 — 100% of `copyMode: "real"` strings present on their page, whitespace-normalised
 * but otherwise character-exact. **Scenario A's typo must survive.**
 *
 * R8.5 carve-out: `fromTemplate: true` blocks are excluded. The brief's [N12] marker
 * tells the builder that text is filler to replace, so demanding it verbatim would gate
 * the builder on obeying two contradictory instructions.
 */
function checkVerbatimCopy(site, digests) {
  const problems = [];
  let checked = 0;
  for (const sitePage of site.pages ?? []) {
    const digest = digests.get(sitePage.slug);
    const haystack = normalise(digest?.bodyText ?? '');
    for (const block of sitePage.blocks ?? []) {
      if (block.copyMode !== 'real') continue;
      if (block.fromTemplate === true) continue; // R8.5
      const needle = normalise(block.text);
      if (needle === '') continue;
      checked += 1;
      if (!haystack.includes(needle)) {
        problems.push(`${sitePage.slug}: real copy missing or altered — ${JSON.stringify(block.text.slice(0, 80))}`);
      }
    }
    for (const block of sitePage.blocks ?? []) {
      if (block.type !== 'button' || !block.label) continue;
      checked += 1;
      if (!haystack.includes(normalise(block.label))) {
        problems.push(`${sitePage.slug}: button label missing — ${JSON.stringify(block.label)}`);
      }
    }
  }
  return { ok: problems.length === 0, problems, checked };
}

async function checkAssets(site, digests, shotsDir, packageDir) {
  const problems = [];
  const pageOfAsset = new Map();
  for (const sitePage of site.pages ?? []) {
    for (const block of sitePage.blocks ?? []) {
      if (block.type === 'imageSlot' && block.assetId) pageOfAsset.set(block.assetId, sitePage.slug);
    }
  }

  for (const asset of site.assets ?? []) {
    const slug = pageOfAsset.get(asset.id);
    if (!slug) {
      problems.push(`asset ${asset.id} is referenced by no page`);
      continue;
    }
    let expectedHash;
    try {
      expectedHash = dHash(decodeImage(await readFile(path.join(packageDir, asset.path))));
    } catch (err) {
      problems.push(`asset ${asset.id}: could not decode the packaged file — ${err.message}`);
      continue;
    }
    const digest = digests.get(slug);
    const candidates = (digest?.images ?? []).filter((img) => img.src);
    let best = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const bytes = await readImageSource(shotsDir, candidate.src);
      if (!bytes) continue;
      try {
        best = Math.min(best, hamming(expectedHash, dHash(decodeImage(bytes))));
      } catch {
        // an undecodable candidate simply is not a match
      }
    }
    if (best > DHASH_MAX_HAMMING) {
      problems.push(
        `asset ${asset.id} does not appear on "${slug}" (best dHash distance ${best === Number.POSITIVE_INFINITY ? 'n/a' : best} > ${DHASH_MAX_HAMMING})`,
      );
    }
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Resolve an `<img src>` from the built site. Only `data:` URLs and paths under the shot
 * directory's sibling site tree are read — a remote src is simply not a match, which is
 * the correct answer for a build that was supposed to be hermetic.
 */
async function readImageSource(shotsDir, src) {
  if (src.startsWith('data:')) {
    const comma = src.indexOf(',');
    return comma === -1 ? null : Buffer.from(src.slice(comma + 1), 'base64');
  }
  if (/^https?:\/\//i.test(src)) {
    try {
      const url = new URL(src);
      const local = path.join(shotsDir, '..', 'builder', 'sandbox', 'site', decodeURIComponent(url.pathname));
      return await readFile(local);
    } catch {
      return null;
    }
  }
  try {
    return await readFile(path.join(shotsDir, '..', 'builder', 'sandbox', 'site', src));
  } catch {
    return null;
  }
}

/* ───────────────────────── soft dimensions ───────────────────────── */

function scoreReadingOrder(site, digests) {
  const pages = [];
  for (const sitePage of site.pages ?? []) {
    const expected = expectedReadingOrder(sitePage);
    const digest = digests.get(sitePage.slug);
    const built = digest ? builtReadingOrder(digest) : [];
    const matched = expected.length === 0 ? 0 : lcsLength(expected, built, tokensMatch);
    pages.push({
      slug: sitePage.slug,
      score: expected.length === 0 ? 1 : matched / expected.length,
      expected,
      built,
    });
  }
  const mean = pages.length === 0 ? 0 : pages.reduce((n, p) => n + p.score, 0) / pages.length;
  const worst = pages.length === 0 ? 0 : Math.min(...pages.map((p) => p.score));
  return {
    pages,
    mean,
    points: SCORE_WEIGHTS.S1 * mean,
    floorMet: mean >= S1_MEAN_FLOOR && worst >= S1_PAGE_FLOOR,
    floor: { mean: S1_MEAN_FLOOR, page: S1_PAGE_FLOOR },
  };
}

function checkGenerateSanity(site, digests) {
  const items = [];
  for (const sitePage of site.pages ?? []) {
    const digest = digests.get(sitePage.slug);
    const haystack = digest?.bodyText ?? '';
    for (const block of sitePage.blocks ?? []) {
      if (block.copyMode !== 'generate') continue;
      const problems = [];
      const description = block.generateDescription ?? '';
      if (normalise(haystack) === '') problems.push('the page rendered no text at all');
      if (LOREM.test(haystack)) problems.push('the page contains lorem ipsum');
      if (haystack.includes(description) && description.length > 0) {
        problems.push('the generateDescription was echoed verbatim instead of written');
      }
      const written = findWrittenCopy(digest, description);
      if (written === null) problems.push('no candidate copy found for this generate item');
      else if (PLACEHOLDER.test(written)) problems.push(`copy still carries a placeholder marker: ${JSON.stringify(written.slice(0, 60))}`);
      items.push({ page: sitePage.slug, blockId: block.id, ok: problems.length === 0, problems, written });
    }
  }
  return { items, allSane: items.every((i) => i.ok), points: 0, note: 'S3 points come from the evaluator half' };
}

/** The longest paragraph/heading on the page that is not another block's real copy. */
function findWrittenCopy(digest, description) {
  if (!digest) return null;
  const candidates = digest.nodes
    .filter((n) => n.kind === 'text' || n.kind === 'heading')
    .map((n) => n.text)
    .filter((t) => t.length > 0 && t !== description);
  return candidates.sort((a, b) => b.length - a.length)[0] ?? null;
}

function scoreImagePlacement(site, digests) {
  const items = [];
  for (const sitePage of site.pages ?? []) {
    const digest = digests.get(sitePage.slug);
    const pageHeight = sitePage.height || 1600;
    for (const block of sitePage.blocks ?? []) {
      if (block.type !== 'imageSlot') continue;
      const images = digest?.images ?? [];
      const wantThird = Math.floor((block.frame.y / pageHeight) * 3);
      const wantHalf = block.frame.x + block.frame.w / 2 < 600 ? 0 : 1;
      const docHeight = Math.max(1, ...images.map((i) => i.box.y + i.box.h));
      const hit = images.find((img) => {
        const third = Math.floor(((img.box.y + img.box.h / 2) / docHeight) * 3);
        const half = img.box.x + img.box.w / 2 < 600 ? 0 : 1;
        return third === wantThird && half === wantHalf;
      });
      const emptySlotOk =
        block.assetId === null
          ? images.some((img) => (img.alt ?? '').length > 0) || (digest?.nodes ?? []).some((n) => n.tag === 'svg')
          : true;
      items.push({
        page: sitePage.slug,
        blockId: block.id,
        empty: block.assetId === null,
        ok: Boolean(hit) && emptySlotOk,
      });
    }
  }
  const fraction = items.length === 0 ? 1 : items.filter((i) => i.ok).length / items.length;
  return {
    items,
    fraction,
    points: SCORE_WEIGHTS.S4 * fraction,
    floorMet: fraction >= S4_FLOOR,
    floor: S4_FLOOR,
  };
}

async function scoreStyle(site, shotsDir) {
  const colours = (site.siteSettings?.colors ?? []).map(String);
  const perPage = [];
  for (const sitePage of site.pages ?? []) {
    let dominants = [];
    try {
      dominants = dominantColours(decodeImage(await readFile(path.join(shotsDir, `${sitePage.slug}.png`))));
    } catch {
      dominants = [];
    }
    perPage.push({
      slug: sitePage.slug,
      dominants,
      nonGrayscale: dominants.filter((d) => !isGrayscale(d.rgb)).length,
      nearest: colours.map((hex) => ({ hex, deltaE: dominants.length === 0 ? Infinity : nearestDeltaE(hex, dominants) })),
    });
  }

  const colourMet =
    colours.length === 0 || perPage.some((p) => p.nearest.some((n) => n.deltaE < DELTA_E_MAX));
  const styled = perPage.some((p) => p.nonGrayscale >= 2);

  return {
    perPage,
    colourDeclared: colours.length > 0,
    colourMet,
    styled,
    points: (colourMet ? S5_DET_POINTS / 2 : 0) + (styled ? S5_DET_POINTS / 2 : 0),
    floorMet: colourMet,
    deltaEMax: DELTA_E_MAX,
  };
}
