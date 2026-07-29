# Handoff — BOSS Blueprint
_Last updated: 2026-07-29 · Current stage: stage-4-roundtrip-launch_

## 🎯 Goals
Finish Stage 4: three clean round-trip runs at the shipped commit decide v1. Blocked on ONE
thing only — Cam re-authenticating the Claude Code CLI (help.md). Everything else is built.

## 📍 Current State
- **Stages 1, 2 and 3 CLOSED** — all 5 Stage 3 features `verified done`; the contract is FROZEN
  at v2.4 (`docs/export-format.md`).
- **The deferred relay is now BUILT** — `feature-notification-relay.md`, `awaiting verification`.
  A provider-agnostic form-POST adapter behind the existing port, shipped CONFIG-GATED and OFF
  (`BOSS_RELAY` in `site.config.ts`, both strings empty). With the empty config the app binds the
  same `NoopRelay` and makes **zero** network calls — asserted in three engines by recording every
  request across a full submit. Cam's provider account + one real submission is all that is left.
- **Stage 4 build complete, verification mixed:**
  - `feature-desktop-guard.md` — **verified done** (independent review 2026-07-29).
  - `feature-roundtrip-harness.md` — awaiting verification. R4.6 amended to BASELINE STERILITY
    and implemented (committed version-keyed builtin manifest, asserted on the streaming init);
    the Windows spawn defect is fixed; an auth failure is now INFRA, never a scored FAIL.
    A real sterile session now reaches SEG-3 and passes purity. Only the gating runs remain.
  - `feature-onboarding-tour.md` — **verified done** (independent re-proof 2026-07-29; both
    bounces fixed and re-proved RED-then-GREEN in chromium, firefox and webkit).
  - `feature-launch-polish.md` — awaiting verification; built, CI green, live, Lighthouse
    99/100/100/100 desktop. Blocked only on the three help.md items and the round-trip runs.
- **Live at `324b952`**: CI success, `https://frankyface.github.io/BOSS-Blueprint/` → 200, and the
  deployed bundle is that commit (`assets/index-BbozndLp.js`).
- 1685 unit / 687 E2E green on Windows; CI green on Linux.

## 📂 Files I'm Working On
- staging/stage-4-roundtrip-launch/feature-roundtrip-harness.md — the three gating runs.
- staging/stage-3-export-delivery/feature-notification-relay.md — awaiting Cam's relay account.

## ✅ Things I've Changed
- 2026-07-29: the notification relay — the last deferred feature — built, gated OFF, mock-verified.
- 2026-07-29: R4.6 baseline-sterility landed, Windows spawn fix, tour T-1 fix.
- 2026-07-29: launch polish — BOSS branding, favicon set, footer, head/OG/social card, the UX
  audit's polish tail (P1, P2, P4, P5, N4, N7, N9), README refresh, Lighthouse pass.
- 2026-07-29: submit-gate follow-ups F1/F2/F3/F7 (still verified done); Stage 4 review verdicts.
- 2026-07-28: Stage 3 closed; export contract frozen at v2.4; Stage 4 specs landed pre-ruled.

## ❌ Watch Out
- ONE main-tree writer at a time; reviewers in detached worktrees; merges via the train pattern.
- The contract is FROZEN — changes need a decisions entry + version bump + round-trip
  justification. The relay is wired but OFF: submit still binds the no-op stub until `BOSS_RELAY`
  is filled in. **Never say a notification was emailed** — nothing has ever reached an inbox.
- snapdom MUST get dpr:1 + scale:1; the export-visual baseline gate hard-fails in CI by design.
  Baselines are regenerated ONLY via the `update_visual_baselines` workflow_dispatch job.
- Run `npm run roundtrip:smoke` before merging any change to `src/export/`, the schema, the brief
  generator, the templates or the PNG renderer.
- Space E2E runs: back-to-back full runs exhaust this box's ephemeral ports.

## ➡️ Next Up
1. Cam re-authenticates the CLI (help.md) — the only remaining blocker.
2. Three clean round-trip runs (A-preview, A-deployed, B-preview) at the shipped commit.
3. Stage close: launch checklist — the three `help.md` items stay visible as awaiting-Cam.

## 🔗 Pointer
→ Current stage folder: `staging/stage-4-roundtrip-launch/` · Active feature files: `staging/stage-4-roundtrip-launch/feature-roundtrip-harness.md`, `staging/stage-3-export-delivery/feature-notification-relay.md`
