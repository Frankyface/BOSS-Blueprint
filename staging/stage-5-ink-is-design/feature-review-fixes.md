# Feature: Adversarial Review Fixes (13 upheld findings)
_Stage: stage-5-ink-is-design · Status: awaiting verification_

## Goal
After the v1.1 implementation landed, an adversarial review was run against it. **13 findings were
upheld and then fixed.** This file is their record.

It exists as its own feature file because the fixes cut across every other file in this stage —
some are validator bugs, some are UI, some are classifier geometry — and because a fix without a
recorded finding is indistinguishable from a fix that was never made.

## The findings

**Traceable in the code, by their review labels:**

| Label | Finding | Where it was fixed | Test that pins it |
|---|---|---|---|
| **A** | **V7's printed-id regex BLOCKed valid packages** whose client filenames merely *looked* like ids — `set_menu.jpg`, `reg_flow.png` for a restaurant | `PRINTED_ID_RE` in `src/export/validate/rules/briefCrossCheck.ts` now matches the **minted** shape only (prefix + zero-padded digits), because letters after the underscore never occur in a real id | `scripts/roundtrip/rules-brief.test.mjs` → `V07 twin — an innocent client filename is not read as a printed id (Fix A)` |
| **B** | **The block-overlap veto missed zero-height stroke bboxes** — a mouse-drawn horizontal line across a block has bbox height exactly `0`, so it escaped the veto and became a region instead of an annotation | `boxesOverlapInclusive` in `src/canvas/ink/metrics.ts`, reached through `segment.ts` | `segment.test.ts` → `the veto reaches a ZERO-AREA stroke drawn across a block (Fix B)`; `classify.test.ts` → `the block-overlap veto reaches zero-area strokes end-to-end (Fix B)` |
| **C** | **`glyphHeight 0` promoted a flat dashed line to the page's `<h1>`** — a divider sorted to the top of the heading candidates | `src/canvas/ink/classify.ts` | `classify.test.ts` → `a flat dashed divider is never the page's heading or <h1> (Fix C)` |
| **F** | **Trim dropped keyboard focus.** A button that disables itself on the click that fires it is blurred by the browser, dumping focus to `<body>` | `src/components/PageSpaceControls.tsx` — after the render that disables the pressed button, focus is handed to its still-live sibling; a `role="status"` live region announces the result | `src/components/CanvasToolbar.test.tsx` → `keeps keyboard focus in the group when Add space greys itself out`, `hands focus to Add space when Trim greys itself out on the click that fires it` |
| **H** | **A 2×2 card grid set only 2 of 4.** The single-axis run can keep one row *or* one column, so the other cells lost their `setId` and were built as unrelated panels | `gridOrder` in `src/canvas/ink/regions.ts`, fired only for a true 2-D grid so every one-row/one-column case takes the unchanged path | `regions.test.ts` → `sets ALL FOUR cards of a 2×2 grid, numbered row-major (Fix H)`, `numbers a 2×3 grid row-major… (Fix H)`, `never drops a grid card even when the grid is too irregular to set (Fix H fallback)` |
| **I** | **The classifier ran twice per change.** `useInkReading` is consumed by both `PenLayer` and `PenControls`, each memoising per instance | `src/hooks/useInkReading.ts` — one classify per change across both consumers | `src/hooks/useInkReading.test.tsx` |

**Named in the handover but NOT label-traceable in the code:**

| Finding | Where it was fixed | Evidence |
|---|---|---|
| **V31 and the Add-space UI conflated *requested* with *applied* space** — a page landing exactly on the 8000 cap with every requested pixel applied still warned | `v31TruncatedPageSpace` in `src/export/validate/rules/warnings.ts` now compares `extraBottomPx` against `page.height - contentOnlyHeight(page)` and fires only when the client asked for more than landed | `e2e/page-space.spec.ts` → `greys "Add space" out at the height cap and reports only the space that fit`; rule-level unit coverage in `inkRules.test.ts` |
| **Ink-reading text failed AA contrast** | `src/components/InkReadingOverlay.css` — the label uses a token clearing the 4.5:1 floor instead of `--boss-select` (4.45:1) | **NONE beyond the CSS comment.** No contrast ratio was measured and nothing guards it — see below |

**NOT RECORDED ANYWHERE THIS FILE CAN READ: 5 findings.**

## Success Criteria
- [x] All 13 upheld findings fixed before the stage's evidence run
- [x] The full suite is green after the fixes (`npm test` 2228 passed, up from the 2208 recorded
      in `docs/decisions.md` when the amendment entry was written)
- [x] Each traceable fix carries a test that names the finding
- [ ] **Every one of the 13 findings is itemised with its own evidence** — 6 are, 2 more are
      identifiable by description, **5 are not recorded at all**
- [ ] **The contrast fix is measured, not asserted**

## How We'll Verify
1. The suite: lint, unit, build, schema, gate self-test, E2E, smoke — all after the fixes.
2. Per finding: a test whose name states the finding, so a regression says what broke rather than
   just failing.
3. Record below.

## Verification Log

### 2026-07-29 — fixes landed and the suite is green; the RECORD is incomplete (awaiting verification)

| Check | Result |
|---|---|
| `npm test` | 119 files · **2228 passed** · 2 skipped · 0 failed (baseline before v1.1: 101 files / 1811) |
| `npm run lint` · `npm run build` · `npm run schema:check` | all clean |
| `npm run roundtrip:gate:selftest` | **PASSED — 45/45** mutations caught |
| `npm run e2e` (chromium + firefox + webkit) | **720 passed**, 0 failed |
| `npm run roundtrip:smoke` | **SMOKE-PASS 47**, 4m04s |
| `docs/export-format.md` §7.1 | byte-identical (Appendix A tests B and D) |

The six labelled fixes above were traced **in this session** by searching the working tree for
their review labels; every table row's file path and test title was read from the source, not
recalled.

**WHY THIS IS NOT `verified done`:**

1. **Five of the thirteen findings have no record anywhere I can read.** A repo-wide search for
   the review's own labels turns up **A, B, C, F, H, I** and nothing else — `Fix D`, `Fix E`,
   `Fix G`, `Fix J`, `Fix K`, `Fix L` and `Fix M` appear in no source, test, script or doc.
   (That the set runs **A–M** is an *inference* from thirteen findings and thirteen letters, not
   something a record states.) Two of those seven are identifiable from the handover by
   description — the V31 conflation and the contrast fix — which leaves **five findings whose
   nature, fix and evidence are unknown to this file**. Their fixes are covered only by the
   aggregate green suite, which cannot tell you what was fixed or whether the fix is right.
2. **The contrast fix is asserted, not measured.** VERIFIED by search: nothing under `src/`,
   `e2e/` or `scripts/` computes a contrast ratio, and `handoff.md`'s "27/27 pairs pass" predates
   this token change with no evidence it covered the pair.
3. **The review's own output is not in the repo.** No transcript, report or finding list was
   committed, so nothing can be reconciled against it later. A future session cannot check whether
   all 13 were actually fixed — it can only take this file's word for six of them.

**To reach `verified done`:** whoever holds the review transcript should itemise the remaining
findings here — one row each, with the file that changed and the test that pins it — and record a
contrast measurement for the ink-reading labels. Both are minutes of work for the session that has
the context, and impossible for any session that does not.

## Open Questions
1. **Should adversarial-review output be archived like round-trip evidence is?** Stage 4 copies
   `report.md` and representative artefacts into `staging/stage-4-roundtrip-launch/evidence/`.
   **Recommendation:** yes — an unarchived review is unverifiable a week later, exactly as this
   file demonstrates.
2. **Should every fix carry its label in a test name?** Six do and they are the six that survived
   into this record; the seven that do not are the seven that were lost. **Recommendation:** make
   it the convention.

## Notes & Decisions
- **Findings A, B, C and H are classifier/validator *correctness* bugs, not polish.** A would have
  BLOCKed real restaurant packages at submit time; B and C would have shipped wrong structure into
  a built site; H would have silently halved a features grid.
- **F and I are quality-of-implementation fixes** on surfaces this stage introduced; both have
  tests and neither changes the contract.
- **The V31 fix is a false-positive removal.** Telling a client their space was not applied when it
  was reads as the app being broken — which is why the rule is `client`-class and why the boundary
  case matters more than the general one.
- **This file deliberately does not claim thirteen fixes were verified.** It claims six were, two
  more are identifiable, and five are unaccounted for. That is what the evidence supports.
