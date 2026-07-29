# Feature: Onboarding Tour
_Stage: stage-4-roundtrip-launch · Status: awaiting verification_

## Goal
Thirty seconds of first-run pointers that teach the five things a client must find on their own:
**how blocks get onto the page · how to type into one · what the pen is for · what the right-hand
panel does · how to send it in.** It must be dismissible, must never block a single click, must
show once per browser, and must be re-openable from a permanent help control.

The UX audit (2026-07-28, persona Rosa) is the evidence base: the app's own explanatory sentence
lives 700px below the first palette block, so her first two instincts both failed in silence and
she nearly stopped before adding a single element (audit §2, findings **M1**, **N1**). A tour is
the cheap fix for discovery; it is **not** a substitute for the interaction defects themselves,
which are routed elsewhere and stay routed elsewhere (see Cross-references).

Master-plan note: "guided wizard onboarding" is an explicit v1 **non-goal**. This is not a wizard
— it is five pointers at things that already exist, and it never gates the canvas.

## The five pointers (order = the reading path: left → centre → right → top)

Shipped copy, verbatim from `src/tour/tourSteps.ts` (the draft this replaced is in Notes):

| # | Target (`data-tour`) | Copy (plain English, no jargon) | Fixes |
|---|---|---|---|
| 1 | `palette` | **Click a block to add it.** Heading, Text, Image, Button or Nav bar — it lands on the page, ready to drag. | N1, M1 (discovery half) |
| 2 | `canvas` | **Double-click a block to type.** Your words replace the grey text. Press Enter when you're done. | inline-edit affordance, N3 |
| 3 | `pen-tool` | **Grab the pen to scribble.** Circle something, write a note, sketch a photo idea — we read your marks. | pen discovery |
| 4 | `side-panel` | **This panel is about whatever you picked.** *Block* = its words and links · *Site* = your name and style · *Nav map* = what links where. | N5 (explanation half) |
| 5 | `submit` | **When you're happy, hit Submit.** Download your design, email it to us — then we build it. | B2 (discovery half) |

Copy rules: second person, ≤ 2 short sentences per pointer, no "click here to continue", no
feature names the UI doesn't use. Total reading time at 200 wpm must be **< 30 s** — a unit test
asserts the concatenated word count of all five pointers is ≤ 95 words. **Measured: 93**
(`tourWordCount()`, `src/tour/tourSteps.test.ts`).

## Success Criteria
- [ ] On a first visit (no `boss-blueprint:tour:v1` key) the tour starts automatically **after**
      the template picker / first-open choice is resolved, never on top of it
- [ ] Exactly five pointers, in the table's order, each anchored to its live target element and
      repositioned on scroll and resize
- [ ] **It never blocks.** With any pointer open: every app control underneath is clickable, the
      canvas scrolls, a block can be added and edited, `document.elementFromPoint()` at the canvas
      centre returns a canvas element (not a tour element), there is no backdrop that swallows
      pointer events, no `aria-modal`, and no focus trap — Tab reaches app controls
- [ ] Dismissible three ways — `Skip`, the final `Got it`, and `Escape` — all of which write the
      dismissed flag; the tour then does not reappear on reload, on a new tab, or after a restart
- [ ] A permanent, always-visible help control (`?` / "Show me around") re-opens the tour from
      pointer 1 at any time, on any page of the sketch, without clearing the dismissed flag
- [ ] The tour is **suppressed entirely while the desktop guard is showing** (small viewport) and
      becomes available if the viewport grows past the threshold
- [ ] Every pointer's target exists: a unit test renders the app and asserts one element per
      `data-tour` value, so a renamed target can never silently produce a pointer aimed at nothing
- [ ] Keyboard operable (`Next` / `Skip` are real focusable buttons, `Escape` closes) and
      `prefers-reduced-motion: reduce` removes all transitions
- [ ] The palette's own "how to add a block" sentence is moved directly under the BLOCKS heading
      (N1) — the tour teaches it once, the palette keeps saying it forever
