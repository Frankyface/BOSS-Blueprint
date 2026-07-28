# Feature: Block Editing
_Stage: stage-1-canvas-core · Status: verified done_

## Goal
Make arranging blocks feel like PowerPoint: click to select, drag to move, handles to resize,
snap to grid, type to edit text, delete, and control stacking order. This is where the app
earns "my mom could use it."

## Success Criteria
- [x] Click selects a block (visible selection outline + handles); click empty canvas deselects
- [x] Drag moves a block with an 8px grid snap; blocks can't be dragged fully off-page
- [x] Corner/edge handles resize (min sizes enforced per block type)
- [x] Double-click a Heading/Text/Button/Nav item → inline text editing; Enter/Escape/click-away
      commits; the committed text renders on the block
- [x] Delete key or a toolbar button removes the selected block
- [x] Bring-forward / send-backward controls change stacking order visibly
- [x] All of the above works with mouse on the three evergreen browsers (Chromium, Firefox, WebKit)

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

**Stage-close review (2026-07-28):**
Independent re-verification at `abba415` in a detached worktree, dependencies installed from
scratch (`npm ci`, 0 vulnerabilities). No repo file was modified.
- `npm run lint` → exit 0, no findings · `npm test` → exit 0, **17 files / 249 tests** (14.24s) ·
  `npm run test:coverage` → exit 0, `src/canvas/**` 100% lines / 100% functions,
  `src/store/**` 96.24% / 95.34% against the 80% gate · `npm run build` → exit 0,
  214.19 kB JS (gzip 67.57 kB), CSS 8.05 kB, and `grep -c` on `dist/assets/*.js` → **0** for both
  `__blueprintStore` and `Object.freeze`.
- `npm run e2e` run twice back to back → exit 0 both times, **141 passed (1.6m)** twice,
  identical per spec file (app-layout 9 · autosave 30 · block-canvas 27 · block-editing 42 ·
  shell 6 · undo-redo 27). Zero retries, zero flakes.
- **HIGH-1 re-verified with an independent probe, proven to discriminate.** At 1366×768 with the
  six-block repro and a 600px wheel over the canvas: `document.scrollingElement.scrollTop = 0`,
  canvas viewport `scrollTop = 600`, header `(0,0,1366×64)`, palette `(0,64,240×704)` and toolbar
  `(240,64,1126×47)` all fully inside the window on chromium/firefox/webkit. Re-injecting the
  pre-fix rule at RUNTIME (`page.addStyleTag`, no repo file touched) reproduced the original
  failure exactly — `documentScrollTop` **711 / 711 / 823**; WebKit's 823 is the original
  reviewer's symptom to the pixel. The fix and `e2e/app-layout.spec.ts` are both real.
- **MEDIUM-1 re-verified: the perf assertion is the genuine invariant.** The spec seeds 30
  blocks, selects first (re-select returns identical state, canvasStore.ts:111, keeping the
  count clean), then asserts 0 notifications after pointerdown, 0 after 60 pointermoves, exactly
  1 after pointerup, plus the committed (160,200). Proven live with an independent subscriber:
  20 mid-drag moves → 0 notifications; a deliberately injected `addBlock` mid-gesture → 1.
- **LOW-1 re-verified through the UI:** heading parked at x=1176 narrowed to 96px minimum,
  east-handle dragged with a real mouse → committed **x=1104, width=96, right edge exactly
  1200**; `e`/`ne`/`se` outward all land at 1200 with width ≥ 96; ordinary shrink away from the
  edge leaves x=80 untouched. All three engines.
- LOW-2/3/6 spot-checked in source; LOW-4 deep freeze confirmed live (suite green with freeze
  active; production bundle greps 0 for `Object.freeze`).
- Bookkeeping corrections: `geometry.test.ts` is **47** tests at this SHA (was **39**, not 44,
  at `77021c4`); commit `e0ccaf7` added **8** test cases from 6 `it` declarations (one
  `it.each`); the Bounce-fixes figures (241 tests / 213.74 kB) were correct at `0aa70e2` and are
  superseded by 249 / 214.19 kB at `abba415`.
- CI green for this SHA (run `30374106775`, headSha `abba4153…`, both jobs success). Live URL
  200; deployed `index-CV061eX6.js` byte-identical (SHA256 `b9f53b3f…23d5d`) to a local
  `npm run build` of this commit.
