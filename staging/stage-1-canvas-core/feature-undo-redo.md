# Feature: Undo / Redo
_Stage: stage-1-canvas-core · Status: not started_

## Goal
Every canvas mutation is undoable. Clients experiment fearlessly; nothing is ever "ruined."

## Success Criteria
- [ ] Ctrl+Z undoes and Ctrl+Y / Ctrl+Shift+Z redoes every mutating action: add, move, resize,
      text edit, delete, z-order (and all Stage 2 actions once they exist — pen strokes, page
      ops, uploads)
- [ ] Toolbar undo/redo buttons mirror the shortcuts and disable when their stack is empty
- [ ] History holds ≥50 steps; performing a new action after undo clears the redo stack
- [ ] A text edit is one undo step (not per keystroke)
- [ ] Undo/redo of a 10-step scripted sequence restores state exactly (deep-equal) at every step

## How We'll Verify
1. Unit: history middleware tests — push/undo/redo semantics, redo-clear rule, 50-step cap,
   text-edit batching; deep-equal state round-trip across a scripted 10-action sequence.
2. E2E: perform 10 mixed edits, undo all 10 asserting visible state at each step, redo all 10,
   assert final state matches pre-undo screenshot.
3. Record outputs below.

## Verification Log
_Empty — nothing verified yet._

## Open Questions
- Implementation approach (snapshot stack vs patches) depends on the canvas-engine verdict —
  Zustand middleware either way. Decide at build, record here.

## Notes & Decisions
- Immutable store updates (house rule) are what make this cheap — snapshots are structural shares.
