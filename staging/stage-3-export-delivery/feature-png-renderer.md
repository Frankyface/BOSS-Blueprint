# Feature: Page PNG Renderer
_Stage: stage-3-export-delivery · Status: not started_

## Goal
Render each page to one PNG of exactly `1200 × page.height`, with the pen layer baked in and
every scrap of editor chrome removed. The PNG is the package's **spatial ground truth and the
only place the client's handwriting is readable** (`docs/export-format.md` §0.1) — if it is
wrong, blank, or the wrong size, the whole package is a lie and V6 must stop the submission.

This is the highest-risk module in Stage 3. The canvas-engine debate (`docs/decisions.md`
2026-07-27) chose hand-rolled DOM/SVG partly *because* DOM capture is testable, and it attached
binding mitigations specifically to this feature: sanity validation with retry and engine
fallback, and day-one CI visual regression across all three browser engines.

## Success Criteria

### The render contract
- [ ] Every page PNG is **exactly `1200 × page.height`** where `page.height` is the value in
      `site.json` (§4.2), at 1:1 scale — **no `devicePixelRatio` multiplication** (§4.3, ruled
      2026-07-28; revisit to 2× only as a spec revision, never as an ad-hoc toggle)
- [ ] The render is a dedicated **export root**, not a screenshot of the live editor: the editor
      page is fit-to-window scaled, carries chrome, and derives a different height (floor 1600,
      cap 8000) than the export (floor 800). The renderer sizes itself from `site.json` only
- [ ] **No editor chrome**: no selection outlines, resize handles, grid dots, hover states,
      cursors, page tabs or toolbars. White page background beneath the blocks
- [ ] **Pen layer baked in, above all blocks, exactly as drawn** — rendered from the in-memory
      `page.penStrokes`, **without** the RDP simplification `site.json` applies at ε = 0.75 (§4.5),
      so the PNG shows exactly what the editor showed. (Stage 2 already thins once on commit; the
      export's RDP pass is a second, JSON-only reduction and must not be written back into the
      strokes the renderer reads — that would make the promise "the PNG loses nothing" false by a
      round of double-thinning.)
- [ ] Empty image slots render their dashed placeholder frame + description text, as the editor
      shows them (§4.3 — the PNG must show what the client saw)
- [ ] Filled image slots render the uploaded image with its `fit`, straight from the block's
      `imageData` **data URI** — Stage 2 already stores compressed photos that way, which
      satisfies debate #1's same-origin constraint with no conversion step and removes canvas
      tainting as a failure mode
- [ ] File name `pages/<NN>-<slug>.png`, `NN` zero-padded 2-digit 1-based page order, matching
      `page.screenshot` exactly (V17 recomputes it if not)

### The clip rule (resolves the Stage 1 close-out INFO, item 8)
- [ ] **The exported page rectangle is `[0, 1200) × [0, page.height)` and the PNG is that
      rectangle, pixel for pixel.** PNG pixel `(px, py)` shows page point `(px, py)`. No scaling,
      no translation, no letterboxing, no "fit the content" mode, and the render **never widens**
      to accommodate an overflowing block. The export width IS the page
