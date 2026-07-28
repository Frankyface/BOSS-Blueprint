# Feature: Block Canvas
_Stage: stage-1-canvas-core · Status: verified done_

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
- [x] The canvas shows a white virtual page, fixed 1200px design width, growing vertically,
      scrollable, with a fit-to-window zoom so it's fully visible on common laptop screens
- [x] Clicking a palette item (or dragging it in) adds that block to the page at a sensible
      default size/position; all six types work
- [x] Blocks render visually distinct per the table above, with readable default placeholder text
- [x] Canvas state lives in a Zustand store as serializable JSON; store mutations are
      immutable (verified by unit tests on the store actions)
- [x] 30+ blocks on a page causes no visible interaction lag (drag stays smooth)

## How We'll Verify
1. Unit: store tests — add each block type, assert state shape, assert immutability
   (previous state object unchanged after action).
2. E2E: for each of the six types — add from palette, assert it appears on the page with its
   default rendering; screenshot the populated page.
3. E2E perf probe: add 30 blocks via store, measure a scripted drag stays responsive.
4. Record outputs below.

## Verification Log

**Implementer run (2026-07-28):**
- `npm run lint` → exit 0, no errors/warnings.
- `npm test` → exit 0, **9 files / 129 tests passed** (4.3s). Store + geometry coverage:
  `canvasStore.test.ts` (add each type, select, delete, z-order, editing state, reset),
  `canvasStore.geometry.test.ts` (move/snap, resize/clamp), `geometry.test.ts` (44 cases:
  snap, clamps, page height, fit-to-window scale), `blockFactory.test.ts` (defaults, stacking,
  cascade, JSON round-trip), `zorder.test.ts`, `blockText.test.ts`, `BlockTextEditor.test.tsx`,
  `BlockPalette.test.tsx`, `App.test.tsx`. Immutability asserted per action (previous state
  object `toEqual` a `structuredClone` snapshot afterwards; new array identity checked).
- `npm run build` → exit 0. `dist/assets/index-*.js` 205.69 kB (gzip 64.97 kB), CSS 7.00 kB.
- `npm run e2e` (build + Playwright, chromium/firefox/webkit) → exit 0, **75 passed (35.3s)**,
  re-run for stability → **75 passed (34.4s)**.
- E2E covering this feature (`e2e/block-canvas.spec.ts`, 9 tests × 3 engines): empty white page
  at 1200px with scale 1; add one of each of the six types and assert each renders; per-type
  placeholder copy asserted; default sizes on-page; full-width bands stack; cascade separates
  repeated blocks; document JSON round-trips with exactly the 7 expected keys; fit-to-window
  zoom < 1 at a 1024px viewport; 30-block perf probe.
- Perf probe: 30 blocks seeded through the store + 1 dragged with a 20-step scripted drag;
  final position asserted exactly (160, 200); elapsed time attached to the report as
  `drag-perf.txt` (chromium locally ≈ 0.9s wall for the whole test, budget 4000 ms).
- Store seam verified BOTH ways: `__blueprintStore` absent from the `npm run build` bundle
  (grep false, and a headless load reports `typeof globalThis.__blueprintStore === 'undefined'`),
  present in the `npm run build:e2e` bundle (grep true, Playwright asserts `getState` is callable).
- Screenshots of the populated page attached to the Playwright report
  (`all-six-block-types.png`, `edited-page.png`).

**Independent review (2026-07-28):**
Re-executed from scratch in a detached worktree pinned at `c220eea` (separate checkout,
own `npm ci` — 240 packages, 0 vulnerabilities), not the implementer's tree.
- `npm run lint` → exit 0, no output.
- `npm test` → exit 0, **9 files / 129 tests passed** (4.99s). Spot-audited the assertions:
  behavioural, not theatre — immutability tests compare pre-action object to a `structuredClone`
  snapshot AND check array identity changed; `resizeBlockBy` asserts the per-type minimum for
  all six types by iterating `BLOCK_TYPES`.
