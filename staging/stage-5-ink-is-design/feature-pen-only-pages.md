# Feature: Pen-Only Pages Are Submittable and Renderable (F0)
_Stage: stage-5-ink-is-design · Status: verified done_

## Goal
A client who draws their whole site with the pen must be able to **submit it**, and the page PNG
must be allowed to come back as ink on white without the renderer calling it a blank capture.

This is the stage's headline fix and it was a **product-defeating** defect, not a polish item:
`v09EmptySite` (`src/export/validate/rules/clientBlocks.ts`) BLOCKed unless the homepage carried a
non-`section` **block**, so "build a site from the pen alone" — the thing the tool advertises —
was unreachable in shipped code. Alongside it, `v09NearEmptyPage` WARNed on ink-only pages, and
`renderPagePng.ts` skipped the blank-capture check on exactly those pages, so the one class of
page most likely to render empty was the one class nothing was checking.

## Success Criteria
- [x] `v09EmptySite` no longer BLOCKs a site whose homepage carries only ink; V9's BLOCK **and**
      WARN sets both shrank
- [x] `v09NearEmptyPage` no longer WARNs merely because a page is ink-only
- [x] The same relaxation exists in the harness twin (`scripts/roundtrip/lib/rules/structure.mjs`)
      — a one-sided edit fails `npm test`
- [x] V6's ink floor is **height-scaled**: an absolute pixel expectation scaled by
      `1600 / page.height`, not a whole-page ratio, so a long page is not judged against a floor
      that grows with the sheet
- [x] The floor is **expectation-gated**: on a pen-only page it engages only when the strokes
      predict `INK_EXPECTATION_SAFETY_FACTOR` (**4×**) the floor in countable ink
      (`src/export/png/inkExpectation.ts`, `src/export/png/constants.ts:129`)
- [x] A page holding one small mark is therefore **never judged** — a *correct* render of it could
      not clear the floor either, so failing it would be a false alarm by construction
- [x] **A pen-only site submits end-to-end through the real UI** — `e2e/pen-only-site.spec.ts`,
      6 tests (2 × chromium/firefox/webkit), green on the Linux CI runner at `c82d917`
- [x] **A pen-only page's PNG is observed in a real exported package** — the same journey opens the
      downloaded zip, checks the PNG's IHDR against `page.height`, and probes measurably real ink

## How We'll Verify
1. Unit: the V9 rules over an ink-only homepage fixture, both the TS rule and the `.mjs` twin;
   `inkExpectation.ts`'s two exported functions (`expectedInkAreaPx`, `expectsVisibleInk`) at and
   either side of the 4× gate, and at more than one `pageHeight` so the scaling is pinned.
2. Unit: `renderPagePng` runs the blank-capture check on an ink-only page rather than skipping it.
3. **E2E — `e2e/pen-only-site.spec.ts`:** draw a page with the pen only, submit, assert the zip
   downloads and `node scripts/roundtrip/gate.mjs --package <zip> --no-manifest` exits 0.
4. Round-trip: **cannot help here** — see the standing limit below.

## Verification Log

### 2026-07-30 — the missing end-to-end leg now exists, is committed, and is green in CI (verified done)

**The blocker named in the 2026-07-29 entry is closed.** `e2e/pen-only-site.spec.ts` exists, is
committed, and drives the real submit button on a design with **zero blocks**.

| Evidence | Result |
|---|---|
| Commit | **`c82d917`** on `main` — "feat: ink is design — pen marks become buildable site content (export v2.5)", 143 files, +17185/−306, committed 2026-07-30 10:32:12 −0400. The spec is in it (`git cat-file -e c82d917:e2e/pen-only-site.spec.ts`) |
| `npx playwright test e2e/pen-only-site.spec.ts --list` | **6 tests in 1 file** — 2 tests × chromium, firefox, webkit (run this session) |
| CI run **30556114726** (push of `c82d917`, ubuntu) — unit | **116 test files · 2241 tests passed · 0 failed** |
| CI run 30556114726 — lint · build · `schema:check` (Appendix A test A) · `roundtrip:gate:selftest` | all **green** |
| CI run 30556114726 — E2E | **732 tests run · 726 passed · 2 failed · 1 flaky.** Both failures are `pen-reading.spec.ts:172` (see feature-ink-reading-overlay.md); the pen-only journey is **not** among them, so its 6 tests passed on ubuntu across all three engines |