- [ ] Zero JavaScript errors with the tour open (the audit's clean-console record is not lost)

## Behaviour rules
1. **State key:** `localStorage['boss-blueprint:tour:v1'] = 'dismissed'`, matching the existing
   `boss-blueprint:canvas:v1` naming. Written on *any* exit path, including `Escape` and a
   mid-tour reload (write on first render, not on completion — a tour that is half-read has still
   been seen, and re-showing it is more annoying than useful). Unreadable/absent storage
   (private mode, quota) → the tour shows and simply never persists; it must never throw.
2. **Never modal.** The overlay layer is `pointer-events: none`; only the bubble and its buttons
   set `pointer-events: auto`. No dimming of the app. No scroll lock. No focus steal on
   auto-start (focus moves to the bubble only when the tour is opened from the help control, i.e.
   by a deliberate user action).
3. **Suppression order:** template picker > desktop guard > tour. The tour polls none of these —
   it subscribes to the same state they set.
4. **Missing target:** if a step's target is not in the DOM (e.g. the pen tool is hidden in a
   future layout), that step is skipped and the step counter renumbers. Silent, but recorded by
   the unit test in the criteria above so it can never happen unnoticed in the shipped app.
5. **Anchoring:** bubbles attach by `data-tour="<id>"`, positioned with a
   viewport-clamped offset so a bubble can never render off-screen; a resize repositions on the
   next frame.
6. **Semantics:** the bubble is `role="note"` inside an `aria-live="polite"` region with
   `aria-label="Getting started, step N of 5"`. Not `role="dialog"` — it is not modal and must not
   be announced as one.

## Cross-references (audit findings this feature does NOT own)
The tour explains; it does not repair. These stay with their real owners and must not be
quietly absorbed here:

| Finding | Why it isn't the tour's job | Owner |
|---|---|---|
| **B1** Site brief not persisted | data loss, not discovery | Stage 2 site-settings |
| **B2** No submit affordance at all | pointer 5 needs something to point at | Stage 3 submit-gate |
| **M1** Palette drag does nothing, silently | the tour teaches "click", but silent failure on drag is still a defect | Stage 2 palette |
| **M3/M4** Typing scrolls work off-screen; Backspace deletes the block | a pointer cannot save her from these | Stage 2 block-editing |
| **M5** Nav bar contradicts itself | wrong data, not missing knowledge | Stage 2 multipage-nav |
| **M8** No "what goes here?" on Image | field doesn't exist yet | Stage 2 image-upload |
| **N5** Panel has no text field for Heading/Text | pointer 4 explains the panel; the missing field is real | Stage 2 block-editing |
| **N6/N7** Blocks not keyboard-focusable; tab order starts on the right | accessibility of the editor itself | Stage 2 / launch polish (N7) |

If **M1** is later fixed by supporting palette→canvas drag, pointer 1's copy changes to name both
gestures — a one-line edit, listed here so it isn't missed.

## How We'll Verify
1. Unit (`npm test`): step-definition table (order, count, ≤ 95 words total); dismissed-flag
   read/write incl. a throwing-localStorage stub; suppression precedence (picker > guard > tour);
   target-existence test rendering the app and asserting one element per `data-tour` id;
   missing-target renumbering.
2. E2E (`npx playwright test e2e/onboarding-tour.spec.ts`, chromium + firefox + webkit):
   - fresh context (no storage) → tour appears at step 1 after the first-open choice; screenshot
   - **non-blocking probe:** with step 1 open, add a Heading from the palette, double-click it,
     type, and assert the block's text committed — all while the tour is still open
   - `document.elementFromPoint(canvasCentre)` is not inside the tour layer; the tour root has
     `pointer-events: none`; no element has `aria-modal="true"`
   - step through all five with `Next`, assert each bubble is anchored within the bounding box
     neighbourhood of its target and fully inside the viewport
   - `Escape` at step 2 dismisses; reload → no tour; new tab in the same context → no tour
   - help control re-opens at step 1; `Skip` closes; reload → still no tour
   - at 390×844 the tour does not appear (guard has precedence); resize to 1440×900 → help
     control still offers it
   - reduced-motion context → no CSS transitions on the bubble (computed style assertion)
   - console error count is 0 for the whole spec
3. `npm run e2e` (full suite, 3 engines) green — the tour must not perturb any existing spec;
   existing specs get a storage seed that marks the tour dismissed, added in `e2e/support/`.
