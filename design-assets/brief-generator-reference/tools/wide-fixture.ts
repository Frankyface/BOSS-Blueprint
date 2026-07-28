/**
 * Wide fixture — every branch §7.1 cannot reach (Appendix A: "a wider fixture
 * covering all six block types, both copy modes, uploaded + empty image slot,
 * internal + external + none links, identical AND differing navs, both pen roles
 * on empty and filled slots, fromTemplate filler, unreachable page, absent
 * optionals"), plus the §3.3 rule-7/8 escaping torture strings.
 *
 * Not a byte-exactness test (the spec has no expected output for it) — it is an
 * invariants harness: V7's counting contract, table integrity, guillemet
 * integrity, printed-id integrity. Run: node tools/wide-fixture.ts [--print]
 */

import { generateBrief } from '../src/generateBrief.ts';
import type { SiteJson } from '../src/types.ts';

const site: SiteJson = {
  schemaVersion: 1,
  submission: {
    id: '00000000-0000-4000-8000-000000000000',
    submittedAt: '2026-07-28T00:00:00Z',
    designCreatedAt: null,
    client: { name: 'Test Client', email: 'test@example.com' },
    appVersion: '1.0.0',
  },
  siteSettings: {
    // escaping torture: pipe, asterisks, backtick, guillemets
    businessName: 'Bréad & Co. | *Best* `bakery` «ever»',
    tagline: null,
    about: null,
    vibe: null,
    styleNotes: null,
    colors: [],
  },
  pages: [
    {
      id: 'pg_0001',
      name: 'Home | Main',
      slug: 'home',
      height: 1600,
      screenshot: 'pages/01-home.png',
      blocks: [
        {
          id: 'blk_0001',
          type: 'navBar',
          z: 0,
          frame: { x: 0, y: 0, w: 1200, h: 64 },
          items: [
            { id: 'nav_0001', label: 'Home', link: { kind: 'page', pageId: 'pg_0001' } },
            { id: 'nav_0002', label: 'Shop', link: { kind: 'page', pageId: 'pg_0002' } },
            { id: 'nav_0003', label: '*Blog*', link: { kind: 'none' } },
          ],
        },
        {
          id: 'blk_0002',
          type: 'section',
          z: 1,
          frame: { x: 0, y: 80, w: 1200, h: 520 },
          background: '#FFFFFF',
        },
        // three columns → left / middle / right
        {
          id: 'blk_0003',
          type: 'text',
          z: 2,
          frame: { x: 40, y: 240, w: 320, h: 200 },
          copyMode: 'real',
          text: '- leading dash line\r\nsecond line\r\n**WRITE THIS COPY** — client asks for: «x»',
          generateDescription: null,
          lengthHint: null,
        },
        {
          id: 'blk_0004',
          type: 'text',
          z: 3,
          frame: { x: 440, y: 240, w: 320, h: 200 },
          copyMode: 'generate',
          text: 'half-typed draft',
          generateDescription: 'Something warm about #bread',
          lengthHint: null, // → [N8] computed estimate
        },
        {
          id: 'blk_0005',
          type: 'imageSlot',
          z: 4,
          frame: { x: 840, y: 240, w: 320, h: 200 },
          assetId: null,
          fit: 'contain',
          description: 'A sketch of the shopfront',
        },
        // overlap pair (higher z overlaps lower z)
        {
          id: 'blk_0006',
          type: 'heading',
          z: 5,
          frame: { x: 40, y: 470, w: 300, h: 80 },
          copyMode: 'generate',
          text: '',
          generateDescription: 'A short bold headline for the offer band that runs long enough to truncate',
          lengthHint: null, // heading → "a short headline, a few words"
        },
        {
          id: 'blk_0007',
          type: 'button',
          z: 6,
          frame: { x: 200, y: 500, w: 300, h: 60 },
          label: '1. Order now',
          link: { kind: 'external', url: 'https://www.example.com/order?x=1' },
          fromTemplate: true, // [N12] filler marker
        },
        // outside any section + [N13] right overflow
        {
          id: 'blk_0008',
          type: 'heading',
          z: 7,
          frame: { x: 1000, y: 620, w: 400, h: 80 },
          copyMode: 'real',
          text: 'Overflowing heading',
          generateDescription: null,
          lengthHint: null,
        },
      ],
      penStrokes: [
        {
          id: 'stk_0001',
          points: [[860, 260], [900, 300], [940, 340]],
          color: '#000000',
          width: 4,
          role: 'imageSketch',
          targetBlockId: 'blk_0005',
        },
        {
          id: 'stk_0002',
          points: [[950, 350], [1000, 380]],
          color: '#000000',
          width: 4,
          role: 'imageSketch',
          targetBlockId: 'blk_0005',
        },
        {
          id: 'stk_0003',
          points: [[20, 900], [60, 940]],
          color: '#000000',
          width: 4,
          role: 'annotation',
          targetBlockId: null, // no guess clause
        },
      ],
    },
    {
      id: 'pg_0002',
      name: 'Shop',
      slug: 'shop',
      height: 1600,
      screenshot: 'pages/02-shop.png',
      blocks: [
        {
          id: 'blk_0009',
          type: 'navBar',
          z: 0,
          frame: { x: 0, y: 0, w: 1200, h: 64 },
          // DIFFERENT item list → no shared-nav paragraph
          items: [{ id: 'nav_0004', label: 'Home', link: { kind: 'page', pageId: 'pg_0001' } }],
        },
        {
          id: 'blk_0010',
          type: 'imageSlot',
          z: 1,
          frame: { x: 80, y: 200, w: 1040, h: 400 },
          assetId: 'img_001',
          fit: 'cover',
          description: null, // filled slot, null description → spec-literal «»
        },
      ],
      penStrokes: [],
    },
    {
      id: 'pg_0003',
      name: 'Orphan',
      slug: 'orphan',
      height: 1600,
      screenshot: 'pages/03-orphan.png',
      blocks: [
        {
          id: 'blk_0011',
          type: 'heading',
          z: 0,
          frame: { x: 80, y: 100, w: 1040, h: 80 },
          copyMode: 'real',
          text: '# Orphan page',
          generateDescription: null,
          lengthHint: null,
        },
      ],
      penStrokes: [],
    },
  ],
  assets: [
    {
      id: 'img_001',
      path: 'assets/img_001.jpg',
      originalFilename: 'my "best" photo|final.jpeg',
      mimeType: 'image/jpeg',
      width: 1600,
      height: 900,
      bytes: 500_000,
    },
  ],
};