**What the journey actually asserts** (read from the spec this session, not summarised from a
commit message). It draws a word, a hand-drawn card with two lines of copy in it, and a bold rule
— eight pen-downs, no blocks — then submits and reads the shipped bytes:

- it reaches `submit-complete` and a real download **at all** — which is the V9 regression guard,
  because before this release the journey ended on the BLOCK screen;
- `site.json`'s home page carries `blocks: []` and the full stroke count;
- the page PNG's IHDR equals `{ width: PAGE_WIDTH, height: home.height }`, and a three-row column
  sampled at the drawn rule reads **luma < 200** on the ink with **> 240** on clear paper beside
  it — the blank-capture question answered against the shipped image, not a fixture;
- `runPackageGate(zip)` runs `node scripts/roundtrip/gate.mjs --package <zip> --no-manifest` from
  the repo root (`e2e/support/submit.ts:32,59`) and must exit **0** with `GATE PASSED`.

The second test carries `extraBottomPx` through the same journey: two presses of **Add space**, a
mark drawn *below where the page used to end*, and both the room and the mark asserted in the
package and in the PNG.

**CLAUDE.md's three-part bar is now met for this feature:** (1) runs without errors, (2) unit
tests pass, (3) **behaviour exercised end-to-end via Playwright** — the part that was missing.

**Standing limits — true, and NOT blockers on this feature:**

1. **The round-trip harness still cannot express an untargeted pen mark.** `scenario.schema.json`'s
   `penCluster` requires a `target`. A green `roundtrip:smoke` therefore still proves only that the
   package is buildable. Recorded in `docs/decisions.md` 2026-07-29. What has changed is that the
   pen no longer has *no* automatic package-level detector: this spec is one, and it runs on every
   push.
2. **`roundtrip:smoke` has NOT been run against `c82d917`.** VERIFIED: the only run root carrying a
   `verdict.txt` (`SMOKE-PASS 47`) is `2026-07-30T01-12-34-144Z_B_70454b9`, whose `run-manifest.json`
   records sha `70454b9` with 129 dirty files and **does not list `e2e/pen-only-site.spec.ts`** — an
   earlier tree. Two later attempts left no verdict; `2026-07-30T13-37-41-943Z_B_70454b9`'s
   transcript ends `"Failed to authenticate: OAuth session expired and could not be refreshed"`.
3. **Transcription is unproven.** A drawn *box* becomes a styled card; whether handwritten *words*
   come out verbatim has never been tested — the fixtures carry no letterforms. Stage-wide limit,
   see `overview.md`.

### 2026-07-29 — built and unit-verified; the end-to-end leg does NOT exist (SUPERSEDED by the 2026-07-30 entry above; kept as history)

**What can be claimed.** The rules changed, the twins changed with them, and the whole suite is
green:

| Check | Result |
|---|---|
| `npm test` | 119 files · **2228 passed** · 2 skipped · 0 failed |
| `npm run lint` · `npm run build` · `npm run schema:check` | all clean |
| `npm run roundtrip:gate:selftest` | PASSED, **45/45** mutations caught |
| `npm run e2e` (chromium + firefox + webkit) | **720 passed** |
| `npm run roundtrip:smoke` | **SMOKE-PASS 47**, 4m04s |