- **Verdict: VERIFIED DONE.**

**UX hardening (2026-07-28):**
The persona UX audit's single most damaging moment lived in this feature, and the fix landed
here. Status unchanged (`verified done`); one recorded rule — what a printable key does with a
block selected — is new, and is written into Notes & Decisions below.
- **MAJOR-3, keystroke fallthrough.** With a block selected and no editor open, keystrokes fell
  through to the browser: the space bar in "Taqueria Rosa" scrolled the canvas 434px behind a
  scrollbar that renders 0px wide, so the client's page looked empty and her work looked
  deleted. A printable character now opens the inline editor on any block that has words and
  carries that character in as the start of the edit (PowerPoint/Keynote/Figma behaviour);
  blocks with no text do nothing, but the space bar is swallowed for them too, because the
  scroll is the harm. `beginTextEdit` (`src/store/textEditing.ts`) is now the one door into
  editing — double-click and type-to-edit both go through it.
- **MAJOR-4, Backspace mid-thought.** Delete/Backspace still delete the selected block, and
  still only while no editor is open — but the dangerous case is now covered by the fix above:
  typing a letter opens the editor, so the Backspace after it edits the text instead of
  destroying the block. Asserted in both the unit and the E2E spec.
- **ONE UNDO STEP.** The seeding keystroke goes into the editor's LOCAL draft, never the store;
  the draft reaches the store once, on Enter or blur. E2E asserts a single undo returns the
  heading to empty (not to "Taqueria Ros", not to no block).
- **MINOR/M6, chrome clipping below 1280px.** `.page-strip__actions` and
  `.canvas-toolbar__actions` were `flex: 0 0 auto`, so a wrapped line stayed as wide as its
  content: measured at 1024×768, the page-strip actions were 485px inside a 480px strip and
  "Delete page" ran 17px under the details panel, which paints over it. Both groups are now
  `flex: 0 1 auto` + `min-width: 0` and wrap internally.
- Evidence — unit: new `src/hooks/useCanvasKeyboard.test.tsx` (25 tests: every text-bearing type
  seeds, every named/modified key stands down, space swallowed on non-text blocks, the
  mid-thought Backspace, and keys aimed at another field ignored) and 4 new cases in
  `BlockTextEditor.test.tsx` (the seed replaces the old words, carries through to one commit,
  is consumed so the next double-click opens on the block's own words, and is dropped when the
  block cannot open an editor).
- Evidence — E2E: `block-editing.spec.ts` "typing at a selected block" (5 tests × 3 engines):
  types the audit's own sentence and asserts `scrollTop` never moved; one-undo-step; Backspace
  mid-thought; an image block ignores letters but still swallows Space; typing replaces the
  existing words. `app-layout.spec.ts` "narrow desktop windows" (3 sizes × 3 engines): every
  one of the 12 chrome controls is on screen, clear of the details panel, and really clickable
  at 1280×800, 1100×800 and 1024×768.
- **Decided and recorded:** the canvas viewport is NOT made unscrollable from the keyboard while
  something is selected. Space and the arrow keys are how a keyboard client scrolls a 1600px
  page; taking that away to fix a mis-aimed keystroke trades one trap for a worse one. Only the
  keys we consume are swallowed, only with a block selected, only with no editor open. (Arrow
  keys still scroll rather than nudging the block — the accessibility gap in Open Questions is
  unchanged and still needs Cam's decision.)

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
- **TYPE-TO-EDIT** (added 2026-07-28, UX audit MAJOR-3/4). With a block selected and no editor
  open, a printable character (`event.key.length === 1`, no Ctrl/Cmd/Alt) opens the inline
  editor on any text-bearing block and becomes the first character of the edit, replacing what
  was there — the same result as double-clicking (which selects the old text) and typing. On a
  block with no words it does nothing, EXCEPT that the space bar is still swallowed, because
  an un-swallowed space scrolls the canvas and reads as "my work disappeared". The keystroke
  lands in the editor's local draft, so a typed sentence is still exactly one undo step.
  Entry point: `beginTextEdit(blockId, seed)` in `src/store/textEditing.ts`, which both the
  keyboard and the double-click go through.
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
