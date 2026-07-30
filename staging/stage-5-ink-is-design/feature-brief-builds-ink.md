# Feature: `brief.md` Tells the Builder to BUILD the Ink (F5)
_Stage: stage-5-ink-is-design · Status: awaiting verification_

## Goal
The contract can now say *this ink is a card* (feature-pen-regions-contract.md). This feature makes
the **brief** say so too — to a zero-context Claude session that has never seen this repo, in
language it cannot read as decoration.

Before: the brief described pen marks as notes *about* the design. A builder reading it did the
right thing by ignoring them. After: ink is design, and skipping it is a failed build.

## Success Criteria
- [x] A standalone paragraph states the precedence outright:
      **"Ink is not commentary on the design — ink IS design."**
- [x] `Scope` is amended so **building a drawn region is explicitly not "inventing"** — the
      builder's own anti-invention instruction used to forbid exactly this
- [x] DoD items 2 and 8 are **unfailable-by-omission** — a builder cannot satisfy them by leaving
      the ink out
- [x] **One `**BUILD THIS FROM INK**` marker per TOP-LEVEL region**, count-enforced by V30
- [x] The marker regex is **anchored to a bullet** (`BUILD_FROM_INK_RE` in
      `src/export/validate/rules/briefCrossCheck.ts`), so the DoD boilerplate and any prose that
      merely *names* the marker cannot be counted
- [x] Drawn artwork is reproduced by the builder from `penStrokes[].points` as **inline SVG**;
      handwriting too small to read is **re-rendered at 4×** from the same points.
      **Zero new files in the zip**
- [x] The prose states only what was **measured** — word counts and glyph heights — and stays
      silent on line counts it has not earned (`text.lines` exists only for `textPlaceholder`)
- [ ] **A real zero-context builder session has read a `**BUILD THIS FROM INK**` marker and built
      the region** — has never happened (see Verification Log)

## How We'll Verify
1. Unit: `src/export/brief/ink.test.ts` per branch (each region kind, each variant, `clear` vs
   `unsure`, set membership), `pen.test.ts` for the annotation path that must NOT change, and the
   **wide fixture** snapshot (`src/export/brief/__snapshots__/wide-fixture.md`) as the whole-brief
   ground truth.
2. Cross-check: V30's marker count against `site.json`'s top-level regions, TS rule and `.mjs`
   twin (`scripts/roundtrip/rules-brief.test.mjs`).
3. Spec equality: `specEquality.test.ts` + Appendix A tests B and D over
   `docs/export-format.md` §7.1/§7.2.
4. **Round-trip: a real builder session receives a brief containing the marker and builds it.**
5. Record below.

## Verification Log

### 2026-07-29 — built, unit-verified, and the new code is PROVEN to run — but no builder has ever seen a marker (awaiting verification)

| Check | Result |
|---|---|
| `npm test` | 119 files · **2228 passed** · 2 skipped · 0 failed |
| `npm run lint` · `npm run build` · `npm run schema:check` | all clean |
| `npm run roundtrip:gate:selftest` | PASSED, **45/45** mutations caught |
| `npm run e2e` (3 engines) | **720 passed** |
| `npm run roundtrip:smoke` | **SMOKE-PASS 47**, 4m04s, run root `C:/Users/Public/boss-blueprint/roundtrip-runs/2026-07-30T01-12-34-144Z_B_70454b9` |
| `docs/export-format.md` §7.1 | **byte-identical**; §7.2 moves only where the amended boilerplate is quoted into it — Appendix A tests **B** and **D** |

**Files:** `src/export/brief/ink.ts` (+ `ink.test.ts`), `inkBullets.ts`, `inkContents.ts`,
`pen.ts` (+ `pen.test.ts`), `boilerplate.ts`, `generateBrief.ts`, `wideFixture.test.ts` and the
committed snapshot `__snapshots__/wide-fixture.md`; twin coverage in
`scripts/roundtrip/lib/rules/brief.mjs` and `scripts/roundtrip/rules-brief.test.mjs`.

**The one piece of real-package evidence, stated precisely.** The smoke run's built package
contained a `brief.md` carrying the **new precedence line**. That proves the amended generator ran
in a real export, not just in a test harness — the boilerplate change is live. It proves nothing
about the region path.

**WHY THIS IS NOT `verified done`:**

1. **The smoke package contained ZERO `penRegions`**, so it contained **zero
   `**BUILD THIS FROM INK**` markers.** No builder session has ever been asked to build a drawn
   region. The instruction that this whole feature exists to deliver is, end to end, untested
   against its actual audience.
2. **The harness cannot produce such a brief.** `scenarios/scenario.schema.json`'s `penCluster`
   requires a `target`, so an untargeted mark — the only kind that becomes a region — cannot be
   expressed; `report.mjs` nulls S6 under `--smoke`. `docs/decisions.md` (2026-07-29) records this
   and says plainly not to claim smoke as evidence for the pen work.
3. **The wide fixture is the strongest evidence available, and it is a fixture.** It exercises
   every branch and pins the exact prose byte for byte, which is what makes a generator change
   safe to review. It cannot tell you whether a fresh Claude session *acts* on the marker.

**To reach `verified done`:** the harness fix (`handoff.md` → Next Up 2), then a round-trip run
whose brief carries markers, with the builder's output showing the region actually built. Until
then no session may say the builder builds ink — only that it is **told** to.

## Open Questions
1. **Is one marker per top-level region the right granularity?** Nested cards are their parent's
   business, so a 2×2 grid produces one marker for the grid, not four. **Recommendation:** keep —
   it matches how the region set models "one component used N times", and V30 counts what the
   brief actually promises.
2. **Should the brief print a line count for handwriting?** Ruled **no**: `text.lines` is earned
   only for `textPlaceholder`, so the prose states word counts and glyph heights it has measured
   and stays silent on lines it has not. **Recommendation:** unchanged — a fabricated line count
   is exactly the kind of confident wrongness the `unsure` model exists to avoid.
3. **Does the anti-invention Scope wording still hold for an `unsure` region?** The builder is told
   to build it and to treat the PNG as the tie-breaker. **Recommendation:** watch the first real
   run; if builders hedge on `unsure` regions, the wording needs a worked example, not a new rule.

## Notes & Decisions
- **The marker is counted, not merely present.** A count invariant is what makes omission
  detectable; V30 uses the same shape V7 already ran for `WRITE THIS COPY` and `SOURCE AN IMAGE`.
- **Anchoring the regex to a bullet is load-bearing.** Without it, the DoD boilerplate that
  *mentions* the marker would be counted as a promise to build something, and V30 would BLOCK
  every package.
- **No new files in the zip.** Artwork and small handwriting are rebuilt from
  `penStrokes[].points`, which the package already carries. Shipping crop PNGs or traced SVGs was
  rejected: `asset.path` is pattern-locked, V12 BLOCKs extras in two implementations, and a
  zip-layout change would be a `schemaVersion: 2` bump.
- **§7.1 byte-identity is the safety proof for this rewrite.** A brief-generator change that
  altered the frozen section would have been a contract break in disguise; it was proved
  mechanically (Appendix A tests B and D), never by reading the diff.
