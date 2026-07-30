# Feature: `page.penRegions` in the Contract, and V28–V31 (F4)
_Stage: stage-5-ink-is-design · Status: verified done_

## Goal
Publish the inference (feature-ink-inference.md) into the **export contract**: `site.json` gains an
optional `page.penRegions`, the region and set ids join the minted-id family, and four new
validators police the result on both sides of the fence — the app's TypeScript rules and the
round-trip harness's `.mjs` twins.

This is the amendment's load-bearing half. Without it the classifier is a pretty overlay; with it,
a drawn card is a thing the builder is contractually told about.

## Contract shape (`docs/export-format.md` v2.5)
- `page.penRegions` — **optional**; each region carries `id`, `kind`, `variant`, `bbox`,
  `strokeIds`, confidence, alignment, optional `setId`/`setIndex`, optional text metrics
- `bbox` has its **own definition with `minimum: 0`** — deliberately NOT `$ref: frame`, because
  `frame` sets `exclusiveMinimum: 0` and a mouse-drawn horizontal rule has bbox height exactly `0`
- Region and set ids are minted as `reg_` / `set_` + zero-padded digits (`src/export/ids.ts`), and
  they join **V7's printed-id family in the same edit that publishes them** — adding them later
  would have shipped one release where the brief could cite a region that does not exist and
  nothing would notice
- **Zero new files in the zip.** The vectors are already in `penStrokes[].points`

## The four validators
| Rule | Class | What it says |
|---|---|---|
| **V28** | BLOCK · bug | `penRegions` integrity, page by page: ids, stroke references, and a **derived** nesting-depth limit (`src/export/validate/rules/inkRegions.ts`) |
| **V29** | WARN | drawn words the builder would be asked to read **below readable size**, measured against the long edge a page PNG is resampled to before a vision model reads it (`warnings.ts`) |
| **V30** | BLOCK · bug | exactly **one `**BUILD THIS FROM INK**` marker per TOP-LEVEL region**; a missing `brief.md` is itself the finding (`briefCrossCheck.ts`) |
| **V31** | WARN · client | space the client asked for that the 8000 height cap actually truncated (`warnings.ts`) |

**V22 was also amended:** it now clusters over **UNCLAIMED** strokes, so the gate no longer warns
about ink the brief already narrates.

## Success Criteria
- [x] `page.penRegions` serializes, round-trips, and is in `src/export/schema/site.v1.schema.json`
      with its own `bbox` definition
- [x] Region/set ids are minted in the normative shape and are recognised by V7's printed-id check
- [x] V28–V31 implemented in `src/export/validate/**` and registered in `validate/index.ts` and
      `validate/types.ts`
- [x] **Harness twins** exist and agree: `scripts/roundtrip/lib/rules/ink.mjs` with
      `scripts/roundtrip/rules-ink.test.mjs`, plus `lib/rules/walk.mjs` and `lib/key-order.mjs`
      taught the new field
- [x] V22 clusters over unclaimed strokes only
- [x] `npm run schema:check` clean and §7.1 of `docs/export-format.md` **byte-identical**
- [x] **`penRegions` observed in a real exported package** — `e2e/pen-only-site.spec.ts` opens the
      downloaded zip and asserts `home.penRegions` is defined, non-empty, contains a `panel`, and
      that **every** region's `strokeIds` exist in the package's own shipped `penStrokes`
- [x] **V28–V31 exercised by the round-trip gate on a package that actually contains regions** —
      the same spec runs `scripts/roundtrip/gate.mjs --package <zip> --no-manifest` on that package
      and requires exit **0** with `GATE PASSED`
- [x] `panel` always carries `variant: "card"` or `variant: "mediaBox"`, and V28 BLOCKs the
      contradiction (`docs/decisions.md` 2026-07-30) — a defect found by three zero-context builders
- [x] `penStroke.role` / `targetBlockId` normatively scoped to ink no `penRegion` claims, pinned in
      the schema `description` and byte-checked by `schema:check` (same entry)

## How We'll Verify
1. Unit: each rule over passing and failing fixtures, TS side and `.mjs` twin, including V31's
   boundary (a page landing exactly on the cap with every requested pixel applied must **not**
   warn).
2. Schema: `npm run schema:check`, plus Appendix A tests B and D for the §7.1/§7.2 diff.
3. `npm run roundtrip:gate:selftest` — the mutation suite that proves the rules can fail.
4. **A real exported package containing `penRegions`, put through the external package gate.**
5. Record below.

