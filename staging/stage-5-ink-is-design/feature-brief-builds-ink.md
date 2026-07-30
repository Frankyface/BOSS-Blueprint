# Feature: `brief.md` Tells the Builder to BUILD the Ink (F5)
_Stage: stage-5-ink-is-design · Status: verified done_

> **Scope, stated before the claims.** This feature is verified for **structure**: a drawn shape is
> named to the builder as a thing to build, and builders build it. It is **not** evidence that
> handwritten **words** survive — no fixture in this repo carries letterforms, and no experiment has
> asked a builder to transcribe any. "Structure verified, transcription unverified" is the whole
> summary; do not let a later session round it up.

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
- [x] **A real zero-context builder session has read a `**BUILD THIS FROM INK**` marker and built
      the region** — **three** independent sessions did (`docs/decisions.md`, 2026-07-30). No
      transcript was archived; see the caveat in the Verification Log
- [x] **V30's count invariant holds on a package produced through the real UI** —
      `e2e/pen-only-site.spec.ts` compares the marker count against the shipped `site.json`'s own
      top-level regions, green on three engines in CI

_(Transcription — handwritten words coming out verbatim — is deliberately NOT a criterion here; see
the Scope note at the top and `overview.md`'s standing limits.)_

## How We'll Verify
1. Unit: `src/export/brief/ink.test.ts` per branch (each region kind, each variant, `clear` vs
   `unsure`, set membership), `pen.test.ts` for the annotation path that must NOT change, and the
   **wide fixture** snapshot (`src/export/brief/__snapshots__/wide-fixture.md`) as the whole-brief
   ground truth.
2. Cross-check: V30's marker count against `site.json`'s top-level regions, TS rule and `.mjs`
   twin (`scripts/roundtrip/rules-brief.test.mjs`).
3. Spec equality: `specEquality.test.ts` + Appendix A tests B and D over
   `docs/export-format.md` §7.1/§7.2.
4. **A real zero-context builder session receives a brief containing the marker and builds it.**
5. E2E: the marker count on a package produced through the real UI matches that package's own
   top-level regions, and the pen-only prose is present verbatim.
6. Record below.

## Verification Log

### 2026-07-30 — builders have now read the markers and built the regions (verified done)

The 2026-07-29 blocker — "no builder session has ever been asked to build a drawn region" — is
closed, and closed twice over, at two different levels.

**(1) A real zero-context builder acted on the markers — three of them.** `docs/decisions.md`,
2026-07-30 ("v2.5 follow-up") records the experiment: a **real exported package** (`site.json` +
`brief.md`) was handed to **three independent zero-context Claude sessions**, each asked what it
would build. All four of the owner's original complaints came back **built** by all three — the
cards as ONE component instantiated twice, the heading as the page's single `<h1>`, the nav as a
real nav, and the drawings as inline per-stroke SVG — with converged nav labels. Two builders
volunteered that the brief overrode an instinct to skip or substitute ("my instinct was to
substitute a clean stock illustration"), which is the precedence paragraph doing its job.

**The experiment also found two data defects the prose was papering over**, and both were fixed in
`c82d917`: every stroke was shipping `role: "annotation"` even when a region claimed it (a builder
obeying §3.3's precedence literally, with no goodwill, would have shipped a **blank page**), and
three byte-identical `panel/card` regions were described by the brief as an `<img>` placeholder.
Those two fixes are the strongest corroboration that the runs happened as recorded: they are
specific, they are in the commit, and they are pinned by tests and by `schema:check`.

**CAVEAT, stated plainly: no transcript was archived.** There is no
`staging/stage-5-ink-is-design/evidence/` directory — VERIFIED by listing. The three runs exist in
the repo only as `docs/decisions.md` prose plus the code they caused. That is a real, dated,
in-repo record written by the session that ran them; it is **weaker** than Stage 4's convention of
copying `report.md` and artefacts into `staging/**/evidence/`, and a future session cannot re-read
what the builders actually said. Open Question 1 of feature-review-fixes.md applies here too.

**(2) V30's invariant is now checked against a live package, in CI.**
`e2e/pen-only-site.spec.ts` submits a design with zero blocks and then, on the shipped bytes:

- counts `**BUILD THIS FROM INK**` markers with a bullet-anchored regex **restated** in the spec
  rather than imported (the E2E project compiles under `tsconfig.e2e.json`, `include: e2e/**`);
- asserts that count equals the number of **top-level** regions in the package's own `site.json`
  (`parentRegionId === null`) — so a classifier that changes its mind cannot make the test agree
  with it;
- asserts `brief.md` contains, verbatim, `This page has no blocks — the client drew it instead.`
  and `**What the client drew on this page** — build every one of these:`;
- asserts each top-level bullet cites a stroke id that is really in the package.

| Evidence | Result |
|---|---|
| Commit | **`c82d917`** on `main`, 143 files, +17185/−306, 2026-07-30 10:32:12 −0400 |
| CI run **30556114726** (push of `c82d917`, ubuntu) | unit **116 files · 2241 passed · 0 failed**; lint, build, `schema:check`, `roundtrip:gate:selftest` green; E2E **726 passed / 2 failed / 1 flaky** of 732 — both failures `pen-reading.spec.ts:172`, neither in this spec |
| `npx playwright test e2e/pen-only-site.spec.ts --list` | **6 tests** (2 × chromium/firefox/webkit) |
| `docs/export-format.md` §7.1 | still **byte-identical** through the follow-up fixes (Appendix A tests B and D) |

**STILL NOT PROVEN — transcription.** The three builder runs shipped **no page PNG** and the
fixtures carry **synthetic strokes with no letterforms**. So "a drawn box becomes a styled card in
the right place" is verified, and "your handwritten words come out verbatim" is not — not by the
builders, not by the wide fixture, not by the E2E. `docs/decisions.md` and the commit message both
say so; this file says so too, and it must keep saying so until someone draws real words and reads
the result.

**Also still true:** `roundtrip:smoke` has **not** been run against `c82d917` (the only
`SMOKE-PASS 47` verdict belongs to run root `2026-07-30T01-12-34-144Z_B_70454b9`, an earlier tree;
a later attempt aborted on an expired OAuth credential), and the harness still cannot express an
untargeted pen mark.

### 2026-07-29 — built, unit-verified, and the new code is PROVEN to run — but no builder has ever seen a marker (SUPERSEDED by the entry above; kept as history)

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
**→ MET by a different route:** three zero-context builders read the markers and built the regions
(2026-07-30 entry). The harness fix is still the missing *automatic* detector for scenarios
`pen-only-site.spec.ts` does not draw, and stays on the Next Up list.

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