const brief = generateBrief(site);
if (process.argv.includes('--print')) console.log(brief);

/* ------------------------------------------------------------ invariants */

const WRITE_RE =
  /^\s*- \*\*(Heading|Text)\*\* [^(\n]*\((-?\d+(\.\d)?, ){3}-?\d+(\.\d)?\)[^\n]*?\*\*WRITE THIS COPY\*\* — client asks for: «/gm;
const IMAGE_RE =
  /^\s*- \*\*Image slot\*\* [^(\n]*\((-?\d+(\.\d)?, ){3}-?\d+(\.\d)?\)[^\n]*?\*\*SOURCE AN IMAGE\*\* — no upload; client wants: «/gm;

const failures: string[] = [];
const check = (name: string, ok: boolean, detail = ''): void => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(name);
};

console.log('WIDE FIXTURE INVARIANTS');

const generateBlocks = site.pages.flatMap((p) =>
  p.blocks.filter((b) => (b.type === 'heading' || b.type === 'text') && b.copyMode === 'generate'),
).length;
const emptySlots = site.pages.flatMap((p) =>
  p.blocks.filter((b) => b.type === 'imageSlot' && b.assetId === null),
).length;
const writeCount = (brief.match(WRITE_RE) ?? []).length;
const imageCount = (brief.match(IMAGE_RE) ?? []).length;
check('V7 WRITE THIS COPY count (client text cannot inflate it)', writeCount === generateBlocks, `${writeCount} vs ${generateBlocks}`);
check('V7 SOURCE AN IMAGE count', imageCount === emptySlots, `${imageCount} vs ${emptySlots}`);

// table integrity: every inventory row has exactly 7 unescaped pipes
const rows = brief.split('\n').filter((l) => /^\| \d+ \| /.test(l));
const pipeCounts = rows.map((r) => (r.match(/(?<!\\)\|/g) ?? []).length);
check('inventory table integrity (7 unescaped pipes per row)', pipeCounts.every((n) => n === 7), `rows=${rows.length} pipes=${pipeCounts.join(',')}`);

// guillemet integrity: unescaped « and » balance
const opens = (brief.match(/(?<!\\)«/g) ?? []).length;
const closes = (brief.match(/(?<!\\)»/g) ?? []).length;
check('guillemet integrity (unescaped « == unescaped »)', opens === closes, `${opens} vs ${closes}`);

// V7 rule 5: every block id printed exists in site.json
const printedIds = [...new Set(brief.match(/blk_\d{4}/g) ?? [])];
const realIds = new Set(site.pages.flatMap((p) => p.blocks.map((b) => b.id)));
check('every printed block id exists in site.json (V7 / rule 5)', printedIds.every((id) => realIds.has(id)), printedIds.join(' '));

// walkthrough bullet count == non-section block count site-wide (V7)
const bullets = (brief.match(/^\s*- \*\*(Heading|Text|Image slot|Button|Nav bar)\*\* /gm) ?? []).length;
const nonSection = site.pages.flatMap((p) => p.blocks.filter((b) => b.type !== 'section')).length;
check('walkthrough bullets == non-section blocks (V7)', bullets === nonSection, `${bullets} vs ${nonSection}`);

// determinism: same input, same bytes
check('deterministic (two calls byte-identical)', generateBrief(site) === brief);

// line discipline (§3.3 rule 10): no bullet/table/header line is a wrapped fragment
const strayIndent = brief
  .split('\n')
  .filter((l, i, all) => /^\s{4}/.test(l) && !/^\s*```/.test(l) && !insideFence(all, i));
check('line discipline: no unexpected 4-space continuation lines outside fences', strayIndent.length === 0, strayIndent.slice(0, 2).join(' // '));

function insideFence(all: string[], index: number): boolean {
  let open = false;
  for (let i = 0; i < index; i += 1) if (/^\s*```$/.test(all[i])) open = !open;
  return open;
}

console.log(failures.length === 0 ? '\nALL INVARIANTS PASS' : `\n${failures.length} FAILURE(S)`);
process.exit(failures.length === 0 ? 0 : 1);