- [ ] A block with `x + w > 1200` (reachable: `clampPosition` only guarantees a 24px sliver stays
      on-page, so a dragged block's width can extend past the right edge) renders its on-page
      part and is **cut at the exact pixel column 1199** — not shrunk, not nudged left
- [ ] The same clip applies at `x < 0` and at `y < 0` (§4.3 already states the negative-y clip);
      there is no bottom clip, because `page.height` is derived from the lowest content
- [ ] Mechanically the clip is the export root's own box: `width: 1200px; height: <H>px;
      overflow: hidden`, asserted by a test on the computed style — one CSS property is the whole
      rule, and it cannot be accidentally disabled without that test going red
- [ ] The three companion behaviours live where they belong and are cross-referenced here:
      `site.json` keeps the **true** frame (`feature-site-json-generator.md`; the schema permits
      `x`/`w` past 1200 per §2.6 and the builder needs the real geometry), `brief.md` marks the
      bullet (**[N13]**, `feature-brief-generator.md`), and the validator **WARNs** (**V25**) —
      never BLOCKs, because a clipped sliver must not stop a client from submitting

### One interface, two engines
- [ ] A single exported function `renderPagePng(spec): Promise<PageRenderResult>` is the only
      way anything in the app produces a page PNG. Engines implement one small interface and are
      selected inside it; no caller ever names an engine
- [ ] **snapdom is primary, html-to-image is the API-comparable fallback** (debate #1 verdict).
      Both are MIT and both are hard dependencies — the fallback is not optional, it is the
      mitigation
- [ ] `PageRenderResult` reports `{ blob, width, height, engine, attempts, inkRatio,
      hasStrokes }`; `hasStrokes` is how the zip's compression ladder learns which pages are
      lossless-only (§4.3), so the packer never has to re-derive it

### Sanity validation, retry and fallback (binding mitigation)
- [ ] Every produced PNG passes **client-side sanity validation before packaging proceeds**:
      (a) it **decodes**; (b) its dimensions are **exactly** `1200 × page.height` — checked twice,
      once from the decoded bitmap and once by parsing the PNG IHDR bytes (a pure function,
      unit-testable without a browser); (c) it is **non-blank** by pixel variance
- [ ] Non-blank is defined, not vibes: sample the decoded image downscaled by a named
      `INK_SAMPLE_DIVISOR`, and require **at least two distinct luminance buckets** always, plus
      `inkRatio ≥ MIN_INK_RATIO` (fraction of sampled pixels differing from the page white by
      more than a named threshold) whenever the page has ≥1 block. A near-empty page is a V9
      WARN, not a renderer failure — the check must not punish it
- [ ] **Ladder: primary → primary retry → fallback engine → V6 BLOCK.** The retry first awaits
      `document.fonts.ready` and one animation frame (the classic cause of a blank or
      wrong-font capture); the fallback runs the other engine on the same export root; a failure
      after all three attempts raises V6 with the client-facing "export hiccup, try again"
      wording and the engine/attempt detail for the console
- [ ] A guard rejects impossible geometry before rendering: `page.height > MAX_SAFE_RENDER_HEIGHT_PX`
      fails sanity rather than silently producing a truncated or empty canvas

### CI visual regression across the three engines (day-one, binding)
- [ ] A committed fixture design renders in chromium, firefox and webkit, and each engine's
      output is compared against **its own committed baseline** with a small pixel tolerance
- [ ] Plus a **cross-engine** assertion no per-engine baseline can give: the three engines agree
      on exact dimensions, and their `inkRatio` values lie within a named tolerance band of each
      other — this is what catches "WebKit rendered half the page" on the first run
- [ ] Baselines are per Playwright project **and** platform (Playwright's own suffixing); a
      missing baseline fails loudly rather than passing silently

## How We'll Verify

1. **Unit (`npm test`)** — the pure halves, in jsdom:
   - `src/export/png/pngHeader.test.ts` — IHDR parsing returns `{ width, height }` for committed
     1×1, 1200×800 and 1200×12056 fixture PNGs; rejects a truncated file and a non-PNG signature.
   - `src/export/png/sanity.test.ts` — `assessInk(sampledPixels)` on synthetic buffers: all-white
     → blank; one dark pixel in 1200×800 sampled → `inkRatio` above/below `MIN_INK_RATIO` at the
     boundary; a two-tone buffer passes the distinct-bucket check, a solid non-white one fails it.
   - `src/export/png/exportRoot.test.tsx` — renders the export root for a fixture page with
     React Testing Library and asserts: computed `width: 1200px`, `height: <§4.2 value>px`,
     `overflow: hidden`; no element carrying the selection/handle/grid class names is present; a
     block with `x: 1000, w: 400` is present in the DOM at its **true** left/width (the clip is
     the container's job, and the JSON's job is to keep the truth).
   - `src/export/png/renderLadder.test.ts` — the ladder with both engines stubbed: primary blank
     → retry called once → still blank → fallback called → result reports
     `{ engine: 'html-to-image', attempts: 3 }`; all three failing raises a V6 finding; a
     first-attempt success never calls the fallback.
2. **E2E render + sanity (`npm run e2e`)** — `e2e/export-png.spec.ts`, ×3 engines: seed the
   fixture design through the test-only store seam, submit, capture the download, unzip with
   `fflate`, and for every entry under `pages/`: assert the IHDR dimensions equal
   `1200 × page.height` from the same zip's `site.json`; assert the file decodes in the browser;
   assert `inkRatio` above the floor. Assert the entry names are exactly
   `pages/01-<slug>.png … pages/NN-<slug>.png` in page order.
3. **E2E clip rule** — `e2e/export-png-clip.spec.ts`, ×3 engines: seed a page containing a block
   dragged to `x = 1000, w = 400` (right edge 1400) and a heading at a known y. Assertions:
   (a) the PNG is still exactly 1200 wide; (b) `site.json` still reports `frame.x = 1000,
   frame.w = 400`; (c) the rendered pixel column 1199 carries the block's fill while column 0 of
   a hypothetical wider render never existed — verified by drawing the exported PNG into a canvas
   and sampling `(1199, midY)` (block colour) and `(1150, midY)` (block colour) versus a control
   page without the block (white); (d) `brief.md` contains the [N13] marker for that block;
   (e) the validation report contains V25 as a WARN and the submission still completed.
4. **Visual regression (`npm run e2e`)** — `e2e/export-visual.spec.ts`, ×3 engines: take the
   exported PNG bytes, render them back into a blank page as an `<img>` at natural size, and
   `expect(locator).toHaveScreenshot('export-<slug>.png', { maxDiffPixelRatio: 0.02 })`.
   Screenshotting the **decoded artifact** (not the live DOM) is what makes this a test of the
   export path rather than of the editor. Cross-engine assertion in the same spec: dimensions
   identical across projects, `inkRatio` within the tolerance band (values written to
   `test-results/export-ink.json` and compared by a final serial test).
5. **Perf probe** — the same E2E records wall time for rendering the 4-page fixture per engine
   and attaches it to the report; budget stated and asserted so a regression is caught, not
   admired.
6. **Fallback path exercised for real** — a Playwright test that neuters the primary engine at
   runtime (stub its module export via an `?export-engine=fallback` query the app honours **in
   the `--mode test` build only**, same pattern as the store seam) and asserts a complete,
   sane, correctly-sized package still comes out. The Stage 3 DoD's "fallback path exercised"
   is not satisfied by unit stubs alone.
7. Record commands, exit codes, dimensions, ink ratios, timings and the baseline paths below.

## Verification Log
_Empty — nothing verified yet._

## Open Questions
- **`MAX_SAFE_RENDER_HEIGHT_PX` value.** Worst case reachable in the editor: `clampPosition`
  allows `y ≤ MAX_PAGE_HEIGHT_PX − 24 = 7976` and `MAX_BLOCK_HEIGHT_PX = 4000`, so
  `maxBottom ≤ 11976` and §4.2 gives `height ≤ 12056` (1200 × 12056 = 14.5 Mpx — inside every
  desktop engine's canvas limits, but not by a wide margin on WebKit).
  **Recommendation:** `MAX_SAFE_RENDER_HEIGHT_PX = 12160` (the reachable worst case plus one
  8px row of slack), with the derivation in the constant's comment and a unit test asserting
  `deriveExportHeight(worstCaseDocument()) ≤ MAX_SAFE_RENDER_HEIGHT_PX` so the two can never
  drift apart. Exceeding it fails sanity → V6, which is honest; silently truncating is not.
- **Does the editor's 8000px page cap need to follow §4.2?** A block dragged to y=7900 with
  h=200 sits partly below the editor's own page background but inside the exported page. The
  divergence is cosmetic (the block still renders), and §4.2 is the binding contract.
  **Recommendation:** leave both formulas alone, keep them in separate named constants, and note
  the divergence in `feature-site-json-generator.md` — do not "fix" one to match the other.
- **Pen legibility at 1× is a known revisit trigger** (`docs/decisions.md` 2026-07-28 export
  rulings; `docs/roundtrip-protocol.md` §10.5). Scenario A's `BIG!` annotation is the empirical
  probe. **Recommendation:** do not pre-emptively raise the scale; if the Stage 4 S6/legibility
  score fails twice, that is the evidence the 2× revisit needs, and it lands as a spec revision.
- **Rasterize-pen escape hatch** (debate #1's ladder) stays unbuilt until stroke count actually
  janks. Note it, do not build it (YAGNI).

## Notes & Decisions
- **Binding contract:** `docs/export-format.md` §4.3 (the PNG render contract), §0.1 (what the
  PNG does and does not carry), §5 V6 (dimension + decode + variance, BLOCK after retry and
  fallback), §1 (file naming). `docs/decisions.md` 2026-07-27 canvas-engine verdict (snapdom
  primary, html-to-image fallback, sanity validation, day-one tri-engine visual regression) and
  2026-07-28 export rulings (1× render).
- **Why the export root is a separate mount, not the live canvas.** The editor page is scaled by
  fit-to-window, wrapped in scrolling containers, decorated with handles and the grid, and sized
  by a different height formula. Capturing it would mean fighting all four with CSS overrides at
  capture time — the exact kind of silent drift the visual-regression tests exist to catch. The
  export root instead re-mounts the **same** block components in `mode="export"` at 1:1 into an
  offscreen container (`position: fixed; left: -20000px; top: 0` — laid out, so capture works;
  never `display: none`, which has no layout, and never `visibility: hidden`, which some capture
  paths render as blank).
- **The clip is one CSS property on purpose.** `overflow: hidden` on a `1200 × H` root gives the
  contract's rectangle exactly, needs no per-block maths, and is asserted directly by a computed
  style test. Any cleverer scheme (per-block clamping, scaling to fit, widening the canvas) would
  either lose the client's real geometry or break the "PNG is 1200 wide" invariant that V6, the
  brief's responsive rules and the Stage 4 comparison all depend on.
- **Clipping is a WARN, not a BLOCK, and that is Cam's ruling.** A block hanging 20px past the
  right edge is a normal sketching accident; refusing the submission over it would be hostile.
  The package tells the truth three ways instead: true geometry in the JSON, a clipped picture,
  and a sentence in the brief telling the builder what happened.
- **`document.fonts.ready` before every attempt.** Text rendered with a fallback font is the most
  likely *silent* corruption — it passes dimensions and variance checks while showing the client
  something they never saw.
- **Same-origin data URIs only** for images inside the export root (debate #1's constrained style
  vocabulary). It removes canvas tainting as a failure mode entirely and makes both engines
  behave the same.
- **The renderer owns `hasStrokes`.** §4.3 permits lossy rungs of the size ladder only on
  stroke-free pages; the packer should obey a flag it was handed, not re-derive a rule it might
  re-derive differently.
- **The visual-regression baselines are per engine because the engines legitimately differ**
  (font hinting, anti-aliasing). Per-engine baselines catch regressions *within* an engine; the
  cross-engine ink-ratio band is what catches a whole engine going wrong. Both are needed —
  either alone has a blind spot the other covers.
- **Test seams stay out of production** (`handoff.md` Watch Out). The engine-forcing query
  parameter is folded away in `npm run build`, exactly like `window.__blueprintStore`, and CI
  greps the production bundle to prove it.
