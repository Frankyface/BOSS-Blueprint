# Feature: Package Zip
_Stage: stage-3-export-delivery · Status: not started_

## Goal
Assemble the four artifact kinds into one zip whose layout is **exactly**
`docs/export-format.md` §1 — no wrapper folder, no extras — apply the deterministic compression
ladder, stamp the submission UUID, name the file by convention, and report a size the client can
see before they send it.

A builder who extracts this zip and runs `ls` must see `site.json` and `brief.md` immediately.
Everything about this feature is in service of that one moment.

## Success Criteria

### Layout (§1)
- [ ] The zip contains **exactly**: `site.json`, `brief.md`, one `pages/<NN>-<slug>.png` per
      page, and zero or more `assets/img_NNN.<ext>` — **all at the zip root, no wrapper folder,
      nothing else**. No README, no thumbnails, no `.blueprint`, no directory entries
- [ ] `assets/` is absent entirely when the design references no uploaded image; `pages/` is
      always present with ≥1 entry
- [ ] Entries are written in the §1 order: `site.json`, `brief.md`, `pages/` in page order,
      `assets/` in id order. Paths use forward slashes and match `page.screenshot` / `asset.path`
      in `site.json` character for character
- [ ] `site.json` and `brief.md` are **UTF-8, no BOM, LF line endings**; `site.json` is
      pretty-printed with 2-space indentation and the stable key order of §2

### Filename and UUID stamping
- [ ] File name is `blueprint_<business-slug>_<uuid8>.zip` — `<business-slug>` per §4.1 steps 1–4
      (steps 5–6 do not apply to the business slug), `<uuid8>` the first 8 hex chars of the
      submission UUID. Example: `blueprint_bluebird-bakery_3f2a9c1e.zip`
- [ ] **One UUID per submission, minted once, stamped in three places** (debate #2 binding):
      `site.json`'s `submission.id`, the `brief.md` HTML comment header, and the zip filename —
      and later the notification payload. A unit test asserts all three agree; V8's "minted this
      submission" is guaranteed **by construction** (mint at the top of the submit action, never
      read from storage), not by inspection
- [ ] The filename is cosmetic: every identity fact also lives inside `site.json`, so a client
      who renames the file loses nothing (§1)

### Compression ladder (debate #2 binding: "deterministic compression ladder on the zip")
- [ ] The ladder is an **ordered list of pure rungs**, each `(bundle) → bundle`, applied in order
      while the projected size exceeds `SIZE_TARGET_BYTES` and rungs remain. The rungs applied
      are recorded in the package report and surfaced by the size meter
- [ ] Rung 0 (always): **store** already-compressed entries (`.png`, `.jpg`, `.webp`) and
      **deflate** the text entries at a fixed level. Re-deflating a PNG buys ~nothing and costs
      time; the fixed level is what makes the output byte-stable
- [ ] Rung 1 (always, lossless): strip ancillary PNG chunks (`tEXt`, `tIME`, `pHYs`, `iTXt`) from
      the page renders — pure byte surgery, no re-encode, no pixel changes
- [ ] Rung 2 (**stroke-free pages only**, lossy): colour quantization of page PNGs. §4.3 is
      binding: *lossless optimization only on any page containing pen strokes*; the renderer
      hands over `hasStrokes` per page and the ladder obeys it. A test asserts a stroke page is
      byte-identical before and after the ladder at every rung
- [ ] **The ladder never touches `assets/`, `site.json` or `brief.md`.** §4.6 requires uploaded
      bytes to be written as-is (they were already compressed at ingest to a 1600px long edge),
      and V21 checks the manifest's `width`/`height`/`bytes` against the staged file — recompressing
      would either break V21 or silently rewrite numbers the brief prints to the builder
- [ ] **Deterministic:** the same bundle in produces byte-identical zip bytes out. All entries
      get a fixed timestamp constant (no wall-clock mtimes), no unix extra fields, no varying
      external attributes. Two calls with the same input and the same submission object produce
      the same bytes — asserted by a unit test comparing hashes
- [ ] V10: zip size over 15 MB is a **WARN with the size surfaced**, never a BLOCK
      (download-first must not fail)

### Size meter
- [ ] The submit UI shows the package size before sending, computed from the real assembled zip
      (not an estimate of it), formatted per [N11] (`~<round(bytes/1024)> KB`, or MB above
      1024 KB), with a plain-language band: comfortable / large / over the guideline
- [ ] When the ladder fired, the meter says so in one short line ("compressed the page images to
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
_Empty — nothing verified yet._

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
