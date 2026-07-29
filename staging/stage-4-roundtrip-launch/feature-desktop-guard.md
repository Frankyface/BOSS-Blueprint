# Feature: Desktop Guard
_Stage: stage-4-roundtrip-launch · Status: awaiting verification_

## Goal
Below a small-viewport threshold, tell the client the truth once — **"Blueprint works best on a
computer"** — without taking anything away from them. A good phone experience is an explicit v1
non-goal (`docs/master_plan.md`, OUT list) and the canvas is a fixed 1200px design surface, so a
phone visitor will have a bad time dragging and drawing. They should still be able to **open,
read and scroll** a sketch they already made, follow a link someone sent them, and understand
why it feels cramped.

The guard warns about **editing**. It never blocks **reading**.

## Threshold
Shown when either media query matches:

```css
(max-width: 1023px), (pointer: coarse) and (max-width: 1279px)
```

- **1024 px** is the decision line: at 1024×768 the audit already measured toolbar buttons
  clipping and colliding with the side panel, and the canvas fit-to-window scale is under half.
  Anything narrower is not a machine you can lay out a website on.
- The coarse-pointer clause catches tablets in the 1024–1279 band: the width is survivable, the
  8-handle resize and pen work are not.
- **Exactly 1024 px must NOT show the notice** — boundary asserted in E2E, both sides.

**This threshold is not a substitute for fixing MAJOR-6.** The audit's layout clipping from
1280px down and at ≥125% browser zoom is a real desktop bug with a real owner; if the guard were
set at 1280 it would quietly become the excuse not to fix it. Guard at 1024, fix M6 where it
belongs (see Cross-references).

## Success Criteria
- [ ] At any viewport matching the threshold, a notice appears with the headline **"Blueprint
      works best on a computer"** and one plain sentence explaining that looking around works
      fine but dragging, resizing and drawing need a bigger screen
- [ ] **It does not block reading.** With the notice showing: the canvas scrolls, existing blocks
      render and are hit-testable, page tabs switch, `document.elementFromPoint()` over the canvas
      returns a canvas element, no element is `inert` or `aria-hidden`, no control is `disabled`
      because of the notice, and there is no backdrop
- [ ] The notice occupies **≤ 25% of viewport height**, is `position: fixed`, and the scroll
      container gains matching bottom padding so no content is permanently hidden underneath it
- [ ] Dismissible ("Got it"); dismissal persists for the tab session (survives reload) and
      **does not** persist into a new session/tab — this is a warning about a real risk, not a
      cookie banner
- [ ] It reacts live: shrinking the window past the threshold shows it without a reload; growing
      past the threshold hides it
- [ ] It never appears at desktop sizes — asserted at 1024×768, 1280×800 and 1440×900
- [ ] The onboarding tour is suppressed while the guard is showing (one piece of first-run chrome
      at a time; guard has precedence — feature-onboarding-tour.md rule 3)
- [ ] Announced as `role="status"` / `aria-live="polite"`, keyboard-dismissible, and **not** a
      dialog: no `aria-modal`, no focus trap, no focus steal
- [ ] Zero JavaScript errors at every tested viewport

## Behaviour rules
1. **Detection** is `window.matchMedia(GUARD_QUERY)` with a `change` listener — not a resize
   handler, not a user-agent sniff. The query string is one exported constant so the E2E boundary
   tests and the component read the same value.
2. **Dismissal key:** `sessionStorage['boss-blueprint:guard:v1'] = 'dismissed'`. `sessionStorage`
   on purpose: a `localStorage` dismissal would silence the warning forever after one accidental
   tap, including for a client who later opens the tool on their phone expecting to work.
   Storage that throws (private mode) must degrade to "shown, not remembered", never to a crash.
3. **Not modal, structurally.** The notice is a fixed banner at the bottom edge with
   `pointer-events: auto` on itself only. Nothing else in the app changes state because it is
   visible — no disabling, no read-only mode, no route change.