4. Round-trip interaction: `npx playwright test --config playwright.roundtrip.config.ts` — the
   client driver's step 00 dismisses the tour through its real control
   (feature-roundtrip-harness.md R2.3) and the filmstrip shows it.
5. Record commands, exit codes, counts and screenshots below.

## Verification Log

### 2026-07-29 — built on branch `stage4-ui` (worktree off 770c346) · awaiting independent verification

Windows 10, Node 24, `npm ci` clean. Every E2E number below is from the **production
`--mode test` build served by `vite preview`** (`npm run e2e` builds first), never the dev server.

**Typecheck / lint** — `npx tsc -b` → exit 0, no output. `npx eslint .` → exit 0, `0 problems`.

**Unit — `npm test`** → `Test Files 81 passed (81) · Tests 1365 passed (1365)`, exit 0, run twice.
What is new, and what it pins down:

| File | Tests | Covers |
|---|---|---|
| `src/tour/tourSteps.test.ts` | 7 | the five targets in reading order; **93 ≤ 95 words**; ≤2-sentence budget per pointer; punctuation is not a word; missing-target **skip + renumber** |
| `src/tour/tourAnchor.test.ts` | 7 | placement per side; the canvas centre kept clear; 35 placement×edge-target combinations all land inside the viewport; a bubble bigger than the window pins to the margin |
| `src/store/chromeFlags.test.ts` | 7 | local/session separation; unset ≠ dismissed; storage that throws on read, throws on write, and refuses with a quota error |
| `src/components/OnboardingTour.test.tsx` | 20 | **one live element per `data-tour` id, all five**; auto-start; flag written on first render; five steps in order ending on "Got it"; `role="note"`, `aria-live`, no `aria-modal`, no focus steal; palette still adds a block with the tour open; Skip / Escape / reload; help control re-opens at step 1 **and** takes focus; suppression order picker → coach → guard → submit, and "hide, don't close" on a mid-tour resize |
| `src/components/BlockPalette.test.tsx` | +1 | the "click a block" sentence now sits **between** the heading and the blocks (N1) |

**E2E — `npx playwright test e2e/onboarding-tour.spec.ts`** (chromium + firefox + webkit) →
**42 passed (14 × 3), 0 failed**, exit 0. Evidence per How-We'll-Verify item:
- first visit: picker up → no bubble; blank card → coach up → no bubble; coach dismissed →
  bubble at step 1 of 5 on `palette`. Screenshot attached as `tour-step-1.png`.
- **non-blocking probe:** with step 1 open, a Heading is added from the palette, double-clicked,
  typed into and committed — asserted in the store (`text === 'North Star Dog Grooming'`) with
  the bubble still visible.
- `document.elementFromPoint()` at the canvas centre resolves inside `canvas-area` and **not**
  inside the tour; the tour layer computes `pointer-events: none` and the bubble `auto`;
  `[aria-modal]` count 0, `[inert]` count 0; focus given to a palette button stays there.
- all five bubbles: each within 120px of its target's box and wholly inside the window, at
  1920×1000 and after a resize to 1440×900 (the step-2 bubble re-anchors, `x` 784 → 544).
- `Escape` at step 2 → gone, flag written; reload → still gone (asserted from the editing
  state, not from behind the picker); a **new tab in the same context** → still gone.
- help control: re-opens at step 1 after Skip, leaves the flag `dismissed`, survives a reload,
  and still works from a second sketch page.
- 390×844: no bubble, guard visible, **flag untouched** (`null`); grown to 1440×900 the help
  control offers it again.
- `contextOptions.reducedMotion: 'reduce'` → bubble `transition-duration: 0s`; the paired
  `no-preference` test asserts it is **not** 0s, so the first assertion has teeth.
- console/pageerror listeners across the spec: **0 errors**.

**Full suite — `npm run e2e`** (build + 3 engines, 627 tests) → **625 passed, 2 skipped, 0 failed**,
exit 0, **run twice**. The 2 skips are the pre-existing chromium-only cross-engine
export-visual comparison. No existing spec was changed to accommodate the tour: `openCanvas`
seeds the "already seen" flag through `page.addInitScript` before the first navigation
(`e2e/support/chrome.ts`), and the two specs that navigate by hand (`shell`,
`export-png-fallback`) seed it themselves.

