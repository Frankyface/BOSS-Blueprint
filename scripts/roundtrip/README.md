# BOSS Blueprint — round-trip PACKAGE GATE

Standalone Node validator for a Blueprint export package. This is the script Stage 3's
Definition of Done invokes:

```
node scripts/roundtrip/gate.mjs --package <downloaded.zip> --no-manifest
```

It implements **`docs/roundtrip-protocol.md` §2 steps 1–3** and replays every
machine-checkable rule of **`docs/export-format.md` v2.4 (FROZEN) §5 (V1–V27)** against a real zip.

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
steps   : protocol §2.1 layout · §2.2 ajv · §2.3 validator replay V1-V27 · §2.4 skipped (--no-manifest)

PASS  F01   zip filename matches blueprint_<business-slug>_<uuid8>.zip  — blueprint_bluebird-bakery_3f2a9c1e.zip
…
PASS  V06   every page PNG decodes, is exactly 1200 × page.height, and is non-blank  — pages/01-home.png 1200x1600 var=2402.7; pages/02-contact.png 1200x1600 var=1894.8
PASS  V07   brief.md cross-checks against site.json (markers, inventory, ids, quotes)  — 1 WRITE THIS COPY, 1 SOURCE AN IMAGE, 13 block bullets
WARN  V22   no pen cluster is too small or too sparse to read  — 2 cluster(s)
        ! page pg_0001: imageSketch cluster of 1 stroke(s) likely illegible (6 points < 12)
SKIP  M04   expected-manifest diff skipped by --no-manifest (protocol §2 step 4, Stage 4 work)

GATE PASSED — 36 pass, 1 warn, 0 fail, 1 skip (38 checks)
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

## 2. Check inventory — 38 checks

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
| `V07` | BLOCK | brief cross-checks — 11 sub-checks, see below | §5 V7 / §3.3 |
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
| `V22` | WARN | no **annotation** cluster too small/sparse to read — §4.5/[N7] union-find with 40px-expanded bboxes, **inclusive** intersection; bbox < 40×20 or < 12 points. `imageSketch` clusters exempt (v2.4) | §5 V22 (v2.4) / [N7] |
| `V23` | WARN | no **non-section** block still carries `fromTemplate: true` (v2.4 scope) | §5 V23 / §2.6 |
| `V23f` | FIX | fixed-state invariant: no `section` ships carrying `fromTemplate` — V23's FIX branch strips it | §5 V23 (FIX) / §2.6 |
| `V24` | BLOCK | identity remap total: every page/block/nav/stroke id equals its **§4.8 ordinal for its document position**; optional exact internal-id leak scan | §5 V24 / §4.8 |
| `V25` | WARN | no block with `frame.x + frame.w > 1200` | §5 V25 (v2.1) |
| `V26` | BLOCK | no blank `button.label`, no `navBar` with zero items, no blank nav-item label | §5 V26 (v2.1) |
| `V27` | WARN | `site.json` key order equals the normative §7.1 order everywhere — canon **derived from §7.1**, not hardcoded | §5 V27 / §2.1 (v2.4) |
| `N13` | BLOCK | the right-overflow marker appears on **exactly** the overflowing blocks' walkthrough bullets (count + per-block frame-tuple match) | §4.4 [N13] |
| `C03` | CONV | every `page.slug` == §4.1 `slugify(page.name)` incl. reserved-name and `-2`/`-3` uniqueness passes | §4.1 |
| `C04` | CONV | pen targets obey §4.5: an `annotation` never targets a `section`; an `imageSketch` targets an `imageSlot` | §4.5 (v2.4) |

### Protocol §2 step 4

| id | class | check |
|---|---|---|
| `M04` | STEP/WARN | expected-manifest diff — **not implemented** (Stage 4). `SKIP` with `--no-manifest`, `WARN` without. |

### V7's eleven sub-checks