4. **No feature gating.** The guard does not hide the palette, the pen or Submit. A determined
   phone user may still try; the warning is informed consent, not a lockout. (If a future ruling
   wants true read-only on mobile, that is a separate feature with its own decision entry.)
5. **Copy** — plain English, second person, no apology, no "unsupported browser" framing:
   > **Blueprint works best on a computer.** You can look around and scroll here, but adding
   > blocks, dragging and drawing need a bigger screen. Open this on a laptop or desktop when
   > you're ready to build.

## Cross-references (not this feature's job)
| Finding | Owner |
|---|---|
| **M6** toolbar/side-panel clipping from 1280px down and at ≥125% browser zoom | Stage 2 app-shell layout / launch polish — a desktop bug, not a mobile one |
| **M7** browser zoom-in shrinks the canvas (fit scale 0.69 → 0.29) | Stage 2 canvas fit — the guard must not be used to explain this away |
| **P5** canvas scroller renders no visible scrollbar | launch polish |

## How We'll Verify
1. Unit (`npm test`): the media-query constant is exactly the string above; `matchMedia` mock →
   shown/hidden per match; `change` event toggles without a reload; dismissal read/write incl. a
   throwing-`sessionStorage` stub; guard-beats-tour precedence.
2. E2E (`npx playwright test e2e/desktop-guard.spec.ts`, chromium + firefox + webkit):
   - **mobile viewport 390×844** → notice visible; screenshot
   - **read-not-blocked probe** at 390×844 on a seeded 2-page sketch: scroll the canvas and
     assert `scrollTop` changed; assert a seeded block's text is present and visible; assert
     `elementFromPoint` at a canvas point outside the banner rect is not inside the banner;
     assert no `[inert]`, no `[aria-hidden="true"]` ancestor over the canvas, no `[aria-modal]`
   - **banner height** ≤ 25% of viewport height, and the canvas container's bottom padding ≥ the
     banner's height (nothing permanently occluded)
   - **tablet 768×1024** → visible
   - **boundary:** 1023×800 → visible; **1024×800 → not visible**
   - **desktop** 1280×800 and 1440×900 → not visible
   - **live resize:** start 1440×900 (absent) → `setViewportSize(390×844)` → appears with no
     reload → back to 1440×900 → disappears
   - **dismissal:** "Got it" hides it; `page.reload()` in the same tab → still hidden; a new
     browser context at 390×844 → visible again
   - **tour precedence:** at 390×844 with no tour flag set, the tour is absent
   - console error count 0 across the spec
3. `npm run e2e` (full suite, 3 engines) green — the guard must not fire at the suite's 1920×1000
   viewport and must not perturb any existing spec.
4. Round-trip: the client driver aborts as PRECONDITION if the guard is present at 1440×900
   (feature-roundtrip-harness.md R2.3) — so a threshold regression is caught by the gating run too.
5. Record commands, exit codes, viewport matrix results and screenshots below.

## Verification Log

### 2026-07-29 — built on branch `stage4-ui` (worktree off 770c346) · awaiting independent verification

Windows 10, Node 24, `npm ci` clean. E2E runs against the **production `--mode test` build served
by `vite preview`**, three engines, never the dev server.

**Typecheck / lint** — `npx tsc -b` → exit 0, no output. `npx eslint .` → exit 0, `0 problems`.

**Unit — `npm test`** → `Test Files 81 passed (81) · Tests 1365 passed (1365)`, exit 0, run twice.
`src/components/DesktopGuard.test.tsx` (10) covers: the query constant is **exactly** the string
in this file and is what the component asks the browser for; hidden above the threshold; the
headline and both clauses of the copy below it; `role="status"` + `aria-live="polite"`, no
`aria-modal`, no focus steal; a `change` event toggles it **without a reload**; one listener,
released on unmount; dismissal writes `sessionStorage` (and **not** `localStorage`), survives a
remount, and returns when the session is cleared; a `sessionStorage` that throws still shows the
notice and still dismisses; the banner publishes `--boss-guard-inset` while up and clears it when
gone. `src/store/chromeFlags.test.ts` (7) covers the storage layer both features share.

