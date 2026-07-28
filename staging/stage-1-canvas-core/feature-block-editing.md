# Feature: Block Editing
_Stage: stage-1-canvas-core · Status: not started_

## Goal
Make arranging blocks feel like PowerPoint: click to select, drag to move, handles to resize,
snap to grid, type to edit text, delete, and control stacking order. This is where the app
earns "my mom could use it."

## Success Criteria
- [ ] Click selects a block (visible selection outline + handles); click empty canvas deselects
- [ ] Drag moves a block with an 8px grid snap; blocks can't be dragged fully off-page
- [ ] Corner/edge handles resize (min sizes enforced per block type)
- [ ] Double-click a Heading/Text/Button/Nav item → inline text editing; Enter/Escape/click-away
      commits; the committed text renders on the block
- [ ] Delete key or a toolbar button removes the selected block
- [ ] Bring-forward / send-backward controls change stacking order visibly
- [ ] All of the above works with mouse on the three evergreen browsers (Chromium, Firefox, WebKit)

## How We'll Verify
1. Unit: store tests for move/resize/text/delete/z-order actions incl. snap math and min-size
   clamping.
2. E2E (Playwright, all three engines): script a full editing session — add, select, drag to a
   known snapped position (assert coordinates), resize (assert dimensions), edit text (assert
   rendered text), reorder overlapping blocks (assert paint order via screenshot), delete
   (assert gone).
3. Record outputs below.

## Verification Log
_Empty — nothing verified yet._

## Open Questions
- Multi-select (marquee/shift-click): OUT for Stage 1 unless it falls out for free — note the
  call in Notes when made.

## Notes & Decisions
- none yet — revisit when starting.
