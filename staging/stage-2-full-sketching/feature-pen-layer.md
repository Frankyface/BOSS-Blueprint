# Feature: Pen Layer
_Stage: stage-2-full-sketching · Status: awaiting verification_

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

**Implementer run (2026-07-28):**

_Dependency:_ `perfect-freehand@1.2.3` — **MIT verified at install**
(`node_modules/perfect-freehand/LICENSE`: "MIT License · Copyright (c) 2021 Stephen Ruiz Ltd"),
zero runtime dependencies of its own.

_Files:_ `src/canvas/penThinning.ts` (distance pre-pass + RDP + rounding),
`src/canvas/penStrokes.ts` (palette, factory, parsing, add/remove/duplicate),
`src/canvas/penPath.ts` (perfect-freehand → SVG path, client→page coordinate mapping),
`src/components/PenLayer.tsx` + `.css` (the SVG overlay and the draw/erase gestures),
`src/components/PenControls.tsx` + `.css` (toolbar), `src/store/penTool.ts` (transient tool
state), `src/store/canvasStore.ts` (`addPenStroke` / `removePenStroke`),
`src/canvas/document.ts` (`withPageStrokes`, strokes on page duplicate),
`src/canvas/blueprintFile.ts` (`penStrokes` parsed with a `[]` default, site-wide id check),
`src/canvas/types.ts` (`PenStroke`, `PenPoint`, `Page.penStrokes`).

_Commands (all run on this machine, 2026-07-28):_

| Command | Result |
|---|---|
| `npm run lint` | clean, exit 0 |
| `npm test` | **619 passed** / 35 files (was 463 / 26 before this batch) |
| `npm run test:coverage` | exit 0 — `src/canvas` 99.7% lines, 99.52% funcs; `src/store` 96.96% lines, 97.14% funcs |
| `npm run build` | ✓ built, 263.19 kB (gzip 81.83 kB) |
| `npm run e2e` (×2) | **294 passed (3.1m)**, then **294 passed** — chromium + firefox + webkit |

_Unit coverage:_ `src/canvas/penThinning.test.ts` (RDP keeps corners and drops collinear runs,
epsilon boundary, one-decimal rounding, a tap becomes a two-point dot, 10k samples do not blow
the stack, an 8,000-sample scribble thins in under 250 ms); `src/canvas/penStrokes.test.ts`
(palette shape, factory, 13 rejection cases through `parsePenStroke`, unknown fields dropped,
no-op identity on remove, fresh ids on duplicate); `src/canvas/penPath.test.ts` (closed filled
outline, determinism, eraser polyline, client→page mapping under zoom, clamping);
`src/store/canvasStore.pen.test.ts` (per-page strokes, immutability, blocks untouched, duplicate
page, tool state never touches the document); `src/canvas/blueprintMedia.test.ts` (round trip; a
pre-pen-layer v2 payload parses to `[]` with `migratedFrom: null`; malformed strokes and
duplicate stroke ids across pages are corruption; `schemaVersion` stays 2).

_E2E_ (`e2e/pen-layer.spec.ts`, ×3 engines, `test.slow()` on every drawing test):
- `draws a freehand stroke that lands in the document as page coordinates` — asserts the stored
  points are thinned (<40 from ~90 samples), hex colour, positive width, and **every coordinate
  rounded to one decimal**; screenshot attached
- `keeps each page's marks on its own page, through a reload`
- `the eraser rubs out exactly the mark that was clicked` (the other stroke survives)
- `a whole stroke is exactly one undo step` (and redo restores it)
- `an erase is one undo step too`
- `with the pen out, the page stops responding to block edits` — a drag that starts **on a block**
  draws a line instead of moving it, and nothing is left selected
- `putting the pen away hands the blocks back, untouched` — the same block then drags 80×40 and
  accepts a text edit, with the mark still painted over it
- `the layer is transparent to pointers when the pen is away` — computed `pointer-events: none`,
  `z-index > 1000`, and a click reaches the block underneath
