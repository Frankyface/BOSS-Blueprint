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

**Bounce fixes (2026-07-28):**
Applied the independent review's fix list. Status stays `awaiting verification` — the reviewer
re-verifies. All work done against the review's own findings, nothing else touched.

- **HIGH-1 (the bounce) — the app shell now owns the window, so the canvas is the only scroller.**
  `.app-shell` went from `min-height: 100%` to `height: 100%` + `overflow: hidden`, and
  `.app-header` gained `flex: 0 0 auto` (`.canvas-toolbar` and `.storage-notice` already had it).
  The failure mechanism, now recorded in a block comment in `src/App.css`: with `min-height` the
  shell was free to grow past the window, the 1600px-tall scaled page pushed `.app-shell__body`
  taller than the viewport, the DOCUMENT became the scroller and `.canvas-area__viewport
  { overflow: auto }` never scrolled at all — so one wheel gesture carried the header, palette and
  toolbar off the top, falsifying this file's own Note that the toolbar "is always in the same
  place for the client".
  - New regression spec `e2e/app-layout.spec.ts` (3 tests × 3 engines = 9), pinned to a
    **1366×768** laptop viewport via `test.use`: (a) the document is unscrollable and
    `scrollingElement.scrollTop === 0` even on an empty page (the page is 1600px tall from the
    first paint, so this never depended on content); (b) with the reviewer's six-block repro, a
    600px wheel gesture over the canvas leaves `document.scrollingElement.scrollTop === 0` and
    `scrollHeight - clientHeight <= 1`, while the canvas viewport's own `scrollTop` is asserted
    **> 0** first so the test cannot pass vacuously on a layout where nothing scrolls — then the
    header, palette and toolbar are each asserted fully inside the 1366×768 window (top, bottom,
    left and right edges), and the toolbar status + palette are asserted still visible;
    (c) three more wheel gestures plus one back up leave the toolbar's `y` unmoved to the pixel.
    Screenshot `scrolled-canvas.png` attached to the report.
  - **Regression test proven to catch the original bug**: reverting `src/App.css` to
    `min-height: 100%`, rebuilding and re-running failed all 3 tests with
    `expected 0, received 823` for the document scrollTop — the reviewer's exact symptom. Fix
    restored and re-verified green on all three engines.
  - The autosave/undo E2E specs were audited for accidental dependence on document scrolling:
    none scroll the document, all interaction goes through element clicks (Playwright scrolls the
    nearest scrollable ancestor, which is now the canvas viewport) and through `boundingBox()`
    coordinates that the change leaves untouched. All 141 tests green afterwards.

- **MEDIUM-1 — the perf probe is now a deterministic invariant, not a stopwatch.** It seeds 30
  blocks, selects the target first (so `pointerdown`'s `selectBlock` is a genuine store no-op and
  cannot pollute the count), installs a store subscriber via the new
  `startStoreWriteCounter`/`readStoreWriteCount` helpers, then asserts **0 notifications after
  pointerdown**, **0 after 60 discrete pointermoves** (up from 20), and **exactly 1 after
  pointerup** — plus the committed position `(160, 200)`. The old `elapsed < 4000ms` assertion is
  dropped: it measured Playwright's IPC round-trips rather than the app. The elapsed time is still
  measured and attached to the report as evidence (`drag-perf.txt`), just no longer a gate.

- **LOW-1 — `resizeRect` clamp-order bug fixed.** The minimum-size clamp ran after the page-edge
  clamp and silently overrode it, so a block parked at x=1176 (the furthest right `clampPosition`
  allows) could be east-resized to a right edge of **1272**, 72px outside the 1200px page Stage 3
  renders. The east branch now computes the room available to the anchored west edge and, only
  when the PAGE EDGE — not the client's own drag — is what makes the minimum unreachable, gives up
  the anchored edge and slides x left so both invariants hold. 7 new unit tests: the exact 1176
  case (→ x=1104, width=96, right edge exactly 1200), all three east-owning corners `e`/`ne`/`se`,
  an inward east drag on the same block, an ordinary shrink-to-minimum away from the edge leaving
  x untouched (the first version of the fix broke this and the existing suite caught it), a
  minimum wider than the whole page pinning x to 0, and a west-handle drag on an already
  overhanging block deliberately left free to keep overhanging.