1. Provenance HTML comment carries `appVersion`, `submission.id`, `submittedAt`, `schemaVersion` (§3.2 / §6.7).
2. `WRITE THIS COPY` count == generate-block count, using the **v2.1 frame-tuple-anchored regex of §3.3 rule 2 verbatim** (`m` flag, one match per logical line).
3. `SOURCE AN IMAGE` count == empty-slot count, same anchoring.
4. Every walkthrough heading `### Page N — <name> (\`<slug>\`)` present, with rule-7 escaping applied to the name.
5. Site-inventory table: per row the page name, `` `slug` ``, `` `screenshot` `` + `(1200×height)`, and block count all match `site.json` exactly.
6. Inventory count line pluralizes per [N11] (v2.3): `1 page` / `N pages`.
7. Walkthrough block bullets (`- **Nav bar|Heading|Text|Button|Image slot**`) == non-`section` block count site-wide.
8. Copy-list header count **and [N8] pluralization** (`1 item` / `N items`) and numbered-item count == generate-block count.
9. Assets section: one entry per manifest asset, each printing `W×H` and `~<round(bytes/1024)> KB` per [N11].
10. Every id printed in the brief (`pg_`/`blk_`/`nav_`/`stk_`/`img_`) exists in `site.json` (§3.3 rule 5).
11. Every `«…»` quote matches a `site.json` string field **or a §4.4 reference text** in a **defined derived form**: after reversing **v2.4** rule-7 escapes and mapping `↵`→newline, either verbatim or (when it ends `…`) a prefix; whitespace-normalized. The two boilerplate placeholders (`«…»`, `«X»`) are exempt.

Sub-check 11 needs two v2.3/v2.4 subtleties to avoid false failures, both implemented:

- **Escape reversal (rule 7, v2.4).** `\` is escaped *first*, so every backslash in an
  emitted client string introduces an escape and the exact inverse is a single
  left-to-right "drop the backslash, take the next character literally" pass. That covers
  the anywhere-escaped set (`\ « » | * " ` + backtick), the leading `#`/`-`/`>` prefixes,
  and the ordered-list form `1\.` (v2.3 — a backslash before a *digit* escapes nothing in
  CommonMark, so the period carries the escape) without needing to know which rule
  produced a given pair.
- **Reference text (§4.4, v2.3).** [N5]/[N7]/[N8] do not always print a bare field: a
  `generate` block is referenced by its `generateDescription` (never its residual `text`),
  and a `navBar` is referenced by its item labels joined `", "` — a composite that exists
  nowhere in `site.json` as a single value. Both forms are added to the comparison set.

The Definition-of-done boilerplate is uncountable by construction (no bullet/type/tuple
prefix, no `**` around the marker), which is exactly why the raw-substring count is never used.

---

## 3. Self-test

```
node selftest/run.mjs [--spec <docs/export-format.md>] [--keep]
```

**The fixture is built from the spec, not hand-authored.** `site.json` is §7.1 **byte-for-byte**
(v2.4 regenerated it with the canonical serializer, and the builder asserts Appendix A
**equality test D** — `serialize(parse(§7.1)) === §7.1` — before writing the zip, so a future
hand-edit of §7.1 fails the build rather than silently weakening the fixture),
`brief.md` is §7.2 verbatim, the page PNGs are generated programmatically at exactly
`1200 × page.height` with block frames and pen strokes painted, and `assets/img_001.jpg` is a
real JPEG encoded at 1600×1200 and padded with legal COM segments to **exactly 214 733 bytes**
so §7.1's manifest holds byte-for-byte and V21 compares real bytes.

### Green run

```
=== GREEN PATH ===
OK   synthetic §7.1/§7.2 package: exit 0, 36 pass / 1 warn / 0 fail / 1 skip
     warns: V22
```

The single WARN is **predicted by the spec itself**: §7 says "the stroke arrays are abridged
for readability — a real export carries dense point lists, and **V22 would WARN on marks this
sparse**". The gate agreeing with that sentence is evidence V22 is implemented correctly, not
a fixture defect.

Under v2.4 that WARN now cites **one** cluster, not two: `stk_0001` is an `imageSketch` and
is exempt, `stk_0002` is the annotation. The gate reports
`1 annotation cluster(s), 1 imageSketch cluster(s) exempt` — the scope change is visible in
the green run itself.

