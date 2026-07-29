# Handoff — BOSS Blueprint
_Last updated: 2026-07-29 · Current stage: stage-4-roundtrip-launch_

## 🎯 Goals
Finish Stage 4: clear the tour defect, then three clean round-trip runs at the shipped commit
decide v1. Everything else in the stage is built and live.

## 📍 Current State
- **Stages 1, 2 and 3 CLOSED** — all 5 Stage 3 features `verified done`; the contract is FROZEN
  at v2.4 (`docs/export-format.md`).
- **Stage 4 build complete, verification mixed:**
  - `feature-desktop-guard.md` — **verified done** (independent review 2026-07-29).
  - `feature-roundtrip-harness.md` — awaiting verification; review calls the mechanics verified,
    the gating runs are still to come.
  - `feature-onboarding-tour.md` — awaiting verification, **BOUNCED by review**: after a Submit
    round trip the tour returns as "step 1 of 1" targeting `submit` instead of five pointers.
    Reproduced in all three engines.
  - `feature-launch-polish.md` — awaiting verification; built, CI green, live, Lighthouse
    99/100/100/100 desktop. Blocked only on the three help.md items and the round-trip runs.
- **Live at `324b952`**: CI success, `https://frankyface.github.io/BOSS-Blueprint/` → 200, and the
  deployed bundle is that commit (`assets/index-BbozndLp.js`).
- 1579 unit / 672 E2E green on Windows; CI green on Linux.

## 📂 Files I'm Working On
- staging/stage-4-roundtrip-launch/feature-onboarding-tour.md — the bounced defect.
- staging/stage-4-roundtrip-launch/feature-roundtrip-harness.md — the three gating runs.

## ✅ Things I've Changed
- 2026-07-29: launch polish — BOSS branding, favicon set, footer, head/OG/social card, the UX
  audit's polish tail (P1, P2, P4, P5, N4, N7, N9), README refresh, Lighthouse pass.
- 2026-07-29: submit-gate review follow-ups F1/F2/F3/F7 (its status stays verified done).
- 2026-07-29: Stage 4 independent review verdicts recorded.
- 2026-07-28: Stage 3 closed; export contract frozen at v2.4; Stage 4 specs landed pre-ruled.

## ❌ Watch Out
- ONE main-tree writer at a time; reviewers in detached worktrees; merges via the train pattern.
- The contract is FROZEN — changes need a decisions entry + version bump + round-trip
  justification. Email relay stays LAST (Cam): submit ships with the DeliveryRelay no-op stub.
- snapdom MUST get dpr:1 + scale:1; the export-visual baseline gate hard-fails in CI by design.
  Baselines are regenerated ONLY via the `update_visual_baselines` workflow_dispatch job.
- Run `npm run roundtrip:smoke` before merging any change to `src/export/`, the schema, the brief
  generator, the templates or the PNG renderer.
- Space E2E runs: back-to-back full runs exhaust this box's ephemeral ports.

## ➡️ Next Up
1. Fix the tour's post-Submit regression and re-verify `feature-onboarding-tour.md`.
2. Three clean round-trip runs (A-preview, A-deployed, B-preview) at the shipped commit.
3. Stage close: launch checklist — the three `help.md` items stay visible as awaiting-Cam.

## 🔗 Pointer
→ Current stage folder: `staging/stage-4-roundtrip-launch/` · Active feature files: `staging/stage-4-roundtrip-launch/feature-onboarding-tour.md`, `staging/stage-4-roundtrip-launch/feature-roundtrip-harness.md`
