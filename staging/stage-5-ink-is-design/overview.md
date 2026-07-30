# Stage 5 — Ink Is Design (v1.1)

## Goal
v1 shipped with the pen as **annotation about blocks**. Cam then reported four gaps that were one
root cause: the export contract had no way to say *this ink IS a thing*. A client could draw a
card, a heading or a graphic and the builder would never build it — and a site drawn entirely with
the pen could not be **submitted at all**, because `v09EmptySite` BLOCKed unless the homepage
carried a non-`section` block.

This stage promotes ink to design content, under **one** export-contract amendment
(**v2.4 → v2.5**, `schemaVersion` still 1), plus the BOSS brand retheme that was queued behind it.

_Binding spec: `docs/export-format.md` (v2.5). Rationale and rejected alternatives:
`docs/decisions.md`, 2026-07-29, the last two entries. Inference constants and their fixture
evidence: `src/canvas/ink/constants.ts`._

## Features
- [x] feature-pen-only-pages.md — F0: V9/V6 relaxed so a pen-only page is legal and renderable;
      height-scaled, expectation-gated ink floor (`src/export/png/inkExpectation.ts`).
      **Promoted 2026-07-30** — `e2e/pen-only-site.spec.ts` closes the missing Playwright leg
- [x] feature-page-space.md — F2: `page.extraBottomPx`, Add space / Trim by button or by dragging
      the page's bottom edge
- [x] feature-ink-inference.md — F3: `src/canvas/ink/**`, pure-geometry segmentation and
      classification of strokes into typed regions
- [x] feature-pen-regions-contract.md — F4: `page.penRegions` in `site.json`, validators V28–V31
      and their harness twins. **Promoted 2026-07-30** — a real exported package now carries
      regions and passes `gate.mjs`
- [x] feature-brief-builds-ink.md — F5: `brief.md` rewritten so the builder BUILDS ink;
      `**BUILD THIS FROM INK**` markers, count-enforced by V30. **Promoted 2026-07-30** — three
      zero-context builders read the markers and built the regions. **STRUCTURE only:
      transcription is unproven**
- [ ] feature-ink-reading-overlay.md — F6: opt-in "Show what we read" overlay, pen palette
      relabel, pen now defaults to **Ink** — **awaiting verification** on TWO items now: the label
      contrast is still measured nowhere, and its own criterion "never costs the client a row of
      canvas" is **RED on CI** (`pen-reading.spec.ts:172`, chromium +31px / firefox +32px)
- [ ] feature-boss-retheme.md — BOSS palette across `src/styles/theme.css` and the component CSS,
      brand assets regenerated — **awaiting verification**: regenerated Linux baselines not yet
      committed (hygiene, not a gate), CI red, not deployed, no contrast guard
- [ ] feature-review-fixes.md — the 13 upheld findings from the post-implementation adversarial
      review — **awaiting verification**: 5 of 13 are still untraceable after a second search

