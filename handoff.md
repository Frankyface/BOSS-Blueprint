# Handoff — BOSS Blueprint
_Last updated: 2026-07-28 · Current stage: stage-3-export-delivery_

## 🎯 Goals
Finish Stage 3: implement the last two features (package-zip, submit-gate with download-first
delivery + relay STUB), verify the whole stage, then Stage 4's round-trip gauntlet decides v1.

## 📍 Current State
- **Stage 1 + Stage 2 CLOSED** — 12/12 features verified done incl. the all-element capstone
  E2E; UX-hardening batch landed (type-to-edit, containment clamp, picker file-open, quota
  rescue messaging).
- **Stage 3 core INTEGRATED on main (14cfba4)**: src/export/ (site.json generator, validator
  V1–V27, byte-exact brief generator — Appendix A tests A/B/C/D green), src/export/png/
  (snapdom renderer + Linux+Windows visual baselines), scripts/roundtrip/ (external gate,
  45/45 mutation-proven). All three awaiting independent verification.
- **Contract FROZEN at v2.4** (docs/export-format.md) after 5 adversarial hardening rounds.
- 1203 unit / 514 E2E green on Windows AND Linux CI; live: frankyface.github.io/BOSS-Blueprint.

## 📂 Files I'm Working On
- staging/stage-3-export-delivery/feature-package-zip.md + feature-submit-gate.md — next build.
- staging/stage-3-export-delivery/feature-{site-json-generator,brief-generator,png-renderer}.md
  — in independent review.

## ✅ Things I've Changed
- 2026-07-28: Merge train — export-core + gate-v24-sync + png-renderer branches landed;
  .gitattributes normalization; Linux baselines via workflow_dispatch.
- 2026-07-28: Stage 2 closed (7/7 verified + capstone); UX hardening batch (3 addenda).
- 2026-07-28: Export contract frozen at v2.4; Stage 4 specs landed pre-ruled.

## ❌ Watch Out
- ONE main-tree writer at a time; reviewers in detached worktrees; branch merges via the train
  pattern (merge.renormalize is set).
- The contract is FROZEN — changes need a decisions entry + version bump + round-trip
  justification. Email relay stays LAST (Cam): submit ships with the DeliveryRelay no-op stub.
- snapdom MUST get dpr:1 + scale:1 (retina would 2× renders); the export-visual baseline gate
  hard-fails in CI by design.

## ➡️ Next Up
1. Implement feature-package-zip.md + feature-submit-gate.md (main tree; download-first,
   honeypot, V23 filler warning UI, businessName enforced at submit only).
2. Independent review of the three integrated Stage 3 core features (worktree).
3. Stage 3 close → Stage 4: harness scenarios + tour + guard + polish → three clean round-trip
   runs (docs/roundtrip-protocol.md) → launch checklist (help.md items awaiting Cam).

## 🔗 Pointer
→ Current stage folder: `staging/stage-3-export-delivery/` · Active feature files: `staging/stage-3-export-delivery/feature-package-zip.md`, `staging/stage-3-export-delivery/feature-submit-gate.md`
