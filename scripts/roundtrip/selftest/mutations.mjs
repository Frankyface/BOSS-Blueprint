/**
 * Red-path mutations. Each takes the green package parts and returns NEW parts
 * (nothing is mutated in place) plus the check the gate must name.
 *
 *   expect      the check id that MUST be in the gate's FAIL list (or WARN list
 *               when expectStatus is 'WARN')
 *   expectStatus 'FAIL' (default) or 'WARN' — a WARN mutation must still exit 0
 *   gateArgs    extra CLI flags this mutation needs
 */

import { renderBlankPng, renderPagePngAtSize, makeJpeg } from './render.mjs';

const clone = (v) => structuredClone(v);

/** Rebuild the parts with a mutated site.json (re-serialized in the §1 file convention). */
function withSite(parts, mutate) {
  const site = clone(parts.site);
  mutate(site);
  const files = new Map(parts.files);
  files.set('site.json', Buffer.from(`${JSON.stringify(site, null, 2)}\n`, 'utf8'));
  return { ...parts, site, files, order: [...parts.order] };
}

function withFiles(parts, mutate) {
  const files = new Map(parts.files);
  const order = [...parts.order];
  const next = mutate(files, order) ?? {};
  return { ...parts, files, order, ...next };
}

function findBlock(site, id) {
  for (const page of site.pages) {
    const block = page.blocks.find((b) => b.id === id);
    if (block) return block;
  }
  throw new Error(`fixture has no block ${id}`);
}