## Verification Log

### 2026-07-30 — a real package now carries regions, and the gate passes it (verified done)

Both blockers named on 2026-07-29 are closed, by a route the earlier entry did not consider: not
the round-trip harness, but a Playwright journey that drives the real submit button and then hands
the produced zip to the same `gate.mjs` a zero-context session would face.

| Evidence | Result |
|---|---|
| Commit | **`c82d917`** on `main`, 143 files, +17185/−306, 2026-07-30 10:32:12 −0400 |
| CI run **30556114726** (push of `c82d917`, ubuntu) | unit **116 files · 2241 passed · 0 failed**; lint, build, `schema:check` (Appendix A test A) and `roundtrip:gate:selftest` all green; E2E **726 passed / 2 failed / 1 flaky** of 732, the two failures being `pen-reading.spec.ts:172` only |
| `npx playwright test e2e/pen-only-site.spec.ts --list` | **6 tests** (2 × chromium/firefox/webkit), run this session |

**What the package proves, precisely.** In `e2e/pen-only-site.spec.ts` the assertions are derived
from the shipped bytes, never from a list written in the test:

- `home.penRegions` is **defined and non-empty** on a page with `blocks: []`, and the hand-drawn
  box arrives as `kind: 'panel'` — §2.5 is exercised by a real export for the first time;
- for every region, `strokeIds.length > 0` and each id is present in the package's own
  `penStrokes` — the premise §3.3 rule 5 rests on, checked rather than assumed;
- the `**BUILD THIS FROM INK**` count in `brief.md` is compared against the **top-level regions the
  package's own `site.json` carries** (`parentRegionId === null`), so **V30's invariant is verified
  against live data** and the test cannot pass by agreeing with a classifier that changed its mind;
- `runPackageGate` (`e2e/support/submit.ts:32,59`) executes
  `node scripts/roundtrip/gate.mjs --package <zip> --no-manifest` from the repo root and requires
  exit 0 — so the **`.mjs` twins, including `lib/rules/ink.mjs`, ran over a package containing
  regions**, which is what §4 of How We'll Verify asked for.

**Two contract defects were found and fixed after the 2026-07-29 entry**, by handing a real
exported package to three independent zero-context Claude sessions (`docs/decisions.md`,
2026-07-30, "v2.5 follow-up"): every stroke was shipping `role: "annotation"` even when a region
claimed it — a builder obeying precedence literally would have shipped a blank page — and three
byte-identical `panel/card` regions were described as an `<img>` placeholder by the brief. Both are
now normative, and V28 gained a contradiction clause. §7.1 stayed **byte-identical** through it.

**Standing limits, unchanged and NOT blockers on this feature:**

1. **The round-trip harness still cannot express an untargeted pen mark** (`scenario.schema.json`'s
   `penCluster` requires a `target`; `report.mjs` nulls S6 under `--smoke`). A green smoke proves
   the package is buildable, nothing about pen content. `docs/decisions.md` 2026-07-29.
2. **`roundtrip:smoke` has NOT been run against `c82d917`.** The only run root with a `verdict.txt`
   (`SMOKE-PASS 47`) is `2026-07-30T01-12-34-144Z_B_70454b9`, whose manifest records sha `70454b9`
   plus 129 dirty files and does not contain `e2e/pen-only-site.spec.ts`. A later attempt
   (`2026-07-30T13-37-41-943Z_B_70454b9`) aborted on `"OAuth session expired and could not be
   refreshed"` before building anything.
3. **Nothing yet asserts the two rule registries have the same membership** — Open Question 3 below
   is still open.

### 2026-07-29 — built and unit-verified; NO package has ever carried a region (SUPERSEDED by the entry above; kept as history)

| Check | Result |
|---|---|
| `npm test` | 119 files · **2228 passed** · 2 skipped · 0 failed |
| `npm run lint` · `npm run build` · `npm run schema:check` | all clean |
| `npm run roundtrip:gate:selftest` | **PASSED — 45/45 mutations caught** |
| `npm run e2e` (3 engines) | **720 passed** |
| `npm run roundtrip:smoke` | **SMOKE-PASS 47**, 4m04s, run root `C:/Users/Public/boss-blueprint/roundtrip-runs/2026-07-30T01-12-34-144Z_B_70454b9` |
| `docs/export-format.md` §7.1 | **byte-identical** — §7.2 moves only where the amended boilerplate is quoted into it. Proved by **Appendix A tests B and D**, not by eye |

