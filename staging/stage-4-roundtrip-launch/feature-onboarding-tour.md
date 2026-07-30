# Feature: Onboarding Tour
_Stage: stage-4-roundtrip-launch · Status: verified done_

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
| 3 | `pen-tool` | **Grab the pen and draw.** A drawn box becomes a card, your handwriting a heading — notes still work too. (rewritten in F6, 2026-07-29: the original body spent all its examples on annotation and never told a client the pen can build the page) | pen discovery |
| 4 | `side-panel` | **This panel is about whatever you picked.** *Block* = its words and links · *Site* = your name and style · *Nav map* = what links where. | N5 (explanation half) |
| 5 | `submit` | **When you're happy, hit Submit.** Download your design, email it to us — then we build it. | B2 (discovery half) |

Copy rules: second person, **one instruction sentence in the title and ≤ 2 sentences in the body**
(restated 2026-07-29 — the old "≤ 2 sentences per pointer" was false for pointer 2, which is a
title plus two body sentences, and nothing but a word count stood behind it; `countSentences()`
now enforces the per-part rule directly), no "click here to continue", no feature names the UI
doesn't use. Total reading time at 200 wpm must be **< 30 s** — a unit test asserts the
concatenated word count of all five pointers is ≤ 95 words. **Measured: 93**
(`tourWordCount()`, `src/tour/tourSteps.test.ts`).

## Success Criteria
- [x] On a first visit (no `boss-blueprint:tour:v1` key) the tour starts automatically **after**
      the template picker / first-open choice is resolved, never on top of it
- [x] Exactly five pointers, in the table's order, each anchored to its live target element and
      repositioned on scroll and resize
- [x] **It never blocks.** With any pointer open: every app control underneath is clickable, the
      canvas scrolls, a block can be added and edited, `document.elementFromPoint()` at the canvas
      centre returns a canvas element (not a tour element), there is no backdrop that swallows
      pointer events, no `aria-modal`, and no focus trap — Tab reaches app controls
- [x] Dismissible three ways — `Skip`, the final `Got it`, and `Escape` — all of which write the
      dismissed flag; the tour then does not reappear on reload, on a new tab, or after a restart
- [x] A permanent, always-visible help control (`?` / "Show me around") re-opens the tour from
      pointer 1 at any time, on any page of the sketch, without clearing the dismissed flag
- [x] The tour is **suppressed entirely while the desktop guard is showing** (small viewport) and
      becomes available if the viewport grows past the threshold
- [x] Every pointer's target exists: a unit test renders the app and asserts one element per
      `data-tour` value, so a renamed target can never silently produce a pointer aimed at nothing
- [x] Keyboard operable (`Next` / `Skip` are real focusable buttons, `Escape` closes) and
      `prefers-reduced-motion: reduce` removes all transitions
- [x] The palette's own "how to add a block" sentence is moved directly under the BLOCKS heading
      (N1) — the tour teaches it once, the palette keeps saying it forever
