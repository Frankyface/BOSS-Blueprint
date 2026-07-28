# Feature: Undo / Redo
_Stage: stage-1-canvas-core · Status: awaiting verification_

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

**Implementer run (2026-07-28):**
- `npm run lint` → exit 0, no errors/warnings (now under `recommendedTypeChecked`, see below).
- `npm test` → exit 0, **16 files / 229 tests passed** (7.9s).
- `npm run test:coverage` → exit 0 with the 80% gate enforced per glob:
  `src/canvas/**` 100% lines / 100% functions · `src/store/**` 95.76% lines / 97.36% functions.
  Gate proven to bite: temporarily raising the minimum to 99 failed the run with
  `ERROR: Coverage for lines (95.6%) does not meet "src/store/**" threshold (99%)`, then reverted.
- `npm run build` → exit 0. `dist/assets/index-*.js` 213.67 kB (gzip 67.42 kB), CSS 8.03 kB.
  `grep __blueprintStore dist/assets/*.js` → 0 matches (deploy bundle still has no test seam).
- `npm run e2e` (build + Playwright, chromium/firefox/webkit) → exit 0, **132 passed (1.2m)**,
  re-run for stability → **132 passed (1.3m)**.
- Unit coverage for this feature:
  - `src/store/history.test.ts` (17 tests): push/undo/redo semantics · no-op push returns the
    *identical* object · custom equality · redo cleared by a new push after undo · immutability of
    the input stack · `HISTORY_LIMIT >= 50` · after 100 pushes the stack holds exactly 50 and the
    oldest entries are gone · undo counted exactly 50 times after overflow · undo/redo at the ends
    return the same object · deep-equal round-trip over a scripted 10-value sequence, asserted at
    every step in both directions.
  - `src/store/canvasSession.test.ts` (27 tests) drives the REAL store through the real wiring:
    one step per mutating action · a committed drag is one step · **no history for no-ops**
    (zero-delta move, zero-delta resize, unknown-id move/delete, send-backward and bring-forward
    at the ends) · **selection and inline editing are not in history at all** · a committed text
    edit is one step · the 10-action mixed sequence (section, heading, text commit, text block,
    move, resize, button, bring-forward, delete, second text commit) undone and redone with the
    whole `blocks` array asserted `toEqual` a `structuredClone` snapshot at each of the 11 states ·
    redo cleared by a new action · replay is not itself a step · selection kept when the block
    survives and pruned when the undo removed it.
  - `src/components/CanvasToolbar.test.tsx` (13 tests): both buttons disabled on a fresh canvas,
    enabling/disabling in step with the stacks, Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z / Cmd+Z, the
    shortcut standing down while the inline editor has focus, other Ctrl combinations untouched.
- Tests proven to discriminate: deleting the `replaceDocument` call inside `applyHistory`
  (so undo updated the stack but not the document) failed 3 of the session tests; restored.
- E2E for this feature (`e2e/undo-redo.spec.ts`, 9 tests × 3 engines = 27):
  - **The 10-edit session**: add Section → add Heading → double-click and type a headline →
    add Text → 20-step drag of the Heading → SE-handle resize → add Button → bring the Section
    forward → delete the Text → type the Button label. Undo all ten, then redo all ten, asserting
    at **every** step that (a) the rendered block count matches, (b) the store JSON deep-equals the
    snapshot, and (c) the DOM `data-block-id/-type/-x/-y/-width/-height` of every block, in paint
    order, deep-equals it too — so an undo that rewinds the store without repainting fails.
    Screenshots `undo-redo-before.png` / `undo-redo-after.png` attached to the report.
  - Keyboard: Ctrl+Z undoes, Ctrl+Y and Ctrl+Shift+Z both redo.
  - One undo step per committed text edit (block stays, text returns to the placeholder).
  - Ctrl+Z inside the open editor leaves both blocks on the page and the editor open.
  - A 20-pointermove drag rewinds with a single undo.
  - No-op actions (send-backward/bring-forward on the only block, select/deselect) add no step:
    one undo then goes straight back to the empty page and disables the button.
  - A new action after undo disables redo and the document is `['heading', 'image']`.
  - **≥50 steps**: 55 blocks added, 50 × Ctrl+Z, exactly 5 blocks remain and undo is disabled.

## Open Questions
- ~~Implementation approach (snapshot stack vs patches)~~ — decided: snapshot stack, see Notes.

## Notes & Decisions
- Immutable store updates (house rule) are what make this cheap — snapshots are structural shares.
- **Snapshot stack, not patches.** `src/store/history.ts` is a pure generic `{past, present, future}`
  over the document slice; a snapshot is one `{ blocks }` object whose array is shared with the
  present, so a 50-deep stack costs 50 pointers. Patches would have bought nothing and would have
  needed a reverse-patch per action type.
- **Not a Zustand middleware.** The stack lives in its own tiny store (`editorStore.ts`) and one
  wiring module (`canvasSession.ts`) subscribes to the canvas store. A middleware would have had to
  wrap `set` and then distinguish "the client did something" from "I am replaying" *inside* the
  store; keeping it outside means `canvasStore.ts` is unchanged apart from one new action, and the
  undo semantics are testable without mounting anything.
- **History is over the DOCUMENT only** — `{ blocks }`. `selectedBlockId` and `editingBlockId` are
  deliberately excluded: undo should put the client's content back, not fight their selection.
  The subscriber's first line is `if (state.blocks === previous.blocks) return`, which is what
  makes selection changes, editor open/close **and every store no-op** free of charge — the store
  already returns the identical array for a no-op (decision recorded in feature-block-editing.md).
- **A replay is not a new action.** `undo`/`redo` set an `isReplaying` flag around the write, so
  applying a snapshot does not push it back onto the stack it came from. Autosave still runs during
  a replay, because the undone design is what should survive a reload.
- **`replaceDocument` prunes a dangling selection.** Undo can take back the very block that was
  selected; the toolbar must not point at a block that is no longer on the page. Selection is kept
  whenever the block still exists.
- **A text edit is one step for free** — `BlockTextEditor` already holds a local draft and calls
  `setBlockText` once, on Enter/blur (contentEditable was rejected in feature-block-editing.md
  precisely so its native undo stack could not fight this one). Every window shortcut stands down
  while an `<input>`/`<textarea>` has focus, so Ctrl+Z inside the editor is the browser's
  character-level undo, exactly as a client expects.
- **`HISTORY_LIMIT = 50`**, oldest dropped past that. The spec asks for "at least 50"; the constant
  is exported and both the unit and E2E tests assert against it rather than the literal.
- Ctrl+Y **and** Ctrl+Shift+Z both redo, and `metaKey` is accepted alongside `ctrlKey`, so Windows
  and Mac muscle memory both work.
