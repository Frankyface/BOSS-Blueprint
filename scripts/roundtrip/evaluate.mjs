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
  FRAME_CHAR_WIDTH_PX,
  FRAME_LINE_HEIGHT_PX,
  S1_MEAN_FLOOR,
  S1_PAGE_FLOOR,
  S3_LENGTH_MAX_RATIO,
  S3_LENGTH_MIN_RATIO,
  S3_SENTENCE_HINT_TOLERANCE,
  S4_FLOOR,
  S4_THIRD_TOLERANCE,
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
      const written = findWrittenCopy({ digest, sitePage, block });
      let length = null;
      if (written === null) {
        problems.push('no candidate copy found for this generate item');
      } else {
        if (PLACEHOLDER.test(written)) {
          problems.push(`copy still carries a placeholder marker: ${JSON.stringify(written.slice(0, 60))}`);
        }
        // R8.2's length rule. It was specified and never implemented: a builder that
        // wrote three words where a two-sentence paragraph belongs used to pass the
        // deterministic half untouched.
        length = checkCopyLength({ written, lengthHint: block.lengthHint, frame: block.frame });
        if (!length.ok) {
          problems.push(
            `copy length ${String(length.measured)} ${length.unit} is outside the ${length.rule} band ` +
              `${String(length.min)}–${String(length.max)}`,
          );
        }
      }
      items.push({ page: sitePage.slug, blockId: block.id, ok: problems.length === 0, problems, written, length });
    }
  }
  return { items, allSane: items.every((i) => i.ok), points: 0, note: 'S3 points come from the evaluator half' };
}

/**
 * THE BLOCK'S OWN COPY, not the longest thing on the page.
 *
 * The original picked the longest paragraph or heading anywhere on the page, which
 * meant every generate block on a page was graded against the SAME string — usually
 * some other block's real copy — so a genuinely empty generate block could score as
 * sane while a good one failed the placeholder test on a neighbour's text.
 *
 * There is no id mapping from `site.json` to the builder's DOM (there cannot be — the
 * builder writes its own markup), so position is the honest proxy: among nodes of the
 * right kind that are not another block's real copy, take the one whose relative
 * vertical position is nearest the block's. Same information a human comparing sketch
 * to shot uses.
 */
export function findWrittenCopy({ digest, sitePage, block }) {
  if (!digest || !Array.isArray(digest.nodes)) return null;

  const description = block.generateDescription ?? '';
  const realCopy = (sitePage?.blocks ?? [])
    .filter((b) => b.copyMode === 'real' && typeof b.text === 'string' && b.text.trim() !== '')
    .map((b) => normalise(b.text));

  const usable = digest.nodes.filter((node) => {
    if (node.kind !== 'text' && node.kind !== 'heading') return false;
    const text = String(node.text ?? '');
    if (text.length === 0 || text === description) return false;
    const value = normalise(text);
    return !realCopy.some((copy) => copy === value || copy.includes(value) || value.includes(copy));
  });
  if (usable.length === 0) return null;

  const wantKind = block.type === 'heading' ? 'heading' : 'text';
  const sameKind = usable.filter((node) => node.kind === wantKind);
  // A builder may legitimately render a generate text block as a heading (or the
  // reverse); kind is a preference, not a requirement, so an empty same-kind set falls
  // back rather than reporting "no candidate copy" for a page that plainly has some.
  const pool = sameKind.length > 0 ? sameKind : usable;

  const pageHeight = sitePage?.height || 1600;
  const docHeight = Math.max(1, ...pool.map((node) => node.box.y + node.box.h));
  const wantRatio = (block.frame.y + block.frame.h / 2) / pageHeight;

  let best = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const node of pool) {
    const ratio = (node.box.y + node.box.h / 2) / docHeight;
    const distance = Math.abs(ratio - wantRatio);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node;
    }
  }
  return best === null ? null : String(best.text);
}

/** How many characters the block's frame can hold at the 1200px design width. */
export function estimateFrameChars(frame) {
  const perLine = Math.max(1, Math.floor((frame?.w ?? 0) / FRAME_CHAR_WIDTH_PX));
  const lines = Math.max(1, Math.floor((frame?.h ?? 0) / FRAME_LINE_HEIGHT_PX));
  return perLine * lines;
}

/** `~2 sentences`, `about 40 words`, `80 characters` — or null when it says none of those. */
export function parseLengthHint(hint) {
  const match = /(\d+)\s*(sentence|word|character|char)/i.exec(String(hint ?? ''));
  if (!match) return null;
  const unit = match[2].toLowerCase();
  return {
    count: Number(match[1]),
    unit: unit.startsWith('sentence') ? 'sentences' : unit.startsWith('word') ? 'words' : 'characters',
  };
}

function countSentences(text) {
  return String(text).split(/[.!?]+/).filter((part) => /[a-z0-9]/i.test(part)).length;
}

