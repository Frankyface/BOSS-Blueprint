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
- [ ] feature-pen-only-pages.md — F0: V9/V6 relaxed so a pen-only page is legal and renderable;
      height-scaled, expectation-gated ink floor (`src/export/png/inkExpectation.ts`)
      — **awaiting verification**
- [x] feature-page-space.md — F2: `page.extraBottomPx`, Add space / Trim by button or by dragging
      the page's bottom edge
- [x] feature-ink-inference.md — F3: `src/canvas/ink/**`, pure-geometry segmentation and
      classification of strokes into typed regions
- [ ] feature-pen-regions-contract.md — F4: `page.penRegions` in `site.json`, validators V28–V31
      and their harness twins — **awaiting verification**
- [ ] feature-brief-builds-ink.md — F5: `brief.md` rewritten so the builder BUILDS ink;
      `**BUILD THIS FROM INK**` markers, count-enforced by V30 — **awaiting verification**
- [ ] feature-ink-reading-overlay.md — F6: opt-in "Show what we read" overlay, pen palette
      relabel, pen now defaults to **Ink** — **awaiting verification** on one narrow item (the
      overlay's label contrast is asserted in a comment and measured nowhere); everything else in
      it is verified
- [ ] feature-boss-retheme.md — BOSS palette across `src/styles/theme.css` and the component CSS,
      brand assets regenerated — **awaiting verification**
- [ ] feature-review-fixes.md — the 13 upheld findings from the post-implementation adversarial
      review — **awaiting verification**

_The F-numbers are the v1.1 work list's. **F1, F7 and F8 are NOT in this stage** — they are the
post-v1 backlog (`handoff.md` → Next Up 3, `docs/decisions.md` 2026-07-29 "Post-v1 backlog
recorded"): the deterministic legibility check, the vacuous `scoreImagePlacement`, and F8's two
package-defect candidates._

## Stage-wide evidence (2026-07-29)

Every feature file below cites this run set; only per-feature detail is repeated there.

| Check | Result |
|---|---|
| `npm test` | **119 files · 2228 passed · 2 skipped · 0 failed** (baseline before this work: 101 files / 1811 passed) |
| `npm run lint` | clean |
| `npm run build` | clean |
| `npm run schema:check` | clean |
| `npm run roundtrip:gate:selftest` | **PASSED — 45/45 mutations caught** |
| `npm run e2e` (chromium + firefox + webkit) | **720 passed** |
| `npm run roundtrip:smoke` | **SMOKE-PASS 47**, 4m04s, run root `C:/Users/Public/boss-blueprint/roundtrip-runs/2026-07-30T01-12-34-144Z_B_70454b9` |
| `docs/export-format.md` §7.1 / §7.2 | §7.1 **byte-identical**; §7.2 moves only where the amended boilerplate is quoted into it — proved by **Appendix A tests B and D**, not by eye |

**Live in-browser check (manual, this machine):** brand tokens resolve (`--boss-brand` = `#0b7ebb`),
the pen starts in **Ink**, and two gappy hand-drawn boxes produced the reading **"We read this as
2 cards"** with two labelled outlines tagged `card?` (unsure).

_Unit-count note:_ `handoff.md` and the `docs/decisions.md` v2.5 entry both record **2208** tests.
2228 is the figure after the review fixes landed. The 20-test delta is **inferred** from that
ordering, not from a recorded before/after pair — if a session needs the exact split it must
re-run, not trust this line.

## What this stage does NOT prove

Four limits apply to every feature file here. None of them may be quietly dropped.

1. **The round-trip harness cannot express the pen.** `scenarios/scenario.schema.json`'s
   `penCluster` requires `["ref","role","target","color","width","strokes"]` with
   `additionalProperties: false`, so the scenario language literally cannot describe an
   **untargeted** pen mark — the exact case this stage exists to fix. `report.mjs` additionally
   nulls S6 under `--smoke`. The green smoke proves the package is still buildable by a
   zero-context session (its real job); it proves **nothing** about pen content surviving.
   The built package's `brief.md` did carry the new precedence line — so the new code ran — and
   the package contained **zero** `penRegions`, because scenario B's pen marks are all
   block-targeted. Recorded in `docs/decisions.md` 2026-07-29 ("Round-trip harness cannot yet
   express the pen").
2. **Linux visual baselines have not been regenerated.** VERIFIED here: only
   `e2e/export-visual.spec.ts-snapshots/export-home-{chromium,firefox,webkit}-win32.png` differ
   from `HEAD`; all six `*-linux.png` baselines are untouched. The
   `update-visual-baselines` `workflow_dispatch` job **exists** in `.github/workflows/deploy.yml`
   (it is manual on purpose) but **has not been run**. Until it is, "CI green on `main` for v1.1"
   is unproven and the visual spec is expected to fail on the Linux runner.
3. **v1.1 is NOT deployed.** The live site is still v1. No claim in this stage rests on the
   deployed bundle.
4. **The whole change set is UNCOMMITTED.** VERIFIED here: `git log -1` is `70454b9`
   ("docs: close Stage 4 …") and `git status --short` lists 134 entries. The smoke run root's
   `_B_70454b9` therefore names **`HEAD`, not the tree that was tested** — the sha in that path
   does not identify the code under test. Do not cite it as a content identity.

## Definition of Done (testable checklist)
- [x] `npm test`, `npm run lint`, `npm run build`, `npm run schema:check` green locally
- [x] `npm run roundtrip:gate:selftest` 45/45
- [x] `npm run e2e` green locally on three engines
- [x] `npm run roundtrip:smoke` green (the mandatory pre-merge check for `src/export/**`, the
      schema, the brief generator, the starter templates and the PNG renderer)
- [x] `docs/export-format.md` §7.1 byte-identical, proved mechanically (Appendix A tests B and D)
- [ ] **A pen-only site submits end-to-end in Playwright** — no such journey exists today
      (`e2e/submit.spec.ts` is unmodified; nothing under `e2e/` references a pen-only or ink-only
      submission). This is the stage's headline claim and it is currently unit-tested only.
- [ ] **`penRegions` observed in a real exported package** — the smoke package contained zero;
      no export has ever carried the field outside unit fixtures
- [ ] **A `**BUILD THIS FROM INK**` marker seen by a real zero-context builder session** — blocked
      on the same harness gap
- [ ] **Linux visual baselines regenerated** via the `workflow_dispatch` job, then CI green
      on `main`
- [ ] **The ink-reading label contrast measured** (or, better, guarded by a test) rather than
      asserted in a CSS comment — feature-ink-reading-overlay.md
- [ ] **v1.1 deployed** and the live URL serving this commit
- [ ] Every feature file above `verified done` with Verification Log evidence — **2 of 8 are
      `verified done`** (feature-page-space.md, feature-ink-inference.md); the other **6 are
      `awaiting verification`** with the blocker stated in their own files

## Open Questions
1. **Do we teach the harness the pen before or after shipping v1.1?** It shipped after —
   `docs/decisions.md` records that ruling and the reason (rebuilding the instrument first would
   have held the owner's four fixes behind a gauntlet). **Recommendation:** unchanged, but the
   harness work is now the highest-value next task, because a pen regression currently has *no*
   automatic detector at package level. `handoff.md` → Next Up 2.
2. **Should a pen-only submit E2E exist before v1.1 deploys?** It is cheap (draw, submit, assert
   the zip downloads and the gate exits 0) and it is the only end-to-end proof of the stage's
   headline claim that does not need the harness rebuilt. **Recommendation:** yes — write it
   before deploy, not after.
3. **Nothing machine-checks the theme's contrast.** VERIFIED here: no test or script under `src/`,
   `e2e/` or `scripts/` computes a contrast ratio. The "27/27 pairs pass" figure in `handoff.md`
   is a one-off measurement with no guard against regression, and the ink-reading label fix
   (review finding, see feature-review-fixes.md) has no automated floor either.
   **Recommendation:** a small unit test over the token pairs, filed as backlog rather than
   blocking v1.1.

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
- **`handoff.md` is stale on one point** (not edited here — another agent owns that file):
  it says the favicon / apple-touch / og-card "still carry the amber mark". They do not.
  VERIFIED: `public/favicon.svg` now paints `#63b3ed`, and `favicon.ico`, `apple-touch-icon.png`
  and `og-card.png` all differ from `HEAD` — the rendered apple-touch icon is the blue BOSS mark
  with no amber in it. `scripts/brand/make-brand-assets.mjs` was run. The **visual baselines**
  regeneration is the step that is genuinely still outstanding.
