# Feature: site.json Generator + Validator
_Stage: stage-3-export-delivery · Status: verified done_

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
- [x] `buildSiteJson` is pure and deterministic: called twice on the same input (same minted
      `submission`) it returns deep-equal output, and serializing it yields **byte-identical**
      text — 2-space indent, LF, no BOM, and the key order printed in §2.1/§2.2 (§1 "File
      conventions")
- [x] **Identity remap (§4.8) is total:** pages → `pg_0001…` in `pages[]` order; blocks →
      `blk_0001…` numbered **site-wide** in document order (page order, then `z`); nav items →
      `nav_0001…` site-wide; strokes → `stk_0001…` site-wide in draw order — all zero-padded to
      4 digits. `link.pageId` and `penStroke.targetBlockId` are rewritten in the same pass, and
      **no internal app id survives anywhere in `site.json`** (a semantic id such as
      `rest-home-hero-title` fed in never appears in the output — the V24 red path)
- [x] **Slugs (§4.1)** are derived fresh from page names every export — NFKD + diacritic strip
      + lowercase, non-`[a-z0-9]` runs → single `-`, trimmed, `page-N` when empty, truncated to
      36 at a `-` boundary where possible, `-page` suffix on the reserved names
      (`index`, `assets`, `pages`, `site`, `brief`, `static`, `public`), `-2`/`-3`… on collision
      in page order with the first occurrence keeping the bare slug
- [x] **Page height (§4.2, as amended v2.2)** is the SHARED editor/export function `clamp(1600, ceil((bottom + 160) / 8) * 8, 8000)` where `bottom` is
      the largest `y + h` over blocks **and** the largest point-y over pen strokes on the page —
      not the editor's on-screen page height (which floors at 1600 and caps at 8000; the two are
      deliberately different, see Notes)
- [x] **Discriminators (§4.7):** `image → imageSlot`, `nav-bar → navBar`, the other four
      unchanged; `{x, y, width, height}` becomes `frame: {x, y, w, h}`; `z` is the block's index
      in the page's array (array order IS paint order in the document — Stage 1), so `blocks[]`
      is sorted by `z` ascending and the two always agree
- [x] **`'' → null`** for every optional client string (`tagline`, `about`, `styleNotes`,
      `generateDescription`, `lengthHint`, `imageSlot.description`, `section.background`);
      `vibe` is already `null` when unset; `colors: []` stays `[]`; `copyMode: 'real'` exports
      `generateDescription: null` (V20 territory) — and `text` stays `''`, never null, because
      the schema types it `string`
- [x] **Assets (§4.6) are derived, because the document has no asset store:** Stage 2 stores the
      photo inline as `block.imageData` (a compressed `data:image/…;base64,…` URL, `''` = empty
      slot). The generator walks `pages[]` in order, blocks by `z`, and numbers each **distinct**
      data URL `img_001…` at its first appearance; two slots sharing the same photo share one
      manifest entry and one staged file. Extension from MIME (`image/jpeg→.jpg`,
      `image/png→.png`, `image/webp→.webp`), `path = assets/<id>.<ext>`, `bytes` = the decoded
      base64 length, `width`/`height` from parsing the image's own header bytes. An empty slot
      exports `assetId: null`. **No unreferenced upload can exist structurally** — V4's
      strip-unreferenced branch is still implemented as defence in depth for a hand-edited
      package reaching the Stage 4 harness
- [x] **Pen roles (§4.5) are computed, never stored:** `role: 'imageSketch'` + non-null
      `targetBlockId` iff ≥60% of the stroke's bbox area lies inside a single `imageSlot` frame
      on that page (pure geometry — `assetId` plays no part); otherwise `annotation` with
      `targetBlockId` = the block whose frame the bbox overlaps most (any overlap counts), else
      the block with the nearest center within 200px, else `null`. Points are RDP-simplified at
      ε = 0.75px and rounded to 1 decimal
- [x] The output validates against `src/export/schema/site.v1.schema.json` for every fixture,
      including the §7.1 worked example rebuilt from an equivalent document

### The validator
- [x] `validatePackage` returns `{ level: 'block' | 'ok', blocks: Finding[], warns: Finding[],
      fixes: AppliedFix[], package: PackageBundle }` where every `Finding` carries
      `{ rule: 'V05', audience: 'client' | 'bug', message, jumpTo?: { pageId, blockId } }` —
      the `jumpTo` is what lets the submit UI navigate to the offending element (§5 BLOCK
      definition)