_The F-numbers are the v1.1 work list's. **F1, F7 and F8 are NOT in this stage** — they are the
post-v1 backlog (`handoff.md` → Next Up 3, `docs/decisions.md` 2026-07-29 "Post-v1 backlog
recorded"): the deterministic legibility check, the vacuous `scoreImagePlacement`, and F8's two
package-defect candidates._

## Stage-wide evidence (2026-07-30 — the work is COMMITTED and has been through CI)

The 2026-07-29 figures below this table were all local, on an uncommitted tree. **Cite these
instead.** Every feature file's own log carries the per-feature detail.

**Commit: `c82d917c6de5566e8cc05c2822f361a2ce6faa4b`** on `main` — "feat: ink is design — pen marks
become buildable site content (export v2.5)", **143 files, +17185/−306**, authored and committed
2026-07-30 10:32:12 −0400, parent `70454b9`.

| Check (CI run **30556114726**, push of `c82d917`, ubuntu) | Result |
|---|---|
| Unit tests with coverage | **116 test files · 2241 tests passed · 0 failed** |
| Lint · Build · `schema:check` (Appendix A test A) | **green** |
| `roundtrip:gate:selftest` | **green — 45/45** |
| E2E, 3 engines, production build under the Pages base path | 732 run · **726 passed · 2 failed · 1 flaky** → job **RED** |
| `export-visual` (6 baseline comparisons) | **PASSED** — against the *stale, pre-rebrand* `-linux` baselines. See limit 2 |
| Deploy to GitHub Pages | did not run — **v1.1 is not live** |

**The two CI failures, recorded honestly — neither is the export:**

| Test | Engines | Detail |
|---|---|---|
| `e2e/pen-reading.spec.ts:172` "never costs the client a row of canvas" | chromium, firefox (webkit passes) | `pen-reading.spec.ts:184` — expected **89.375**, got **120.375** (chromium, **+31px**); expected **91.400**, got **123.400** (firefox, **+32px**). The canvas toolbar wraps under ubuntu font metrics and steals a row of drawing area. **A real platform-metrics defect the Windows-only local runs could not see.** A fix is in flight, uncommitted |
| `e2e/launch-polish.spec.ts:391` (assertion at :399) | chromium | opacity expected `"1"`, got `"0.998593"` — **flaky**, passed on retry |

**Also committed and green: `e2e/pen-only-site.spec.ts`** — 6 tests (2 × chromium/firefox/webkit,
confirmed by `--list`). A design with **zero blocks** submits, ships `penRegions`, gets one
`**BUILD THIS FROM INK**` marker per top-level region *counted against the package's own
`site.json`*, renders a PNG with measurably real ink (luma < 200 on the stroke, > 240 on the paper
beside it), and passes `node scripts/roundtrip/gate.mjs --package <zip> --no-manifest` with exit 0.
This single spec closed the named blocker on **F0, F4 and F5**.

**Baseline regeneration — run `30560085196`**, `workflow_dispatch`, 2026-07-30T16:08:30Z: job
"Regenerate export visual baselines (ubuntu)" **succeeded** in 1m19s;
`npx playwright test e2e/export-visual.spec.ts --update-snapshots=all` ran 9 tests (7 passed /
2 skipped) and rewrote `export-home-{chromium,firefox,webkit}-linux.png`; artifact
**`visual-baselines-linux`**, 146816 bytes, id 8766507712. **The artifact is NOT yet committed** —
`git status e2e/` shows no snapshot changes.

_Which unit count to cite:_ **116 files / 2241 tests** for `c82d917`. The commit message's
"120 files / 2310", `docs/decisions.md`'s 2282 and the 2228 below are all whole-dirty-tree local
figures — the working tree carries four untracked `.test.mjs` files from another session
(116 + 4 = 120), which is the **inferred** explanation of the gap.

## Stage-wide evidence (2026-07-29 — local, uncommitted; kept as history)

| Check | Result |
|---|---|
| `npm test` | **119 files · 2228 passed · 2 skipped · 0 failed** (baseline before this work: 101 files / 1811 passed) |
| `npm run lint` | clean |
| `npm run build` | clean |
| `npm run schema:check` | clean |
| `npm run roundtrip:gate:selftest` | **PASSED — 45/45 mutations caught** |
| `npm run e2e` (chromium + firefox + webkit) | **720 passed** |
| `npm run roundtrip:smoke` | **SMOKE-PASS 47**, 4m04s, run root `C:/Users/Public/boss-blueprint/roundtrip-runs/2026-07-30T01-12-34-144Z_B_70454b9` — **an EARLIER tree, not `c82d917`; see limit 4** |
| `docs/export-format.md` §7.1 / §7.2 | §7.1 **byte-identical**; §7.2 moves only where the amended boilerplate is quoted into it — proved by **Appendix A tests B and D**, not by eye |

**Live in-browser check (manual, this machine):** brand tokens resolve (`--boss-brand` = `#0b7ebb`),
the pen starts in **Ink**, and two gappy hand-drawn boxes produced the reading **"We read this as
2 cards"** with two labelled outlines tagged `card?` (unsure).

## What this stage does NOT prove

Five limits apply across this stage. None of them may be quietly dropped. **Two limits from the
2026-07-29 version of this file have been removed because they were measured and found FALSE — see
"Corrected" below.**

1. **Transcription.** A drawn *box* becomes a styled card in the right place — three independent
   zero-context builders did exactly that, and converged on the nav labels. What has **never** been
   tested is whether handwritten **words** survive: the fixtures carry synthetic strokes with
   **no letterforms**, and the three builder runs shipped **no page PNG** at all.
   **"Structure verified, transcription unverified"** is the whole of it. `docs/decisions.md` and
   the commit message both say so.
2. **The round-trip harness cannot express the pen.** `scenarios/scenario.schema.json`'s
   `penCluster` requires `["ref","role","target","color","width","strokes"]` with
   `additionalProperties: false`, so the scenario language literally cannot describe an
   **untargeted** pen mark — the exact case this stage exists to fix. `report.mjs` additionally
   nulls S6 under `--smoke`. A green smoke proves the package is still buildable by a zero-context
   session; it proves **nothing** about pen content surviving. Recorded in `docs/decisions.md`
   2026-07-29. *(Partly mitigated: `e2e/pen-only-site.spec.ts` is now an automatic package-level
   pen detector and runs on every push — but only for the design that spec draws.)*
3. **CI is RED on `main`** — on `pen-reading.spec.ts:172` (real) plus one flaky opacity assertion.
   No stage-level "CI green" claim can be made until that lands.
4. **`roundtrip:smoke` has NOT been run against `c82d917`.** VERIFIED: the only run root carrying a
   `verdict.txt` (`SMOKE-PASS 47`) is `2026-07-30T01-12-34-144Z_B_70454b9`, whose
   `run-manifest.json` records sha `70454b9` with **129 dirty files** and does **not** list
   `e2e/pen-only-site.spec.ts` — an earlier tree. A later attempt,
   `2026-07-30T13-37-41-943Z_B_70454b9`, has no verdict, no `eval/`, no `shots/`, and its builder
   transcript ends `"Failed to authenticate: OAuth session expired and could not be refreshed"`
   (`terminal_reason: api_error`) — it built nothing. Smoke is mandatory before merging
   `src/export/**` changes (CLAUDE.md), and the merge has already happened without it.
5. **v1.1 is NOT deployed.** The live site is still v1; the Deploy job did not run in either
   30556114726 or 30560085196. No claim here rests on the deployed bundle.

**Corrected — two former limits that are now known to be false:**

- ~~"Linux visual baselines have not been regenerated, so the visual spec is expected to fail on
  the Linux runner."~~ **Measured and wrong.** The stale `-linux` baselines **passed** CI at
  `c82d917`. Old vs new `export-home-chromium-win32.png` (1200×1600): **23.099%** of pixels differ
  at all, **0.756%** differ past the per-pixel threshold, against a **2.000%** allowance — about a
  third of the budget. Regenerating them is **hygiene, not a gate**; the job has since run
  (30560085196) and its artifact is waiting to be committed. Full reasoning in `docs/decisions.md`
  2026-07-30, "the visual gate cannot see a brand-wide colour change". The real lesson is the same
  as post-v1 backlog F1's: **the gate measured a proxy, and the proxy was silent.**
- ~~"The whole change set is UNCOMMITTED."~~ It is committed, as `c82d917`. What remains
  uncommitted in the working tree is **another session's** in-flight work (the `pen-reading` layout
  fix, and the round-trip legibility advisory) — do not sweep it into a v1.1 commit.

