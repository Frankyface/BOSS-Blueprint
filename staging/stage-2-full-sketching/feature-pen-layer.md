# Feature: Pen Layer
_Stage: stage-2-full-sketching · Status: not started_

## Goal
The MS Paint half of the promise: a freehand pen over each page's blocks for annotations
("make this bigger!") and for literally sketching what an image should contain.

## Success Criteria
- [ ] Pen tool toggles the canvas into draw mode: freehand strokes render over the blocks,
      anchored to page coordinates (they scroll/zoom with the page)
- [ ] A few colors + 2 widths + an eraser (stroke-level erase is fine); strokes are undoable
- [ ] Strokes belong to their page and serialize with the design (autosave + `.blueprint` file)
- [ ] Block editing still works normally when the pen tool is off

## How We'll Verify
Unit: stroke serialization round-trip. E2E: draw strokes on two pages, switch pages (strokes
stay put), reload (persist), undo (stroke removed), erase (stroke gone). Screenshot evidence.
Record below.

## Verification Log
_Empty — nothing verified yet._

## Open Questions
- Smoothing/simplification of stroke points (payload size) — likely simple point-thinning;
  decide at build.

## Notes & Decisions
- Stage 3 export bakes strokes into the page PNGs — keep strokes renderable off-screen.
