# Feature: "Show What We Read" Overlay + Pen Defaults to Ink (F6)
_Stage: stage-5-ink-is-design · Status: awaiting verification_

## Goal
Close the loop with the client. The app now infers meaning from their strokes
(feature-ink-inference.md), and the client deserves to be able to **see that reading** — on
request, never imposed — so a misread is caught at sketch time rather than in a built site.

Two smaller changes ride with it, both aimed at the same confusion: the pen palette said
**"Red (notes)"**, which taught clients the pen was for annotation, and the pen opened in the
annotation mode by default. The palette label is now just **"Red"**, and the pen starts in **Ink**.

## Success Criteria
- [x] A checkbox in the pen controls labelled **"Show what we read"**
      (`READING_LABEL`, `src/components/PenControls.tsx`)
- [x] **DEFAULT OFF** (`showInkReading: false`, `src/store/penTool.ts`) — the sketch is what the
      client came to look at, and labelling every mark unasked is noise
- [x] Shown only while the pen is out: `selectIsInkReadingShown` requires
      `showInkReading && mode !== 'off'`
- [x] The overlay **never gets between the pen and the page** — drawing through it works
- [x] It is a **view, not a document**: nothing it displays ever reaches the saved design
- [x] It **never costs the client a row of canvas** — no layout shift when it appears
- [x] It leaves with the pen and hands the blocks back untouched
- [x] Regions are labelled with their kind and their confidence, e.g. `card?` for `unsure`
- [x] Pen palette relabelled `Red (notes)` → **`Red`**
- [x] The pen tool **starts in Ink**
- [x] The classifier runs **once per change across both consumers** — `PenLayer` and `PenControls`
      share one memoised result (review finding, Fix I)
- [ ] **The overlay's label text clears the 4.5:1 AA floor** — implemented and documented, but
      never measured or guarded (see Verification Log)

## How We'll Verify
1. Unit: the store's default and toggle, the "shown only with the pen out" selector, the shared
   hook's one-classify-per-change property, and the reading model itself.
2. E2E across three engines: the reading appears where the mark was drawn; the overlay is
   pointer-transparent; it never enters the saved document; no layout shift; it leaves with the
   pen.
3. A live human look at real hand-drawn input, including a deliberately imperfect case.
4. A contrast measurement of the label text against its background.
5. Record below.

## Verification Log

### 2026-07-29 — built and verified except for one narrow item (awaiting verification)

| Check | Result |
|---|---|
| `npm test` | 119 files · **2228 passed** · 2 skipped · 0 failed |
| `npm run lint` · `npm run build` · `npm run schema:check` | all clean |
| `npm run e2e` (chromium + firefox + webkit) | **720 passed**, 0 failed |
| `npm run roundtrip:smoke` | **SMOKE-PASS 47**, 4m04s |

**Files:** `src/components/InkReadingOverlay.tsx` + `.css`, `src/canvas/inkReading.ts` (+ test),
`src/hooks/useInkReading.ts` (+ `useInkReading.test.tsx`), `src/store/penTool.ts` (+
`penTool.test.ts`), `src/components/PenControls.tsx` (+ `PenControls.test.tsx`),
`src/components/PenLayer.tsx` (+ `PenLayer.test.tsx`), `src/components/PenControls.css`,
`src/tour/tourSteps.ts`.

**E2E — `e2e/pen-reading.spec.ts`, 5 tests × 3 engines**, inside the all-green 720-test run (titles
read from the spec in this session; per-spec counts were not captured, so their passing is
inferred from a suite with zero failures):

- `reads a hand-drawn box as a card, right where it was drawn`
- `never gets between the pen and the page`
- `leaves with the pen, and hands the blocks back untouched`
- `never costs the client a row of canvas`
- `is a view, not a document — it never reaches the saved design`

**Live in-browser check, this machine:** the pen **starts in Ink** (verified by eye in the running
app, and pinned by `penTool.test.ts`), and two gappy hand-drawn boxes produced the reading
**"We read this as 2 cards"** with two labelled outlines tagged **`card?` (unsure)** — the honest
presentation of an ambiguous read.

**Fix I (one classify per change).** `useInkReading` is consumed by **both** `PenLayer` and
`PenControls`; each memoised per instance, so before the fix the same strokes were classified
twice per change. The hook's own comment records it and `useInkReading.test.tsx` asserts it.

**THE ONE OPEN ITEM — why this is not `verified done`:**

The overlay's label contrast. `src/components/InkReadingOverlay.css:31` documents the fix in
words: the label text uses a token that clears the AA floor **rather than `--boss-select`, which
is 4.45:1 and below the 4.5:1 floor for text**. That is an implementer's assertion in a comment.
**No contrast ratio was measured in this session, and nothing in the repo guards it** — VERIFIED by
search: no file under `src/`, `e2e/` or `scripts/` (excluding the unrelated round-trip legibility
advisory work) computes a contrast ratio, and `e2e/launch-polish.spec.ts` does not check one.
`handoff.md`'s "27/27 contrast pairs pass" is a one-off retheme measurement and **it is not
established that it covered this pair**, since this token change came out of the later review.

**To reach `verified done`:** measure the shipped label colour against its shipped background and
record the ratio here — ideally as a unit test over the token pairs so the number cannot rot.
Everything else in this feature is verified.

## Open Questions
1. **Should the reading be on by default once the classifier is trusted?** **Recommendation:** no.
   Opt-in is the right default for a tool whose whole promise is "your sketch, your way"; the
   overlay is a diagnostic, not a feature to show off.
2. **Should a misread be correctable in place?** Ruled no for v1.1 — there is no stable anchor for
   an override (feature-ink-inference.md, Open Question 2). The overlay is what makes the
   redraw-to-correct loop viable: without it the client cannot tell there is anything to correct.
3. **Does the tour need a step for it?** `src/tour/tourSteps.ts` was touched in this change set.
   **Recommendation:** confirm with the tour's owner file
   (`staging/stage-4-roundtrip-launch/feature-onboarding-tour.md`, also modified) rather than
   deciding it here.

## Notes & Decisions
- **"Show what we read", not "Show detected regions".** The client is not a developer; the label
  says what the app is doing in the client's own terms and admits it is a reading, not a fact.
- **Confidence is shown, not hidden.** `card?` is the whole point — an overlay that presented
  `unsure` guesses as certainties would make misreads *harder* to catch, not easier.
- **Shown only with the pen out** because that is the only time the client is thinking about ink.
  It also keeps the overlay out of the way of block editing entirely.
- **The palette relabel is small and load-bearing.** "Red (notes)" told every client the pen was
  for annotation — the exact belief this whole stage exists to correct.