**Files:** `src/export/penRegions.ts` (+ `penRegions.test.ts`), `src/export/penRoles.ts`,
`src/export/ids.ts`, `src/export/types.ts`, `src/export/serialize.ts`, `src/export/siteJson.ts`,
`src/export/schema/site.v1.schema.json`, `src/export/validate/rules/inkRegions.ts`,
`.../warnings.ts`, `.../briefCrossCheck.ts`, `.../bugBlocks.ts`, `src/export/validate/index.ts`,
`src/export/validate/types.ts` (the finding-id union now carries `'V28' | 'V29' | 'V30' | 'V31'`),
and the twins `scripts/roundtrip/lib/rules/ink.mjs`, `lib/rules/walk.mjs`, `lib/key-order.mjs`
with `rules-ink.test.mjs` and `rules-brief.test.mjs`.

**WHY THIS IS NOT `verified done`:**

1. **No exported package has ever contained a `penRegions` entry.** The smoke run's package
   carried **zero** — scenario B's pen marks are all block-targeted, so the block-overlap veto
   correctly kept every one of them an annotation. Everything asserted about V28–V31 is asserted
   against unit fixtures and the gate self-test's synthetic mutations, never against a package a
   real client-shaped journey produced.
2. **The harness cannot produce such a package.** `scenarios/scenario.schema.json`'s `penCluster`
   requires `["ref","role","target","color","width","strokes"]` with
   `additionalProperties: false` — the scenario language **literally cannot describe an untargeted
   pen mark**, which is the only kind that becomes a region. `report.mjs` additionally nulls S6
   under `--smoke`. Recorded in `docs/decisions.md`, 2026-07-29 ("Round-trip harness cannot yet
   express the pen"), with the explicit instruction not to claim smoke as evidence for the pen
   work.
3. What the green smoke **does** prove: the package is still buildable by a zero-context session,
   and the new code ran — the built `brief.md` contained the new precedence line. That is the
   check's real job and it is why it was still run. It is not evidence for this feature.

**To reach `verified done`:** teach the scenario schema an untargeted pen mark and stop nulling S6
under `--smoke` (`handoff.md` → Next Up 2), then run a scenario whose package carries regions and
record the gate output here. Short of that, a hand-built package plus `node
scripts/roundtrip/gate.mjs --package <zip> --no-manifest` on a design containing regions would be
weaker but real evidence — and is worth doing before v1.1 deploys.
**→ DONE, by the second route and better than "hand-built":** `e2e/pen-only-site.spec.ts` produces
the package through the real UI and runs that exact gate command on it. See the 2026-07-30 entry.
The harness fix remains worth doing — it is the regression detector for scenarios this spec does
not draw — but it is no longer what stands between this feature and `verified done`.

## Open Questions
1. **Should V29's readable-size floor be a BLOCK?** It is a WARN. **Recommendation:** keep it a
   WARN — the builder is told to re-render small handwriting at 4× from the same points, so
   illegibility at 1× is a heads-up, not a defect.
2. **V28's depth limit is derived rather than chosen** (`inkRegions.ts`). **Recommendation:** leave
   it derived; a hand-picked constant here would drift from the two-level collapse in
   `src/canvas/ink/`.
3. **Does anything guard against the twins drifting apart?** `npm test` runs both, which catches a
   one-sided *edit*. It does not catch a rule added on one side only. **Recommendation:** a
   registry-count assertion across the two rule indexes; cheap, and it closes the last gap in the
   twin discipline.

## Notes & Decisions
- **The ids join V7 in the same edit that publishes them.** Stated in `briefCrossCheck.ts`'s own
  comment and worth repeating: a printed id the brief may cite must exist in `site.json` from the
  first release that can print it.
- **`bbox` is not `frame`.** Zero-height is real (a ruled line), and `frame`'s `exclusiveMinimum: 0`
  would have made a legitimate region unrepresentable.
- **V31 is client-facing on purpose.** It is the client's own action being reported back to them;
  a bug-class finding would have hidden it from the person who caused it.
- **Rejected, per `docs/decisions.md`:** widening `penStroke.role`'s closed enum (silently breaks
  the harness scenario language, V22, and the manifest diff); shipping crop PNGs or traced SVG
  files (`asset.path` is pattern-locked, V12 BLOCKs extras in two implementations, and a
  zip-layout change is a `schemaVersion: 2` bump); storing a client override of an inferred role.
