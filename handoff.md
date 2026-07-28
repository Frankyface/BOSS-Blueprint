# Handoff — BOSS Blueprint
_Last updated: 2026-07-28 · Current stage: stage-2-full-sketching_

## 🎯 Goals
Finish Stage 2 (full sketching): batch 2 (pen layer + image upload) and batch 3 (templates +
design file), with independent review of every batch, then Stage 3 (export & delivery).

## 📍 Current State
- **Stage 1 CLOSED** — all 5 features `verified done` with stage-close review evidence; DoD met.
- Stage 2 batch 1 (multi-page/nav, copy blocks, site settings) implemented on document schema
  v2 with v1→v2 migration: 463 unit / 237 E2E ×2 green, CI green, deployed. **Awaiting
  independent verification** (reviewer running).
- Stage 3 fully pre-specced in parallel: docs/export-format.md (frozen v2-final),
  docs/roundtrip-protocol.md, draft feature files incoming; template fixtures validated in
  design-assets/templates/.
- Live: https://frankyface.github.io/BOSS-Blueprint/ (multi-page editor).

## 📂 Files I'm Working On
- staging/stage-2-full-sketching/feature-pen-layer.md + feature-image-upload.md — batch 2 (next).
- staging/stage-2-full-sketching/ batch-1 feature files — in independent review.

## ✅ Things I've Changed
- 2026-07-28: Stage 1 closed formally (statuses, criteria, overview DoD all flipped w/ evidence).
- 2026-07-28: Stage 2 batch 1 landed (schema v2 + migration; 3 features).
- 2026-07-28: Export format v2 + round-trip protocol + template fixtures landed in docs/.
- 2026-07-28: Block-editing bounce fixed (chrome-scroll HIGH) + undo/autosave bounce fixed.
- 2026-07-28: Debate verdicts recorded (DOM/SVG canvas · download-first delivery).

## ❌ Watch Out
- ONE repo writer at a time; reviewers use detached worktrees; never `git add -A` mid-flight.
- Additive document fields (e.g. batch-2 penStrokes) must NOT bump schemaVersion — extend
  blueprintFile validation with defaults instead; version bump = migration, reserved for breaks.
- Email relay stays LAST (Cam's directive): submit ships download-first with a stubbed
  DeliveryRelay port; docs/export-format.md is the binding package contract.

## ➡️ Next Up
1. Batch-2 implementer (pen layer + image upload) in main repo; batch-1 reviewer in worktree.
2. On batch-1 verdict: apply flips; then batch 3 (templates + design file — fixtures ready in
   design-assets/templates/).
3. Stage 2 close review → Stage 3 implementation per scratchpad stage3-specs (landing soon).

## 🔗 Pointer
→ Current stage folder: `staging/stage-2-full-sketching/` · Active feature files: `staging/stage-2-full-sketching/feature-pen-layer.md`, `staging/stage-2-full-sketching/feature-image-upload.md`