- [x] **Every rule V1–V24 is implemented as its own pure function with its own red-path unit
      fixture**, and each red fixture fails only that rule
- [x] **V1 uses ajv v8 + `ajv-formats` with `{ allErrors: true, strict: true }`** and a red test
      proves the formats are actually wired: a malformed `submittedAt` (`"yesterday"`) is
      rejected. Without `ajv-formats`, `format: "email"`/`"date-time"` are silent no-ops
- [x] The **FIX rules are deterministic and auto-applied** (V3 z re-sort/renumber, V4 strip
      unreferenced assets, V11 prepend `https://` to a bare domain, V17 recompute `screenshot`,
      V20 null a stranded `generateDescription`), and the report names every fix applied so the
      submit UI can log them
- [x] **Pipeline order is fixed and tested** (see Notes): FIX pass → re-derive dependents →
      client-facing BLOCK rules → bug-class BLOCK rules → V1 schema → WARN rules. A client who
      left a text box empty sees "write something or switch it to 'Write it for me'", never a
      schema error
- [x] The same module runs unchanged in its three call sites (§5): the app at submit, Vitest
      against fixtures, and the **Stage 4 round-trip harness** against an extracted package.
      (Corrected 2026-07-28: `scripts/roundtrip/gate.mjs` is deliberately NOT one of them — it
      imports no app code, precisely so that a validator bug in `src/export/validate` cannot
      agree with itself into a green gate. See `scripts/roundtrip/README.md`.)
- [x] `src/export/**` holds ≥80% lines and functions under `npm run test:coverage`

## How We'll Verify

_(File names corrected 2026-07-28 to what was actually built. The transform's per-topic tests
landed as `describe` blocks inside `src/export/siteJson.test.ts` rather than as separate files,
and the per-rule validator files landed as one `rules.test.ts` plus `schemaCheck.test.ts` for
the async V1. The assertions below are unchanged; only the paths were drifting.)_

1. **Unit — transform (`npm test`)**
   - `src/export/siteJson.test.ts` › **§4.8 identity remap** — ordinal assignment across the
     fixture; asserts `pg_0001..`, site-wide `blk_0001..`, `nav_0001..`, `stk_0001..`; asserts
     `link.pageId` and `targetBlockId` were rewritten to the new ids; asserts
     `JSON.stringify(siteJson).includes('rest-home-hero-title') === false` for a document seeded
     with semantic internal ids.
   - `src/export/slug.test.ts` — table test: `"Café Münster" → cafe-munster`; `"🙂🙂" → page-3`
     (3rd page); `"Menu" ×3 → menu, menu-2, menu-3`; each reserved name → `<name>-page`; a
     42-char name truncates to ≤36 at a `-` boundary and still admits `-2` under the schema's
     40-char cap; `"---" → page-N`.
   - `src/export/siteJson.test.ts` › **§4.2 page height** (with `src/canvas/geometry.test.ts` ›
     `pageHeightForContent`, which owns the shared function itself) — `maxBottom` from a block,
     from a stroke point below every block, the **1600 floor** (v2.2 unified heights) on a
     near-empty page, and the ceil-to-8 rounding; asserts the §7.1 numbers exactly: Home and
     Contact both floor-clamp to `1600` (Home bottom 1060 → 1224 → clamped; Contact bottom
     640 → 800 → clamped).
   - `src/export/siteJson.test.ts` › **§4.6 assets** (with `src/export/imageHeader.test.ts` for
     the header parsing) — first-use numbering when the second page reuses the first
     page's photo (stays `img_001`, one staged file, both slots pointing at it);
     extension-from-MIME for all three types; `bytes` equals the decoded base64 length;
     `width`/`height` parsed from committed PNG, JPEG and WebP fixture headers and asserted
     against their known dimensions; `imageData: ''` exports `assetId: null`; V4's
     strip-unreferenced branch exercised on a hand-built package.
   - `src/export/penRoles.test.ts` — the 60% boundary tested at 59.9% / exactly 60% / 60.1%;
     overlap-most vs nearest-center-within-200px vs `null`; RDP ε = 0.75 removes collinear
     points and keeps endpoints; 1-decimal rounding.
   - `src/export/siteJson.test.ts` — full transform on the §7.1-equivalent document:
     `expect(serializeSiteJson(buildSiteJson(fixture, submission))).toBe(readSection71())`,
     proving key order, indentation and `'' → null` in one assertion — plus **Appendix A
     equality test D** in its own describe: `serializeSiteJson(JSON.parse(§7.1 text)) === §7.1
     text`, both sides read from `docs/export-format.md` at test time (added 2026-07-28).
