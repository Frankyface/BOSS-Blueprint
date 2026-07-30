# Feature: Page Space — Add Space / Trim (F2)
_Stage: stage-5-ink-is-design · Status: verified done_

## Goal
Give the client room to draw **below** their content, and let them take it back. Before this, a
page was exactly as tall as its blocks made it, so "I want to sketch a footer under this" had no
answer — the client had to invent a block they did not want just to grow the sheet.

`page.extraBottomPx` is the field; **Add space** / **Trim** in the toolbar and a **drag handle on
the page's bottom edge** are the two ways to move it.

## Contract shape (`docs/export-format.md` v2.5 §2 / §4.2)
- `page.extraBottomPx` — **optional**, absent means `0`, grid-snapped, **≤ 4000**
- **ADDITIVE** to the derived content height, and applied **AFTER** the 1600 floor clamp. Both
  halves matter:
  - after the clamp, **Trim is geometrically incapable of cropping a block or a stroke** — it can
    only give back space that was added, never eat into content;
  - additive-after-clamp is also what stops the first clicks of *Add space* being invisible on a
    short page (they used to disappear inside the floor).
- §4.2 clamps the final `height` to **8000** *after* adding `extraBottomPx`, which is why V31
  exists (see feature-pen-regions-contract.md).

## Success Criteria
- [x] `page.extraBottomPx` serializes into `site.json`, round-trips through the `.blueprint` file,
      and is in the schema (`src/export/schema/site.v1.schema.json`)
- [x] Toolbar **Add space** and **Trim** buttons; each press is **one undo step**
- [x] A **drag handle on the page's bottom edge** does the same thing in one undo step
- [x] The added room is real canvas: the client can draw in it, and trimming leaves a mark that
      was drawn there on the page
- [x] The exported PNG is as tall as the page the client was looking at
- [x] At the height cap, **Add space** greys out and says why, and the client is told only about
      space that genuinely did **not** fit (the V31 fix — see Notes)
- [x] A button that disables itself on the click that fires it **hands keyboard focus to its live
      sibling** instead of dropping it to `<body>` (review finding, Fix F)
- [x] The space survives a reload

## How We'll Verify
1. Unit: the pure height maths (`src/canvas/pageSpace.test.ts`), the store transitions and their
   undo granularity, serialization both ways, and the schema.
2. Unit: the focus-rescue behaviour of the two toolbar buttons.
3. E2E across chromium + firefox + webkit: add, trim, drag, draw-in-the-added-room, the cap, the
   exported PNG height, and reload persistence.
4. Record commands and results below.

## Verification Log

### 2026-07-30 — committed and re-confirmed on the Linux CI runner (still verified done)

Nothing regressed; this entry exists because the 2026-07-29 evidence was all local, on an
uncommitted tree, and both of those caveats are now obsolete.

| Evidence | Result |
|---|---|
| Commit | **`c82d917`** on `main`, 143 files, +17185/−306, 2026-07-30 10:32:12 −0400 |
| CI run **30556114726** (push of `c82d917`, ubuntu) | unit **116 test files · 2241 tests passed · 0 failed**; lint, build, `schema:check` and `roundtrip:gate:selftest` green |
| CI E2E | 732 run, **726 passed / 2 failed / 1 flaky** — both failures are `pen-reading.spec.ts:172` (feature-ink-reading-overlay.md). `e2e/page-space.spec.ts` is **not** among them |
| New coverage since 2026-07-29 | `e2e/pen-only-site.spec.ts`'s second test carries `extraBottomPx` through a **submit** for the first time: two presses of Add space, a rule drawn *below where the page used to end*, then `home.extraBottomPx === 800`, `home.height === expectedPageHeight(stored)`, the low stroke present in `site.json`, and that stroke sampled as real ink in the shipped PNG. 2 tests × 3 engines, green in the same CI run |

_Correction to the table below:_ `npm run roundtrip:smoke` has **not** been run against `c82d917`.
The `SMOKE-PASS 47` verdict belongs to run root `2026-07-30T01-12-34-144Z_B_70454b9`, an earlier
tree (sha `70454b9` + 129 dirty files, no `pen-only-site.spec.ts`). This feature does not rest on
it — `page.extraBottomPx` is proved by unit, E2E and the package assertions above — but the line
must not be read as smoke evidence for the committed tree.

### 2026-07-29 — built and verified (kept as history; its counts are pre-commit local figures)

