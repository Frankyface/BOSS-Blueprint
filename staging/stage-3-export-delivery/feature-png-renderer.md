# Feature: Page PNG Renderer
_Stage: stage-3-export-delivery · Status: awaiting verification_

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
      page is fit-to-window scaled and carries chrome. The HEIGHT is not a difference between them
      — §4.2 v2.2 gave both **one shared function**, `clamp(1600, ceil((bottom+160)/8)*8, 8000)`,
      and the renderer calls the shipped `pageHeightForContent` rather than a second formula. The
      renderer sizes itself from `site.json` only
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
- [ ] A block with `x + w > 1200` (still reachable — **not** by dragging: `clampPosition` now
      enforces full containment, so no gesture in the editor can push a block past the right edge.
      An IMPORTED `.blueprint` file can carry any geometry it likes, and that is the case this rule
      exists for) renders its on-page part and is **cut at the exact pixel column 1199** — not
      shrunk, not nudged left
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

### 2026-07-28 — implementer evidence (branch `stage3-png-renderer`)

Worktree `C:\Users\Cam\AppData\Local\Temp\bp-s3png-wt`. E2E ran against a worktree-local
Playwright config identical to `playwright.config.ts` except the preview port (4273 instead of
4173) — another agent held 4173. Baselines land in the repo path either way.

**Files**