2. **Unit — validator (`npm test`)** — `src/export/validate/rules/rules.test.ts` (V2–V27, one
   describe per rule family) and `src/export/validate/rules/schemaCheck.test.ts` (V1, which is
   async and needs its own ajv-formats proof).
   Each asserts (a) the rule is silent on the §7.1 fixture, (b) its red fixture produces exactly
   one finding with the right `rule`, `audience` and `jumpTo`, and (c) for FIX rules, the
   returned package is corrected and re-validates clean. V1's red set includes
   `submittedAt: "yesterday"`, a bad-pattern `id`, and a `generate` block with
   `generateDescription: null`.
3. **Unit — pipeline order** — `src/export/validate/index.test.ts`: a package that is
   simultaneously V19-dirty (blank real text) and V1-invalid asserts the report's first
   client-facing finding is V19, not V1; a package that is only FIX-dirty returns
   `level: 'ok'` with fixes applied and a schema-valid package.
4. **Schema sync (`npm test`)** — `src/export/schema/schemaSync.test.ts` **equality test A**:
   read the fenced ```json block from `docs/export-format.md` §2.2 and
   `src/export/schema/site.v1.schema.json`; `expect(fromDoc).toBe(fromRepo)` byte-for-byte. Also
   enforced OUTSIDE the app's runner from 2026-07-28, as a CI step:
   `node extract-schema.mjs --check ../../src/export/schema/site.v1.schema.json` in
   `scripts/roundtrip` (gate README §5.3) — verified locally:
   `OK  ../../src/export/schema/site.v1.schema.json byte-matches export-format.md §2.2 (9430 B)`.
5. **Coverage** — `npm run test:coverage` with a new per-glob threshold
   `'src/export/**': { lines: 80, functions: 80 }` in `vite.config.ts`; record the actual
   percentages in the log.
6. **Gate script** — `node scripts/roundtrip/gate.mjs --package <zip> --no-manifest` on a zip
   produced by the E2E submit: exits 0, prints the layout check, the ajv result and the
   validator replay. A deliberately corrupted zip (rename `site.json` → `Site.json`) exits
   non-zero naming the layout rule (V12). Both runs recorded.
7. **E2E (`npm run e2e`)** — `e2e/submit.spec.ts`, ×3 engines (the spec landed under that name
   with the submit gate rather than as a separate `export-sitejson.spec.ts`, because a
   `site.json` can only reach a browser THROUGH the submit flow): seed a fixture document
   through the test-only store seam (`npm run build:e2e` bundle only), submit through the real
   UI, capture the download, unzip in the test with `fflate`, `JSON.parse` `site.json` and
   assert: `schemaVersion === 1`; ids match `^pg_\d{4}$` / `^blk_\d{4}$`; every `link.pageId`
   resolves; `blocks` sorted by `z`; `page.height` equals the §4.2 formula recomputed in the
   test; `assets[].path` matches the staged entries exactly.
8. Record every command's exit code and counts below.

## Verification Log

### 2026-07-28 — implementer evidence (branch `stage3-export-core`)

Pure modules only: no UI, no submit flow, no PNG renderer, no zip writer (those compose these
later in the main tree). E2E deliberately not run — nothing renders yet.

**Files landed**

| Path | What |
|---|---|
| `src/export/types.ts` | the §2 `site.json` shapes |
| `src/export/slug.ts` | §4.1 (core, page slugs with reserved + collision passes, business fallback) |
| `src/export/ids.ts` | §4.8 ordinal minting + the schema id patterns |
| `src/export/imageHeader.ts` | base64 decode + PNG/JPEG/WebP header dimensions + §4.6 MIME→ext |
| `src/export/assets.ts` | §4.6 first-use `img_NNN` registry over distinct data URLs |
| `src/export/penRoles.ts` | §4.5 role/target + the export-side RDP pass at ε = 0.75 |
| `src/export/serialize.ts` | §7.1 normative key order, the C02 text shape, and V27's checker |
| `src/export/siteJson.ts` | `buildExportPayload` / `buildSiteJson` — the whole §4 transform |
| `src/export/schema/site.v1.schema.json` | §2.2 extracted verbatim (9432 B) |
| `src/export/validate/**` | V1–V27, the FIX pass, and the pipeline |
| `src/test/exportFixtures.ts`, `src/test/specFixtures.ts` | the §7.1-equivalent document and the spec extractors |

**Commands (all run in the worktree, 2026-07-28)**

| Command | Result |
|---|---|
| `npm ci` | 254 packages, 0 vulnerabilities |
| `npm run lint` | clean, exit 0 |
| `npm test` | **49 files / 876 tests passed** (export subset: 13 files / 214 tests) |
| `npm run test:coverage` | thresholds pass — `src/export` 94.03 stmts / 100 funcs / 97.43 lines · `src/export/brief` 96.99 / 98.4 / 98.09 · `src/export/validate/rules` 94.66 / 98.56 / 96.22 |
| `npm run build` | `tsc -b && vite build` green, `dist/assets/index-*.js` 264.09 kB |

**Appendix A equality test A** — `src/export/schema/schemaSync.test.ts`:
`[test A] §2.2 fence 9432 bytes · repo file 9432 bytes`, byte-identical. Also asserted:
draft-07, `schemaVersion const 1`, and that `additionalProperties` appears nowhere (§6.2).

**The transform reproduces §7.1.** `src/export/siteJson.test.ts` builds the worked example from
a hand-written document with semantic internal ids and asserts
`serializeSiteJson(buildSiteJson(fixture))` is byte-identical to §7.1 **re-serialized**, plus
deep equality against the parsed fixture. That covers ids, slugs, heights, discriminators,
`'' → null`, key order, indentation, pen roles and the asset manifest in one assertion.

**Validator** — every rule V1–V27 is an independent pure function; `rules.test.ts` asserts each
is silent on the §7.1 package and fires on a fixture that breaks only what it checks;
`schemaCheck.test.ts` carries Appendix A's required `submittedAt: "yesterday"` red path proving
`ajv-formats` is wired; `index.test.ts` proves the pipeline order (V19 before V01), that the FIX
pass returns a corrected `ok` package, and that the brief is regenerated **after** V4's asset
renumbering. The §7.1 package validates with **0 blocks and exactly one WARN (V22)** — expected
and documented in §7: its stroke arrays are abridged, "V22 would WARN on marks this sparse".

**Deviations and contract issues found (not fudged):**

1. **`serialize(build(fixture)) === §7.1 text` is unsatisfiable as written** (this file's "How
   We'll Verify" step 1 and the DoD). §7.1 is HAND-FORMATTED — several JSON values per line, and
   `810.0` where any re-serialization writes `810`. This is exactly the defect Open Question 1
   found in §7.2's hand wrapping. The implemented assertion compares against §7.1 **re-serialized
   with `JSON.stringify(…, null, 2)`**; because `JSON.parse` preserves the fixture's key order,
   it is just as strong and is still derived from the doc. Needs a one-line correction to this
   file (and, if the designer prefers the literal form, a whitespace-only regeneration of §7.1).
2. **§4.5's annotation target must exclude `section` blocks** — the spec says "the block whose
   frame the stroke's bbox overlaps most" without qualifying it, but a full-width band always
   wins on area: §7.1's `stk_0002` would target `blk_0001` (the section) instead of `blk_0006`
   (the button) it demonstrably targets. §4.4's reference-text preamble settles it — "`section`
   blocks are never referenced" — and [N7] prints this guess. Implemented with sections excluded;
   §4.5 should say so.
3. **Stale numbers in this file:** step 1's `pageHeight.test.ts` line still says "the 800 floor"
   and "Home `1060 → 1144`, Contact `640 → 800`", and Notes still mentions "an 800px PNG for
   Contact". v2.2 raised the floor to 1600 and §7.1 records both pages at 1600. The tests assert
   the v2.2 numbers.
4. **`fromTemplate`'s key position is undefined by the fixture** — §7.1 has no flagged block.
   Implemented per §2.6's own table order (`id, type, z, frame, fromTemplate`, then per-type),
   which is byte-neutral on §7.1.
5. **A dangling `link.pageId` degrades to `{ kind: "none" }`** rather than leaking an internal id
   (V24) or blocking a client on a bug they cannot fix. The editor's page-delete invariant makes
   it unreachable; V2 stays implemented for hand-edited packages reaching the Stage 4 harness.
6. **Colour case:** the app stores colours lowercase (`normaliseHexColor`), §7.1 shows uppercase.
   The schema accepts both and the transform copies verbatim, so a real export differs from §7.1
   in case only. Worth a sentence in §2.4 if byte-comparison against §7.1 ever matters elsewhere.

**Still open (out of this branch's scope):** the E2E submit path, the round-trip gate run against
a real zip, `designCreatedAt` (exported `null` — the caller supplies it), and the V25/V26/V27
message wording once the submit UI exists.

**Independent review (2026-07-28):** re-ran everything in a detached worktree at 4168a2a.
`npm ci` 260 pkgs · `npm run lint` clean · `npm test` **62 files / 1203 tests** ·
`npm run test:coverage` exit 0 (`src/export` 94.03 stmts / **100** funcs / 97.43 lines;
`validate/rules` 94.66 / 98.56 / 96.22) · `npm run build` 300.67 kB ·
`npm run e2e` ×2 both **514 passed / 2 skipped**, 0 flaky ·
`scripts/roundtrip/selftest/run.mjs` **green + 45/45 mutations caught**.
Appendix A **A** byte-identical (9432 B); **D**'s property holds (§7.1 fence 8649 B sha
`28c5d5e2…` ≡ canonical serializer output). A **non-fixture** document (semantic ids, 2 pages,
one photo in two slots, a sketch stroke ≥60% over a slot and an annotation overlapping only a
section band) driven through buildExportPayload → validatePackage → generateBrief: id remap
**total** (no internal id in site.json OR brief.md; remap table absent), pen roles correct
(sketch → the slot; annotation → `null`, **refusing the section** per §4.5 v2.4), slugs
`index-page`/`menu`, heights recomputed independently and matching, two slots sharing one photo
→ **one img_001, one staged file**, empty slot → `assetId: null`, V27 clean, C02 clean, report
`level: ok` + one legitimate V22 WARN. Validator classes each probed: V11 FIX applied AND
reported, input bundle unmutated; V19 first with its human sentence and jumpTo, never an ajv
path; V02 audience:bug; V01 strictly last, ajv-formats proven live. Six red-path fixtures
rebuilt from scratch — all fired, all silent on green. No purity violations; no test theatre.
**NOT VERIFIED DONE — BOUNCE.** Blockers: (1) Appendix A test D is REQUIRED by the frozen v2.4
contract and asserted nowhere CI runs — siteJson.test.ts compares vs §7.1 *re-serialized* (the
option decisions.md explicitly rejected) under a NOTE whose "hand-formatted/810.0" claim is
measurably false since v2.4; (2) Verify steps 6/7 unexecuted — no E2E touches
buildSiteJson/validatePackage (genuinely blocked on zip/submit, now discharging via that
batch); (3) the "three call sites … gate.mjs" criterion contradicts the gate's deliberate
no-app-imports design — reword to the Stage 4 harness. Fixes assigned to the zip/submit batch.

### 2026-07-28 — bounce blockers discharged by the zip/submit batch

Status stays `awaiting verification`: the reviewer re-verifies after this lands.

1. **Appendix A test D now exists and runs in CI.** `src/export/siteJson.test.ts` opens with
   `describe('Appendix A equality test D — the canonical serializer owns §7.1')` asserting
   `serializeSiteJson(JSON.parse(specSiteJsonText)) === specSiteJsonText`, both sides read from
   `docs/export-format.md` at test time. The stale NOTE that claimed §7.1 was hand-formatted
   (`810.0`, multi-value lines) is DELETED — measured this session, the §7.1 fence is byte-identical
   to `JSON.stringify(parse, null, 2) + '\n'` (8643 B), so the strong form was available all
   along. The fixture comparison was tightened to `toBe(specSiteJsonText)` at the same time, so
   nothing in this file compares against a re-serialization any more.
   `npx vitest run src/export/siteJson.test.ts` → **23 passed**.
2. **Verify steps 6 and 7 are discharged.** `e2e/submit.spec.ts` (6 tests × chromium, firefox,
   webkit — all green in the 535-test suite) drives a design through the real submit UI into
   `buildExportPayload` → `validatePackage` → `generateBrief` → the zip, captures the browser
   download, unzips it in Node, and asserts `schemaVersion`, the `pg_`/`blk_` id patterns, the
   §1 entry list derived from `site.json` itself, and the no-BOM / no-CR / 2-space contract.
   Step 6's gate run is in `feature-package-zip.md`'s log: **exit 0, `GATE PASSED — 35 pass,
   2 warn, 0 fail, 1 skip`**, with the corrupted-zip negative control asserted in the same test
   (an extra `notes.txt` → non-zero, naming V12).
3. **The "three call sites … gate.mjs" criterion is reworded** to name the Stage 4 harness, with
   the reason (`gate.mjs` imports no app code by design) stated inline.

Also repaired in this pass: the mangled "Export page height ≠ editor page height" bullet (it had
been half-overwritten by the v2.2 unification edit and read as a sentence fragment), the drifted
test filenames in How We'll Verify, and the schema-sync path.

**Stage-close review (2026-07-29):** re-ran everything in a detached worktree at 770c346.
`npm ci` 0 vuln · lint clean · `npm test` **76 files / 1313 tests** · `test:coverage` exit 0
(`src/export/brief` 98.09 lines/98.4 funcs · `delivery` 97.95/100 · `png` 96.11/96.55 ·
`validate/rules` 96.22/98.56 · `zip` 98.54/100) · build 565.09 kB · `npm run e2e` ×2 both
**535 passed / 2 skipped**, 0 flaky · gate self-test **45/45 mutations caught**, exit 0.
**Bounce blocker 1 DISCHARGED — Appendix A test D verified live:** siteJson.test.ts opens with
the test-D describe, byte-exact, both sides read from the spec at test time; measured
independently, §7.1 fence **8649 B sha 28c5d5e2…** ≡ serializeSiteJson(parse(§7.1)). The stale
"hand-formatted / 810.0" NOTE is DELETED; no comparison against a re-serialization remains.
(Corrects the discharge entry above: the fence is 8649 B, not 8643.)
**Blocker 2 DISCHARGED:** the reviewer ran the gate personally on an E2E-produced package —
GATE PASSED — 35 pass, 2 warn, 0 fail, 1 skip (38 checks), EXIT 0; the +notes.txt negative
control exits 1 naming **V12**. **Blocker 3 DISCHARGED:** criterion reworded to the Stage 4
harness; gate.mjs and lib modules confirmed to import zero src/ code.
**V24 proven on a REAL package:** all internal ids absent from site.json AND brief.md; remap
table absent; ids ordinal-only. Gate C03/C04/V06/V01/V02/V03/V27 all PASS on those bytes.
CI green at 770c346 incl. the gate-selftest and schema-check steps; live 200, deployed hash
matches this commit's local build. **VERIFIED DONE.**

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
- **v2.4:** §7.1 is now canonical-serializer output; Appendix A test D (`serialize(parse(§7.1)) === §7.1`, byte-exact) is REQUIRED — the branch implementation's compare-vs-reserialized workaround is superseded by a direct byte test. §4.5 annotation targets exclude sections (clause now explicit). V22 = annotation clusters only.
- **Binding contract:** `docs/export-format.md` §2 (shape), §4.1 (slugs), §4.2 (height), §4.5
  (pen semantics), §4.6 (assets), §4.7 (discriminators), §4.8 (identity remap), §5 (V1–V24),
  §6 (forward compatibility). `docs/decisions.md` 2026-07-28 "Export format v2 adopted".
- **Export page height = editor page height, since v2.2** (this bullet used to say the opposite,
  and was left as a mangled half-sentence by the v2.2 edit — repaired 2026-07-28). The editor
  and the export now share ONE function, `pageHeightForContent` in `src/canvas/geometry.ts`,
  implementing §4.2's `clamp(1600, ceil((bottom + 160) / 8) * 8, 8000)`. In the §7 example both
  pages land on the 1600 floor. The earlier split — an 800px export floor against a 1600px
  on-screen page — was what made "the PNG shows what the client saw" merely approximately true;
  unifying it is what lets §4.3 say *literally*. `page.height` is still the number the PNG must
  match exactly (V6), so the renderer sizes itself from **this module's output**, never from the
  live canvas DOM.
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
