# Feature: Ink Inference — Strokes Into Typed Regions (F3)
_Stage: stage-5-ink-is-design · Status: verified done_

## Goal
Turn a page's raw pen strokes into **typed regions** by pure client-side geometry, so the export
can say *this ink is a card, that ink is a heading, that line is a rule* instead of shipping a
bag of coordinates. No ML, no network, nothing stored — `src/canvas/ink/**` is a pure function of
the strokes and the page's blocks.

Region kinds: `panel` · `writing` · `navRow` · `rule` · `textPlaceholder` · `artwork`, with
variants (e.g. `panel`/`card`), a two-level confidence (`clear` / `unsure`), and sibling **sets**
so a repeated component is recognised as one component used N times.

## Success Criteria
- [x] Segmentation and classification are **pure** — same strokes in, same regions out; no
      network, no persistence, no side effects (`src/canvas/ink/segment.ts`, `classify.ts`,
      `regions.ts`, with geometry helpers in `metrics.ts`, `enclosure.ts`, `writing.ts`,
      `margins.ts`)
- [x] **Colour families separate overlapping ink objects** — two things drawn on top of each other
      in different pens are two things
- [x] A **block-overlap veto** keeps a mark that touches a block an *annotation about that block*
      rather than a region in its own right
- [x] The veto reaches **zero-area / zero-height** strokes — a mouse-drawn horizontal line across
      a block has bbox height exactly `0` and must still be vetoed (review finding, Fix B)
- [x] A **flat dashed divider is never promoted to the page's heading or `<h1>`** — a
      `glyphHeight` of `0` used to sort to the top (review finding, Fix C)
- [x] A **regular grid** of identical cards is read row-major and **every cell** joins the set —
      a 2×2 grid sets all four, not two (review finding, Fix H); irregular scatters fall through
      to the unchanged single-axis run and **never drop a card**
- [x] Nesting past two levels collapses (a card inside a section is two; three is noise)
- [x] Confidence degrades to `unsure` rather than guessing confidently
- [x] Every threshold in `src/canvas/ink/constants.ts` carries its **fixture evidence** in a
      comment beside it

## How We'll Verify
1. Unit, per module, over hand-built fixtures (`src/test/inkFixtures.ts`): segmentation, the
   veto (including the zero-area case), enclosure fusion, writing metrics, grid vs single-axis
   ordering, nesting collapse, confidence.
2. E2E: draw a box in a real browser and assert the app reads it as a card **where it was drawn**.
3. A live human look at ambiguous input — two gappy boxes — to confirm the `unsure` path presents
   honestly rather than over-claiming.
4. Record below.

## Verification Log

### 2026-07-29 — built and verified

| Check | Result |
|---|---|
| `npm test` | 119 files · **2228 passed** · 2 skipped · 0 failed (baseline 101 / 1811) |
| `npm run lint` · `npm run build` · `npm run schema:check` | all clean |
| `npm run e2e` (chromium + firefox + webkit) | **720 passed**, 0 failed |
| `npm run roundtrip:gate:selftest` | PASSED, 45/45 |
| `npm run roundtrip:smoke` | **SMOKE-PASS 47**, 4m04s |

**Files:** `src/canvas/ink/` — `segment.ts`, `classify.ts`, `regions.ts`, `metrics.ts`,
`enclosure.ts`, `writing.ts`, `margins.ts`, `types.ts`, `constants.ts`; tests
`segment.test.ts`, `classify.test.ts`, `regions.test.ts`, `metrics.test.ts`, `drawings.test.ts`;
fixtures `src/test/inkFixtures.ts`.

**Unit assertions that pin the three review findings in this module** (test titles read from the
specs in this session):

- `segment.test.ts` → `the veto reaches a ZERO-AREA stroke drawn across a block (Fix B)`
- `classify.test.ts` → `the block-overlap veto reaches zero-area strokes end-to-end (Fix B)`
- `classify.test.ts` → `a flat dashed divider is never the page's heading or <h1> (Fix C)`
- `regions.test.ts` → `sets ALL FOUR cards of a 2×2 grid, numbered row-major (Fix H)`,
  `numbers a 2×3 grid row-major, left-to-right then top-to-bottom (Fix H)`,
  `never drops a grid card even when the grid is too irregular to set (Fix H fallback)`

**E2E** — `e2e/pen-reading.spec.ts` → `reads a hand-drawn box as a card, right where it was drawn`,
run on chromium + firefox + webkit inside the all-green 720-test suite. (Per-spec counts were not
captured; that this test passed is inferred from a suite with zero failures.)

**Live in-browser check, this machine:** two **gappy** hand-drawn boxes — deliberately imperfect,
the case a strict enclosure test would drop — produced the reading **"We read this as 2 cards"**
with two labelled outlines tagged **`card?` (unsure)**. That is the intended behaviour on
ambiguous input: it commits to a count, shows where it thinks the things are, and marks its own
uncertainty rather than presenting a guess as fact.

**What `verified done` means here, precisely.** The geometry does what its specification says, on
its fixtures and on a real browser-drawn box. It does **not** mean the classifier reads every real
client's ink correctly — that is an accuracy question no test in this repo can settle, and
`docs/decisions.md` records the revisit trigger for it (below). The `clear` / `unsure` split exists
so a wrong guess degrades to "look at the PNG and decide" instead of shipping a confident error.

**Status: VERIFIED DONE.**

## Open Questions
1. **What happens when the classifier is confidently wrong on real client ink?**
   `docs/decisions.md` (2026-07-29) makes this the explicit revisit trigger for the whole
   amendment. **Recommendation:** unchanged — the two-level confidence model is the mitigation,
   and the correction path is deliberately "rub it out and draw it again" (see Notes).
2. **Should the client be able to override an inferred role?** Ruled **no** for v1.1: there is no
   stable anchor to hang an override on. It would key on a stroke-id set that changes the moment
   one stroke is erased. **Recommendation:** leave it; redrawing *is* the correction path, and it
   survives redrawing because it is redrawing.
3. **Two-level nesting.** Deeper structure is currently collapsed as noise. **Recommendation:**
   keep until a real sketch needs three, then bring evidence rather than intuition.

## Notes & Decisions
- **Pure geometry was a constraint, not a preference.** The hard constraints (no backend, no
  accounts, everything free-tier) rule out a model call, and a client's sketch is their business
  — nothing about the ink leaves the browser.
- **The block-overlap veto is what bought `docs/export-format.md` §7.1 byte-identity.** Because a
  mark touching a block stays an annotation, every existing fixture's output is unchanged; the
  amendment adds a new class rather than reinterpreting the old one. Appendix A tests B and D
  prove it mechanically.
- **`frame` could not be reused for a region's bbox.** `frame` sets `exclusiveMinimum: 0`, and a
  mouse-drawn horizontal rule has bbox height exactly `0`. `penRegions[].bbox` therefore has its
  own definition with `minimum: 0` — the same zero-height reality that Fix B had to reach in the
  veto.
- **A grid is one component used N times.** The single-axis run can only ever keep one row or one
  column, so before Fix H the other cells lost their `setId` and were built as unrelated panels.
  Grid detection fires only for a true two-dimensional grid — more than one row *and* column,
  equal row widths, columns aligned across rows, evenly spaced gaps on both axes — so every
  one-row/one-column case the existing tests pin still takes the unchanged path.
- **Thresholds carry their evidence.** `src/canvas/ink/constants.ts` states, per constant, the
  fixture that chose the number (e.g. the 0.55 heading/card split is justified against a traced
  seven-glyph 56px word). A future session changing one must change its evidence line too.
