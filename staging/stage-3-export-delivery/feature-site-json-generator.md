# Feature: site.json Generator + Validator
_Stage: stage-3-export-delivery · Status: not started_

## Goal
Turn the in-memory document (v2: `{ schemaVersion: 2, siteSettings, pages: [{ id, name, blocks }] }`
with per-page `penStrokes` and inline image data URLs) into `site.json` exactly as
`docs/export-format.md` §2 defines it — and into the **shared validator module** that decides,
before anything is zipped, whether this package is fit to send.

This is the stage's load-bearing module. `brief.md` is generated from its output, the PNGs are
sized from its `page.height`, the zip is laid out from its `assets[]` and `page.screenshot`
paths, and the Stage 4 harness replays its validator against real packages. Everything
downstream inherits its bugs.

## Scope
Two pure modules, no React, no DOM, no I/O:

1. `buildSiteJson(input) → SiteJson` — the deterministic transform (§4.1, §4.2, §4.5–§4.8).
2. `validatePackage(pkg) → ValidationReport` — every rule in §5 (V1–V24, plus V25/V26 pending
   the Open Questions), each a pure function, each with a red-path fixture.

Out of scope here: rendering PNGs (`feature-png-renderer.md`), writing the brief
(`feature-brief-generator.md`), zipping (`feature-package-zip.md`), and any UI
(`feature-submit-gate.md`).

## Success Criteria

### The transform
- [ ] `buildSiteJson` is pure and deterministic: called twice on the same input (same minted
      `submission`) it returns deep-equal output, and serializing it yields **byte-identical**
      text — 2-space indent, LF, no BOM, and the key order printed in §2.1/§2.2 (§1 "File
      conventions")
- [ ] **Identity remap (§4.8) is total:** pages → `pg_0001…` in `pages[]` order; blocks →
      `blk_0001…` numbered **site-wide** in document order (page order, then `z`); nav items →
      `nav_0001…` site-wide; strokes → `stk_0001…` site-wide in draw order — all zero-padded to
      4 digits. `link.pageId` and `penStroke.targetBlockId` are rewritten in the same pass, and
      **no internal app id survives anywhere in `site.json`** (a semantic id such as
      `rest-home-hero-title` fed in never appears in the output — the V24 red path)
- [ ] **Slugs (§4.1)** are derived fresh from page names every export — NFKD + diacritic strip
      + lowercase, non-`[a-z0-9]` runs → single `-`, trimmed, `page-N` when empty, truncated to
      36 at a `-` boundary where possible, `-page` suffix on the reserved names
      (`index`, `assets`, `pages`, `site`, `brief`, `static`, `public`), `-2`/`-3`… on collision
      in page order with the first occurrence keeping the bare slug
- [ ] **Page height (§4.2, as amended v2.2)** is the SHARED editor/export function `clamp(1600, ceil((bottom + 160) / 8) * 8, 8000)` where `bottom` is
      the largest `y + h` over blocks **and** the largest point-y over pen strokes on the page —
      not the editor's on-screen page height (which floors at 1600 and caps at 8000; the two are
      deliberately different, see Notes)
- [ ] **Discriminators (§4.7):** `image → imageSlot`, `nav-bar → navBar`, the other four
      unchanged; `{x, y, width, height}` becomes `frame: {x, y, w, h}`; `z` is the block's index
      in the page's array (array order IS paint order in the document — Stage 1), so `blocks[]`
      is sorted by `z` ascending and the two always agree
- [ ] **`'' → null`** for every optional client string (`tagline`, `about`, `styleNotes`,
      `generateDescription`, `lengthHint`, `imageSlot.description`, `section.background`);
      `vibe` is already `null` when unset; `colors: []` stays `[]`; `copyMode: 'real'` exports
      `generateDescription: null` (V20 territory) — and `text` stays `''`, never null, because
      the schema types it `string`
- [ ] **Assets (§4.6) are derived, because the document has no asset store:** Stage 2 stores the
      photo inline as `block.imageData` (a compressed `data:image/…;base64,…` URL, `''` = empty
      slot). The generator walks `pages[]` in order, blocks by `z`, and numbers each **distinct**
      data URL `img_001…` at its first appearance; two slots sharing the same photo share one
      manifest entry and one staged file. Extension from MIME (`image/jpeg→.jpg`,
      `image/png→.png`, `image/webp→.webp`), `path = assets/<id>.<ext>`, `bytes` = the decoded
      base64 length, `width`/`height` from parsing the image's own header bytes. An empty slot
      exports `assetId: null`. **No unreferenced upload can exist structurally** — V4's
      strip-unreferenced branch is still implemented as defence in depth for a hand-edited
      package reaching the Stage 4 harness
