# Feature: Onboarding Tour
_Stage: stage-4-roundtrip-launch · Status: not started_

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

| # | Target (`data-tour`) | Copy (plain English, no jargon) | Fixes |
|---|---|---|---|
| 1 | `palette` | **Click a block to add it.** Pick Heading, Text, Image, Button or Nav bar — it lands on the page, then drag it where you want. | N1, M1 (discovery half) |
| 2 | `canvas` | **Double-click a block to type.** Your words replace the grey example text. Press Enter when you're done. | inline-edit affordance, N3 |
| 3 | `pen-tool` | **Grab the pen to scribble.** Circle something, write a note, or sketch what a photo should show — we read your marks. | pen discovery |
| 4 | `side-panel` | **This panel is about the thing you picked.** *Block* = its words and where it links · *Site* = your business name and style · *Nav map* = what links where. | N5 (explanation half) |
| 5 | `submit` | **When you're happy, hit Submit.** You'll download your design and email it to us — then we build it. | B2 (discovery half) |

Copy rules: second person, ≤ 2 short sentences per pointer, no "click here to continue", no
feature names the UI doesn't use. Total reading time at 200 wpm must be **< 30 s** — a unit test
asserts the concatenated word count of all five pointers is ≤ 95 words.

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
_Empty — nothing verified yet._

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