- `npm run build` → exit 0, `dist/assets/index-ChTkZmJr.js` 205.69 kB (gzip 64.97 kB).
- `npm run e2e` → exit 0, **75 passed (35.4s)** across chromium/firefox/webkit (25 × 3).
- Store seam verified four ways: grep 0 in `build` bundle / 1 in `build:e2e`; runtime
  `typeof globalThis.__blueprintStore === 'undefined'` on clean build; clean build still works;
  deployed `index-ChTkZmJr.js` (same hash, same 205692 bytes) contains **0** occurrences.
- Own probes (24/24 passed): page grows 1600→4160 px at y=4000 block (= bottom+160); six types
  render distinctly; 41-block perf probe — **0 store writes between pointerdown and last of 60
  pointermoves**, exactly 1 commit on pointerup, no long task >50 ms, max inter-move gap 18.1 ms.
- Immutability at runtime: fresh array + fresh block object per action; previous array stayed
  deep-equal to its pre-action clone; zero-delta move returned the identical array.
- CI: `gh run view 30365580456` → **success**, headSha `c220eea…`; live URL → **HTTP 200**.
- Ruling: **VERIFIED DONE.** (One HIGH finding raised against the app-shell layout — recorded
  in feature-block-editing.md's log; does not falsify any criterion of this feature.)

## Open Questions
- ~~Exact default sizes/positions per block type~~ — decided, see Notes.
- ~~Should Section blocks auto-stack?~~ — yes, see Notes.

## Notes & Decisions
- 1200px design width is also the Stage 3 export render width — keep it a named constant.
  (`PAGE_WIDTH_PX` in `src/canvas/constants.ts`; nothing else hard-codes 1200.)
- **Default geometry per type** (all multiples of the 8px grid), declared in one table in
  `src/constants/blockTypes.ts` — the palette, defaults, min sizes and placeholders all read
  from it, so a type can't be half-added:

  | Type | Default x,y | Default w×h | Min w×h | Placement | Text |
  |---|---|---|---|---|---|
  | Section | 0, stacked | 1200×240 | 160×64 | stacked | none |
  | Heading | 80,120 | 640×72 | 96×40 | cascade | single-line |
  | Text | 80,240 | 640×160 | 96×48 | cascade | multi-line |
  | Image | 80,440 | 400×280 | 64×64 | cascade | none |
  | Button | 80,760 | 200×56 | 64×32 | cascade | single-line |
  | Nav bar | 0, stacked | 1200×72 | 240×40 | stacked | single-line (comma-separated items) |

- **Sections auto-stack: YES** — and the rule was widened to cover Nav bars, because both are
  full-width bands and a per-type rule would have dropped the first Section on top of the first
  Nav bar at (0,0). Rule: a new `stacked` block lands at `x = 0, y = the lowest bottom edge of
  any existing stacked block` (0 when there are none). Free-floating types instead cascade
  +24px down-right per existing block **of the same type** (wrapping after 8), so a second
  Heading never hides the first and adding a Text block isn't shifted by unrelated Headings.
- **Full-width bands are added at the BACK of the paint order**, free-floating blocks at the
  front. Adding a Section after a Heading would otherwise bury the Heading under the band.
  Paint order is simply array order in the document (index 0 = furthest back) — no z-index
  field to drift, and the whole document stays a flat serialisable array.
- Page height is derived, not stored: `max(1600, lowest block bottom + 160)` capped at 8000px.
- New blocks are created with `text: ''` and the placeholder is rendered from the type table.
  Empty string therefore means "the client has not written anything here yet", which Stage 3
  needs in order to tell real copy from filler.
- The store is exposed on `window.__blueprintStore` in dev and in the `--mode test` production
  build only (`npm run build:e2e`); the deployed `npm run build` bundle has the branch folded
  away at build time. CI now builds twice — test build for Playwright, clean build for Pages.
