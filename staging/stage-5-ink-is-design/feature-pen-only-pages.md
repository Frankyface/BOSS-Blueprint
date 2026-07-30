# Feature: Pen-Only Pages Are Submittable and Renderable (F0)
_Stage: stage-5-ink-is-design · Status: awaiting verification_

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
- [ ] **A pen-only site submits end-to-end through the real UI** — implemented, but no Playwright
      journey exercises it (see Verification Log)
- [ ] **A pen-only page's PNG is observed in a real exported package** — no such package exists

## How We'll Verify
1. Unit: the V9 rules over an ink-only homepage fixture, both the TS rule and the `.mjs` twin;
   `inkExpectation.ts`'s two exported functions (`expectedInkAreaPx`, `expectsVisibleInk`) at and
   either side of the 4× gate, and at more than one `pageHeight` so the scaling is pinned.
2. Unit: `renderPagePng` runs the blank-capture check on an ink-only page rather than skipping it.
3. **E2E (NOT YET WRITTEN):** draw a page with the pen only, submit, assert the zip downloads and
   `node scripts/roundtrip/gate.mjs --package <zip> --no-manifest` exits 0.
4. Round-trip: **cannot help here** — see the blocker below.

## Verification Log

### 2026-07-29 — built and unit-verified; the end-to-end leg does NOT exist (awaiting verification)

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