Files carrying the change: `src/export/validate/rules/clientBlocks.ts` (`v09EmptySite` at line 79,
registered at 206), `src/export/validate/rules/warnings.ts`, `src/export/png/renderPagePng.ts`,
`src/export/png/inkExpectation.ts` (+ its test), `src/export/png/constants.ts`
(`INK_EXPECTATION_SAFETY_FACTOR = 4`), and the harness twin
`scripts/roundtrip/lib/rules/structure.mjs` with `scripts/roundtrip/rules-structure.test.mjs`.
Unit coverage lives in `src/export/png/inkExpectation.test.ts`,
`src/export/validate/rules/rules.test.ts`, `src/export/validate/rules/inkRules.test.ts` and
`src/test/inkFixtures.ts`.

**WHAT CANNOT BE CLAIMED — and this is the reason the status is not `verified done`:**

1. **No Playwright journey submits a pen-only site.** VERIFIED by search, not assumed:
   `e2e/submit.spec.ts` is **unmodified** in this change set, and nothing under `e2e/` matches
   `pen-only`, `penOnly`, `ink-only` or `inkOnly`. CLAUDE.md's minimum bar is three-part —
   *(1) runs without errors, (2) unit tests pass, (3) behavior exercised end-to-end via
   Playwright* — and part (3) is missing for the exact behaviour this feature is named after.
   Everything above is bench evidence about rule functions; none of it drives the real submit
   button on a page drawn with the pen.
2. **The round-trip cannot stand in for it.** `scenario.schema.json`'s `penCluster` requires a
   `target`, so the harness cannot describe an untargeted mark; `report.mjs` nulls S6 under
   `--smoke`. Scenario B's pen marks are all block-targeted, so the smoke package contained
   **zero** `penRegions`. The green SMOKE-PASS proves the package is still buildable by a
   zero-context session — nothing more. (`docs/decisions.md`, 2026-07-29.)
3. **No exported package has ever contained a pen-only page's PNG.** The blank-capture path for
   ink-only pages is exercised in unit tests and by the local visual snapshots on win32 only.

**To reach `verified done`:** write the E2E in §3 of How We'll Verify — draw with the pen only,
submit, assert the download and a `gate.mjs --no-manifest` exit 0 — and record the run here. That
is a small spec and it does not need the harness rebuilt.
**→ DONE.** That is exactly `e2e/pen-only-site.spec.ts`; see the 2026-07-30 entry above.

## Open Questions
1. **Is 4× the right safety factor?** It is deliberately generous: the gate exists to avoid
   crying wolf on a sparse page, and both choices in `inkExpectation.ts` (the area estimate and
   the factor) push the same way — toward *not* judging. **Recommendation:** leave it until a real
   package shows a genuinely blank ink page slipping through; tightening it without that evidence
   trades a real false-alarm class for a hypothetical miss.
2. **Should V9 warn at all on a pen-only homepage?** Today it is silent. **Recommendation:** stay
   silent. A WARN that fires on the product's own advertised workflow trains clients to ignore
   warnings.

## Notes & Decisions
- **The floor is an absolute pixel expectation, not a ratio.** A ratio over the whole sheet meant
  a client who added space below their content (see feature-page-space.md) diluted their own ink
  until the page failed the floor — two features fighting each other. Scaling by
  `1600 / page.height` keeps the expectation about *how much ink there is*, not *how big the page
  got*.
- **Expectation-gating is what makes the relaxation safe.** Deleting the check outright would have
  removed the only guard against a genuinely blank render; gating it on predicted ink keeps the
  guard exactly where it can be right.
- **The twin edit is not optional.** `npm test` runs the `.mjs` rules alongside the TS ones, so a
  relaxation applied on one side only fails the unit suite immediately instead of surfacing as a
  gate failure twelve minutes into a round-trip run.
- The v2.5 rationale, including the rejected alternatives (widening `penStroke.role`'s closed
  enum; shipping crop PNGs or traced SVG files; a global 2× page render), is in
  `docs/decisions.md`, 2026-07-29 — do not re-litigate them here.
