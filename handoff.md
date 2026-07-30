# Handoff — BOSS Blueprint
_Last updated: 2026-07-29 · Current stage: **v1.1 "ink is design" — code complete, awaiting the
smoke run + two regeneration steps**_

## 🎯 Goals
v1 shipped and is live. v1.1 answers Cam's four reported gaps plus a BOSS rebrand, all under one
export-contract amendment (**v2.4 → v2.5**, schemaVersion still 1).

## 📍 Current State
- **v2.5 landed in code and spec.** Ink is no longer annotation-only: `src/canvas/ink/**` segments
  strokes into typed regions by pure geometry, `site.json` carries `page.penRegions`, and
  `brief.md` tells the builder to **BUILD** them (V30 counts the markers).
- **The headline fix: a pen-only site is now submittable.** `v09EmptySite` BLOCKed unless the
  homepage had a non-`section` block — "build a site from the pen alone" was impossible in
  shipped code. Fixed in `src/` **and** in the harness twin (`lib/rules/structure.mjs`).
- **`page.extraBottomPx`** — Add space / Trim, by button or by dragging the page's bottom edge.
- **BOSS palette applied** (`#0b7ebb`/`#09679a`/`#63b3ed`/`#f2f8fc`); 27/27 contrast pairs pass.
- **Unit 119 files / 2208 tests green** (was 101/1811), lint + build + `schema:check` clean,
  `roundtrip:gate:selftest` 45/45. §7.1 **byte-identical**; §7.2 moves only where the amended
  boilerplate is quoted into it — Appendix A tests B and D are the proof.
- Live site is still v1 — **v1.1 is NOT deployed**.

## 📂 Files I'm Working On
- None mid-edit. `scripts/roundtrip/lib/legibility.mjs` + its tests are an EARLIER session's
  uncommitted advisory work (post-v1 backlog item 1) — untouched by v1.1, do not sweep it into a
  v1.1 commit.

## ✅ Things I've Changed
- 2026-07-29: v2.5 amendment — V9/V6 relaxed for ink, `extraBottomPx`, `penRegions`, V28–V31,
  brief rewritten so ink is built; decisions entry records it and the rejected alternatives.
- 2026-07-29: BOSS retheme; fixed a pre-existing AA failure (SidePanel placeholder 3.76 → 4.70:1).
- 2026-07-29: pen palette relabelled (`Red (notes)` → `Red`); pen now starts in **Ink**.

## ❌ Watch Out
- **`npm run roundtrip:smoke` has NOT been run for v1.1** and is mandatory before merge
  (`src/export/**`, schema, brief generator and PNG renderer all changed).
- **The harness cannot express the pen.** `scenario.schema.json`'s `penCluster` requires a
  `target`, so it cannot describe an untargeted mark — a green smoke proves the package is still
  buildable, NOT that pen content survives. Recorded in decisions.md; do not overclaim it.
- **Brand assets ARE regenerated** — `make-brand-assets.mjs` was run; `public/favicon.svg`,
  `favicon.ico`, `apple-touch-icon.png` and `og-card.png` all carry the blue BOSS mark. What is
  still outstanding is the **visual baselines**: only the three `*-win32.png` were regenerated
  locally; all six `*-linux.png` are untouched, so CI's visual spec WILL fail until the
  `update-visual-baselines` workflow_dispatch job is run and its artifact committed. Exported
  PNGs legitimately changed (button pill is BOSS blue, bands `#f2f8fc`).
- **The smoke run root is named `..._B_70454b9` after git HEAD, NOT after the tree it tested.**
  All of v1.1 is uncommitted, so that sha identifies the Stage-4 close, not this work. Do not cite
  it as a content identity for v1.1.
- Keep TS rules and their `scripts/roundtrip/lib/rules/*.mjs` twins in step — `npm test` runs
  both, so a one-sided edit fails the suite now instead of the gate 12 minutes later.
- The contract is frozen: changes need a decisions entry + version bump + smoke run.
- Never say a notification was emailed: the relay is OFF.
- Fresh clone: `npm ci --prefix scripts/roundtrip` or the submit E2E fails confusingly.
- snapdom needs dpr:1 + scale:1; visual baselines regenerate ONLY via workflow_dispatch.

## ➡️ Next Up
1. `npm run roundtrip:smoke`, then the two regeneration steps above, then commit + deploy v1.1.
2. Teach the harness the pen (scenario schema + stop nulling S6 under smoke) — the only way a pen
   regression gets caught automatically.
3. Post-v1 backlog, unchanged: deterministic legibility check (F1), vacuous
   `scoreImagePlacement` (F7), F8's two package-defect candidates.
4. Cam's launch items (help.md): BOSS-website PR #1 · relay account + two strings · public submit
   address · optional `sketch.bossolutions.pro` DNS.

## 🔗 Pointer
→ v2.5 rationale: `docs/decisions.md` (2026-07-29, last two entries) · spec: `docs/export-format.md`
· inference constants + their fixture evidence: `src/canvas/ink/constants.ts`