- [x] Zero JavaScript errors with the tour open (the audit's clean-console record is not lost)

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
| `src/tour/tourSteps.test.ts` | 7 | the five targets in reading order; **93 ≤ 95 words**; per-pointer word caps; punctuation is not a word; missing-target **skip + renumber**. _(The row originally read "≤2-sentence budget per pointer" — see the 2026-07-29 bounce-fix entry: that claim was not tested and was false; sentence counting landed with the fix.)_ |
| `src/tour/tourAnchor.test.ts` | 7 | placement per side; the canvas centre kept clear; 35 placement×edge-target combinations all land inside the viewport; a bubble bigger than the window pins to the margin |
| `src/store/chromeFlags.test.ts` | 7 | local/session separation; unset ≠ dismissed; storage that throws on read, throws on write, and refuses with a quota error |
| `src/components/OnboardingTour.test.tsx` | 20 | **one live element per `data-tour` id, all five**; auto-start; flag written on first render; five steps in order ending on "Got it"; `role="note"`, `aria-live`, no `aria-modal`, no focus steal; palette still adds a block with the tour open; Skip / Escape / reload; help control re-opens at step 1 **and** aims focus at the bubble _(T-1: jsdom cannot prove the focus LANDS — the E2E does)_; suppression order picker → coach → guard → submit, and "hide, don't close" on a mid-tour resize |
| `src/components/BlockPalette.test.tsx` | +1 | the "click a block" sentence now sits **between** the heading and the blocks (N1) |

**E2E — `npx playwright test e2e/onboarding-tour.spec.ts`** (chromium + firefox + webkit) →
**42 passed (14 × 3), 0 failed**, exit 0 _(now 48 = 16 × 3; see the 2026-07-29 T-1 entry)_. Evidence per How-We'll-Verify item:
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
reopens at step 1, takes focus [^t1], flag stays dismissed · ≤95-word claim independently recounted:
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

### 2026-07-29 — Bounce fix: the Submit round trip restores all five pointers

**Reproduced first, in a unit test.** Before touching `OnboardingTour.tsx`, the Submit case was
extended in `src/components/OnboardingTour.test.tsx` ("comes back from Submit with all five
pointers, on the step it left"): open the tour, `Next` to step 2 on `canvas`, open Submit, close
Submit. It failed exactly as the review described — `data-tour-count="1"` where 5 was expected.
That failing assertion is the regression test the fix now satisfies; it was red before the fix
and green after, in that order.

**The fix.** `liveTourSteps(document)` was called from a render-phase `useMemo` keyed
`[isShowing, openCount]`, so it ran during the render where `isShowing` flips true — while the
DOM still held the Submit view, in which four of the five targets are unmounted and only the
header's `data-tour="submit"` survives. It is now read in a **post-commit `useLayoutEffect`**
into state: React applies every DOM mutation of the commit before any layout effect runs, and
layout effects run before the browser paints, so the list is read from the page the client is
about to see and there is no flicker.

One knock-on, caught by the existing suite rather than by inspection: the help control's
"takes the focus with it" test went red, because the bubble is now mounted one commit later than
`isShowing` flips, so the focus effect ran while `bubbleRef.current` was still `null`. The effect
now also depends on a `hasBubble` boolean — a boolean and not `step`, deliberately, so pressing
`Next` cannot yank focus off the `Next` button. [^t1]

[^t1]: **Both "takes focus" claims above were FALSE when written, and are corrected rather than
    deleted so the record shows what was believed and why it was wrong.** `hasBubble` was
    necessary but not sufficient: the bubble renders `visibility: hidden` until it is anchored,
    and `.focus()` on a visibility-hidden element is a no-op in every real engine — so the
    keyboard never actually reached it. jsdom does not implement that rule, which is why the unit
    test went green and stayed green while all three browsers disagreed. Found by independent
    review as **T-1** (2026-07-29) and fixed the same day by additionally gating the effect on
    the bubble being ANCHORED; the evidence is now `e2e/onboarding-tour.spec.ts` → "moves the
    keyboard to the bubble", ×3 engines. See the T-1 entry below.

`react-hooks/set-state-in-effect` is disabled for that one line with a stated reason: this is
React's own documented "measure the DOM before the browser repaints" case, it runs at most once
per suppression transition, and the rule's suggested shape (`useSyncExternalStore` over a
`MutationObserver` on `document.body` with `subtree: true`) would re-query five selectors on
every DOM mutation in an app whose main interaction is dragging things around a canvas.

**LOW-1 — the sentence-budget claim, fixed by making it true and testable.** The log's
"≤2-sentence budget per pointer" was backed only by a word count, and pointer 2 is three
sentences by that reading (title + two body sentences). The rule the shipped copy actually obeys
is per-part, so that is now what is written and what is asserted: `countSentences()` in
`src/tour/tourSteps.ts`, `TOUR_TITLE_SENTENCE_LIMIT = 1`, `TOUR_BODY_SENTENCE_LIMIT = 2`, plus a
test that clause separators (`·`, em dashes) are not sentence ends. Measured across the five
pointers: titles 1/1/1/1/1 sentences, bodies 1/2/1/1/1. No copy changed; the word count is still
**93 ≤ 95**.

**Measured, this session, on Windows 10 / Node 24:**

| Check | Command | Result |
|---|---|---|
| Lint | `npx eslint .` | **exit 0**, 0 problems |
| Types | `npx tsc -b` | **exit 0**, no output |
| Unit | `npm test` | **92 files / 1603 tests passed**, exit 0 |
| — tour | `npx vitest run src/tour/tourSteps.test.ts` · `…/OnboardingTour.test.tsx` | **9** and **21** passed (was 7 and 20) |
| Harness unit | `npx vitest run scripts/` | **8 files / 179 tests passed** |
| Coverage | `npm run test:coverage` | **exit 0** — 87.54% stmt · 80.25% branch · 85.66% func · 88.68% line |
| Build | `npm run build` | **exit 0** |
| E2E | `npm run e2e` (build + chromium/firefox/webkit) | **672 passed, 3 skipped, 0 failed**, exit 0, 5.0 min |

**The round-trip driver still walks the DOM the fix changed** — the thing worth proving, since
the tour now mounts its bubble one commit later than it used to:

| Scenario | Driver | Filmstrip | Tour recorded | Gate |
|---|---|---|---|---|
| A — Cedar & Stone | `npx playwright test --config playwright.roundtrip.config.ts` → **1 passed (35.9s)** | **21 frames** | `tourPresent: true · tourFirstStep: 1 · tourStepCount: 5` | **37 pass, 1 warn, 0 fail, 0 skip · exit 0** |
| B — North Star | **1 passed (14.6s)** | **18 frames** | `tourPresent: true · tourFirstStep: 1 · tourStepCount: 5` | **38 pass, 0 warn, 0 fail, 0 skip · exit 0** |

Frame counts are up by one each because the tour's dismissal now screenshots **before** the Skip
click as well as after (`02-onboarding-tour-before-dismissal.png`) — harness LOW-3, landed in the
same batch.

**Status: still `awaiting verification`.** The bounce is fixed and the fix is proven by a test
that failed first, but the criteria are ticked by an independent pass, not by the agent that
wrote the fix.

**Re-verification (2026-07-29):** detached worktree pinned at 52fecbe, no tracked edits.
Full re-run: `npm test` **92 files / 1607** · `vitest run scripts/` **179** · coverage exit 0 ·
build exit 0 · e2e **672 passed / 3 skipped / 0 failed** (after the worktree-setup
`npm ci --prefix scripts/roundtrip`). CI green at 52fecbe; live 200; deployed bundle is this
commit.
**The criterion-2 bounce is FIXED and holds in three real browsers** (independent probe suite,
23 tests ×3 engines, deleted after): the exact repro — tour → step 2 (canvas) → Submit
(bubble hides) → back → the bubble returns **count 5, step 2, target canvas** on chromium,
firefox AND webkit; repeated from step 4 across two consecutive round trips; the returned
bubble still anchored (≤200px, inside the viewport). The regression test asserts step, count
AND target. Sentence budget re-measured independently: **93 words**, titles 1/1/1/1/1, bodies
1/2/1/1/1 — countSentences() is real and its clause-separator test has teeth. All other
criteria re-proved ×3 (ordering both paths, anchors, pass-through with a store-committed edit
under the open bubble, three dismissal routes persisting, guard suppression both directions
returning to the same step, reduced-motion pair with teeth).
**One NEW defect found — pre-existing, and it bounces the feature (T-1): the help control
never moves focus to the bubble, in any engine.** After clicking "Show me around" the bubble
is up, anchored and visible, but document.activeElement is still the help button (chromium,
firefox) or BODY (webkit). Mechanism MEASURED: the bubble renders visibility:hidden until
anchored, and .focus() on a hidden element is a no-op (focusableWhenHidden false /
focusableWhenVisible true); the focus effect's deps have all settled by the commit that mounts
the still-hidden bubble, and the anchoring layout effect that reveals it re-runs nothing.
jsdom does not implement the visibility rule, so OnboardingTour.test.tsx's "takes the focus
with it" is a FALSE POSITIVE that cannot fail. **Explicitly not a regression from the bounce
fix** — reproduced identically on a scratch build of 5d6e24a (pre-fix). Consequence: a
keyboard user who asks for the tour is left several Tab stops from Skip/Next; the bubble is
still announced via the aria-live region — reach, not silence.
**Status: BOUNCE on Behaviour rule 2.** Exact changes: (1) gate + key the focus effect on the
bubble being ANCHORED (position !== null) as well as hasBubble, keeping boolean deps so Next
cannot yank focus; (2) assert the behaviour in e2e/onboarding-tour.spec.ts ×3 engines — the
jsdom test cannot be the evidence; (3) correct the "takes focus" claims in the two log entries
above by annotation, not deletion.

### 2026-07-29 — T-1 fixed: the help control now moves the keyboard to the bubble, in all three engines

**Reproduced first, in the browsers, and it had to be reproduced in the RIGHT state.** The new
E2E goes red on the pre-fix build in **chromium, firefox AND webkit** — but only from a page load
where the tour has never been anchored yet: `openCanvas(page)` (which seeds the "seen" flag, so
auto-start does not run) → click `tour-help` → the bubble is visible and `toBeFocused()` fails
with "inactive". Re-opening a tour that already ran once passes either way, because `position`
still holds the previous opening's point and the bubble is therefore visible the instant it
mounts. The first draft of this test did exactly that and passed on the broken build — it is
recorded here because "the test was green" was itself the original defect.

**The fix, exactly as the bounce specified.** The focus effect is now gated *and* keyed on the
bubble being **anchored** as well as present:

```
const isAnchored = position !== null
useEffect(() => {
  if (!isShowing || !shouldFocus || !hasBubble || !isAnchored) return
  bubbleRef.current?.focus()
}, [isShowing, shouldFocus, openCount, hasBubble, isAnchored])
```

Both new gates are **booleans**, which is the whole reason it is `isAnchored` and not `position`:
the anchor point changes on every `Next` and on every re-anchor, and depending on it would drag
focus back to the bubble mid-tour — the exact thing `hasBubble` was made a boolean to prevent.

**Measured, RED then GREEN, ×3 engines:**

| | pre-fix | post-fix |
|---|---|---|
| `the help control › moves the keyboard to the bubble` | **3 failed** (chromium, firefox, webkit — bubble "inactive") | **3 passed** |
| `the help control › but auto-start still never steals it` | 3 passed | 3 passed |

Full suite after: **`npm run e2e` → 678 passed / 3 skipped / 0 failed (5.0 m)**, `npm test`
**1636 passed / 2 skipped**, lint clean, build exit 0.

**T-2 — the count split, so the next reader can reconcile the totals.** The E2E count moves
**672 → 678**: +6 = **2 new tests × 3 engines**, and nothing was removed or renamed. The split
inside `onboarding-tour.spec.ts` is +1 for the T-1 repro ("moves the keyboard to the bubble") and
+1 for its converse ("but auto-start still never steals it"), which is kept as a separate test
rather than folded in because the two need different page states — seeded-as-seen versus
tour-allowed — and a single test that reloads between them would hide which half regressed. The
unit count moves 1607 → 1636 for an unrelated reason (the round-trip harness batch in the same
commit, `feature-roundtrip-harness.md`); no tour unit test was added or deleted.

**Three engine differences met and worth recording**, because the obvious assertions are all
wrong in at least one of them: chromium focuses a button it clicks, webkit **blurs to the body**
on a click, and webkit focuses the nearest focusable ancestor when the button is inside one — so
"is `tour-next` focused after clicking it?" and "is the bubble unfocused after clicking Next?"
each pass in two engines and fail in the third, for reasons that have nothing to do with the
tour. The step is therefore advanced by **keyboard** (`press('Enter')`), where all three agree,
which is also the interaction the assertion is about.

**The jsdom test is kept and labelled.** `OnboardingTour.test.tsx`'s focus case is renamed to
"aims the focus at the bubble (see the E2E for whether it lands)" and carries a comment saying
in as many words that it is **not** the evidence — jsdom does not implement the CSS visibility
rule, so it cannot fail on this defect. It still pins the wiring (help click → `shouldFocus` →
the bubble, not some inner button), which is worth keeping.

**Status: unchanged — `awaiting verification`.** The bounce is fixed and the fix failed first in
three real browsers, but the criteria are ticked by an independent pass, not by the agent that
wrote the fix.

**Re-verification (2026-07-29):** detached worktree pinned at b437748, no tracked edits (probes
untracked, deleted after). `npm ci` exit 0 (plus scripts/roundtrip) · eslint exit 0 · tsc -b
exit 0 · `npm test` **93 files / 1636 passed / 2 skipped** · the four tour unit files alone
**44 passed** · `npm run e2e` **678 passed / 3 skipped / 0 failed** · round-trip client
scenario A **1 passed (45.4s), 21 frames, tourPresent true · step 1 · count 5** (re-proved at
this commit because the fix changed when the bubble mounts).
**T-1 is FIXED in three real browsers** (independent probe suite, 14 tests ×3 engines, deleted
after): from a page load where the tour has never been anchored, "Show me around" leaves
document.activeElement ON THE BUBBLE in chromium, firefox AND webkit, Skip one Tab away;
auto-start still takes nothing (BODY, and still BODY 500ms later — after the anchoring effect,
the moment the fix could have started stealing); Next does not yank (Enter on Next keeps focus
on Next ×3; focus parked on a palette button stays there ×3; webkit's bubble-focus on real
clicks proven to be the engine's ancestor rule via an auto-started control where the effect
provably cannot fire). Criterion 2 re-proved ×3: step 2 → Submit → back returns count 5,
step 2, target canvas, anchored, 0 console errors.
**The shipped E2E was checked for teeth rather than taken on trust:** run against a bundle
built from THIS commit with the isAnchored gate reverted → "moves the keyboard to the bubble"
**3 failed (toBeFocused → inactive)** while the auto-start test passed 3/3 — it opens via
openCanvas (never-anchored fresh path, not a reopen). The two false "takes focus" claims are
annotated in place, not deleted. Anchors, pass-through with the bubble focused, all three
dismissal routes, persistence and guard/Submit suppression re-spot-checked ×3 clean; 93 words
re-counted, titles 1/1/1/1/1, bodies 1/2/1/1/1.
**One LOW recorded, not bounced:** shouldFocus is session-scoped, so a help-opened tour
re-takes focus whenever suppression lifts (guard round trip; Submit back), even when the
previously focused control survived — no trap, pass-through intact, both paths follow a
deliberate request; clearing shouldFocus after the first landed focus closes it if it ever
irritates. Also LOW: tourStore.ts:19 points at e2e/support/tour.ts — the literal lives in
e2e/support/chrome.ts.
**Status: VERIFIED DONE.**

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
