# Feature: Package Zip
_Stage: stage-3-export-delivery · Status: verified done_

## Goal
Assemble the four artifact kinds into one zip whose layout is **exactly**
`docs/export-format.md` §1 — no wrapper folder, no extras — apply the deterministic compression
ladder, stamp the submission UUID, name the file by convention, and report a size the client can
see before they send it.

A builder who extracts this zip and runs `ls` must see `site.json` and `brief.md` immediately.
Everything about this feature is in service of that one moment.

## Success Criteria

### Layout (§1)
- [x] The zip contains **exactly**: `site.json`, `brief.md`, one `pages/<NN>-<slug>.png` per
      page, and zero or more `assets/img_NNN.<ext>` — **all at the zip root, no wrapper folder,
      nothing else**. No README, no thumbnails, no `.blueprint`, no directory entries
- [x] `assets/` is absent entirely when the design references no uploaded image; `pages/` is
      always present with ≥1 entry
- [x] Entries are written in the §1 order: `site.json`, `brief.md`, `pages/` in page order,
      `assets/` in id order. Paths use forward slashes and match `page.screenshot` / `asset.path`
      in `site.json` character for character
- [x] `site.json` and `brief.md` are **UTF-8, no BOM, LF line endings**; `site.json` is
      pretty-printed with 2-space indentation and the stable key order of §2

### Filename and UUID stamping
- [x] File name is `blueprint_<business-slug>_<uuid8>.zip` — `<business-slug>` per §4.1 steps 1–4
      (steps 5–6 do not apply to the business slug), `<uuid8>` the first 8 hex chars of the
      submission UUID. Example: `blueprint_bluebird-bakery_3f2a9c1e.zip`
- [x] **One UUID per submission, minted once, stamped in three places** (debate #2 binding):
      `site.json`'s `submission.id`, the `brief.md` HTML comment header, and the zip filename —
      and later the notification payload. A unit test asserts all three agree; V8's "minted this
      submission" is guaranteed **by construction** (mint at the top of the submit action, never
      read from storage), not by inspection
- [x] The filename is cosmetic: every identity fact also lives inside `site.json`, so a client
      who renames the file loses nothing (§1)

### Compression ladder (debate #2 binding: "deterministic compression ladder on the zip")
- [x] The ladder is an **ordered list of pure rungs**, each `(bundle) → bundle`, applied in order
      while the projected size exceeds `SIZE_TARGET_BYTES` and rungs remain. The rungs applied
      are recorded in the package report and surfaced by the size meter
- [x] Rung 0 (always): **store** already-compressed entries (`.png`, `.jpg`, `.webp`) and
      **deflate** the text entries at a fixed level. Re-deflating a PNG buys ~nothing and costs
      time; the fixed level is what makes the output byte-stable
- [x] Rung 1 (always, lossless): strip ancillary PNG chunks (`tEXt`, `tIME`, `pHYs`, `iTXt`) from
      the page renders — pure byte surgery, no re-encode, no pixel changes
- [x] Rung 2 (**stroke-free pages only**, lossy): colour quantization of page PNGs. §4.3 is
      binding: *lossless optimization only on any page containing pen strokes*; the renderer
      hands over `hasStrokes` per page and the ladder obeys it. A test asserts a stroke page is
      byte-identical before and after the ladder at every rung
- [x] **The ladder never touches `assets/`, `site.json` or `brief.md`.** §4.6 requires uploaded
      bytes to be written as-is (they were already compressed at ingest to a 1600px long edge),
      and V21 checks the manifest's `width`/`height`/`bytes` against the staged file — recompressing
      would either break V21 or silently rewrite numbers the brief prints to the builder
- [x] **Deterministic:** the same bundle in produces byte-identical zip bytes out. All entries
      get a fixed timestamp constant (no wall-clock mtimes), no unix extra fields, no varying
      external attributes. Two calls with the same input and the same submission object produce
      the same bytes — asserted by a unit test comparing hashes
- [x] V10: zip size over 15 MB is a **WARN with the size surfaced**, never a BLOCK
      (download-first must not fail)

### Size meter
- [x] The submit UI shows the package size before sending, computed from the real assembled zip
      (not an estimate of it), formatted per [N11] (`~<round(bytes/1024)> KB`, or MB above
      1024 KB), with a plain-language band: comfortable / large / over the guideline