### Red-path proof table — 45/45 mutations caught by the right check

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
| 37 | `key-order-swapped` | a block serialized `type` before `id` | V27 **WARN** | **0** | yes | — |
| 38 | `key-order-frame-swapped` | a frame serialized `{y, x, w, h}` | V27 **WARN** | **0** | yes | — |
| 39 | `section-from-template` | a `section` ships carrying `fromTemplate` | V23f FAIL | 1 | yes | — |
| 40 | `annotation-targets-section` | an annotation stroke targets the band behind it | C04 **WARN** | **0** | yes | — |
| 41 | `imagesketch-tiny-exempt` | imageSketch stroke shrunk to 4×4 — V22 must stay silent | V22 **PASS** | **0** | yes | — |
| 42 | `escaping-v24-roundtrip` | adversarial text quoted with correct v2.4 escaping | V07 **PASS** | **0** | yes | — |
| 43 | `escaping-v22-legacy` | the same text quoted with superseded v2.2 escaping | V07 FAIL | 1 | yes | — |
| 44 | `inventory-page-plural` | inventory reads "2 page" instead of "2 pages" | V07 FAIL | 1 | yes | — |
| 45 | `navbar-reference-text` | brief quotes a navBar reference text matching no nav | V07 FAIL | 1 | yes | — |

```
SELF-TEST PASSED — green package clean, 45/45 mutations caught by the right check
```

Rows 33–36 and 37–38, 40 are the WARN-class proof: the gate names the condition **and still
exits 0**, which is §5's "package ships; the condition is noted" contract.

Rows 41 and 42 use the **`PASS` expectation** — a negative test asserting a named check stays
*silent*. Those are what prove an exemption really exempts rather than merely that some rule
fires somewhere.

Notable isolation properties this table demonstrates:

- **21 (`blank-button-label`)** and **13 (`id-not-ordinal`)** are *schema-valid* mutations —
  they prove V26 and V24 catch things ajv structurally cannot.
- **5 vs 4** prove V4's bijection is checked in **both** directions.
- **12 (`malformed-timestamp`)** proves `ajv-formats` is actually wired (without it,
  `format: "date-time"` is a silent no-op).
- **32** proves V25's WARN and N13's BLOCK are independent and both fire.
- **37/38 (`key-order-*`)** are byte-valid, schema-valid, *and* canonically-formatted — only
  the key ORDER moves. They prove V27 is independent of C02's pretty-print round-trip, which
  by construction cannot see order.
- **41 (`imagesketch-tiny-exempt`)** shrinks the imageSketch stroke to a 4×4 box: under v2.2
  rules V22 would have warned, under v2.4 it must not. This is the regression guard for the
  scope change.
- **42 vs 43 (`escaping-*`)** are the escaping pair: identical adversarial client text
  (`1. He said "back\slash" | *bold* \`code\` «quoted»`), quoted once with v2.4 escaping
  (V7 stays silent) and once with the superseded v2.2 escaping (V7 fails). Together they
  pin the escape map's invertibility in both directions.

Runtime: ~2.5 minutes for 46 gate invocations (each spawns a fresh Node process and fully
decodes two 1200×1600 PNGs).

### Other verified behaviours (outside the mutation table)

| scenario | result |
|---|---|
| no `--package` / unreadable zip / `--help` | exit 2 / exit 2 / exit 0 |
| run **without** `--no-manifest` | `M04` becomes a WARN, gate still exits 0 |
| `--schema <file>` instead of spec extraction | identical verdict, except `V27` reports SKIP when the spec is unreadable (no §7.1 canon) |
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
   brief *against* `site.json` (V7's eleven sub-checks); it does not regenerate it. Appendix A
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
8. **V22 has no OCR.** It replays §4.5's clustering (union-find, 40px-expanded bboxes,
   **inclusive** intersection per [N7] v2.3) and the spec's size/density thresholds;
   "legible" in the human sense is Cam eyeballing the PNG.
9. **V3's FIX/BLOCK split is flattened to FAIL.** A *shipped* package must already be in the
   fixed state, so an unsorted `blocks[]` in a delivered zip is a defect either way. Same for
   V11, V17, V20 — reported as class `FIX`, status `FAIL`.
10. **V27's canon comes from §7.1, so it can only pin shapes §7.1 contains.** §7.1 exercises
    all six block types, all three link kinds and every optional-bearing node, so coverage is
    complete today — with one documented splice: `fromTemplate`'s position (after `frame`) is
    taken from the §2.6 table, because §2.1 itself says "§7.1 has no flagged block to pin it".
    Keys the canon does not mention are skipped rather than judged: §6 requires consumers to
    tolerate unknown fields, and an unknown field has no normative position to violate.