- `offers a red for notes, other colours, and two widths`; screenshot attached
- `marks are part of the design, so "start over" clears them`

**Bounce fixes (2026-07-28):**

Status stays `awaiting verification` — the reviewer re-verifies. The thinning itself is
**unchanged**: it was ruled better than the contract, and the contract is being amended to match.

- **MEDIUM-1 — page height now counts pen marks (the one code defect).** `pageHeightForRects` is
  replaced by ONE shared pure function, `pageHeightForContent(rects, strokes)` in
  `src/canvas/geometry.ts`, which Stage 3's PNG render will use as well:

      bottom = max(every block's bottom edge, every pen point's y)
      height = clamp(1600, ceilToGrid(bottom + 160), 8000)

  Rounding is UP (new `ceilToGrid`): the old `snapToGrid` rounded 1961 down to 1960 and quietly
  ate a pixel of the bottom padding. Before this, a mark drawn below the lowest block kept its
  page coordinates but fell off the bottom of the white sheet the moment that block was deleted —
  still painted (the overlay does not clip), but hanging in the grey below the page, and off the
  exported PNG entirely.
- **`penThinning.ts` header comment corrected** to state the truth plainly: a stroke is thinned
  ONCE, at commit; the in-memory strokes ARE the thinned strokes; and the export's ε = 0.75 pass
  is near-idempotent rather than a real second reduction — measured 93 points in, 94 out (RDP is
  not monotone in the count it keeps, so a wider epsilon can pick a marginally larger subset).
- **Spec amendments (§4.5 point thinning, §4.2 page height) are landing separately** — the main
  session owns `docs/`, and this batch deliberately did not touch it.

_New unit coverage_ (`src/canvas/geometry.test.ts`, `pageHeightForContent`): a mark below every
block holds the page open; the page stays open when the block that held it open is deleted;
whichever of block-bottom and mark-bottom is lower wins; every point of a stroke is read, not just
the first and last; the result is always on the 8px grid and always ≥ bottom + 160 (five awkward
values); a mark drawn absurdly far down is capped exactly as a block is.

_New E2E_ (`e2e/pen-layer.spec.ts`, ×3 engines): `a mark below the blocks keeps the page open
after the block is deleted` — stacks seven bands, scrolls the canvas, draws below them all,
deletes every band, then asserts both the page height and, independently, that the stroke's
bounding box still sits inside the white sheet's bounding box. Screenshot attached. Confirmed to
be a real fix: reverted to the block-only height, the test fails (`Expected: > 1600, Received:
1600`); restored, it passes.

_Commands (all run on this machine, 2026-07-28):_

| Command | Result |
|---|---|
| `npm run lint` | clean, exit 0 |
| `npm test` | **662 passed** / 36 files (619 before this batch) |
| `npm run test:coverage` | exit 0 — `src/canvas` 99.71% lines, 99.52% funcs; `src/store` 97.02% lines, 97.15% funcs |
| `npm run build` | ✓ built, 264.09 kB (gzip 82.10 kB) |
| `npm run e2e` (×2) | **324 passed (3.4m)**, then **324 passed (3.5m)** — chromium + firefox + webkit |

**Independent review (2026-07-28):**

Re-run from a clean checkout of 47bbacc in a detached worktree (`npm ci` from scratch, 0
vulnerabilities): `lint` clean · `test` **619 passed / 35 files** · `test:coverage` exit 0
(`src/canvas` 99.7% lines / 99.52% funcs, `src/store` 96.96/97.14 — gate 80/80) · `build`
**263.33 kB (gzip 81.87)** — the implementer's 263.19 does not reproduce · `e2e` ×2 =
**294 passed (3.4m)** then **294 passed (3.4m)**, chromium + firefox + webkit. CI green on both
312ad31 and 47bbacc, live URL 200, and the deployed bundle is sha256-identical to a local
`npm run build` (0 occurrences of `__blueprintStore`; 1 in the `build:e2e` bundle, so the grep
means something). `perfect-freehand@1.2.3` LICENSE read in the freshly installed tree: MIT,
Stephen Ruiz Ltd, zero dependencies.

