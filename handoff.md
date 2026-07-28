# Handoff — BOSS Blueprint
_Last updated: 2026-07-28 · Current stage: stage-1-canvas-core_

## 🎯 Goals
Finish Stage 1: undo/redo + autosave on top of the landed block canvas, then independent
review closes the stage and Stage 2 (full sketching) begins.

## 📍 Current State
- feature-app-scaffold: **verified done** (independent review reproduced all criteria; live
  Pages deploy byte-identical to the reviewed commit).
- feature-block-canvas + feature-block-editing: **awaiting verification** — implemented,
  129 unit / 75 E2E green ×3 engines, deployed; independent review pending.
- Both Fable debate verdicts recorded (DOM/SVG canvas · download-first delivery) and binding.
- Design assets ready in session scratchpad: export-format-draft.md (full site.json schema +
  brief.md template, rulings applied per decisions.md) and template-content-draft.md
  (4 templates × 3 pages, fromTemplate flag ruled in) — they feed Stages 2–3.

## 📂 Files I'm Working On
- staging/stage-1-canvas-core/feature-undo-redo.md + feature-autosave.md — next implementation.
- staging/stage-1-canvas-core/feature-block-canvas.md / feature-block-editing.md — in review.

## ✅ Things I've Changed
- 2026-07-28: Block canvas + editing landed (six block types, drag/snap/resize/text/z-order).
- 2026-07-28: App scaffold flipped to verified done with reviewer evidence; reuseExistingServer
  disabled (stale-server E2E hazard).
- 2026-07-27: Debate verdicts recorded; scaffold implemented + deployed; repo created.

## ❌ Watch Out
- ONE repo writer at a time: agents work the main tree solo; reviewers use detached worktrees;
  never `git add -A` while an implementation agent is mid-flight (caused commit c11d426 sweep).
- contentEditable is banned for text editing (undo-stack conflict) — binding debate mitigation.
- The test-only store seam (`window.__blueprintStore`) must stay out of the production bundle
  (CI builds twice; keep it that way).

## ➡️ Next Up
1. Opus agent: implement feature-undo-redo.md + feature-autosave.md (+ reviewer follow-ups:
   coverage tooling, typechecked eslint, CI hardening — list in scratchpad review verdict).
2. Parallel Opus review agent (worktree): verify block-canvas + block-editing.
3. On stage close: /sync-docs, then Stage 2 implementation begins (three feature batches).

## 🔗 Pointer
→ Current stage folder: `staging/stage-1-canvas-core/` · Active feature files: `staging/stage-1-canvas-core/feature-undo-redo.md`, `staging/stage-1-canvas-core/feature-autosave.md`
