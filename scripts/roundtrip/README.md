# BOSS Blueprint — round-trip PACKAGE GATE

Standalone Node validator for a Blueprint export package. This is the script Stage 3's
Definition of Done invokes:

```
node scripts/roundtrip/gate.mjs --package <downloaded.zip> --no-manifest
```

It implements **`docs/roundtrip-protocol.md` §2 steps 1–3** and replays every
machine-checkable rule of **`docs/export-format.md` v2.2 §5 (V1–V26)** against a real zip.

**It imports no app code.** Everything is re-derived from the spec and from the package
bytes, which is the whole point: a gate that called `src/export/validate` would agree with
the app by construction and could never catch a validator bug. The JSON Schema is
**extracted at run time from the fenced block in `docs/export-format.md` §2.2**, so the spec
stays the single source of truth and the gate keeps working before `src/export/schema/`
exists (it does not exist yet — checked 2026-07-28).

---

## 1. Usage

```
node gate.mjs --package <zip> [options]

Required:
  --package <zip>        the export package to gate

Options:
  --no-manifest          skip protocol §2 step 4 (expected-manifest diff, Stage 4 work).
                         Without it the step is still skipped but reported as a WARN.
  --scenario <file>      reserved for step 4; not implemented here (reports SKIP).
  --spec <file>          path to docs/export-format.md. Default: <script>/../../docs/export-format.md
  --schema <file>        use this JSON Schema file instead of extracting from the spec.
  --internal-ids <file>  newline- or JSON-array-delimited list of the app's internal ids,
                         enabling the exact V24 leak scan (see Limitations).
  --out <dir>            write report.json + extracted-schema.json here.
  --max-zip-mb <n>       V10 budget in MB (default 15).
  --strict-conventions   promote §1 file-convention WARNs (C01/C02/C03) to FAIL.
  --json                 print the machine report instead of the text table.
  --quiet                print only the summary plus FAIL/WARN lines.
  -h, --help
```

**Exit codes:** `0` = pass (no FAIL lines) · `1` = at least one FAIL · `2` = usage / IO error.
WARN never changes the exit code — that is §5's outcome-class contract ("package ships; the
condition is noted").

Sample green run:

```
package : blueprint_bluebird-bakery_3f2a9c1e.zip (23.7 KB, 5 entries)
schema  : extracted from …/docs/export-format.md §2.2
steps   : protocol §2.1 layout · §2.2 ajv · §2.3 validator replay V1-V26 · §2.4 skipped (--no-manifest)

PASS  F01   zip filename matches blueprint_<business-slug>_<uuid8>.zip  — blueprint_bluebird-bakery_3f2a9c1e.zip
…
PASS  V06   every page PNG decodes, is exactly 1200 × page.height, and is non-blank  — pages/01-home.png 1200x1600 var=2402.7; pages/02-contact.png 1200x1600 var=1894.8
PASS  V07   brief.md cross-checks against site.json (markers, inventory, ids, quotes)  — 1 WRITE THIS COPY, 1 SOURCE AN IMAGE, 13 block bullets
WARN  V22   no pen cluster is too small or too sparse to read  — 2 cluster(s)
        ! page pg_0001: imageSketch cluster of 1 stroke(s) likely illegible (6 points < 12)
SKIP  M04   expected-manifest diff skipped by --no-manifest (protocol §2 step 4, Stage 4 work)

GATE PASSED — 33 pass, 1 warn, 0 fail, 1 skip (35 checks)
```

### Schema extraction as a standalone step

```
node extract-schema.mjs --out src/export/schema/site.v1.schema.json   # materialise
node extract-schema.mjs --check src/export/schema/site.v1.schema.json # Appendix A test A, from CI
```