| Check | Result |
|---|---|
| `npm test` | 119 files · **2228 passed** · 2 skipped · 0 failed (baseline 101 / 1811) |
| `npm run lint` · `npm run build` · `npm run schema:check` | all clean |
| `npm run e2e` (chromium + firefox + webkit) | **720 passed**, 0 failed |
| `npm run roundtrip:gate:selftest` | PASSED, 45/45 mutations caught |
| `npm run roundtrip:smoke` | **SMOKE-PASS 47**, 4m04s |

**Files:** `src/components/PageSpaceControls.tsx` + `.css`, `src/components/PageSpaceHandle.tsx`,
`src/canvas/pageSpace.test.ts`, and edits to `src/canvas/document.ts`, `src/canvas/geometry.ts`,
`src/canvas/types.ts`, `src/canvas/blueprintFile.ts`, `src/components/CanvasArea.tsx`,
`src/components/CanvasToolbar.tsx`, `src/store/canvasStore.ts`, `src/export/serialize.ts`,
`src/export/siteJson.ts`, `src/export/types.ts`, `src/export/schema/site.v1.schema.json`,
`src/export/png/renderPagePng.ts`.

**E2E — `e2e/page-space.spec.ts`, 8 tests × 3 engines**, inside the all-green 720-test run:

- `adds a band of empty page and gives it straight back`
- `each click is one undo step, and the space survives a reload`
- `you can draw in the room you added, and trimming leaves the mark on the page`
- `the bottom-edge handle drags the page shorter in one undo step`
- `greys "Add space" out at the height cap and reports only the space that fit`
- `the exported PNG is as tall as the page the client was looking at`
- `a stroke drawn in the added room comes back after a reload`

_Scope of that claim:_ the run was recorded as an aggregate — **720 passed across three engines,
no failures** — not as a per-spec breakdown. That every one of these 24 (8 × 3) passed is
therefore **inferred from an all-green suite**, which is sound (a failure anywhere would have
broken the total), but a per-spec line was not captured. The test titles above were read from the
spec file in this session, so their existence is verified.

**Unit — the keyboard-focus fix (Fix F), `src/components/CanvasToolbar.test.tsx`:**
`keeps keyboard focus in the group when Add space greys itself out` and `hands focus to Add space
when Trim greys itself out on the click that fires it`. The mechanism is in
`PageSpaceControls.tsx`: after the render that disables the pressed button, focus is handed to its
still-live sibling; the pressed-button ref is cleared each time so it only ever runs after a real
press. A `role="status"` live region announces the growth or trim — the same wiring `PenControls`
uses for its reading.

**Nothing here depends on the four stage-wide gaps.** This feature does not touch `penRegions`, so
the harness's inability to express an untargeted pen mark is irrelevant to it; its own E2E asserts
the exported PNG's height directly rather than relying on a visual baseline, so the outstanding
Linux baseline regeneration does not gate it either. The one thing it shares with the rest of the
stage is that it is **not deployed** — this log is a local verification, as every other feature
file in this repo's early logs was.

**Status: VERIFIED DONE.**

## Open Questions
1. **Should Trim have an "undo all my added space" affordance?** Today it steps. **Recommendation:**
   leave it — Ctrl+Z already collapses a run of steps and a "reset" button is one more control on
   a toolbar the audit already called cramped.
2. **Is 4000px the right per-page ceiling?** It is under the 8000 total clamp with room for real
   content. **Recommendation:** keep, revisit only if a client hits it.

## Notes & Decisions
- **Applied AFTER the 1600 floor clamp — the ordering is the safety property.** It is what makes
  "Trim can never crop your work" true by geometry instead of by a guard that could be wrong.
- **The V31 fix belongs to this feature's surface** (the rule itself lives in
  feature-pen-regions-contract.md). The old rule conflated *requested* with *applied*: on a page
  that lands exactly on the 8000 cap with every requested pixel applied, it warned anyway. It now
  compares `extraBottomPx` against `page.height - contentOnlyHeight(page)` and fires only when the
  client asked for more than landed — the only case worth telling a client about. It is
  `client`-facing on purpose: being told your space was not applied when it was reads as the app
  being broken.
- **Focus rescue, not focus prevention.** The alternative was to keep the button enabled and
  no-op it, which lies to assistive tech about what is possible. Moving focus to the live sibling
  keeps the truth *and* the keyboard.
- **Interaction with the ink floor:** `page.extraBottomPx` makes pages taller, which is precisely
  why V6's ink floor had to become height-scaled rather than a whole-page ratio — see
  feature-pen-only-pages.md. The two features were designed together; changing either scaling rule
  in isolation re-opens the other's false-alarm class.