| Path | What it is |
|---|---|
| `src/export/png/constants.ts` | every named number: `MAX_SAFE_RENDER_HEIGHT_PX`, `INK_SAMPLE_DIVISOR`, `MIN_INK_RATIO`, the luma thresholds |
| `src/export/png/types.ts` | `PageRenderResult`, `PngRenderError` (carries `finding: 'V6'`), `RENDER_HICCUP_MESSAGE` |
| `src/export/png/pngHeader.ts` | pure IHDR parser (the browser-free half of V6's dimension check) |
| `src/export/png/sanity.ts` | `assessInk`, `checkPngSanity`, `checkRenderableHeight` — all pure |
| `src/export/png/exportRoot.tsx` | the dedicated export root: 1200 × H, `overflow: hidden`, blocks + baked pen layer |
| `src/export/png/mountExportRoot.tsx` | offscreen React mount (`position: fixed; left: -20000px`, `flushSync`) |
| `src/export/png/renderLadder.ts` | primary → retry → fallback → V6, ports injected |
| `src/export/png/renderPagePng.ts` | the public `renderPagePng(document, pageId)` |
| `src/export/png/engineOrder.ts` | snapdom-first order + the folded-away `?export-engine=fallback` seam |
| `src/export/png/pngTestBridge.ts` | folded-away `window.__blueprintRenderPagePng` seam for Playwright |
| `src/export/png/index.ts` | public surface (no engine is nameable through it) |
| `src/export/png/fixtures/pngFixtures.ts` | three real PNGs (1×1, 1200×800, 1200×12056) as base64 |
| `src/platform/browserPngPorts.ts` | the browser adapter: snapdom, html-to-image, decode, sample |
| `src/components/ImageSlotFace.tsx` | the image slot's face, split out of `ImageSlot` and shared with the export |
| `src/components/BlockContent.tsx` | +`mode?: 'edit' \| 'export'` (the only production file changed for the export) |
| `e2e/support/exportPng.ts` | the fixture design, the seam, IHDR-in-Node, pixel sampling |
| `e2e/export-png.spec.ts` · `export-png-clip.spec.ts` · `export-png-fallback.spec.ts` · `export-visual.spec.ts` | ×3 engines |
| `e2e/export-visual.spec.ts-snapshots/*.png` | six committed baselines (2 pages × 3 engines, win32) |

**Commands and results**

| Command | Result |
|---|---|
| `npm ci` | 254 packages, 0 vulnerabilities |
| `npm install @zumer/snapdom@2.23.1 html-to-image@1.11.13` | both **MIT**, verified in `node_modules/*/LICENSE` and `npm view` |
| `npm run lint` | clean |
| `npx tsc -b` | clean |
| `npm test` | **860 unit tests across 46 files, all pass** — 55 of them new (6 files under `src/export/png/`) |
| `npm run test:coverage` | exit 0; `src/export/png` **94.84% stmts / 96.13% lines**; global 80.4% stmts |
| `npm run build` | 295.11 kB — seam **absent**: `__blueprintRenderPagePng`, `export-engine`, `snapdom` all grep-negative |
| `npm run build:e2e` | 467.53 kB — all three grep-**positive** |
| full E2E ×3 engines, runs 1–4 | **454 passed, 2 skipped** every time (4.1 / 4.5 / 4.1 / 4.0 min) |
| the 4 new specs alone, ×3 engines, ×4 | **52 passed, 2 skipped** every time |

The 2 skips are the cross-engine test declining to run a second and third time — it drives all
three engines itself from the chromium project (see Notes).

**One flaky run, chased down.** An early four-spec run failed two Firefox tests. It did not
reproduce in isolation or in four repeats, so the cause was pinned by deliberately overloading the
machine: at `--workers=14` the suite fails with `Test timeout of 30000ms exceeded` — and the
casualties are **pre-existing** specs (`autosave.spec.ts` ×4, `pen-layer.spec.ts` ×1, none of the
export ones), alongside a Firefox `RenderCompositorSWGL` crash annotation. So the mechanism is
worker contention against Playwright's 30 s default test timeout, a property of the whole suite on
this hardware, not of the renderer. CI runs `workers: 1`, where the spike cannot happen. The one
contribution this feature made to it — the cross-engine test launching three extra browsers with
`Promise.all` — was removed: it now launches them one at a time.

**Measured render evidence** (per page: wall time, PNG bytes, ink ratio)

| Page | chromium | firefox | webkit |
|---|---|---|---|
| `page-home` (1200×1600) | 172 ms · 80 512 B · 0.2812 | 176 ms · 34 798 B · 0.2794 | 948 ms · 33 689 B · 0.2772 |
| `page-gallery` (1200×1600) | 91 ms · 55 684 B · 0.0731 | 82 ms · 18 942 B · 0.0719 | 758 ms · 16 673 B · 0.0718 |
| `page-clip` (1200×1600) | 117 ms · 56 540 B · 0.0130 | 74 ms · 18 664 B · 0.0120 | 652 ms · 17 236 B · 0.0119 |
| `page-clip-control` (1200×1600) | 88 ms · 53 244 B · 0.0047 | 48 ms · 16 727 B · 0.0036 | 639 ms · 15 577 B · 0.0036 |
| **four-page total** | **489 ms** | **537 ms** | **4457 ms** |

Every render: `engine: 'snapdom'`, `attempts: 1`, IHDR **and** decoded bitmap both `1200 × 1600`.
Forced-fallback runs (`?export-engine=fallback`) produce `engine: 'html-to-image'`, `attempts: 1`,
same dimensions, same clip, pen layer present.

**How each Success Criterion was shown**

- Dimensions at 1× — `export-png.spec.ts` "every page renders at exactly 1200 × its §4.2 height,
  twice measured": decoded bitmap **and** IHDR bytes, all 4 pages, all 3 engines.
- Dedicated export root, not the live editor — `exportRoot.test.tsx` (computed `width`/`height`/
  `overflow`), plus "no editor chrome survives into the picture", which selects a block (outline +
  8 handles on screen) and renders anyway.
- Pen baked in above blocks, as drawn — `export-png.spec.ts` "pen strokes are baked in where they
  were drawn": pixel at a stroke coordinate is ink, pixel below it is paper. Visible in the
  committed baselines.
- Empty slot placeholder + filled slot photo — same spec, plus both baselines.
- Clip rule — `export-png-clip.spec.ts`: PNG still 1200 wide with a block at `x:1000 w:400`;
  columns 1150 and **1199** carry the block's near-black fill; the same two pixels on the control
  page are paper; the document still reports `x:1000 w:400`.
- One interface, two engines — `renderLadder.test.ts` (12 tests) + `export-png-fallback.spec.ts`.
- Sanity + retry + fallback — `sanity.test.ts` (15) + `renderLadder.test.ts`: blank → retry →
  fallback → `PngRenderError{ finding: 'V6' }`; ink floor not enforced on a block-free page.
- Tri-engine visual regression — `export-visual.spec.ts`: six committed baselines at
  `maxDiffPixelRatio 0.02`, plus a cross-engine test asserting identical dimensions and ink ratios
  within 25% of the median.

**Not done here, by scope**: V6's "PNG count equals page count", the `pages/<NN>-<slug>.png`
naming, [N13] in the brief and the V25 WARN all belong to `feature-package-zip.md`,
`feature-brief-generator.md` and `feature-site-json-generator.md` — this feature renders one page
and reports `hasStrokes`; it does not name or count files. The clip spec asserts the document half
of "the JSON keeps the truth" against the store, because the `site.json` generator is a sibling
branch.

**Blocker for `verified done`**: the committed baselines are `-win32`. CI runs `ubuntu-latest`, so
the first CI run **will fail loudly** with "snapshot doesn't exist" for six files (which is what
the spec asks a missing baseline to do). Linux baselines must be generated once — no Docker or
WSL on this machine to produce them here. See Open Questions.

## Open Questions

- **RESOLVED 2026-07-28 — `MAX_SAFE_RENDER_HEIGHT_PX = 12160`**, as recommended below, with the
  derivation in the constant's comment and `sanity.test.ts` asserting
  `pageHeightForContent(worstCase) ≤ MAX_SAFE_RENDER_HEIGHT_PX` **and** that the unclamped worst
  case still clears it, so raising `MAX_PAGE_HEIGHT_PX` later cannot silently walk past the
  ceiling. Note the shipped §4.2 function clamps at 8000, so today's reachable maximum is 8000 —
  the ceiling is headroom, not a live limit.
- **RESOLVED 2026-07-28 — the export floor is 1600, not 800.** This file's Success Criteria say the
  export derives "floor 800" where the editor uses 1600. That predates §4.2 v2.2's **one shared
  height function** ruling, which `docs/export-format.md` v2.3 states plainly:
  `clamp(1600, ceil((bottom+160)/8)*8, 8000)` for both. The implementation calls the shipped
  `pageHeightForContent` — one function, no second formula — which is what makes "exactly as the
  editor shows it" literally true. **The stale "floor 800" wording in the Success Criteria was
  struck when the renderer merged to main (2026-07-28).**
- **OPEN, and the one thing blocking `verified done` — Linux visual baselines.** Playwright suffixes
  baselines with the platform; the six committed ones are `-win32` and CI is `ubuntu-latest`, so
  the first CI run fails with "A snapshot doesn't exist". Neither Docker nor WSL is available on
  this machine, so they cannot be produced here. Options, in order of preference: (1) one
  `workflow_dispatch` run with `--update-snapshots` and commit the six `-linux` files; (2) run the
  suite once in the `mcr.microsoft.com/playwright` image on any Linux box; (3) if Cam decides CI
  is the only platform that matters, delete the `-win32` set and keep `-linux` only. Do **not**
  "fix" it by dropping the platform suffix — win32 and linux genuinely rasterize text differently
  and a shared baseline would be permanently red or uselessly loose.
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

### Implementation calls (2026-07-28)

- **Reused components, not a render-only clone — with one deliberate split.** `BlockContent` gained
  `mode?: 'edit' | 'export'` (default `edit`) and the export root re-mounts it, so both renders go
  through one component and one stylesheet. The single place the modes differ is the image slot's
  upload chrome, so `ImageSlot` was split: `ImageSlotFace` (the photo, or the dashed placeholder
  plus the client's description) is now shared, and `ImageSlot` supplies the picker button, file
  input and drop handlers as props around it. `BlockView` itself is NOT reused — it exists to wire
  gestures, selection and resize handles to the store, all of which the export must not have; the
  export root re-creates only its positioned wrapper with the same classes and data attributes,
  which is what makes the CSS match without a second stylesheet. Net effect: the export root
  subscribes to no store at all, so it is testable in jsdom with no fixtures beyond a `Page`.
- **Dependencies:** `@zumer/snapdom@2.23.1` (MIT, ZumerLab) and `html-to-image@1.11.13` (MIT, W.Y.).
  Licenses read out of the installed `LICENSE` files, not just the registry metadata. Together they
  add ~172 kB raw / ~55 kB gzip; today they tree-shake out of `npm run build` entirely because
  nothing in the app calls `renderPagePng` yet — **the production bundle will grow by roughly that
  much when the submit flow wires it in**, which is expected, not a surprise to discover later.
- **Engine options that matter.** snapdom: `scale: 1` **and** `dpr: 1` — without `dpr` it inherits
  `devicePixelRatio` and silently renders 2× on a retina screen, failing every dimension check;
  `cache: 'disabled'` so the retry rung is a real re-render rather than a replay of a cached style
  map; `embedFonts: false` because every font in the constrained vocabulary is a system font.
  html-to-image: `pixelRatio: 1` (the same 1× rule), explicit `width`/`height`, `cacheBust: false`,
  `skipFonts: true` (there is no `@font-face` rule in this app to embed).
- **Variance implementation.** `assessInk` restates the round-trip gate's definition verbatim
  (`scripts/roundtrip/README.md` note 5, `scripts/roundtrip/lib/png-inspect.mjs`): BT.709 luma,
  8-wide buckets, **blank iff variance < 1.0 AND fewer than 3 distinct buckets**. On top of that
  shared floor the app adds ≥ 2 distinct buckets always (a solid grey page has one bucket and no
  variance — a variance-only rule would pass it) and `inkRatio ≥ 0.0001` only when the page has
  blocks. `MIN_INK_RATIO` is derived from the smallest block the editor allows (96 × 40 on a
  1200 × 1600 page ⇒ ~0.03% ink) and set three times below it: the gate exists to catch a white
  capture, not to punish a sparse page, which is V9's WARN. Alpha is composited onto white before
  measuring, so a transparent capture reads as blank rather than as black.
- **The downscale is box-filtered, not point-sampled.** `INK_SAMPLE_DIVISOR = 4` with
  `imageSmoothingQuality: 'high'`: a 2px glyph stem or a fine pen stroke can hide between the
  columns of a nearest-neighbour sample, and averaging turns it into a grey pixel that still reads
  as ink. A sampler that can miss ink is the wrong sampler for a blank detector.
- **Baseline tolerances.** Per-engine screenshots at `maxDiffPixelRatio: 0.02`. Cross-engine ink
  band **0.25 of the median**, measured against ~1.5% real spread on the content-rich pages
  (0.2812 / 0.2794 / 0.2772). Sparse pages are excluded from the band by an `INK_BAND_FLOOR` of
  0.01: when a page is nearly all paper its ink is almost entirely anti-aliased glyph edges and the
  engines legitimately differ by a third there (clip-control measured 0.0047 / 0.0036 / 0.0036) —
  the blank gate is the check that matters below that floor. Dimensional identity is asserted on
  every page regardless.
- **The cross-engine test drives all three engines itself** rather than writing per-project files
  and hoping the last project to finish reads them all. It runs once (skipped outside the chromium
  project) and launches chromium, firefox and webkit through Playwright's own `BrowserType` API, so
  it is order-independent and cannot silently compare fewer than three readings.
- **WebKit is ~9× slower than the other two** (4457 ms vs 489/537 ms for the four-page fixture) and
  carries `test.slow()`. Its *output* is excellent — visually indistinguishable from Chromium's and
  within 1.5% on ink — so this is a throughput note, not a fidelity one. A 20-page design would
  cost WebKit ~20 s of render time inside the submit flow, which the submit UI should expect.
- **The E2E seam is `window.__blueprintRenderPagePng`,** installed from `main.tsx` beside the store
  seam and folded away by the same inline `import.meta.env` guard. It exists because the submit
  flow that will call the renderer is a later feature and this one is not allowed to wait for it;
  it hands the PNG back as base64 so the specs assert on the bytes that would be zipped.
- **`renderPagePng` is `async`, not merely `Promise`-returning.** A bad page id has to *reject*; a
  synchronous throw would sail past a caller's `.catch`. A unit test caught this.
- **Pen probes need a straight stroke.** perfect-freehand applies streamline and smoothing, so a
  scribble's rendered outline does not pass through its own recorded points — a pixel probe aimed
  at one misses the ink it is looking for (it did, on the first run). The fixture's annotation
  stroke is a straight horizontal run for exactly that reason; the second stroke stays a curve so
  the baselines still show a real scribble.