## Definition of Done (testable checklist)
- [x] `npm test`, `npm run lint`, `npm run build`, `npm run schema:check` green — **and green in
      CI on ubuntu at `c82d917`**, not only locally
- [x] `npm run roundtrip:gate:selftest` 45/45, in CI
- [x] `docs/export-format.md` §7.1 byte-identical, proved mechanically (Appendix A tests B and D)
- [x] **A pen-only site submits end-to-end in Playwright** — `e2e/pen-only-site.spec.ts`, 6 tests
      across three engines, green in CI run 30556114726
- [x] **`penRegions` observed in a real exported package** — the same journey opens the downloaded
      zip and asserts them, and the package passes `gate.mjs --no-manifest`
- [x] **A `**BUILD THIS FROM INK**` marker seen by a real zero-context builder session** — three
      of them (`docs/decisions.md`, 2026-07-30); **no transcript archived**, see F5's caveat
- [x] **The change set is committed** — `c82d917` on `main`
- [ ] **`npm run roundtrip:smoke` green against the COMMITTED tree** — the mandatory pre-merge
      check for `src/export/**`, the schema, the brief generator, the starter templates and the PNG
      renderer. The `SMOKE-PASS 47` on record is an **earlier tree**; a later attempt died on an
      expired OAuth credential. **The merge happened without this check.**
- [ ] **CI green on `main`** — red on `pen-reading.spec.ts:172` (real, +31/+32px on ubuntu) and one
      flaky opacity assertion
- [ ] **Regenerated Linux baselines committed** — artifact `visual-baselines-linux` from run
      30560085196 is not in the repo. **Hygiene, not a gate** — the stale baselines pass
- [ ] **The ink-reading label contrast measured** (or, better, guarded by a test) rather than
      asserted in a CSS comment — feature-ink-reading-overlay.md
- [ ] **Transcription tested at all** — no fixture carries letterforms; no builder has been asked
      to read handwriting