export const MUTATIONS = [
  {
    name: 'wrong-png-dims',
    what: 'page 1 PNG rendered 1200×1592 instead of 1200×1600',
    expect: 'V06',
    apply: (p) =>
      withFiles(p, (files) => {
        files.set('pages/01-home.png', renderPagePngAtSize(p.site.pages[0], 1200, 1592));
      }),
  },
  {
    name: 'blank-png',
    what: 'page 2 PNG is a uniform white raster',
    expect: 'V06',
    apply: (p) =>
      withFiles(p, (files) => {
        files.set('pages/02-contact.png', renderBlankPng(1200, 1600));
      }),
  },
  {
    name: 'corrupt-png',
    what: 'page 1 PNG bytes truncated mid-stream',
    expect: 'V06',
    apply: (p) =>
      withFiles(p, (files) => {
        files.set('pages/01-home.png', files.get('pages/01-home.png').subarray(0, 400));
      }),
  },
  {
    name: 'missing-asset-file',
    what: 'assets/img_001.jpg dropped from the zip while the manifest keeps it',
    expect: 'V04',
    apply: (p) =>
      withFiles(p, (files, order) => {
        files.delete('assets/img_001.jpg');
        order.splice(order.indexOf('assets/img_001.jpg'), 1);
      }),
  },
  {
    name: 'unmanifested-asset-file',
    what: 'an extra assets/img_002.png staged with no manifest entry',
    expect: 'V12',
    apply: (p) =>
      withFiles(p, (files, order) => {
        files.set('assets/img_002.png', Buffer.from(files.get('pages/02-contact.png')));
        order.push('assets/img_002.png');
      }),
  },
  {
    name: 'unreferenced-asset',
    what: 'a second manifest asset + file that no imageSlot points at',
    expect: 'V04',
    apply: (p) => {
      const jpg = makeJpeg(320, 240);
      const next = withSite(p, (site) => {
        site.assets.push({
          id: 'img_002',
          path: 'assets/img_002.jpg',
          originalFilename: 'orphan.jpg',
          mimeType: 'image/jpeg',
          width: 320,
          height: 240,
          bytes: jpg.length,
        });
      });
      next.files.set('assets/img_002.jpg', jpg);
      next.order.push('assets/img_002.jpg');
      return next;
    },
  },
  {
    name: 'dangling-page-link',
    what: 'button blk_0006 links to a pageId that does not exist',
    expect: 'V02',
    apply: (p) =>
      withSite(p, (site) => {
        findBlock(site, 'blk_0006').link = { kind: 'page', pageId: 'pg_0009' };
      }),
  },
  {
    name: 'dangling-stroke-target',
    what: 'penStroke targets a block that is not on its page',
    expect: 'V02',
    apply: (p) =>
      withSite(p, (site) => {
        site.pages[0].penStrokes[1].targetBlockId = 'blk_0015';
      }),
  },
  {
    name: 'extra-zip-entry',
    what: 'a README.md added at the zip root',
    expect: 'V12',
    apply: (p) =>
      withFiles(p, (files, order) => {
        files.set('README.md', Buffer.from('# not allowed\n', 'utf8'));
        order.push('README.md');
      }),
  },
  {
    name: 'wrapper-folder',
    what: 'every entry nested under a blueprint/ wrapper folder',
    expect: 'V12',
    apply: (p) =>
      withFiles(p, (files, order) => {
        const wrapped = new Map();
        for (const [k, v] of files) wrapped.set(`blueprint/${k}`, v);
        files.clear();
        for (const [k, v] of wrapped) files.set(k, v);
        const newOrder = order.map((n) => `blueprint/${n}`);
        order.length = 0;
        order.push(...newOrder);
      }),
  },
  {
    name: 'invalid-vibe',
    what: 'siteSettings.vibe set to a value outside the schema enum',
    expect: 'V01',
    apply: (p) =>
      withSite(p, (site) => {
        site.siteSettings.vibe = 'spooky';
      }),
  },
  {
    name: 'malformed-timestamp',
    what: 'submission.submittedAt = "yesterday" (proves ajv-formats is wired)',
    expect: 'V01',
    apply: (p) =>
      withSite(p, (site) => {
        site.submission.submittedAt = 'yesterday';
      }),
  },
  {
    name: 'id-not-ordinal',
    what: 'page 2 re-identified pg_0042 (schema-valid, wrong §4.8 ordinal)',
    expect: 'V24',
    apply: (p) =>
      withSite(p, (site) => {
        site.pages[1].id = 'pg_0042';
        for (const page of site.pages) {
          for (const block of page.blocks) {
            if (block.link?.pageId === 'pg_0002') block.link.pageId = 'pg_0042';
            for (const item of block.items ?? []) {
              if (item.link?.pageId === 'pg_0002') item.link.pageId = 'pg_0042';
            }
          }
        }
      }),
  },
  {
    name: 'internal-id-leak',
    what: 'a semantic internal id survives into site.json as an extra field',
    expect: 'V24',
    gateArgs: ['--internal-ids', 'INTERNAL_IDS_FILE'],
    internalIds: ['rest-home-hero-title'],
    apply: (p) =>
      withSite(p, (site) => {
        findBlock(site, 'blk_0004').internalId = 'rest-home-hero-title';
      }),
  },
  {
    name: 'duplicate-block-id',
    what: 'two blocks share the id blk_0011',
    expect: 'V03',
    apply: (p) =>
      withSite(p, (site) => {
        site.pages[1].blocks[2].id = 'blk_0011';
      }),
  },
  {
    name: 'z-out-of-order',
    what: 'blocks[] no longer sorted by z ascending (FIX invariant broken)',
    expect: 'V03',
    apply: (p) =>
      withSite(p, (site) => {
        const blocks = site.pages[0].blocks;
        const swapped = [...blocks];
        [swapped[3], swapped[4]] = [swapped[4], swapped[3]];
        site.pages[0].blocks = swapped;
      }),
  },
  {
    name: 'generate-no-description',
    what: 'a copyMode "generate" block with generateDescription null',
    expect: 'V05',
    apply: (p) =>
      withSite(p, (site) => {
        findBlock(site, 'blk_0005').generateDescription = null;
      }),
  },
  {
    name: 'empty-slot-no-description',
    what: 'empty image slot blk_0015 with its description nulled',
    expect: 'V14',
    apply: (p) =>
      withSite(p, (site) => {
        findBlock(site, 'blk_0015').description = null;
      }),
  },
  {
    name: 'blank-real-text',
    what: 'copyMode "real" text block containing only whitespace',
    expect: 'V19',
    apply: (p) =>
      withSite(p, (site) => {
        findBlock(site, 'blk_0009').text = '   ';
      }),
  },
  {
    name: 'stranded-generate-description',
    what: 'copyMode "real" block still carrying a generateDescription (V20 FIX invariant)',
    expect: 'V20',
    apply: (p) =>
      withSite(p, (site) => {
        findBlock(site, 'blk_0008').generateDescription = 'left over from generate mode';
      }),
  },
  {
    name: 'blank-button-label',
    what: 'button label of two spaces (passes schema minLength, fails V26)',
    expect: 'V26',
    apply: (p) =>
      withSite(p, (site) => {
        findBlock(site, 'blk_0010').label = '  ';
      }),
  },
  {
    name: 'bad-email',
    what: 'submission.client.email is not an email',
    expect: 'V08',
    apply: (p) =>
      withSite(p, (site) => {
        site.submission.client.email = 'dana(at)bluebirdbakery.ca';
      }),
  },
  {
    name: 'bad-ext-for-mime',
    what: 'asset mimeType image/png while the staged path stays .jpg',
    expect: 'V16',
    apply: (p) =>
      withSite(p, (site) => {
        site.assets[0].mimeType = 'image/png';
      }),
  },
  {
    name: 'manifest-dims-mismatch',
    what: 'manifest says 1601×1200 but the staged JPEG is 1600×1200',
    expect: 'V21',
    apply: (p) =>
      withSite(p, (site) => {
        site.assets[0].width = 1601;
      }),
  },
  {
    name: 'screenshot-path-wrong',
    what: 'page 2 screenshot recorded as pages/03-contact.png',
    expect: 'V17',
    apply: (p) =>
      withSite(p, (site) => {
        site.pages[1].screenshot = 'pages/03-contact.png';
      }),
  },
  {
    name: 'bad-filename',
    what: 'zip renamed to bluebird.zip',
    expect: 'F01',
    apply: (p) => ({ ...p, files: new Map(p.files), order: [...p.order], filename: 'bluebird.zip' }),
  },
  {
    name: 'filename-slug-mismatch',
    what: 'zip filename slug does not match the business name',
    expect: 'F02',
    apply: (p) => ({
      ...p,
      files: new Map(p.files),
      order: [...p.order],
      filename: 'blueprint_some-other-shop_3f2a9c1e.zip',
    }),
  },
  {
    name: 'brief-marker-removed',
    what: 'the WRITE THIS COPY marker stripped out of brief.md',
    expect: 'V07',
    apply: (p) =>
      withFiles(p, (files) => {
        const brief = files.get('brief.md').toString('utf8').replace('**WRITE THIS COPY** — client asks for: ', '');
        files.set('brief.md', Buffer.from(brief, 'utf8'));
      }),
  },
  {
    name: 'brief-unknown-block-id',
    what: 'brief.md prints a block id that is not in site.json',
    expect: 'V07',
    apply: (p) =>
      withFiles(p, (files) => {
        const brief = files.get('brief.md').toString('utf8').replace('`blk_0005`', '`blk_0999`');
        files.set('brief.md', Buffer.from(brief, 'utf8'));
      }),
  },
  {
    name: 'brief-invented-quote',
    what: 'brief.md quotes client text that appears nowhere in site.json',
    expect: 'V07',
    apply: (p) =>
      withFiles(p, (files) => {
        const brief = files
          .get('brief.md')
          .toString('utf8')
          .replace('«Come say hi»', '«Come say hello to our wonderful team»');
        files.set('brief.md', Buffer.from(brief, 'utf8'));
      }),
  },
  {
    name: 'brief-missing',
    what: 'brief.md removed from the zip',
    expect: 'V12',
    apply: (p) =>
      withFiles(p, (files, order) => {
        files.delete('brief.md');
        order.splice(order.indexOf('brief.md'), 1);
      }),
  },
  {
    name: 'right-overflow-unmarked',
    what: 'block widened past x=1200 with no [N13] marker in the brief',
    expect: 'N13',
    alsoWarn: 'V25',
    apply: (p) =>
      withSite(p, (site) => {
        findBlock(site, 'blk_0007').frame.w = 500;
      }),
  },
  {
    name: 'template-filler',
    what: 'a block still flagged fromTemplate: true',
    expect: 'V23',
    expectStatus: 'WARN',
    apply: (p) =>
      withSite(p, (site) => {
        findBlock(site, 'blk_0004').fromTemplate = true;
      }),
  },
  {
    name: 'block-above-page-top',
    what: 'a block dragged 100px above y=0 (clipped out of the PNG)',
    expect: 'V18',
    expectStatus: 'WARN',
    apply: (p) =>
      withSite(p, (site) => {
        findBlock(site, 'blk_0009').frame.y = -100;
      }),
  },
  {
    name: 'crlf-and-bom',
    what: 'site.json written with a BOM and CRLF line endings',
    expect: 'C02',
    expectStatus: 'WARN',
    apply: (p) =>
      withFiles(p, (files) => {
        const text = files.get('site.json').toString('utf8').replace(/\n/g, '\r\n');
        files.set('site.json', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')]));
      }),
  },
  {
    name: 'entry-order-scrambled',
    what: 'zip entries written assets-first, violating the §1 write order',
    expect: 'C01',
    expectStatus: 'WARN',
    apply: (p) =>
      withFiles(p, (files, order) => {
        const scrambled = [...order].reverse();
        order.length = 0;
        order.push(...scrambled);
      }),
  },

  // ---- v2.4 sync: new and re-scoped rules --------------------------------
  {
    name: 'key-order-swapped',
    what: 'a block serialized type-before-id (still valid JSON, still 2-space form)',
    expect: 'V27',
    expectStatus: 'WARN',
    apply: (p) =>
      withSite(p, (site) => {
        const b = site.pages[0].blocks[3];
        site.pages[0].blocks[3] = {
          type: b.type,
          id: b.id,
          z: b.z,
          frame: b.frame,
          copyMode: b.copyMode,
          text: b.text,
          generateDescription: b.generateDescription,
          lengthHint: b.lengthHint,
        };
      }),
  },
  {
    name: 'key-order-frame-swapped',
    what: 'a frame serialized {y, x, w, h} instead of {x, y, w, h}',
    expect: 'V27',
    expectStatus: 'WARN',
    apply: (p) =>
      withSite(p, (site) => {
        const f = site.pages[1].blocks[2].frame;
        site.pages[1].blocks[2].frame = { y: f.y, x: f.x, w: f.w, h: f.h };
      }),
  },
  {
    name: 'section-from-template',
    what: 'a section block ships carrying fromTemplate (§2.6 says it never should)',
    expect: 'V23f',
    apply: (p) =>
      withSite(p, (site) => {
        const section = site.pages[0].blocks[0];
        site.pages[0].blocks[0] = {
          id: section.id,
          type: section.type,
          z: section.z,
          frame: section.frame,
          fromTemplate: true,
          background: section.background,
        };
      }),
  },
  {
    name: 'annotation-targets-section',
    what: 'an annotation stroke targets the section band behind it (§4.5 v2.4 forbids)',
    expect: 'C04',
    expectStatus: 'WARN',
    apply: (p) =>
      withSite(p, (site) => {
        site.pages[0].penStrokes[1].targetBlockId = 'blk_0001'; // the section
      }),
  },
  {
    name: 'imagesketch-tiny-exempt',
    what: 'the imageSketch stroke shrunk to a 4×4 box — V22 must STAY SILENT (v2.4 exemption)',
    expect: 'V22',
    expectStatus: 'PASS',
    apply: (p) =>
      withSite(p, (site) => {
        // Keep it inside blk_0007's frame (760,144,360,400) so the role stays imageSketch,
        // and drop the annotation stroke so only the imageSketch cluster remains.
        site.pages[0].penStrokes = [
          {
            id: 'stk_0001',
            points: [
              [800, 200],
              [804, 204],
            ],
            color: '#D94F30',
            width: 4,
            role: 'imageSketch',
            targetBlockId: 'blk_0007',
          },
        ];
      }),
  },
  {
    name: 'escaping-v24-roundtrip',
    what: 'client text with \\ " | * and a leading "1." quoted with correct v2.4 escaping — V7 must PASS',
    expect: 'V07',
    expectStatus: 'PASS',
    apply: (p) => reEscapeBlk0009(p, ADVERSARIAL_TEXT, escapeV24(ADVERSARIAL_TEXT)),
  },
  {
    name: 'escaping-v22-legacy',
    what: 'the same text quoted with the OLD v2.2 escaping (no \\ or " escaped) — V7 must FAIL',
    expect: 'V07',
    apply: (p) => reEscapeBlk0009(p, ADVERSARIAL_TEXT, escapeV22Legacy(ADVERSARIAL_TEXT)),
  },
  {
    name: 'inventory-page-plural',
    what: 'the inventory count line reads "2 page" instead of "2 pages" [N11]',
    expect: 'V07',
    apply: (p) =>
      withFiles(p, (files) => {
        const brief = files.get('brief.md').toString('utf8').replace('2 pages. **Page 1', '2 page. **Page 1');
        files.set('brief.md', Buffer.from(brief, 'utf8'));
      }),
  },
  {
    name: 'navbar-reference-text',
    what: 'brief quotes a nav-bar reference text that no longer matches its item labels',
    expect: 'V07',
    apply: (p) =>
      withFiles(p, (files) => {
        // §4.4 reference text for a navBar is its item labels joined ", ". Introduce one
        // that matches no navBar in site.json.
        const brief = files
          .get('brief.md')
          .toString('utf8')
          .replace('«Come say hi»', '«Home, Contact, Menu»');
        files.set('brief.md', Buffer.from(brief, 'utf8'));
      }),
  },
];

/** Text exercising every v2.4 rule-7 escape class at once. */
const ADVERSARIAL_TEXT = '1. He said "back\\slash" | *bold* `code` «quoted»';

/** §3.3 rule 7 as of v2.4 — `\` first, then « » | * " `, leading marker escapes the period. */
function escapeV24(s) {
  const escaped = s.replace(/[\\«»|*"`]/g, (c) => `\\${c}`);
  if (/^[#\->]/.test(escaped)) return `\\${escaped}`;
  return escaped.replace(/^(\d+)\./, '$1\\.');
}

/** The pre-v2.3 escape set: no `\`, no `"`, and the marker escaped as `\1.`. */
function escapeV22Legacy(s) {
  const escaped = s.replace(/[«»|*`]/g, (c) => `\\${c}`);
  return escaped.replace(/^(\d+\.)/, '\\$1');
}

/** Swap blk_0009's text in site.json AND its «…» quote in the brief, independently escaped. */
function reEscapeBlk0009(parts, rawText, quotedForm) {
  const next = withSite(parts, (site) => {
    findBlock(site, 'blk_0009').text = rawText;
  });
  const brief = next.files
    .get('brief.md')
    .toString('utf8')
    .replace(
      '«Bluebird started in our home kitchen in 2019. Today we bake from a little shop on Agricola Street, same starter, same stubborn attention to crumb.»',
      `«${quotedForm}»`,
    );
  next.files.set('brief.md', Buffer.from(brief, 'utf8'));
  return next;
}