11. **V23f, C03 and C04 have no V-number.** They are invariants the frozen text states
    (§2.6's scope rule, §4.1's slug derivation, §4.5's section exclusion) but that §5 does not
    number, so a violation cannot be reported as a spec rule. C03/C04 are CONV (WARN); V23f is
    the FIX branch V23's own row describes and is reported as FAIL.
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
lib/brief-parse.mjs          §3.3 rule-2 marker regexes, sections, v2.4 escaping, [N11] number format
lib/key-order.mjs            V27: canonical key order DERIVED from §7.1 (§2.1 canon)
lib/rules/index.mjs          the ordered check inventory
lib/rules/walk.mjs           shared site.json traversal helpers
lib/rules/layout.mjs         F01-F03, V12, C01, C02
lib/rules/structure.mjs      V01, V02, V03, V05, V08, V09, V09w, V13, V14, V19, V20, V26, V27
lib/rules/links-frames.mjs   V11, V15, V17, V18, V22, V23, V23f, V24, V25, C03, C04
lib/rules/assets-png.mjs     V04, V06, V10, V16, V21
lib/rules/brief.mjs          V07 (eleven sub-checks incl. §4.4 reference text), N13
selftest/render.mjs          page PNG / blank PNG / JPEG generation + exact-byte COM padding
selftest/build-fixture.mjs   builds the green package from the spec (+ Appendix A test D)
selftest/mutations.mjs       the 45 red-path mutations
selftest/run.mjs             harness: green assertion + red table + exit code
```

---

## 7. v2.4 sync notes (what changed since the v2.2 build)

Each item was re-verified against the frozen text rather than taken on trust.

| # | delta | spec | what changed here |
|---|---|---|---|
| 1 | rule-7 escaping grew `\` and `"`; ordered-list marker escapes the **period** (`1\.`, not `\1.`); `*` escaped anywhere | §3.3 r7 (v2.3) | `escapeClientText` added; `unescapeClientText` rewritten as the exact single-pass inverse (valid *because* `\` is escaped first) |
| 2 | [N7] cluster intersection is **inclusive** — touching edges join | [N7] (v2.3) | `boxesIntersectInclusive` added; clustering switched to it, strict variant kept for frame overlap |
| 3 | V22 evaluates **annotation** clusters only | §5 V22 (v2.4) | imageSketch clusters skipped and counted as exempt; green run now cites 1 cluster, not 2 |
| 4 | V27 (WARN) — canonical key order | §5 V27 / §2.1 (v2.4) | **new check**, canon derived from §7.1 (`lib/key-order.mjs`) |
| 5 | annotation targets exclude `section`; `fromTemplate` key position blessed | §4.5, §2.6 (v2.4) | **new C04**; `fromTemplate` spliced after `frame` in the V27 canon |
| 6 | reference-text fallback for [N5]/[N7]/[N8] | §4.4 (v2.3) | V7's quote comparison set gained generate-block descriptions and navBar label composites |

Deltas found here that were **not** on the hand-off list:

- **V25 and V26 are not new.** Both landed in v2.1 and were already implemented and
  red-path tested in the original build; the frozen §5 rows still read "Additive rule
  (v2.1)" and "reclassified (v2.1)". Only **V27** is genuinely new. Nothing was added
  twice — the existing V25/V26 checks were re-verified against the frozen text instead.
- **V23 was re-scoped** (v2.3/v2.4): it counts **non-section** blocks only, and its FIX
  branch strips the flag off any `section` that carries it. Split into `V23` (WARN) +
  `V23f` (FIX).
- **[N11] gained inventory pluralization** (`1 page` / `N pages`, v2.3) — added as a V7
  sub-check.
- **§2.1 now makes the serialized FORM canonical** (`JSON.stringify(data, null, 2)` + LF)
  and §7.1 was regenerated to match, so the fixture ships §7.1 byte-for-byte and asserts
  Appendix A **test D** at build time. Two prior README limitations (unverifiable key
  order; display-formatted §7.1) are retired by this.
- **Extractor CRLF bug (portability, found during the sync).** The spec is committed with
  LF, but this repo has `core.autocrlf=true` and no `.gitattributes`, so a Windows checkout
  delivers CRLF. The extractor split on a bare LF and kept the trailing CR, pushing CR into the
  extracted schema, §7.1 and §7.2 — meaning the gate's verdict depended on the developer's
  git config. All three extractors now normalize EOL on read. Worth a `.gitattributes`
  entry in the repo proper, which is outside this branch's scope.