`--check` is Appendix A **equality test A** ("the fenced JSON Schema in §2.2 byte-matches
`src/export/schema/site.v1.schema.json`") runnable without the app's test runner. Verified:
matching file exits 0; a one-byte edit exits 1 with a DRIFT line.

---

## 2. Check inventory — 35 checks

Outcome classes mirror §5: **BLOCK** and **FIX** violations produce `FAIL`; **WARN** and
**CONV** violations produce `WARN`. The gate does not *apply* FIX rules — a shipped package
has already been through the app's fix pass, so the gate asserts the **fixed-state
invariant** and treats a violation as a real defect.

### Protocol §2 step 1 — filename + exact zip layout

| id | class | check | spec |
|---|---|---|---|
| `F01` | BLOCK | filename matches `blueprint_<business-slug>_<uuid8>.zip` | §1 / protocol §2.1 |
| `F02` | BLOCK | filename slug == `slugify(siteSettings.businessName)` (full §4.1 incl. the `business` fallback) | §1 / §4.1 |
| `F03` | BLOCK | filename uuid8 == first 8 hex of `submission.id` | §1 (debate #2 binding) |
| `V12` | BLOCK | entry list **exactly** equals §1: no wrapper folder, no extras, none missing, no stray directory entries | §5 V12 / §1 |
| `C01` | CONV | entries written in §1 order (`site.json`, `brief.md`, pages in page order, assets in id order) | §1 File conventions |
| `C02` | CONV | `site.json`/`brief.md` UTF-8, no BOM, LF; `site.json` 2-space pretty-printed | §1 File conventions |

### Protocol §2 step 2 — ajv schema validation

| id | class | check | spec |
|---|---|---|---|
| `V01` | BLOCK | `site.json` validates against the §2.2 schema — **ajv v8 + ajv-formats, `{ allErrors: true, strict: true }`**, draft-07 | §5 V1 |

`ajv-formats` is wired and proven by the `malformed-timestamp` red path (`submittedAt: "yesterday"`).

### Protocol §2 step 3 — validator replay

| id | class | check | spec |
|---|---|---|---|
| `V02` | BLOCK | every `link.pageId`, `imageSlot.assetId`, `penStroke.targetBlockId` resolves (stroke targets checked **per page**) | §5 V2 |
| `V03` | BLOCK | page/block/asset/stroke/nav-item id uniqueness; page slug uniqueness; `z` unique per page; `blocks[]` sorted by `z` ascending | §5 V3 |
| `V04` | BLOCK | asset bijection **both directions**: every manifest entry has a staged file, every staged `assets/` file has a manifest entry, every manifest entry is referenced by ≥1 imageSlot | §5 V4 |
| `V05` | BLOCK | every `copyMode: "generate"` block has a non-empty `generateDescription` | §5 V5 |
| `V06` | BLOCK | PNG count == page count; each pairs with its `page.screenshot`; every PNG **decodes**, is exactly **1200 × page.height**, and is **non-blank** by luminance variance | §5 V6 / §4.3 |
| `V07` | BLOCK | brief cross-checks — 10 sub-checks, see below | §5 V7 / §3.3 |
| `V08` | BLOCK | `client.name` non-empty, `client.email` plausible, `submission.id` a well-formed v4 UUID | §5 V8 |
| `V09` | BLOCK | ≥1 page; homepage (`pages[0]`) has ≥1 non-`section` block | §5 V9 (BLOCK half) |
| `V09w` | WARN | no individual page is empty | §5 V9 (WARN half) |
| `V10` | WARN | zip ≤ 15 MB (`--max-zip-mb`) | §5 V10 |
| `V11` | FIX | fixed-state invariant: every external URL already starts `http(s)://` | §5 V11 |
| `V13` | WARN | no duplicate `page.name` site-wide | §5 V13 |
| `V14` | BLOCK | every empty image slot (`assetId: null`) has a non-blank `description` | §5 V14 |
| `V15` | WARN | every page reachable from `pages[0]` by walking `button.link` / `navBar.items[].link` | §5 V15 |
| `V16` | BLOCK | `asset.path` extension == §4.6 mapping of `mimeType`, and path == `assets/<id>.<ext>` | §5 V16 / §4.6 |
| `V17` | FIX | fixed-state invariant: `page.screenshot` == `pages/<pad2(i+1)>-<slug>.png` for its position | §5 V17 |
| `V18` | WARN | no frame substantially off-page (`y+h ≤ 0`, `y < −40`, `x+w ≤ 0`, `x > 1200`) | §5 V18 / §4.3 |
| `V19` | BLOCK | no `copyMode: "real"` block with blank/whitespace-only `text` | §5 V19 |
| `V20` | FIX | fixed-state invariant: `copyMode: "real"` ships with `generateDescription: null` | §5 V20 |
| `V21` | BLOCK | every asset's `width`/`height`/`bytes` **and format** match the staged file (header-parsed PNG/JPEG/WebP) | §5 V21 |
| `V22` | WARN | no pen cluster too small/sparse to read — §4.5/[N7] union-find with 40px-expanded bboxes; bbox < 40×20 or < 12 points | §5 V22 / §4.5 |
| `V23` | WARN | no block still carries `fromTemplate: true` | §5 V23 |
| `V24` | BLOCK | identity remap total: every page/block/nav/stroke id equals its **§4.8 ordinal for its document position**; optional exact internal-id leak scan | §5 V24 / §4.8 |
| `V25` | WARN | no block with `frame.x + frame.w > 1200` | §5 V25 (v2.1) |
| `V26` | BLOCK | no blank `button.label`, no `navBar` with zero items, no blank nav-item label | §5 V26 (v2.1) |
| `N13` | BLOCK | the right-overflow marker appears on **exactly** the overflowing blocks' walkthrough bullets (count + per-block frame-tuple match) | §4.4 [N13] |
| `C03` | CONV | every `page.slug` == §4.1 `slugify(page.name)` incl. reserved-name and `-2`/`-3` uniqueness passes | §4.1 |

### Protocol §2 step 4

| id | class | check |
|---|---|---|
| `M04` | STEP/WARN | expected-manifest diff — **not implemented** (Stage 4). `SKIP` with `--no-manifest`, `WARN` without. |

### V7's ten sub-checks

1. Provenance HTML comment carries `appVersion`, `submission.id`, `submittedAt`, `schemaVersion` (§3.2 / §6.7).
2. `WRITE THIS COPY` count == generate-block count, using the **v2.1 frame-tuple-anchored regex of §3.3 rule 2 verbatim** (`m` flag, one match per logical line).
3. `SOURCE AN IMAGE` count == empty-slot count, same anchoring.
4. Every walkthrough heading `### Page N — <name> (\`<slug>\`)` present, with rule-7 escaping applied to the name.
5. Site-inventory table: per row the page name, `` `slug` ``, `` `screenshot` `` + `(1200×height)`, and block count all match `site.json` exactly.
6. Walkthrough block bullets (`- **Nav bar|Heading|Text|Button|Image slot**`) == non-`section` block count site-wide.
7. Copy-list header count **and [N8] pluralization** (`1 item` / `N items`) and numbered-item count == generate-block count.
8. Assets section: one entry per manifest asset, each printing `W×H` and `~<round(bytes/1024)> KB` per [N11].
9. Every id printed in the brief (`pg_`/`blk_`/`nav_`/`stk_`/`img_`) exists in `site.json` (§3.3 rule 5).
10. Every `«…»` quote matches a `site.json` string field in a **defined derived form**: after reversing rule-7 escapes and mapping `↵`→newline, either verbatim or (when it ends `…`) a prefix; whitespace-normalized. The two boilerplate placeholders (`«…»`, `«X»`) are exempt.

The Definition-of-done boilerplate is uncountable by construction (no bullet/type/tuple
prefix, no `**` around the marker), which is exactly why the raw-substring count is never used.

---

## 3. Self-test

```
node selftest/run.mjs [--spec <docs/export-format.md>] [--keep]
```

**The fixture is built from the spec, not hand-authored.** `site.json` is §7.1 verbatim
(re-serialized to §1's 2-space file convention — the fenced block in the doc is formatted for
reading), `brief.md` is §7.2 verbatim, the page PNGs are generated programmatically at exactly
`1200 × page.height` with block frames and pen strokes painted, and `assets/img_001.jpg` is a
real JPEG encoded at 1600×1200 and padded with legal COM segments to **exactly 214 733 bytes**
so §7.1's manifest holds byte-for-byte and V21 compares real bytes.

### Green run

```
=== GREEN PATH ===
OK   synthetic §7.1/§7.2 package: exit 0, 33 pass / 1 warn / 0 fail / 1 skip
     warns: V22
```

The single WARN is **predicted by the spec itself**: §7 says "the stroke arrays are abridged
for readability — a real export carries dense point lists, and **V22 would WARN on marks this
sparse**". The gate agreeing with that sentence is evidence V22 is implemented correctly, not
a fixture defect.

### Red-path proof table — 36/36 mutations caught by the right check

`exit` is the gate's exit code; `caught` means the expected check id appeared in the gate's
FAIL list (or WARN list for WARN-class mutations); `also failed` lists the other checks that
legitimately fired, because a mutation to `site.json` usually breaks more than one invariant.

| # | mutation | what it does | expects | exit | caught | also failed |
|---|---|---|---|---|---|---|
| 1 | `wrong-png-dims` | page 1 PNG rendered 1200×1592 | V06 FAIL | 1 | yes | — |
| 2 | `blank-png` | page 2 PNG is uniform white | V06 FAIL | 1 | yes | — |
| 3 | `corrupt-png` | page 1 PNG truncated mid-stream | V06 FAIL | 1 | yes | — |
| 4 | `missing-asset-file` | manifest keeps `img_001`, file dropped | V04 FAIL | 1 | yes | V12 |
| 5 | `unmanifested-asset-file` | extra `assets/img_002.png`, no manifest entry | V12 FAIL | 1 | yes | V04 |
| 6 | `unreferenced-asset` | 2nd asset + file that no imageSlot points at | V04 FAIL | 1 | yes | V07 |
| 7 | `dangling-page-link` | button links to `pg_0009` | V02 FAIL | 1 | yes | — |
| 8 | `dangling-stroke-target` | stroke targets a block on another page | V02 FAIL | 1 | yes | — |
| 9 | `extra-zip-entry` | `README.md` added at the root | V12 FAIL | 1 | yes | — |
| 10 | `wrapper-folder` | everything nested under `blueprint/` | V12 FAIL | 1 | yes | V01 |
| 11 | `invalid-vibe` | `vibe: "spooky"` (outside the enum) | V01 FAIL | 1 | yes | — |
| 12 | `malformed-timestamp` | `submittedAt: "yesterday"` | V01 FAIL | 1 | yes | V07 |
| 13 | `id-not-ordinal` | page 2 re-identified `pg_0042` (schema-valid) | V24 FAIL | 1 | yes | — |
| 14 | `internal-id-leak` | `internalId: "rest-home-hero-title"` survives into a block (run with `--internal-ids`) | V24 FAIL | 1 | yes | — |
| 15 | `duplicate-block-id` | two blocks share `blk_0011` | V03 FAIL | 1 | yes | V24 |
| 16 | `z-out-of-order` | `blocks[]` no longer sorted by `z` | V03 FAIL | 1 | yes | V24 |
| 17 | `generate-no-description` | generate block with `generateDescription: null` | V05 FAIL | 1 | yes | V01, V07 |
| 18 | `empty-slot-no-description` | empty slot with `description: null` | V14 FAIL | 1 | yes | V07 |
| 19 | `blank-real-text` | real-copy block containing only spaces | V19 FAIL | 1 | yes | V07 |
| 20 | `stranded-generate-description` | real block still carrying a description | V20 FAIL | 1 | yes | — |
| 21 | `blank-button-label` | label of two spaces (passes schema `minLength: 1`) | V26 FAIL | 1 | yes | V07 |
| 22 | `bad-email` | `dana(at)bluebirdbakery.ca` | V08 FAIL | 1 | yes | V01 |
| 23 | `bad-ext-for-mime` | `mimeType: image/png` with a `.jpg` path | V16 FAIL | 1 | yes | V21 |
| 24 | `manifest-dims-mismatch` | manifest says 1601×1200, file is 1600×1200 | V21 FAIL | 1 | yes | V07 |
| 25 | `screenshot-path-wrong` | page 2 recorded as `pages/03-contact.png` | V17 FAIL | 1 | yes | V12, V06, V07 |
| 26 | `bad-filename` | zip renamed `bluebird.zip` | F01 FAIL | 1 | yes | — |
| 27 | `filename-slug-mismatch` | `blueprint_some-other-shop_3f2a9c1e.zip` | F02 FAIL | 1 | yes | — |
| 28 | `brief-marker-removed` | `**WRITE THIS COPY**` stripped from the brief | V07 FAIL | 1 | yes | — |
| 29 | `brief-unknown-block-id` | brief prints `blk_0999` | V07 FAIL | 1 | yes | — |
| 30 | `brief-invented-quote` | brief quotes text not in `site.json` | V07 FAIL | 1 | yes | — |
| 31 | `brief-missing` | `brief.md` removed from the zip | V12 FAIL | 1 | yes | V07 |
| 32 | `right-overflow-unmarked` | block widened to x=1260, no [N13] marker | N13 FAIL + V25 WARN | 1 | yes | — |
| 33 | `template-filler` | a block flagged `fromTemplate: true` | V23 **WARN** | **0** | yes | — |
| 34 | `block-above-page-top` | block dragged to `y = −100` | V18 **WARN** | **0** | yes | — |
| 35 | `crlf-and-bom` | `site.json` written with BOM + CRLF | C02 **WARN** | **0** | yes | — |
| 36 | `entry-order-scrambled` | entries written assets-first | C01 **WARN** | **0** | yes | — |

```
SELF-TEST PASSED — green package clean, 36/36 mutations caught by the right check
```

Rows 33–36 are the WARN-class proof: the gate names the condition **and still exits 0**,
which is §5's "package ships; the condition is noted" contract.

Notable isolation properties this table demonstrates:

- **21 (`blank-button-label`)** and **13 (`id-not-ordinal`)** are *schema-valid* mutations —
  they prove V26 and V24 catch things ajv structurally cannot.
- **5 vs 4** prove V4's bijection is checked in **both** directions.
- **12 (`malformed-timestamp`)** proves `ajv-formats` is actually wired (without it,
  `format: "date-time"` is a silent no-op).
- **32** proves V25's WARN and N13's BLOCK are independent and both fire.

Runtime: ~2 minutes for 37 gate invocations (each spawns a fresh Node process and fully
decodes two 1200×1600 PNGs).

### Other verified behaviours (outside the mutation table)

| scenario | result |
|---|---|
| no `--package` / unreadable zip / `--help` | exit 2 / exit 2 / exit 0 |
| run **without** `--no-manifest` | `M04` becomes a WARN, gate still exits 0 |
| `--schema <file>` instead of spec extraction | identical verdict (33 pass / 1 warn / 0 fail) |
| `--strict-conventions` on a §1-order violation | WARN → FAIL, exit 0 → 1 |
| `site.json` renamed `Site.json` (the counter-test `feature-site-json-generator.md` §6 asks for) | exit 1, names `V12` + `V01`, remaining rules SKIP |
| `extract-schema.mjs --check` on a matching / one-byte-edited file | exit 0 / exit 1 with a DRIFT line |

---

## 4. Known limitations

Things this gate deliberately does **not** or **cannot** prove:

1. **Protocol §2 step 4 (expected-manifest diff) is not implemented.** It needs the scenario
   file and is Stage 4 work. `--no-manifest` reports it as `SKIP`; without the flag it is a
   `WARN` so nobody forgets. `--scenario` is accepted and reserved.
2. **`generateBrief(site.json) === brief.md` is not replayed.** The gate cross-checks the
   brief *against* `site.json` (V7's ten sub-checks); it does not regenerate it. Appendix A
   **equality test B** remains a Stage 3 unit test — a gate that reimplemented the generator
   would just be a second generator to keep in sync.
3. **V24's leak scan is only exact with `--internal-ids`.** Without the app's id inventory
   the gate proves the strong-but-narrower property that every id-typed field equals its
   §4.8 ordinal. An internal id hiding in a free-text field (`description`, `styleNotes`) is
   undetectable from the package alone. Pass `--internal-ids <file>` in CI, where the app can
   dump the pre-remap id list, for the complete check.
4. **V8's "minted this submission"** is unverifiable by inspection — the spec says so
   ("'fresh' is enforced by construction, not by inspection"). The gate checks v4-UUID
   well-formedness and the filename↔`submission.id` agreement only.
5. **"Non-blank pixel variance" has no numeric definition in the spec.** This gate defines
   blank as luminance variance `< 1.0` **and** fewer than 3 distinct luma buckets (both must
   hold, so a legitimately sparse page still passes). Measured variance is printed on every
   V06 line. Constants live in `lib/png-inspect.mjs`.
6. **PNG *content* fidelity is out of scope.** V06 proves decode + exact dimensions +
   non-blankness. It cannot prove the PNG depicts the blocks `site.json` describes, or that
   the pen layer is baked in — that is the Stage 3 E2E's per-engine visual-regression baseline.
7. **V10 measures the delivered zip size**, not whether the deterministic compression ladder
   ran, and not §4.3's "lossless-only on stroke-bearing pages" rule (unverifiable from a PNG).
8. **V22 has no OCR.** It replays §4.5's clustering and the spec's size/density thresholds;
   "legible" in the human sense is Cam eyeballing the PNG.
9. **V3's FIX/BLOCK split is flattened to FAIL.** A *shipped* package must already be in the
   fixed state, so an unsorted `blocks[]` in a delivered zip is a defect either way. Same for
   V11, V17, V20 — reported as class `FIX`, status `FAIL`.
10. **`site.json` key *order* is not independently verified.** C02 asserts the file
    round-trips through 2-space pretty-print; §2.1's property order and §7.1's example
    disagree (`z` before vs after `frame`), so there is no unambiguous canonical order to
    check against. Raise it with the spec owner if it matters.
11. **The self-test's `site.json` is §7.1 re-serialized, not the fenced block byte-for-byte**
    — the doc's block is display-formatted (several keys per line). Everything else about it
    is verbatim spec content.
12. **The synthetic PNGs are programmatic block renders**, not snapdom captures, and the
    synthetic JPEG is a generated gradient, not a photo. Every check they feed (V06, V21) is
    genuinely exercised; nothing about renderer *fidelity* is proven synthetically.
13. **Zip reading is adm-zip's.** `{ noSort: true }` is passed explicitly — adm-zip
    alphabetises entries on read by default, which would silently defeat C01. Zip64 and
    encrypted archives are untested.

---

## 5. Drop-in instructions for `scripts/roundtrip/`

1. Copy `gate.mjs`, `extract-schema.mjs`, `lib/`, and `selftest/` into
   `<repo>/scripts/roundtrip/`. The default `--spec` resolves to
   `<script>/../../docs/export-format.md`, which is correct from that location — no config.

2. Add the runtime deps to the repo's `package.json`:

   ```
   npm i -D adm-zip@^0.6.0 pngjs@^7 jpeg-js@^0.4
   ```

   `ajv` and `ajv-formats` are already required by `feature-site-json-generator.md`, so they
   will be present as app deps. **Use `adm-zip@^0.6.0` or later** — `<0.6.0` carries
   GHSA-xcpc-8h2w-3j85 (crafted zip → 4 GB allocation), which is exactly the input class a
   gate handles. `jpeg-js` is only needed by the self-test, so it can stay a devDependency.

3. Add npm scripts:

   ```json
   "roundtrip:gate": "node scripts/roundtrip/gate.mjs",
   "roundtrip:gate:selftest": "node scripts/roundtrip/selftest/run.mjs",
   "schema:check": "node scripts/roundtrip/extract-schema.mjs --check src/export/schema/site.v1.schema.json"
   ```

4. Wire the Stage 3 DoD bullet: after the E2E submit captures the download,

   ```
   node scripts/roundtrip/gate.mjs --package <downloaded.zip> --no-manifest
   ```

   must exit 0. The corrupted-zip counter-test the feature doc asks for
   (`site.json` → `Site.json`) is already covered by mutation 9 / 31's shape and will exit
   nonzero naming `V12`.

5. Once `src/export/schema/site.v1.schema.json` lands, **keep extraction as the default**.
   The gate must not depend on app artifacts; `--schema` exists for the case where you
   deliberately want to gate against the repo file, and `extract-schema.mjs --check` is the
   CI assertion that the two are identical (Appendix A test A).

6. `selftest/run.mjs` takes `--spec`; in-repo it needs no argument. It writes
   `selftest-results.txt` next to the script and cleans its `.selftest/` work dir unless
   `--keep` is passed.

---

## 6. File map

```
gate.mjs                     CLI entry, report printing, exit code
extract-schema.mjs           §2.2 schema extractor / Appendix A test A runner
lib/args.mjs                 flag parsing + usage text
lib/report.mjs               CheckResult model, PASS/WARN/FAIL/SKIP rendering, tallies
lib/schema-extract.mjs       §2.2 schema, §7.1 site.json and §7.2 brief.md extraction
lib/package-load.mjs         zip open (noSort), entry list, UTF-8/BOM/LF decode, expected entries
lib/slug.mjs                 §4.1 slugify (page + business variants, uniqueness pass)
lib/geometry.mjs             stroke bboxes, §4.5/[N7] union-find clustering
lib/image-header.mjs         PNG IHDR / JPEG SOFn / WebP VP8·VP8L·VP8X header parser (V16, V21)
lib/png-inspect.mjs          full PNG decode + luminance variance (V06)
lib/brief-parse.mjs          §3.3 rule-2 marker regexes, sections, escaping, [N11] number format
lib/rules/index.mjs          the ordered check inventory
lib/rules/walk.mjs           shared site.json traversal helpers
lib/rules/layout.mjs         F01-F03, V12, C01, C02
lib/rules/structure.mjs      V01, V02, V03, V05, V08, V09, V09w, V13, V14, V19, V20, V26
lib/rules/links-frames.mjs   V11, V15, V17, V18, V22, V23, V24, V25, C03
lib/rules/assets-png.mjs     V04, V06, V10, V16, V21
lib/rules/brief.mjs          V07 (ten sub-checks), N13
selftest/render.mjs          page PNG / blank PNG / JPEG generation + exact-byte COM padding
selftest/build-fixture.mjs   builds the green package from the spec
selftest/mutations.mjs       the 36 red-path mutations
selftest/run.mjs             harness: green assertion + red table + exit code
```