**E2E — `npx playwright test e2e/desktop-guard.spec.ts`** (chromium + firefox + webkit) →
**48 passed (16 × 3), 0 failed**, exit 0.

Viewport matrix — assertion is the banner's visibility AND `window.matchMedia(GUARD_QUERY)`
agreeing with it, so a CSS-only regression cannot pass:

| Viewport | Expected | Result |
|---|---|---|
| 390 × 844 (phone) | shown | ✅ shown, all 3 engines · screenshot `desktop-guard-390.png` |
| 768 × 1024 (tablet) | shown | ✅ shown |
| 1023 × 800 | shown | ✅ shown |
| **1024 × 800** | **hidden** | ✅ hidden — the boundary holds from both sides |
| 1024 × 768 | hidden | ✅ hidden (the size named in the criteria) |
| 1280 × 800 | hidden | ✅ hidden |
| 1440 × 900 | hidden | ✅ hidden |
| 1180 × 820 + `hasTouch` | shown | ✅ shown (all 3 engines reported `pointer: coarse`; the test skips itself with a reason on an engine that does not emulate one — it did not need to) |

Reading is not blocked, on a real two-page sketch built at 1440×900 and carried to 390×844:
- the canvas page has **non-zero width and height** (the 390px zero-width case this feature had
  to fix — see Notes), the typed heading "Cedar & Stone" is present and visible,
- the canvas viewport **scrolls** (`scrollTop > 0` after a wheel gesture over an eight-band page),
- `document.elementFromPoint()` at the page centre, clear of the banner, resolves inside
  `canvas-area` and not inside the banner,
- `[inert]` count 0, `[aria-modal]` count 0, no `aria-hidden="true"` ancestor over the canvas,
- the page tabs still switch (Home → Menu → Home),
- palette, pen, Add page, Submit and the tour's help control are all still **enabled**,
- the banner does not take focus when it appears, and `Enter` on it dismisses it.

Size and occlusion: banner height ≤ **25% of the viewport height**, computed `position: fixed`,
and the canvas scroller's computed `padding-bottom` ≥ the banner's height (it is
`calc(2rem + var(--boss-guard-inset))`, the inset being measured live from the banner).

Dismissal: "Got it" hides it · same tab reloaded → still hidden (sessionStorage) · a **new
browser context** at 390×844 → shown again. Live resize 1440 → 390 → 1440 shows and hides it with
no reload. Tour precedence: in a context with **nothing seeded**, at 390×844 with the start
surfaces resolved, the guard is up, the tour is absent, and the tour's flag is still `null` —
suppressed, not spent. Console/pageerror listeners: **0 errors** at every viewport tested.

**Full suite — `npm run e2e`** (build + 3 engines, 627 tests) → **625 passed, 2 skipped, 0 failed**,
exit 0, **run twice**. The guard does not fire at the suite's 1920×1000 viewport, nor at
`app-layout.spec.ts`'s 1366×768 / 1280 / 1100 / **1024**×768 narrow-desktop cases, which continue
to assert that every toolbar control is reachable above the line. The 2 skips are the pre-existing
chromium-only cross-engine export-visual comparison.