- [ ] **Pen roles (§4.5) are computed, never stored:** `role: 'imageSketch'` + non-null
      `targetBlockId` iff ≥60% of the stroke's bbox area lies inside a single `imageSlot` frame
      on that page (pure geometry — `assetId` plays no part); otherwise `annotation` with
      `targetBlockId` = the block whose frame the bbox overlaps most (any overlap counts), else
      the block with the nearest center within 200px, else `null`. Points are RDP-simplified at
      ε = 0.75px and rounded to 1 decimal
- [ ] The output validates against `src/export/schema/site.v1.schema.json` for every fixture,
      including the §7.1 worked example rebuilt from an equivalent document

### The validator
- [ ] `validatePackage` returns `{ level: 'block' | 'ok', blocks: Finding[], warns: Finding[],
      fixes: AppliedFix[], package: PackageBundle }` where every `Finding` carries
      `{ rule: 'V05', audience: 'client' | 'bug', message, jumpTo?: { pageId, blockId } }` —
      the `jumpTo` is what lets the submit UI navigate to the offending element (§5 BLOCK
      definition)
- [ ] **Every rule V1–V24 is implemented as its own pure function with its own red-path unit
      fixture**, and each red fixture fails only that rule
- [ ] **V1 uses ajv v8 + `ajv-formats` with `{ allErrors: true, strict: true }`** and a red test
      proves the formats are actually wired: a malformed `submittedAt` (`"yesterday"`) is
      rejected. Without `ajv-formats`, `format: "email"`/`"date-time"` are silent no-ops
- [ ] The **FIX rules are deterministic and auto-applied** (V3 z re-sort/renumber, V4 strip
      unreferenced assets, V11 prepend `https://` to a bare domain, V17 recompute `screenshot`,
      V20 null a stranded `generateDescription`), and the report names every fix applied so the
      submit UI can log them
- [ ] **Pipeline order is fixed and tested** (see Notes): FIX pass → re-derive dependents →
      client-facing BLOCK rules → bug-class BLOCK rules → V1 schema → WARN rules. A client who
      left a text box empty sees "write something or switch it to 'Write it for me'", never a
      schema error
- [ ] The same module runs unchanged in three call sites (§5): the app at submit, Vitest against
      fixtures, and `scripts/roundtrip/gate.mjs` against an extracted zip
- [ ] `src/export/**` holds ≥80% lines and functions under `npm run test:coverage`

## How We'll Verify

1. **Unit — transform (`npm test`)**
   - `src/export/ids.test.ts` — §4.8 ordinal assignment across a 3-page fixture with
     interleaved z; asserts `pg_0001..`, site-wide `blk_0001..`, `nav_0001..`, `stk_0001..`;
     asserts `link.pageId` and `targetBlockId` were rewritten to the new ids; asserts
     `JSON.stringify(siteJson).includes('rest-home-hero-title') === false` for a document seeded
     with semantic internal ids.
   - `src/export/slug.test.ts` — table test: `"Café Münster" → cafe-munster`; `"🙂🙂" → page-3`
     (3rd page); `"Menu" ×3 → menu, menu-2, menu-3`; each reserved name → `<name>-page`; a
     42-char name truncates to ≤36 at a `-` boundary and still admits `-2` under the schema's
     40-char cap; `"---" → page-N`.
   - `src/export/pageHeight.test.ts` — `maxBottom` from a block, from a stroke point below every
     block, the 800 floor on a near-empty page, and the multiple-of-8 rounding; asserts the §7.1
     numbers exactly: Home `1060 → 1144`, Contact `640 → 800`.
   - `src/export/assets.test.ts` — first-use numbering when the second page reuses the first
     page's photo (stays `img_001`, one staged file, both slots pointing at it);
     extension-from-MIME for all three types; `bytes` equals the decoded base64 length;
     `width`/`height` parsed from committed PNG, JPEG and WebP fixture headers and asserted
     against their known dimensions; `imageData: ''` exports `assetId: null`; V4's
     strip-unreferenced branch exercised on a hand-built package.
   - `src/export/penRoles.test.ts` — the 60% boundary tested at 59.9% / exactly 60% / 60.1%;
     overlap-most vs nearest-center-within-200px vs `null`; RDP ε = 0.75 removes collinear
     points and keeps endpoints; 1-decimal rounding.
   - `src/export/siteJson.test.ts` — full transform on the §7.1-equivalent document:
     `expect(serialize(buildSiteJson(fixture))).toBe(readSection71())` after substituting the
     minted submission block, proving key order, indentation and `'' → null` in one assertion.