_Environment note for whoever re-runs this:_ the two full runs must be **separated by a minute or
two**. Launched back to back on this Windows box the second run drowns in
`page.goto: Could not connect to server` (66 of them) — the 627-test run leaves the ephemeral
port range in `TIME_WAIT` and the fresh `vite preview` cannot be reached. Nothing to do with the
product; both runs are clean when spaced.

**Not run — round-trip interaction (How We'll Verify §4).** `playwright.roundtrip.config.ts` and
the client driver do not exist yet; `scripts/roundtrip/` currently holds the package gate only.
That step belongs to `feature-roundtrip-harness.md` (R2.3) and stays open here.

**Independent review (2026-07-29):** re-ran everything in a detached worktree pinned at
fb7eaf6, no tracked edits. `npm ci` clean · eslint exit 0 · tsc -b exit 0 · `npm test`
**1523 passed / 89 files** · `npx vitest run scripts/` **154 / 8** · coverage exit 0 (87.2%
stmt, 80.27% branch, 85.61% func, 88.3% line) · build exit 0 · `npm run e2e` **×2, spaced:
625 passed / 2 skipped / 0 failed** each. CI green at fb7eaf6 (run 30429321874); live deploy
HTTP 200; the deployed bundle carries all five pointers, the storage key, the help control and
the reduced-motion rule. A live probe against the deployed build confirms the tour auto-starts
at `palette`, 5 steps, guard absent at 1440×900.

Independent browser probes (13 tests × 3 engines, own config, deleted after): first-visit
ordering on BOTH blank AND template paths (picker → no bubble, flag null; coach → no bubble;
resolved → step 1 of 5, flag written) · all five data-tour anchors resolve to exactly ONE
visible element · pointer-events pass-through re-proved (layer none, bubble auto,
elementFromPoint at canvas centre inside canvas-area; a Heading added, double-clicked, typed
and COMMITTED in the store with the bubble up; aria-modal 0, inert 0) · Escape, Skip AND Got
it each persist through reload and a new tab · fresh context re-shows at step 1 · help control
reopens at step 1, takes focus, flag stays dismissed · ≤95-word claim independently recounted:
**93** · reduced-motion pair has teeth (reduce → 0s, no-preference → non-zero) · guard
suppression correct both directions: mid-tour step 3 → 390×844 hides → 1440×900 returns
**step 3, target pen-tool**.

**One defect found, and it bounces this feature.** After a Submit round trip the tour does NOT
return as five pointers. Reproduced ×3 engines: open tour → step 2 → Submit (correctly
suppressed) → submit-back → the bubble returns as step **1 of 1** targeting `submit`. Cause:
OnboardingTour.tsx's steps useMemo (keyed [isShowing, openCount]) runs during the render where
isShowing flips true — before React commits the re-mounted palette/canvas/panel/pen targets —
so liveTourSteps(document) reads the still-committed Submit DOM where only the header's
data-tour="submit" survives. Help control heals it (openCount bump), reload heals it, nothing
else does. Guard path unaffected (unmounts nothing — verified as control). The existing unit
test misses it by asserting presence only. Fix: read live steps in a post-commit
useLayoutEffect into state; assert step/count in the Submit unit test. Also LOW-1: the log's
"≤2-sentence budget per pointer" claim is backed by a word-count test, and pointer 2 is three
sentences — restate or count sentences.

**Status: BOUNCE on criterion 2** — one scoped fix plus one regression assertion.

## Open Questions
1. **Stepped bubbles or all five at once?** Five simultaneous callouts read faster but clutter a
   1440×900 layout and would overlap the canvas. **Recommendation:** stepped, with "1 of 5" and a
   visible `Skip` — 30 seconds either way, far less visual noise.
2. **Auto-start on first visit, or wait for a nudge?** Auto-start risks being dismissed reflexively
   before it is read. **Recommendation:** auto-start. Rosa's failure was that she never found the
   information at all; a reflexive dismiss is a strictly better outcome than a silent dead end,
   and the help control makes it recoverable.
3. **Should the flag be versioned per tour content?** `:v1` allows a future re-show after a major
   UI change. **Recommendation:** keep the `v1` suffix, never bump it for copy tweaks — only if
   the app's interaction model changes enough that returning clients genuinely need re-teaching.
4. **Does pointer 5 exist before Stage 3's submit lands?** No. **Recommendation:** the tour ships
   with all five steps and rule 4 (missing target → skip) covers the gap during development; the
   stage DoD requires all five live in the shipped build.

## Notes & Decisions

### Calls made while building (2026-07-29)
- **The draft copy was 12 words over its own budget.** The table's original wording counted 107
  words against the ≤ 95 the criteria and How-We'll-Verify both assert, so one of the two had to
  give. The measurable criterion won and the copy was trimmed to **93** with every teaching point
  intact — click to add, drag to place, double-click to type, Enter to commit, what the pen is
  for, what each panel tab holds, what Submit does. The draft is preserved here so the change is
  visible rather than silent: *"Pick Heading, Text, Image, Button or Nav bar — it lands on the
  page, then drag it where you want." · "Your words replace the grey example text." · "Circle
  something, write a note, or sketch what a photo should show — we read your marks." · "This
  panel is about the thing you picked. Block = its words and where it links · Site = your
  business name and style…" · "You'll download your design and email it to us…"*
- **The blank-page coach counts as the first-open choice.** Rule 3 names the picker; the Notes
  name "the picker and its coach overlay". The tour therefore waits for `startState === 'editing'`,
  which is reached from the picker either by choosing a template or by choosing Blank *and*
  retiring the coach card. Two first-run cards over one canvas was the thing to avoid.
- **Submit joins the suppression list.** The Submit view takes over the editor body and unmounts
  four of the five targets, so an open bubble would be pointing at a form. It hides while Submit
  is up and returns if the client backs out — same "hide, don't close" rule as the guard.
  Defensively, a target that disappears mid-step also hides its bubble rather than floating.
- **Small viewport suppresses the tour whether or not the guard banner is still on screen.** The
  criterion says "suppressed while the desktop guard is showing (small viewport)"; keying it to
  the media query rather than to the banner's dismissal means dismissing the banner on a phone
  does not then produce five pointers at a layout that cannot use them.
- **`useSyncExternalStore` over `matchMedia`, not a store.** The guard, the tour and the shell
  layout all ask the same `MediaQueryList`, so they cannot disagree, and there is no copy of the
  browser's state to keep in step (`src/hooks/useSmallViewport.ts`).
- **Placement is per-step and deliberate.** Pointer 1 parks low beside the palette rather than
  beside its middle, because the middle of the canvas is where a new block lands and where the
  non-blocking probe clicks. `src/tour/tourAnchor.ts` is pure arithmetic so "can a bubble render
  off-screen?" is answered by a unit test rather than by three browsers.
- **Existing specs are seeded, not edited.** `openCanvas` writes the dismissed flag via
  `addInitScript` before the first navigation (a `page.evaluate` after `goto` would race the
  auto-start effect). `e2e/support/chrome.ts` owns the key and the seed.

### From the original spec
- Evidence base: UX audit report (2026-07-28) §2 first-sixty-seconds and §5 recommendation 2
  ("Make the first 60 seconds teach the interaction (M1 + N1)" — named the cheapest fix on the
  list). The audit also records what already works and must not be disturbed: the calm empty
  state, the "Write it for me" escape hatch, plain-English destructive confirmations, and a
  zero-JS-error session.
- The tour is chrome, not product data: nothing it does touches the document store, the
  `.blueprint` file or the export. It cannot affect `site.json`, so it cannot affect a round-trip
  verdict — except through the DOM the client driver walks, which is why the driver dismisses it
  as step 00 rather than the harness routing around it.
- Sequencing with `feature-templates.md`: that feature owns the first-open picker
  (Restaurant/Trades/Portfolio/Shop or blank) and its coach overlay. The tour is strictly
  downstream of that choice — two first-run experiences stacked on each other would be the exact
  overload this stage is trying to remove.
