# Feature: Block Canvas
_Stage: stage-1-canvas-core · Status: not started_

## Goal
The heart of the product: a virtual web page the client populates with structured blocks from
a palette. One page only in this stage (multi-page is Stage 2).

## Block types (all six in this feature)
| Type | Renders as | Notes |
|---|---|---|
| Section | full-width background band | the horizontal strips real sites are made of |
| Heading | large single-line text | editable text |
| Text box | multi-line paragraph text | becomes a copy block in Stage 2 |
| Image slot | dashed placeholder frame with ⛰ icon | upload lands here in Stage 2 |
| Button | rounded labeled pill | nav linking lands here in Stage 2 |
| Nav bar | horizontal band of labeled items | linking in Stage 2 |

## Success Criteria
- [ ] The canvas shows a white virtual page, fixed 1200px design width, growing vertically,
      scrollable, with a fit-to-window zoom so it's fully visible on common laptop screens
- [ ] Clicking a palette item (or dragging it in) adds that block to the page at a sensible
      default size/position; all six types work
- [ ] Blocks render visually distinct per the table above, with readable default placeholder text
- [ ] Canvas state lives in a Zustand store as serializable JSON; store mutations are
      immutable (verified by unit tests on the store actions)
- [ ] 30+ blocks on a page causes no visible interaction lag (drag stays smooth)

## How We'll Verify
1. Unit: store tests — add each block type, assert state shape, assert immutability
   (previous state object unchanged after action).
2. E2E: for each of the six types — add from palette, assert it appears on the page with its
   default rendering; screenshot the populated page.
3. E2E perf probe: add 30 blocks via store, measure a scripted drag stays responsive.
4. Record outputs below.

## Verification Log
_Empty — nothing verified yet._

## Open Questions
- Exact default sizes/positions per block type — implementer picks sensible values, records
  them in Notes.
- Should Section blocks auto-stack (each new one below the last)? Lean yes — decide at build.

## Notes & Decisions
- 1200px design width is also the Stage 3 export render width — keep it a named constant.