- [x] When the ladder fired, the meter says so in one short line ("compressed the page images to
      keep this emailable") — the client should understand the number, not the algorithm

## How We'll Verify

1. **Unit (`npm test`)**
   - `src/export/zip/pack.test.ts` — assemble a fixture bundle, unzip it back in the test with
     `fflate`, and assert the entry list **deep-equals** the expected array in order; assert no
     entry name contains `\` or starts with `./`; assert a no-assets design produces no
     `assets/` entries at all.
   - `src/export/zip/pack.test.ts` (determinism) — pack the same bundle twice and compare a hash
     of the bytes; pack with the entries supplied in a shuffled order and assert the output is
     still identical (the packer sorts, the caller does not have to).
   - `src/export/zip/filename.test.ts` — `blueprint_bluebird-bakery_3f2a9c1e.zip` from the §7
     fixture; a business name with diacritics/emoji/symbols; the all-symbols fallback (Open
     Question below); the uuid8 slice is lower-case hex of length 8.
   - `src/export/zip/ladder.test.ts` — rung order is fixed; a bundle under target skips every
     optional rung; a bundle over target applies rungs in order and stops as soon as it fits; a
     **stroke page is byte-identical** after the full ladder while a stroke-free page is smaller;
     `assets/`, `site.json` and `brief.md` bytes are identical before and after in every case.
   - `src/export/zip/stamping.test.ts` — the UUID in `submission.id`, in the `brief.md` header
     comment and in the filename are the same value; minting twice yields different UUIDs
     matching the v4 pattern from the schema.
2. **E2E (`npm run e2e`)** — `e2e/export-zip.spec.ts`, ×3 engines: submit the fixture design,
   capture the download, and assert:
   - `download.suggestedFilename()` matches `/^blueprint_[a-z0-9-]+_[0-9a-f]{8}\.zip$/`
   - the unzipped entry list **exactly equals** the §1 expectation derived from the zip's own
     `site.json` (page count → `pages/NN-slug.png` names; `assets[]` → `assets/img_NNN.ext`)
   - `site.json` text has no BOM, no `\r`, and round-trips `JSON.parse` → re-serialize with
     2-space indent byte-identically (proves the pretty-print contract)
   - the three UUID stampings agree
3. **Round-trip gate** — `node scripts/roundtrip/gate.mjs --package <downloaded.zip> --no-manifest`
   exits 0 (§2 steps 1–3 of `docs/roundtrip-protocol.md`: filename + layout, ajv, validator
   replay). Then a negative control: inject an extra `notes.txt` into a copy of the zip and
   assert the gate exits non-zero naming V12.
4. **Size meter E2E** — assert the meter's displayed KB equals `Math.round(bytes/1024)` of the
   actually downloaded file (read the file's size in the test), so the number the client sees is
   the number they will forward.
5. Record commands, exit codes, entry listings, byte sizes and hashes below.

## Verification Log

### 2026-07-28 — built and exercised end to end (awaiting independent verification)

**Unit — `npx vitest run src/export/zip`** → 5 files, 44 tests, 0 failed.

- `pack.test.ts` (12) — the archive is unzipped back with `fflate` and its entry list
  **deep-equals** `['site.json', 'brief.md', 'pages/01-home.png', 'pages/02-contact.png',
  'assets/img_001.jpg']` in order; no entry name contains a backslash, starts with `./`
  or `/`, or ends with `/` (no directory entries); a no-assets bundle produces no
  `assets/` entry at all. The local **and** central headers are read back BY HAND
  rather than through fflate: `site.json`/`brief.md` carry method 8, the PNG and the
  JPEG carry method 0, every entry's DOS date/time equals the value computed from the
  literal constants (`((2026−1980)<<25)|(1<<21)|(1<<16)|(12<<11)` = 1545691136), every
  extra-field length is 0 on both sides, and the data-descriptor flag bit is clear.
- Determinism — `sha256(packZip(entries))` is equal across two calls **and** equal when
  the same entries are supplied shuffled (the packer sorts; the caller does not).
- `ladder.test.ts` (12) — the applied list is
  `['rung0-store-and-deflate', 'rung1-strip-ancillary-chunks']` under target and gains
  `'rung2-quantize-stroke-free'` only over it; with no quantizer bound the ladder
  records `unavailable: ['rung2-quantize-stroke-free']` instead of pretending it ran.
  **A stroke page is byte-identical after the FULL ladder** while the stroke-free page
  shrinks, and `site.json` / `brief.md` / `assets/img_001.jpg` are byte-identical at
  every rung under every ports × target combination.
- `filename.test.ts` (7) — `blueprint_bluebird-bakery_3f2a9c1e.zip` from the §7 fixture;
  a diacritics + ampersand + emoji name gives `blueprint_cafe-ursula-co_3f2a9c1e.zip`;
  an emoji-only name and `'   '` both give `blueprint_business_3f2a9c1e.zip`; the uuid8
  is 8 lower-case hex characters.
- `buildPackage.test.ts` (10) — the §7.1 design assembles to exactly the five §1 entries,
  which also deep-equal `expectedZipEntries()` derived from `site.json`; the archived
  `site.json` has no BOM, no CR, and re-serializes to itself; the staged JPEG is
  byte-identical to the ingest bytes (214,733 B); V21's evidence is re-read from the
  staged bytes (1600×1200, 214733, image/jpeg) rather than copied off the manifest;
  `validatePackage` on the assembled evidence returns `blocks: []`, `level: 'ok'`.
- `stamping.test.ts` (5) — the SAME UUID appears in `submission.id`, in the `brief.md`
  header comment (`submission <uuid>`) and in the filename; 32 successive mints are 32
  distinct v4-pattern UUIDs.
- `size.test.ts` (5) — `~0/1/24/1024 KB`, then `~1.0 MB` once the KB figure passes 1024;
  the bands switch at `SIZE_TARGET_BYTES` and at V10's 15 MB.

**Coverage — `npm run test:coverage`** → `src/export/zip` 96.27% statements, 98.54%
lines, 100% functions, against the 80% lines+functions gate on `src/export/**`.

**E2E — `npx playwright test`** → 535 passed / 2 skipped across chromium, firefox and
webkit (7.4 min locally, parallel; 514 before this batch). `e2e/submit.spec.ts` captures
the real browser download, unzips it in Node, and asserts the entry list equals the
expectation **derived from the package's own `site.json`**, plus the filename convention,
the no-BOM / no-CR / 2-space contract, and the three UUID stampings.

**Round-trip gate (the Stage 3 DoD bullet)** — `node scripts/roundtrip/gate.mjs --package
blueprint_bluebird-bakery_20dabec3.zip --no-manifest`, run on an E2E-produced package:

```
package : blueprint_bluebird-bakery_20dabec3.zip (63.0 KB, 4 entries)
PASS  F01   zip filename matches blueprint_<business-slug>_<uuid8>.zip
PASS  F02   filename business slug equals slugify(siteSettings.businessName)
PASS  F03   filename uuid8 equals the first 8 hex chars of submission.id
PASS  V12   zip entry list exactly equals §1 layout  — 4 file entries, 4 expected
PASS  C01   zip entries written in §1 order (site.json, brief.md, pages, assets)
PASS  C02   site.json / brief.md UTF-8, no BOM, LF; 2-space, stable key order
PASS  V10   zip size within the 15 MB budget  — 0.06 MB
…
GATE PASSED — 35 pass, 2 warn, 0 fail, 1 skip (38 checks)
EXIT=0
```

The two WARNs are the fixture's deliberate ones (V15 unreachable page, V23 template
filler). The **negative control** runs inside the same E2E: a copy of that zip carrying
an extra `notes.txt` makes the gate exit non-zero, naming **V12**.

**Size meter** — the E2E reads the downloaded file's size off disk and asserts the meter
shows `~<round(bytes/1024)> KB` of *that* number, so the figure on screen is the figure
the client forwards.

**Ladder measurement — why rung 2 ships as a port and not a dependency.** The committed
export baselines measure 16.7–24.5 KB per page render, and the E2E-produced two-page
package is **63.0 KB** against a `SIZE_TARGET_BYTES` of 8,388,608 — three orders of
magnitude of headroom. No quantizer dependency was added, which is exactly what the Open
Question below instructed once a measurement existed.

**Stage-close review (2026-07-29):** re-verified in a detached worktree at 770c346 — lint clean ·
**76 files / 1313 tests** · coverage exit 0 (`src/export/zip` **98.54% lines, 100% functions**) ·
build 565.09 kB · e2e ×2 both **535 passed / 2 skipped**, 0 flaky · gate self-test **45/45**.
**Headers parsed BY HAND on a produced archive, on a UTC-5 machine** (the timezone reasoning
genuinely exercised): text entries method 8, images method 0; every local AND central DOS
date/time = **1545691136**, exactly what the literal constants compute; extra-field length 0
both sides; data-descriptor bit clear; versionMadeBy 0x14; externalAttr 0; no directory
entries; EOCD 5 entries. fflate 0.8.3 confirmed at source to use LOCAL date getters as
documented. Shuffled input → byte-identical hash.
**Determinism scope stated precisely:** same bundle + same submission object → identical bytes
(proven); two separate submissions differ only by minted UUID/submittedAt — verified on two
real packages identical once submission is excluded; per-engine PNG render determinism holds
across 12 real packages.
**§1 and the DoD gate run by the reviewer on a real E2E package** (64,563 B): entries exactly
equal the expectation derived from the package's own site.json; gate → **EXIT 0** (35 pass /
2 warn / 0 fail / 1 skip); +notes.txt control exits 1 naming V12. Ladder re-confirmed: 63.0 KB
against an 8 MB target, no quantizer shipped. **VERIFIED DONE.**

## Open Questions
- **Zip library.** **Recommendation: `fflate`** (MIT, ~8 kB gzipped, sync API, explicit per-entry
  `mtime` and `level`, works identically in the browser and in the Node harness). Rejected:
  JSZip (larger, and its defaults bake wall-clock timestamps into entries, which kills the
  determinism criterion), `CompressionStream` alone (no zip container). The Stage 4 protocol
  mentions adm-zip for the harness; using `fflate` on both sides means one library and one set of
  behaviours to reason about — worth a note in `docs/roundtrip-protocol.md` when the harness lands.
- **Quantization dependency for rung 2.** Only needed when a real package actually exceeds the
  target. **Recommendation:** implement rungs 0 and 1 unconditionally, and implement rung 2
  behind the same `SIZE_TARGET_BYTES` trigger using a small MIT quantizer, chosen at
  implementation time by measuring a real 4-page package first. Do not add the dependency before
  a measurement shows it is needed (YAGNI) — but do keep the rung in the ladder's type and tests
  so "the ladder is deterministic and ordered" stays a proven property rather than a promise.
- **`SIZE_TARGET_BYTES` vs V10's 15 MB.** V10 warns at 15 MB; the ladder should aim lower so the
  warn is rare. **Recommendation:** target 8 MB (comfortably inside common 20–25 MB mail
  attachment limits after base64's ~33% expansion), warn at V10's 15 MB. Two named constants,
  both with the reasoning in a comment.
- **Business-slug fallback** when `slugify(businessName)` is empty (`overview.md` Open Question 6).
  **Recommendation:** `business`, so the file is `blueprint_business_3f2a9c1e.zip` rather than
  `blueprint__3f2a9c1e.zip`.
- **`>99` pages** would break the schema's 2-digit `NN` pattern for `page.screenshot`. Not
  reachable through the UI in any realistic session. **Recommendation:** note it, do not build a
  3-digit path; if it ever matters it is a schemaVersion 2 change (§6.3 — the zip layout is
  version-bump territory).

## Notes & Decisions
- **Binding contract:** `docs/export-format.md` §1 (layout, naming, file conventions), §4.3 (the
  lossless-on-stroke-pages rule), §4.6 (assets written as-is), §5 V10 / V12 / V21.
  `docs/decisions.md` 2026-07-28 delivery entry (compression ladder and UUID stamping are the two
  things explicitly adopted from the losing side of debate #2 — they are binding, not optional).
- **Determinism is a testing tool, not an aesthetic.** A zip whose bytes depend on the wall clock
  cannot be hashed, diffed, or cached between round-trip iterations; the protocol's §8 loop
  explicitly re-exports the same design many times. Fixed entry timestamps cost one constant and
  buy a byte-comparable artifact.
- **Store, don't deflate, the images.** PNG and JPEG payloads are already entropy-coded; deflating
  them again typically saves under 1% and adds seconds on a 4-page package. Storing them also
  makes the zip's own bytes trivially predictable, which the determinism test likes.
- **Assets are untouchable.** §4.6 says the ingest bytes go in as-is and V21 cross-checks the
  manifest against the staged file. Any "helpful" recompression here would put the brief's printed
  dimensions and KB figures at odds with the file the builder opens — the exact class of defect
  the three-artifact redundancy model exists to prevent.
- **The ladder obeys `hasStrokes`, it does not compute it.** The renderer already knows which
  pages carry pen marks (`feature-png-renderer.md`); duplicating the derivation here is a second
  place for it to be wrong.
- **V10 never blocks.** Download-first's entire value is that the zip cannot fail to be produced.
  A 20 MB package still downloads, still validates, still gets a mailto — it just tells the client
  and Cam that it is big.
- **The size meter reads the real zip.** An estimate that disagrees with the downloaded file's
  properties dialog is worse than no meter; assembly is fast enough to just do it.

### Implementation calls (2026-07-28)

- **Zip library: `fflate` 0.8.3, MIT** — licence verified by reading
  `node_modules/fflate/LICENSE` ("MIT License, Copyright (c) 2026 Arjun Barrett"), not by
  trusting the registry field. JSZip was rejected as the Open Question recommended, and the
  rejection was *checked* rather than assumed: a produced archive's headers were parsed by
  hand and fflate writes **no extra fields, no data descriptors, no directory entries, no
  file comments, external attributes 0, version-made-by 0x14** — nothing that varies with
  the machine once `mtime` and `level` are pinned. Both knobs are per-entry parameters,
  which is what makes the determinism criterion reachable at all.
- **Timestamp constant: `ZIP_ENTRY_MTIME = new Date(2026, 0, 1, 12, 0, 0, 0)` — LOCAL
  fields, deliberately.** fflate derives the DOS date/time with the LOCAL `Date` getters
  (`esm/browser.js:1884`: `dt.getFullYear()`, `dt.getHours()`, …). A UTC instant would
  therefore encode differently in Vancouver than on a UTC CI runner: deterministic per
  machine, not across them. Constructing the Date from local field values makes those
  getters read back 2026-01-01 12:00:00 in every timezone. **Noon, not midnight**, because
  a few zones have historically shifted the clock *at* midnight, which makes `00:00` a
  non-existent local time there. `pack.test.ts` asserts the encoded 4-byte field against a
  value computed from the literal constants, so any regression to a UTC-derived timestamp
  fails on a machine that is not on UTC.
- **Write order: the packer sorts, by CODE UNIT.** §1's order is a property of the artifact, so
  `orderEntries()` owns it (`site.json`, `brief.md`, `pages/*`, `assets/*`, then lexicographic
  — which IS numeric order because §1 zero-pads both `NN` and `img_NNN`). A shuffled input
  produces a byte-identical archive, asserted by hash. Deliberately **not** `localeCompare`:
  the archive's bytes are supposed to be a function of the design and nothing else, and
  collation is a function of whichever ICU data the engine ships — several collations treat `-`
  and `_` as ignorable punctuation, which is one library update away from silently reordering
  an entry list containing both. A test pins a pair (`01-ab` vs `02-a-b`) that the two rules
  order differently.
- **Rung 2 is a PORT, not a stub and not a dependency.** `runLadder` takes
  `{ quantizePng }`; the app binds `null` and the unit suite binds a fake quantizer, which
  is how "the ladder is ordered, deterministic, and obeys `hasStrokes`" stays a *proven*
  property with no quantizer shipped. The measurement that justifies shipping none is in
  the Verification Log. Wiring a real one later is one binding.
- **Rung 1 strips exactly the four types §1 names** (`tEXt`, `tIME`, `pHYs`, `iTXt`) and
  deliberately keeps `sRGB`, `sBIT` and `iCCP`, which describe how to *interpret* the
  colours rather than being metadata. Measured on the committed export baselines: chromium
  and firefox emit no ancillary chunks at all and webkit emits only those three — so on
  today's renderers rung 1 is a no-op, which is precisely why a real stroke page comes out
  byte-identical rather than merely pixel-identical.
- **V21's evidence is re-read from the staged bytes.** `buildPackage` parses the image
  header of the bytes it actually put in the archive instead of copying the manifest's
  numbers across. Copying would have made V21 compare a number with itself; re-reading
  keeps it a real check on the staging step, which is the check the brief's printed
  dimensions depend on.
- **`SIZE_TARGET_BYTES = 8 MB`, `MAX_ZIP_BYTES` re-exported from the validator.** The warn
  line has exactly one definition (`src/export/validate/rules/warnings.ts`), so the meter
  and V10 cannot drift apart.