2. **Unit — validator (`npm test`)** — `src/export/validate/rules/*.test.ts`, one file per rule.
   Each asserts (a) the rule is silent on the §7.1 fixture, (b) its red fixture produces exactly
   one finding with the right `rule`, `audience` and `jumpTo`, and (c) for FIX rules, the
   returned package is corrected and re-validates clean. V1's red set includes
   `submittedAt: "yesterday"`, a bad-pattern `id`, and a `generate` block with
   `generateDescription: null`.
3. **Unit — pipeline order** — `src/export/validate/index.test.ts`: a package that is
   simultaneously V19-dirty (blank real text) and V1-invalid asserts the report's first
   client-facing finding is V19, not V1; a package that is only FIX-dirty returns
   `level: 'ok'` with fixes applied and a schema-valid package.
4. **Schema sync (`npm test`)** — `src/export/spec-sync.test.ts` **equality test A**: read the
   fenced ```json block from `docs/export-format.md` §2.2 and
   `src/export/schema/site.v1.schema.json`; `expect(fromDoc).toBe(fromRepo)` byte-for-byte.
5. **Coverage** — `npm run test:coverage` with a new per-glob threshold
   `'src/export/**': { lines: 80, functions: 80 }` in `vite.config.ts`; record the actual
   percentages in the log.
6. **Gate script** — `node scripts/roundtrip/gate.mjs --package <zip> --no-manifest` on a zip
   produced by the E2E submit: exits 0, prints the layout check, the ajv result and the
   validator replay. A deliberately corrupted zip (rename `site.json` → `Site.json`) exits
   non-zero naming the layout rule (V12). Both runs recorded.
7. **E2E (`npm run e2e`)** — `e2e/export-sitejson.spec.ts`, ×3 engines: seed a fixture document
   through the test-only store seam (`npm run build:e2e` bundle only), submit through the real
   UI, capture the download, unzip in the test with `fflate`, `JSON.parse` `site.json` and
   assert: `schemaVersion === 1`; ids match `^pg_\d{4}$` / `^blk_\d{4}$`; every `link.pageId`
   resolves; `blocks` sorted by `z`; `page.height` equals the §4.2 formula recomputed in the
   test; `assets[].path` matches the staged entries exactly.
8. Record every command's exit code and counts below.

## Verification Log
_Empty — nothing verified yet._

## Open Questions
- **V25 (right-overflow WARN) and V26 (blank button label / empty nav bar, client-facing
  BLOCK)** are proposed in `overview.md` Open Questions 3 and 4 and are implemented here once
  ruled. Both are additive per §6.2. Until ruled, write the rules behind a single exported
  list so adding them is one line and one fixture.
- **V7's `«…»` cross-check needs a defined comparison set.** §5 V7 says every `«…»`-quoted
  string must equal "(post-escaping) some `site.json` string field", but the generator legally
  renders *derived* forms: [N5]/[N7] truncate to 40 chars, rule 8 turns CR/LF into `↵`.
  **Recommendation:** compare each quoted span against the set
  `{ escape(f), escape(newlineGlyph(f)), escape(truncate40(f)), escape(truncate40(newlineGlyph(f))) }`
  over all `site.json` string fields, and unit-test a truncated overlap suffix and a multi-line
  address block as green cases. Cheap, and it keeps V7 from failing on its own §7.2 example.
- **Asset identity when the same photo is uploaded twice.** Two slots holding byte-identical
  data URLs are obviously one asset. Two slots holding *visually* identical photos uploaded twice
  are two data URLs (JPEG re-encode is not byte-stable across two ingests).
  **Recommendation:** dedupe on the data URL string only (cheap, exact, deterministic) and accept
  the rare duplicate file — `originalFilename` will show Cam what happened, and inventing a
  perceptual-hash dedupe here would make `img_NNN` numbering depend on a threshold.
- **`originalFilename` needs a home.** §2.3/§4.6 require it verbatim in the manifest, but
  `block.imageData` carries no filename. **Recommendation:** Stage 2's image-upload feature
  should keep the client's filename on the block (e.g. `imageFilename`) at ingest — it is one
  string, it is contract-required, and reconstructing it later is impossible. If it does not land,
  the honest fallback is `img_001.jpg` as the filename with a note, but ask Stage 2 first: this is
  a Stage 2 gap, not a Stage 3 workaround (§6.6).
- **`width`/`height` come from parsing the staged bytes, not from a DOM decode.** V21 compares the
  manifest against the file in the zip, so parsing the very bytes being staged makes the two
  agree by construction and keeps the whole transform pure and Vitest-testable. One small
  header parser covers PNG (IHDR), JPEG (SOF0/2) and WebP (VP8/VP8L/VP8X); it is shared with the
  PNG renderer's sanity check.
- **`designCreatedAt` source.** §2.3 wants "when the design was first created (from autosave
  state), if known". Stage 1's `canvasSession` does not currently persist a creation timestamp.
  **Recommendation:** export `null` in v1 rather than inventing one; if Stage 2's design-file
  work adds `createdAt` to the `.blueprint` payload, read it then — it is an optional field, so
  adding it later is additive (§6.2).
- **`section.background` has no UI.** The schema keeps it as nullable headroom (ruled
  2026-07-28). Export `null` unless the document actually carries a value; do not invent one.

## Notes & Decisions
- **Binding contract:** `docs/export-format.md` §2 (shape), §4.1 (slugs), §4.2 (height), §4.5
  (pen semantics), §4.6 (assets), §4.7 (discriminators), §4.8 (identity remap), §5 (V1–V24),
  §6 (forward compatibility). `docs/decisions.md` 2026-07-28 "Export format v2 adopted".
- **Export page height ≠ editor page height, and that is deliberate.** The editor derives
  `max(1600, lowest bottom + 160)` capped at 8000 (`feature-block-canvas.md` Notes); the export
  uses §4.2's unified formula (v2.2: `clamp(1600, ceil((bottom+160)/8)*8, 8000)`, shared with the editor — heights now MATCH the editor exactly). In the §7 example this is the difference
  between a 1600px on-screen page and an 800px PNG for Contact. `page.height` is the number the
  PNG must match exactly (V6), so the renderer sizes itself from *this* module's output, never
  from the live canvas DOM. Both formulas keep their own named constants; neither is "fixed" to
  match the other.
- **`z` is the array index, not a stored field.** Stage 1 ruled paint order = array order with
  no z-index field to drift (`feature-block-canvas.md` Notes). The export materializes `z` from
  the index, which is why V3's "z unique per page and `blocks[]` sorted ascending" is true by
  construction and its FIX branch is defence in depth against a hand-edited package reaching the
  Stage 4 harness.
- **Ordinal remap, not hash.** §4.8 ruling: deterministic, diff-friendly, and it means a fixture
  diff after a generator change shows semantic changes rather than churned ids. Internal
  semantic ids stay semantic for E2E selectors and debugging; V24 is the leak-block that makes
  the two worlds provably separate.
- **The remap table never ships** (§4.8 rule 4). Logging it to the console at export time is
  explicitly allowed and worth doing — it is the only way to trace `blk_0007` back to the block
  Cam is looking at in the editor.
- **Validator pipeline order (this stage's ruling; §5 does not specify one):**
  1. **FIX pass**, in rule-number order (V3 → V4 → V11 → V17 → V20), each returning a new
     package — immutability rule, no in-place correction.
  2. **Re-derive** anything a fix invalidates (stripping an asset renumbers `img_NNN`, which
     rewrites `assetId`s, which changes `brief.md` — so the brief is generated *after* the fix
     pass, never before).
  3. **Client-facing BLOCKs** (V5, V8, V9-zero-pages, V11-unfixable, V14, V19, +V26) — these
     are things the client can act on, and they must be reported first so the UI can show a
     human message and a jump target.
  4. **Bug-class BLOCKs** (V2, V3-collision, V4-missing-file, V6, V7, V12, V16, V21, V24).
  5. **V1 schema last** — by the time it runs, everything fixable is fixed and everything
     client-actionable has already been named, so a V1 failure genuinely is a generator bug and
     deserves its "something went wrong" wording.
  6. **WARNs** (V9-near-empty, V10, V13, V15, V18, V22, V23, +V25) — collected on the final
     package and handed to the submit UI and the notification payload.
- **Ajv is loaded by dynamic `import()` at validation time, not at app boot.** The app is a
  static SPA on Pages and ajv + ajv-formats is ~120 kB of the ~244 kB current bundle; submit is
  a deliberate user action where a code-split chunk load is invisible. Same module, same
  semantics, one implementation for all three call sites (dynamic import works in Node for the
  harness too). If the chunk ever hurts, the fallback is ajv's standalone code generation with a
  CI test asserting the generated validator is current — do not hand-roll a partial validator.
- **The schema file is the single source of truth in the repo; the doc's copy is the mirror.**
  Equality test A asserts they are byte-identical (Appendix A). Editing one without the other
  must fail CI — that is the whole point of the test.
- **Right-overflow (Open Question 3) is a WARN here, a clip in the renderer, and a marker in the
  brief.** `site.json` keeps the true frame — the schema explicitly permits `x`/`w` past 1200
  (§2.6) and the builder needs the real geometry to reproduce the client's intent. Losing it in
  the JSON as well as the PNG would be lossy twice.
- **Unknown fields are tolerated, never emitted.** §6.2 requires consumers to ignore unknown
  fields (which is why `additionalProperties` is never `false`), but the generator emits exactly
  the documented keys in the documented order — "tolerate on read, be strict on write".