function countWords(text) {
  return String(text).split(/\s+/).filter((token) => /[a-z0-9]/i.test(token)).length;
}

/**
 * R8.2 S3 · "length within `lengthHint` or 0.3–3× the frame estimate".
 * The hint wins when the client gave one; the frame is the fallback the scenario's
 * no-lengthHint generate block exists to exercise.
 */
export function checkCopyLength({ written, lengthHint, frame }) {
  const hint = parseLengthHint(lengthHint);
  if (hint !== null) {
    if (hint.unit === 'sentences') {
      const measured = countSentences(written);
      const min = Math.max(1, hint.count - S3_SENTENCE_HINT_TOLERANCE);
      const max = hint.count + S3_SENTENCE_HINT_TOLERANCE;
      return { ok: measured >= min && measured <= max, rule: 'lengthHint', unit: 'sentences', measured, min, max };
    }
    const measured = hint.unit === 'words' ? countWords(written) : written.length;
    const min = Math.max(1, Math.round(hint.count * S3_LENGTH_MIN_RATIO));
    const max = Math.round(hint.count * S3_LENGTH_MAX_RATIO);
    return { ok: measured >= min && measured <= max, rule: 'lengthHint', unit: hint.unit, measured, min, max };
  }

  const estimate = estimateFrameChars(frame);
  const min = Math.max(1, Math.round(estimate * S3_LENGTH_MIN_RATIO));
  const max = Math.round(estimate * S3_LENGTH_MAX_RATIO);
  const measured = written.length;
  return { ok: measured >= min && measured <= max, rule: 'frame estimate', unit: 'characters', measured, min, max, estimate };
}

/** Vertical bucket of a centre within its surface: 0 = top third, 1 = middle, 2 = bottom. */
export function verticalThird(centre, surfaceHeight) {
  const height = surfaceHeight > 0 ? surfaceHeight : 1;
  return Math.min(2, Math.max(0, Math.floor((centre / height) * 3)));
}

/** Which half of the 1200 px sketch width a centre falls in. 0 = left, 1 = right. */
function horizontalHalf(x, w) {
  return x + w / 2 < 600 ? 0 : 1;
}

/**
 * The rendered surface a placement is measured against — the page's REAL document height.
 *
 * `documentHeight` is recorded by SEG-5's digest. The fallback is the tallest element's
 * bottom, for digests captured before that field existed; it is deliberately NOT the
 * max-of-image-bottoms proxy this replaced, which made the top third unreachable for any
 * page rendering a single image (docs/decisions.md, 2026-07-29).
 */
export function renderedSurfaceHeight(digest) {
  const recorded = digest?.documentHeight ?? 0;
  if (recorded > 0) return recorded;
  const nodes = digest?.nodes ?? [];
  const bottom = nodes.length === 0 ? 0 : Math.max(...nodes.map((n) => n.box.y + n.box.h));
  return bottom > 0 ? bottom : 1;
}

/**
 * S4 · did each image land where the sketch put it?
 *
 * Both sides are normalised the SAME way — a centre divided by the height of the surface it
 * sits on — then bucketed into thirds, and a placement matches when the buckets are within
 * `S4_THIRD_TOLERANCE`. The tolerance exists because the surfaces differ structurally, not
 * to be lenient: a gross misplacement (top-sketched, bottom-built) is two thirds away and
 * still fails. Horizontal half is exact.
 */
export function scoreImagePlacement(site, digests) {
  const items = [];
  for (const sitePage of site.pages ?? []) {
    const digest = digests.get(sitePage.slug);
    const pageHeight = sitePage.height || 1600;
    for (const block of sitePage.blocks ?? []) {
      if (block.type !== 'imageSlot') continue;
      const images = digest?.images ?? [];
      const wantThird = verticalThird(block.frame.y + block.frame.h / 2, pageHeight);
      const wantHalf = horizontalHalf(block.frame.x, block.frame.w);
      const docHeight = renderedSurfaceHeight(digest);
      let bestDelta = null;
      const hit = images.find((img) => {
        const third = verticalThird(img.box.y + img.box.h / 2, docHeight);
        const half = horizontalHalf(img.box.x, img.box.w);
        const delta = Math.abs(third - wantThird);
        if (half === wantHalf && (bestDelta === null || delta < bestDelta)) bestDelta = delta;
        return half === wantHalf && delta <= S4_THIRD_TOLERANCE;
      });
      const emptySlotOk =
        block.assetId === null
          ? images.some((img) => (img.alt ?? '').length > 0) || (digest?.nodes ?? []).some((n) => n.tag === 'svg')
          : true;
      items.push({
        page: sitePage.slug,
        blockId: block.id,
        empty: block.assetId === null,
        wantThird,
        wantHalf,
        docHeight,
        thirdDelta: bestDelta,
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