_Environment note:_ space the two full runs a minute or two apart — back to back, the second
drowns in `page.goto: Could not connect to server` because the first leaves the Windows ephemeral
port range in `TIME_WAIT` (see feature-onboarding-tour.md's log for the detail).

**Not run — round-trip precondition (How We'll Verify §4).** The client driver and
`playwright.roundtrip.config.ts` do not exist yet (`scripts/roundtrip/` holds the package gate
only); that check belongs to `feature-roundtrip-harness.md` R2.3 and stays open here.

## Open Questions
1. **Is the coarse-pointer clause worth it?** It adds a second condition and one more E2E case,
   and Playwright needs `hasTouch: true` to exercise it. **Recommendation:** keep it — a 1180px
   touch tablet is precisely the device where a client will try to drag-resize and conclude the
   tool is broken. Drop it only if it proves flaky across the three engines.
2. **Banner at the top or the bottom?** Top is more visible; bottom keeps the toolbar and page
   strip (already cramped at these widths per M6) untouched. **Recommendation:** bottom.
3. **Should the guard appear at ≥125% browser zoom on a desktop?** Browser zoom shrinks the CSS
   viewport, so a 1280px window at 150% reports ~853px and *will* trip the guard — which is
   arguably wrong (it is a desktop, the real defects are M6/M7). **Recommendation:** accept it for
   v1 and fix M6/M7 rather than special-casing zoom; a zoomed-in user at an effective 853px does
   genuinely have a cramped editing surface. Revisit if it annoys real users.
4. **Session vs. permanent dismissal.** **Recommendation:** session, as specified — and if Cam
   later reports it as nagging, the change is a one-line storage swap plus a decisions entry, not
   a redesign.

## Notes & Decisions

### Calls made while building (2026-07-29)
- **The 390px canvas was zero pixels wide, and the guard could not ship without fixing it.**
  The shell is three columns: palette `flex: 0 0 240px`, stage `flex: 1 1 auto; min-width: 0`,
  details panel `flex: 0 0 304px`. 240 + 304 is already wider than a 390px window, so the one
  column allowed to shrink shrank to nothing. The canvas existed, reported a 0px viewport and
  rendered nothing you could scroll, read or hit-test — which makes "it does not block reading"
  unsatisfiable, not merely untested. **Fix:** at small viewports the columns stack
  (`App.css`, keyed off `data-small-viewport` which `App.tsx` writes from the same media query
  the banner reads — one definition of "too small", not a second CSS breakpoint). The stage is
  ordered **first** so the design is what a client sees, at `height: 65vh`; the palette and
  details panel follow at full width, one scroll away. Nothing is hidden, nothing is disabled,
  and the header scrolls horizontally rather than clipping Submit under `overflow: hidden`.
  This is a layout change, not a feature gate — rule 4 holds.
- **The banner's height is measured, not assumed.** It publishes `--boss-guard-inset` on `<html>`
  via a `ResizeObserver` while it is up (cleared on unmount), and the canvas scroller pads by
  `calc(2rem + var(--boss-guard-inset))`. A constant would be too small on a 320px screen — where
  the copy wraps to more lines — and too big everywhere else. `max-height: 25vh` with
  `overflow-y: auto` on the banner itself is the belt to that braces: the ≤ 25% criterion holds
  even if a text-scaling setting inflates the copy.
- **Detection is shared, not duplicated.** `SMALL_VIEWPORT_QUERY` (`src/constants/viewport.ts`) is
  read through `useSmallViewport()`, a `useSyncExternalStore` over the `MediaQueryList` itself —
  so the banner, the tour's suppression and the stacked layout are the same subscription and
  cannot drift. `e2e/desktop-guard.spec.ts` duplicates the literal (the E2E tsconfig cannot see
  `src/`) and a unit test asserts the constant character for character.
- **Dismissal state lives in the component, read once per mount.** A `useState` lazy initialiser
  over `sessionStorage` beats a module-level read: no stale cache across a reload, and no store
  to reset between tests.
- **Open Question 1 resolved by measurement:** the coarse-pointer clause stays. All three engines
  reported `pointer: coarse` under Playwright's `hasTouch: true`, so the 1180×820 case is a real
  assertion rather than a hopeful one; the test still skips itself with a reason if an engine ever
  stops emulating it.

### From the original spec
- Master plan lists "a good phone sketching experience" as an explicit v1 non-goal, and the app
  is desktop-first by hard constraint (CLAUDE.md process rules). The guard makes that scope
  decision visible to the client instead of letting them discover it by failing.
- The audit measured the real numbers behind the threshold: at 1024×768 "Delete page" and "Start
  over" are clipped and overlap the side panel; the canvas auto-fit scale falls to 0.29 at 150%
  zoom. Those measurements chose 1024, not a round number.
- **Warn, never lock.** Blocking edit below the threshold would be easy to build and would break
  the "reading still works" criterion the moment someone reached for `inert` to implement it. The
  criteria above are written so that a lockout implementation fails the tests.