_Independent probes (own Playwright + Vitest specs, since deleted):_ a hand-rolled 33-sample drag
lands as **5 stored points**, every coordinate exactly one decimal, ends at (200, 300)/(520, 310)
on chromium and (200, 299.4)/(520, 309.4) on firefox/webkit — page pixels through a fractional
scale, not client pixels — byte-identical after reload. Two pages, one mark each, distinct ids,
both surviving a reload. One undo took back exactly one of two strokes and redo restored it; an
eraser click on a recorded point of stroke B removed B and left A. Pen away: computed
`pointer-events: none` and a drag moved the block; pen out: the same drag drew, left x/y
untouched and `selectedBlockId` null. Inline text editing still commits before and after a mark
is painted over the block, and the Stage 1 pinned-chrome invariant still holds at 1366×768 with
the pen toolbar present. All ×3 engines.

_The thin-on-commit deviation, measured:_ a 240-sample scribble commits as 126 points at
**0.51px** max deviation from the raw trail; the spec's own ε=0.75 export pass on the same raw
trail gives 93 points at **0.74px**. Running the export's pass over the committed points yields
94 points / 0.743px — materially the same site.json (§4.5's "near no-op" claim holds). Worst
case over 40 random hand-like strokes: **1.09px**. **Ruling: the engineering is ACCEPTED and is
strictly better than the contract as written; the documentation was NOT** — §4.5 claimed the PNG
renders from un-thinned in-memory strokes, of which there are none.

_Also found (MEDIUM-1, reproduced):_ the editor's page height ignored strokes while §4.2 defined
`maxBottom` over blocks AND stroke point-y — a mark below the lowest block could end up painted
below the sheet after the block holding the page open was deleted.

_Deviations judged:_ thin-on-commit **accepted (code), doc amendment required**;
`simulatePressure: false` + `thinning: 0` **accepted**; two-point taps **accepted**; strokes
additive to schema v2 without a bump **accepted**.

**Status at review time: BOUNCE** — on the §4.5 doc drift and the height reconciliation, with
NO change wanted to the thinning itself. Both causes were resolved the same day: export-format
v2.2 (commit 9b52638) rewrote §4.5 to the thin-at-commit truth and unified the height formula,
and the review-fix batch (commit 21ecd72) implemented the shared
`pageHeightForContent(rects, strokes)` = clamp(1600, ceilToGrid(bottom+160), 8000) with unit +
E2E coverage (mark below blocks keeps the page open; deleting the block leaves the mark on the
sheet). Awaiting re-verification.

## Open Questions
- ~~Smoothing/simplification of stroke points (payload size)~~ **Decided at build:** a 0.75px
  distance pre-pass, then RDP at ε = 0.5px, coordinates rounded to 1 decimal (see Notes).

## Notes & Decisions
- Stage 3 export bakes strokes into the page PNGs — keep strokes renderable off-screen. **Held:**
  the layer is plain SVG inside `.canvas-page`, so a DOM capture of the page captures the marks
  with it. No canvas element anywhere (debate #1).
- **Thinning: distance pre-pass at 0.75px, then RDP at ε = 0.5px, coordinates rounded to 1
  decimal.** `docs/export-format.md` §4.5 runs RDP again at package time at **ε = 0.75px**; we
  thin TIGHTER here so the export's own pass stays a near no-op and the PNG (which §4.5 renders
  from the in-memory strokes) loses nothing visible at 1:1. **Deviation worth the reviewer's
  eye:** §4.5 describes thinning *at export* from un-thinned in-memory points; we thin on COMMIT
  instead, because the raw trail would otherwise sit in localStorage and in every autosave. The
  export contract itself is unchanged.
- **The distance pre-pass is a performance guard, not tidiness.** RDP is O(n log n) typically but
  O(n²) in the worst case, and it runs on pointerup while the client waits. Dropping samples
  closer than 0.75px bounds `n` by the stroke's length in PIXELS rather than by the pointer's
  sampling rate, so a 1000 Hz mouse costs the same as a slow tablet. Found by measurement: a
  10,000-sample zigzag took **18 s** through bare RDP; it is now milliseconds, and an
  8,000-sample looping scribble is asserted to thin in under 250 ms.
- **A tap is stored as a two-point dot.** The export schema requires `points` to have ≥ 2 entries
  (§2.9), and binning a deliberate single-tap mark is worse than duplicating its point.
- **Palette:** `#d92d20` Red (notes) — the default — plus `#1f2937` Ink, `#2f6df6` Blue,
  `#15803d` Green. Red leads because the feature's goal leads with annotation, and red is the one
  colour a builder reads as a margin note rather than as part of the design. **Widths:** 4px
  (Fine) and 12px (Bold), far enough apart to tell apart at fit-to-window zoom. Colours are
  validated by FORMAT (`^#[0-9a-fA-F]{6}$`), never by membership of the palette, so changing the
  palette later cannot make yesterday's saved design unreadable.
- **`simulatePressure: false`, `thinning: 0`.** perfect-freehand's default fakes pen pressure from
  pointer VELOCITY, which would make the stored geometry depend on how fast the client's hand
  moved and how often their browser sampled — unreproducible across engines and untestable. A
  constant-width line is also what a marker annotation should look like.
- **Strokes live IN the document (`page.penStrokes`), and this did NOT bump `schemaVersion`.**
  Additive field with a clean default: `parsePenStrokes(undefined) === []`, so a v2 payload
  written last week parses to exactly the design it described (`migratedFrom` stays `null` — it is
  not a migration). A bump means "older builds must not read this", which costs every one of them
  their client's work. Every field is validated with batch-1 rigour: non-empty id, ≥ 2 points of
  finite numbers, six-digit hex colour, width in `(0, 64]`; unknown fields are dropped rather than
  carried into the export; duplicate stroke ids **site-wide** are corruption, because §4.8 numbers
  strokes site-wide at export.
- **`role` and `targetBlockId` are deliberately NOT stored.** §4.5 computes both from pure
  geometry at package time; storing them would let derived data drift the moment a block moved
  underneath a stroke.
- **One stroke = one history step, via the gesture fast path.** While the pointer is down nothing
  reaches Zustand: the in-progress line is previewed by writing the `d` attribute of one dedicated
  `<path>` directly, and `addPenStroke` fires once on pointerup — the same rule `useBlockGesture`
  follows, for the same reason. A cancelled pointer (OS gesture, browser scroll takeover) commits
  what was drawn rather than binning it.
- **The tool's own state (mode/colour/width) is a separate store, `src/store/penTool.ts`.** The
  strokes are the client's work and belong in the document; "the pen is currently red" is the
  state of a toolbar. Keeping it out of `canvasStore` means the session subscriber can never
  mistake a colour change for a document change.
- **Picking up the pen deselects.** The overlay already swallows pointer events, but a block left
  selected underneath would keep its resize grips on screen and stay the Delete key's target — it
  would look locked and behave otherwise.
- **Off means gone: `pointer-events: none` on the whole overlay.** The strokes stay visible and
  keep painting above every block (§2.9, `z-index: 100000`), but every pointer event passes
  straight through to the block underneath. In erase mode each stroke also gets a transparent
  20px-wide polyline hit line, because the filled outline of a 4px stroke is nearly impossible to
  hit.
- **Coordinates are clamped to the page.** Pointer capture keeps delivering samples after the hand
  leaves the page, and a stroke at x = −400 is off the exported PNG entirely. Scale is derived
  from the overlay's own measured box, so a fit-to-window resize mid-stroke self-corrects.
- **Duplicating a page copies its marks with fresh ids**, exactly as it does for blocks.