- [ ] **v1.1 deployed** and the live URL serving this commit
- [ ] Every feature file above `verified done` with Verification Log evidence — **5 of 8 are
      `verified done`** (page-space, ink-inference, **pen-only-pages**, **pen-regions-contract**,
      **brief-builds-ink**); **3 are `awaiting verification`** (ink-reading-overlay, boss-retheme,
      review-fixes) with the blocker stated in their own files

## Open Questions
1. **Do we teach the harness the pen before or after shipping v1.1?** It shipped after —
   `docs/decisions.md` records that ruling and the reason. **Recommendation updated:** still worth
   doing, but it is **no longer the highest-value next task** and its old justification is spent.
   A pen regression is no longer undetectable at package level: `e2e/pen-only-site.spec.ts` runs on
   every push and asserts regions, markers and real ink in the shipped zip. The harness fix now
   buys coverage of *other* pen-shaped designs, not the difference between "detected" and "not".
   The genuinely higher-value items are the red CI test and the un-run smoke against `c82d917`.
2. ~~**Should a pen-only submit E2E exist before v1.1 deploys?**~~ **Answered — yes, and it does.**
   `e2e/pen-only-site.spec.ts`, written and committed in `c82d917`, green on three engines in CI.
   It turned out to close three features' blockers at once (F0, F4, F5), which is a better return
   than the estimate assumed.
3. **Nothing machine-checks the theme's contrast.** Re-VERIFIED 2026-07-30: no test or script under
   `src/` or `e2e/` computes a contrast ratio. (`scripts/roundtrip/lib/legibility.mjs` does, but it
   is another session's uncommitted advisory work and measures built sites, not this app's tokens.)
   The "27/27 pairs pass" figure is a one-off measurement with no guard against regression, and the
   ink-reading label fix has no automated floor either. **Recommendation:** unchanged — a small
   unit test over the token pairs, filed as backlog rather than blocking v1.1.
4. **NEW: should the visual gate be replaced rather than retuned?** `docs/decisions.md` 2026-07-30
   measured that a brand-wide colour change lands at a third of the ratio allowance and is
   invisible to it, and ruled **not** to tighten the tolerance — a ratio-only gate cannot separate
   "ubuntu renders text differently" from "every CTA changed colour". **Recommendation:** follow
   that entry — add a sample-point or palette-histogram assertion beside the ratio, keep the ratio
   for font noise. Backlog, alongside post-v1 F1, which is the same failure shape.
5. **NEW: should adversarial-review and builder-experiment output be archived?** Stage 4 archives
   round-trip evidence under `staging/**/evidence/`; Stage 5 archives nothing. The cost is already
   visible — 5 of 13 review findings are permanently untraceable, and the three builder runs that
   justify F5's promotion survive only as `docs/decisions.md` prose. **Recommendation:** yes, make
   it the convention; see feature-review-fixes.md Open Question 1.

## Notes & Decisions
- **This stage is one amendment, executed once.** The v2.4 freeze's change process allows it;
  four separate amendments would have cost four gauntlets and four fixture reconciliations
  (`docs/decisions.md`, "Export format v2.5").
- **`site.json` gained fields; the zip layout did not.** Drawn artwork is rebuilt by the builder
  from `penStrokes[].points` as inline SVG, and handwriting too small to read is re-rendered at 4×
  from the same points. **Zero new files in the zip** — a zip-layout change would have been a
  `schemaVersion: 2` bump.
- **The TS rules and their `scripts/roundtrip/lib/rules/*.mjs` twins must stay in step.**
  `npm test` runs both, so a one-sided edit fails the unit suite immediately instead of the gate
  twelve minutes later.
- **The brand assets were already regenerated** — `public/favicon.svg` paints `#63b3ed`, and
  `favicon.ico`, `apple-touch-icon.png` and `og-card.png` all carry the blue BOSS mark;
  `scripts/brand/make-brand-assets.mjs` was run. `handoff.md` used to be stale on this and has now
  been corrected. What remains is committing the regenerated `-linux` baselines — **hygiene**.
- **This stage's verification chain has one weak link worth naming.** Two of the three promotions
  on 2026-07-30 rest on `e2e/pen-only-site.spec.ts`, which is excellent evidence *because it
  derives its assertions from the shipped bytes* — the marker count is compared against the
  package's own top-level regions, not against a number written in the test. The third (F5's
  "a builder acts on the marker") rests on `docs/decisions.md` prose about three unarchived
  sessions, corroborated by the two code fixes those sessions caused. That is real, and it is
  weaker than the rest. Say so when citing it.
