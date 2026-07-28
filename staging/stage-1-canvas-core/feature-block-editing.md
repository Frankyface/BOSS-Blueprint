# Feature: Block Editing
_Stage: stage-1-canvas-core · Status: awaiting verification_

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

**Implementer run (2026-07-28):**
- `npm run lint` → exit 0, no errors/warnings.
- `npm test` → exit 0, **9 files / 129 tests passed** (4.3s). Editing-specific unit coverage:
  `canvasStore.geometry.test.ts` (move snaps 37,21 → +40,+24; off-page clamp; size/text left
  alone; unknown id and zero-delta both return the identical state object; SE resize; per-type
  minimum clamp asserted for **all six types**; NW resize pins the opposite corner) ·
  `canvasStore.test.ts` (text commit + trim + clear, delete incl. selection/editor cleanup,
  bring-forward/send-backward incl. both no-op ends, editor open/close, refuses to open an
  editor on Section/Image) · `geometry.test.ts` (the pure snap/clamp/resize maths, 44 cases) ·
  `BlockTextEditor.test.tsx` (input vs textarea, autofocus, Enter/blur commit, Escape discards,
  Shift+Enter newline, no double-commit). Every mutating action has an immutability test.
- `npm run build` → exit 0 (205.69 kB JS gzip 64.97 kB).
- `npm run e2e` → exit 0, **75 passed (35.3s)** across chromium/firefox/webkit; re-run for
  stability → **75 passed (34.4s)**.
- E2E for this feature (`e2e/block-editing.spec.ts`, 14 tests × 3 engines): click selects
  (outline + exactly 8 handles) and empty canvas deselects, re-select works · scripted drag of
  an off-grid (37,21) asserts the snapped landing spot **(120,144)** via the DOM data
  attributes, the live `boundingBox()` delta AND the store JSON · drag far off-page asserts the
  clamp · SE resize → 680×112, NW resize → (40,80) 680×112, over-shrink → the 96×40 minimum ·
  double-click → type → Enter → the committed text renders and is in the store · inline edit
  exercised on Text, Button and Nav bar (nav items re-split to 2) · Escape leaves the
  placeholder · click-away commits · overlapping blocks reordered via the toolbar with paint
  order asserted on `data-z` and on document order, screenshots attached before/after · Delete
  key removes the selection · toolbar Delete removes the selection · a combined
  add/drag/resize/type session asserted end to end.
- Firefox flake found and fixed at the root: `vite preview` could bind `::1` only while Firefox
  resolved `localhost` to `127.0.0.1` → intermittent `NS_ERROR_CONNECTION_REFUSED`. Preview host
  and `PREVIEW_BASE_URL` are now both pinned to `127.0.0.1` in `site.config.ts`. Two consecutive
  full-suite runs green afterwards.

## Open Questions
- ~~Multi-select (marquee/shift-click)~~ — OUT for Stage 1, see Notes.

## Notes & Decisions
- **Multi-select is OUT** — it did not fall out for free. Selection is a single
  `selectedBlockId: string | null`; a future multi-select would widen that to an id array and
  the store actions would take id lists.
- **Selection deliberately does not close an open inline editor.** Clearing
  `editingBlockId` from `selectBlock` unmounted the textarea during the `pointerdown` that
  preceded its own `blur`, so clicking away silently discarded what the client had typed. The
  editor now owns its own lifecycle: Enter / Escape / blur. Verified by the "clicking away
  commits the edit" E2E on all three engines.
- **Inline editing uses `<input>` (single-line) / `<textarea>` (multi-line), never
  contentEditable** — binding mitigation from the canvas-engine debate, because
  contentEditable's native undo stack would fight the store-level undo landing next.
  Enter commits, Escape discards, blur commits, Shift+Enter inserts a newline in Text blocks.
- **Delete has two routes**, per the spec: the `Delete`/`Backspace` key (window-level, ignored
  while an editor or any input has focus) and a `Delete` button in the canvas toolbar.
- **The toolbar is a strip at the top of the canvas**, not a floating badge on the block: it
  stays readable at any fit-to-window zoom, is always in the same place for the client (and for
  Playwright), and has room to name what is selected ("Heading selected").
- **Gesture fast path (perf):** while the pointer is down nothing is written to the store. The
  dragged element is previewed by writing `transform: translate3d(...)` directly (compositor
  only), a resize writes left/top/width/height directly, and the store is committed once on
  pointerup. The preview calls the same pure functions as the store action against the same
  start rect, so what the client sees is exactly what is committed. Block components are
  `React.memo`ed. See the block comment in `src/hooks/useBlockGesture.ts`.
- **Paint order = array order** in the document; `bring-forward`/`send-backward` are pure array
  swaps that return the original array on a no-op (so a future history middleware records
  nothing for a no-op).
- Resizing is bounded by the page: the west/north edges stop at the page's left/top edge and the
  east edge stops at the 1200px right edge, with the minimum-size clamp pinning the opposite
  edge so a block never slides sideways when it bottoms out.
