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

**UX hardening (2026-07-28):**
Two interaction fixes landed here from the persona UX audit (Rosa, 54, taqueria owner). The
feature stays `verified done`; every criterion still holds, and two recorded RULES changed —
both rewritten in Notes & Decisions above.
- **MAJOR-2, off-canvas parking.** `clampPosition` now keeps a whole block on the page instead
  of a 24px sliver. Unit: `geometry.test.ts` grew the audit's exact case (a 200×56 button at
  x=−176 lands at x=0), an all-four-directions fling loop over `moveRect`, an oversized-block
  case, and the bottom edge (`y + height ≤ 8000`, previously `y ≤ 8000 − 24`).
  `canvasStore.geometry.test.ts` asserts the same through the store. E2E
  (`block-canvas.spec.ts` "a violent drag in any direction leaves the block clickable"):
  four 4000px flings, each followed by a real centre-click that must re-select the block —
  the very thing Playwright could not do before the fix.
- **MAJOR-7, inverted zoom.** `pageScaleForViewport` takes a zoom factor; `usePageScale` reads
  it from `devicePixelRatio` against the ratio latched at first measurement. Unit: a `browser
  zoom` block in `geometry.test.ts` (1.25/1.5/2× hold the fit scale steady, zooming out too,
  factor 1 is the old behaviour, hostile factors ignored, and the page never shrinks below its
  unzoomed scale as the client zooms in). Not E2E-tested: Playwright cannot change a browser's
  own zoom level, so the maths is unit-pinned and the real-window path is covered by the
  existing narrow-viewport fit test.
- New unit spec `src/hooks/useBlockGesture.test.tsx` (8 tests) pins the gesture fast path in
  jsdom: 0 store notifications through pointerdown + two moves, exactly 1 on release, the
  preview matching the commit at the page edge, and the scale divisor.
- `src/hooks/**` joined the coverage gate (80% lines/functions) — see feature-site-settings.md.
- **M1, the palette drag that did nothing — partially addressed, deliberately.** The audit's
  client's first instinct was to DRAG "Heading" onto the page; nothing happened, with no ghost,
  no drop target and not even a pressed state, and she tried twice before finding the click.
  Palette items now have an `:active` pressed state (with a `prefers-reduced-motion` opt-out),
  so the press is visible from the moment the mouse goes down and the affordance is legible.
  Drag-to-drop-at-a-point was NOT built: it needs a live drop preview mapped through the page's
  fit-to-window scale, which is a feature rather than a polish, and it belongs with the Stage 4
  onboarding work that also owns where the "click a block to drop it" line lives (audit N1).
  Recorded here so the decision is not mistaken for an oversight.
- Full green at this checkpoint: `npm run lint` exit 0 · `npm run test:coverage` exit 0,
  **43 files / 934 tests**, hooks 96.64% lines / 92.85% functions · `npm run build` exit 0 ·
  `npm run e2e` **462 passed** (154 × 3 engines), twice.

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
- **THE PAGE EDGE STOPS A BLOCK, ON ALL FOUR SIDES** (changed 2026-07-28 by the UX audit,
  MAJOR-2). `clampPosition` used to allow a block to hang off the left or right edge as long
  as a 24px sliver stayed on the page; the audit parked a 200px button at x=−176, where the
  sliver is under the palette and the block's own centre is off-page — unclickable for the
  client and for Playwright. It now keeps the WHOLE block inside the page:
  `x ∈ [0, pageWidth − width]`, `y ∈ [0, 8000 − height]`, pinning to (0,0) for anything
  bigger than the page. Two further reasons beyond reachability: the Stage 3 PNG renders
  exactly the 1200px page, so an overhang is silently cropped out of the client's brief; and
  `resizeRect` has always kept a block fully on the page, so moving was the odd one out.
  `MIN_ON_PAGE_PX` is gone with the old rule. An overhanging block is still *representable*
  (a hand-edited `.blueprint` can carry one) — `resizeRect`'s handling of that case is kept
  and tested.
- **Fit-to-window zoom is fitted to the WINDOW, not to the browser's zoom level** (changed
  2026-07-28, UX audit MAJOR-7). Ctrl+= shrinks the viewport measured in CSS pixels, so
  auto-fit re-fitted the page to the smaller number and zooming IN made the sketch smaller
  (measured 0.69 → 0.45 → 0.29 at 100/125/150%). `pageScaleForViewport(width, zoomFactor)`
  now takes how far the display's pixel ratio has moved since the app loaded and undoes it,
  so the fit scale holds and the page grows and shrinks physically along with everything else
  on screen. A real window resize leaves the factor at 1 and behaves exactly as before.
- New blocks are created with `text: ''` and the placeholder is rendered from the type table.
  Empty string therefore means "the client has not written anything here yet", which Stage 3
  needs in order to tell real copy from filler.
- The store is exposed on `window.__blueprintStore` in dev and in the `--mode test` production
  build only (`npm run build:e2e`); the deployed `npm run build` bundle has the branch folded
  away at build time. CI now builds twice — test build for Playwright, clean build for Pages.