- **LOW-2 — `ResizeHandles` comment corrected.** It claimed keyboard users resize "via the store
  actions the toolbar exposes"; the toolbar exposes stacking order, delete, undo/redo and start
  over, and there is no keyboard route to move or resize at all. The comment now says so plainly
  and names the gap. Arrow-key nudging was NOT added: each press would be its own undo step, which
  is a product decision for Cam rather than a review tidy-up.

- **LOW-3** — dead `hasEditableText` export removed from `src/constants/blockTypes.ts` (grep
  confirmed zero callers in `src/` and `e2e/`).
  **LOW-6** — `MAX_BLOCK_HEIGHT_PX` comment fixed: it now states the value is deliberately half of
  `MAX_PAGE_HEIGHT_PX` so one runaway resize cannot eat the whole page budget, instead of the
  false claim that a block is never taller than the page.

- **LOW-4 (optional, taken) — dev/test-only deep freeze of the document.** New
  `src/store/devFreeze.ts` freezes the blocks array and every block on each store change, so the
  "immutable updates only" house rule is enforced by the runtime everywhere rather than asserted
  after the fact in the tests that happen to look. Active in `vite dev`, in Vitest
  (`MODE === 'test'`) and in the `--mode test` E2E build. 4 new unit tests prove it bites rather
  than silently no-opping: the array and each block report `Object.isFrozen`, an in-place `block.x
  = 999` throws `TypeError` (ESM is strict mode), an in-place `push` throws, and a full
  add/move/resize/text/z-order/delete session still passes. **The entire existing suite passes
  with the freeze live** — real evidence that no action mutates in place.
  Bundle purity checked and fixed along the way: with the env guard hoisted into an
  `isDevelopmentLikeBuild()` helper the minifier folded the guard to `false` but left the dead
  bodies in the deployed bundle. Writing the guard inline as the function's first statement
  (exactly the `installStoreTestBridge` pattern) drops it entirely — `grep -c "Object.freeze"
  dist/assets/*.js` → **0**.

- Results: `npm run lint` → exit 0, no findings · `npx tsc -b` → exit 0 ·
  `npm test` → **17 files / 241 tests passed** (10.7s) · `npm run test:coverage` → exit 0 with the
  80% gate held (`src/canvas/**` 100% lines / 100% functions, `src/store/**` 95.93% / 96.25%) ·
  `npm run build` → exit 0, 213.74 kB JS (gzip 67.45 kB), CSS 8.05 kB, and the deployed bundle
  still greps **0** for both `__blueprintStore` and `Object.freeze` · `npm run e2e` →
  **141 passed (1.7m)** on chromium/firefox/webkit, re-run for stability → **141 passed (1.4m)**.
- Two E2E helpers were made explicitly patient rather than relying on Playwright's 5s default,
  after Firefox flaked on a page that had demonstrably loaded correctly (the failure snapshot
  showed the app fully rendered): the store-bridge readiness poll used by `openCanvas` and
  `reloadCanvas` now allows 15s, and the 10-edit undo/redo session is marked `test.slow()` — it
  runs 21 full document comparisons against both the DOM and the store, which is legitimately
  long rather than slow. No assertion was weakened; that session test also dropped one redundant
  round trip per step by polling the DOM shape (which already covers count and paint order)
  instead of asserting the count separately.

## Open Questions
- ~~Multi-select (marquee/shift-click)~~ — OUT for Stage 1, see Notes.
- Keyboard move/resize (arrow-key nudging) is a known accessibility gap — see LOW-2 above.
  Needs a product decision from Cam before it is built.

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
  Playwright), and has room to name what is selected ("Heading selected"). This only holds because
  the app shell is pinned to the window height — see the HIGH-1 bounce fix and the block comment
  in `src/App.css`. The rationale was originally written before the CSS backed it up.
- **The app shell is `height: 100%`, never `min-height`.** The canvas viewport is the one and only
  scroller in the app; the header, palette and canvas toolbar are all `flex: 0 0 auto` and never
  scroll. Regression-tested at 1366×768 in `e2e/app-layout.spec.ts`.
- **Resize: the page edge outranks the anchored edge.** When a block sits so close to the 1200px
  right edge that its type minimum will not fit, an east resize slides the block left rather than
  growing past the page. Everything past 1200 is clipped out of the Stage 3 export, so a block
  that renders on screen but not in the deliverable would be the worse outcome.
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
