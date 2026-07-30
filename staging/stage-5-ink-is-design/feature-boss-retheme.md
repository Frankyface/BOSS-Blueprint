# Feature: BOSS Brand Retheme
_Stage: stage-5-ink-is-design · Status: awaiting verification_

## Goal
Make the tool look like it belongs to BOSS. `src/styles/theme.css` and the component CSS move to
the BOSS palette — **`#0b7ebb` / `#09679a` / `#63b3ed` / `#f2f8fc`** — and the brand assets
(favicon, apple-touch icon, OG card) are regenerated to match.

It rides in this stage rather than its own because it changes the **exported page PNGs** (the
button pill is now BOSS blue, bands are `#f2f8fc`), and anything that changes an exported byte
belongs behind the same smoke run as the contract amendment.

## Success Criteria
- [x] `src/styles/theme.css` carries the BOSS tokens: `--boss-brand: #0b7ebb`,
      `--boss-brand-dark: #09679a`, `--boss-brand-light: #63b3ed`, `--boss-brand-tint: #f2f8fc`
- [x] **Filled controls use `--brand-dark`, not `--brand`** — white on `#0b7ebb` is **4.45:1** and
      misses AA; on `#09679a` it is **5.8:1**. Hover goes darker
- [x] `--boss-brand` is used for **outlines and fills only**, never for text on white
- [x] **Amber survives as `--boss-warn` (`#f4b23e`)** so the storage notice keeps its distinct
      meaning instead of dissolving into the brand
- [x] The component CSS follows the tokens rather than re-declaring colours
- [x] Brand assets regenerated (`node scripts/brand/make-brand-assets.mjs`)
- [x] Brand tokens resolve in a running browser
- [x] **The `export-visual` suite passes on the Linux runner** — it did, at `c82d917`, against the
      **stale pre-rebrand** baselines. That is a finding about the gate, not a pass for the rebrand
- [ ] **Regenerated Linux baselines committed** — the job has RUN and produced an artifact; the
      artifact is **not in the repo** (see below). Hygiene, **not a gate**
- [ ] **CI green on `main`** — CI is RED at `c82d917`, on `pen-reading.spec.ts:172`, which is
      nothing to do with the theme (see feature-ink-reading-overlay.md)
- [ ] **Live** — v1.1 is not deployed
- [ ] **A machine-checked contrast floor** — still nothing in `src/` or `e2e/` computes a ratio

## How We'll Verify
1. Unit + build: `npm test`, `npm run lint`, `npm run build` clean with the new tokens.
2. Visual: regenerate the `export-visual` baselines on **every** platform CI runs on, via the
   manual `update-visual-baselines` `workflow_dispatch` job, and commit them.
3. Live: load the app and read the computed custom properties.
4. Contrast: every foreground/background pair used for text clears 4.5:1.
5. Record below.

## Verification Log

### 2026-07-30 — the baseline "blocker" was WRONG, and is now measured (still awaiting verification, for different reasons)

**The 2026-07-29 entry's central prediction was false and this entry corrects it.** It said the
visual spec "is expected to **fail** on Linux until the baselines are regenerated". It did not
fail. CI run **30556114726** (push of `c82d917`) passed **all six** baseline comparisons against
the stale, pre-rebrand `-linux` images. The E2E job went red on `pen-reading.spec.ts:172` and
nothing else; `export-visual` was green.

**Why — measured, not guessed** (`docs/decisions.md`, 2026-07-30, "the visual gate cannot see a
brand-wide colour change"). Old vs new `export-home-chromium-win32.png` (1200×1600):

| Measure | Value |
|---|---|
| Pixels differing **at all** | **23.099%** |
| Pixels differing **past the per-pixel threshold** | **0.756%** |
| `MAX_DIFF_PIXEL_RATIO` allowance | **2.000%** |

The whole rebrand lands at about a third of the allowance. The band shift (`#f2f5fa` → `#f2f8fc`)
covers a fifth of the page but is too subtle to clear the per-pixel threshold; the button pill
(amber → `#09679a`) is dramatic per pixel but covers well under 1% of it. Nothing in between is
measured. **Consequence: regenerating the `-linux` baselines is HYGIENE, not a gate.** Any record
— including the 2026-07-29 entry below and the old `handoff.md` — claiming the baselines block CI
or the deploy is now **false**.

**The regeneration job has RUN, and its output is NOT yet in the repo.**

| Evidence | Result |
|---|---|
| Run **30560085196**, `workflow_dispatch`, 2026-07-30T16:08:30Z | job "Regenerate export visual baselines (ubuntu)" **succeeded** in 1m19s |
| Command | `npx playwright test e2e/export-visual.spec.ts --update-snapshots=all` — 9 tests, **7 passed / 2 skipped** |
| Files rewritten | `export-home-{chromium,firefox,webkit}-linux.png`. The three `export-gallery-*-linux.png` were re-written byte-identical — the rebrand does not touch that render |
| Artifact | **`visual-baselines-linux`**, 146816 bytes, artifact id **8766507712** |
| In the repo? | **NO.** VERIFIED: `git status e2e/` reports no snapshot modifications. The artifact must still be downloaded and committed |

**Everything else about the retheme is unchanged and green.** CI run 30556114726 at `c82d917`:
unit **116 files · 2241 passed · 0 failed**, lint, build, `schema:check` and
`roundtrip:gate:selftest` all green. The brand assets were already regenerated (2026-07-29 entry;
`handoff.md` has now been corrected on that point).

**WHY THIS IS STILL NOT `verified done` — the honest list, with the old reasons removed:**

1. **The regenerated Linux baselines are not committed.** Hygiene, but the committed reference
   images still depict the pre-rebrand product, which will mislead the next reader of a diff.
2. **CI is RED on `main`** — on `pen-reading.spec.ts:172`, a toolbar/font-metrics defect unrelated
   to the palette (chromium +31px, firefox +32px). "CI green on `main`" is a stage-level gate this
   feature cannot satisfy alone.
3. **v1.1 is not deployed.** The Deploy job did not run in either 30556114726 (E2E failed) or
   30560085196 (dispatch job only). The live site is still v1.
4. **No automated contrast check exists.** Re-VERIFIED by search: nothing under `src/` or `e2e/`
   computes a contrast ratio. The "27/27 pairs pass" figure and `theme.css`'s inline ratios
   (4.45:1, 5.8:1, 4.2:1) remain one-off implementer measurements with no regression guard.

**To reach `verified done`:** download artifact `visual-baselines-linux` from run 30560085196 and
commit the three changed `-linux` PNGs; get CI green on `main`; deploy and confirm the live bundle.
The contrast guard is worth filing as backlog rather than blocking — but item 4 stays unchecked
until it exists.

### 2026-07-29 — retheme landed and locally green; the baseline regeneration is NOT done (SUPERSEDED — its "visual spec WILL fail on Linux" prediction was measured and is FALSE; kept as history)

| Check | Result |
|---|---|
| `npm test` | 119 files · **2228 passed** · 2 skipped · 0 failed |
| `npm run lint` · `npm run build` · `npm run schema:check` | all clean |
| `npm run e2e` (3 engines, **on this win32 machine**) | **720 passed**, 0 failed |
| `npm run roundtrip:smoke` | **SMOKE-PASS 47**, 4m04s |

**Live in-browser check, this machine:** the brand tokens resolve — `--boss-brand` computes to
**`#0b7ebb`**.

**Brand assets ARE regenerated — `handoff.md` is stale on this point.** VERIFIED in this session,
by reading the files rather than trusting the note:
- `public/favicon.svg` now paints the mark in **`#63b3ed`** on `#0b1220`; there is no amber in it.
- `public/favicon.ico`, `public/apple-touch-icon.png` and `public/og-card.png` all differ from
  `HEAD` (`git diff --stat`), and the rendered `apple-touch-icon.png` is the **blue BOSS mark**.
- `scripts/brand/make-brand-assets.mjs` was itself updated (+19/−6) and run.

`handoff.md` still lists this as outstanding ("favicon/apple-touch/og-card still carry the amber
mark"). It is not outstanding. That file is another agent's to correct — this record notes the
discrepancy rather than editing it.

**WHY THIS IS NOT `verified done`:**

1. **The Linux visual baselines are stale.** VERIFIED: of the twelve files in
   `e2e/export-visual.spec.ts-snapshots/`, only
   `export-home-{chromium,firefox,webkit}-win32.png` differ from `HEAD`. All six `*-linux.png`
   baselines — the ones the CI runner compares against — are **untouched**, and so are the three
   `export-gallery-*-win32.png`. The retheme changed exported pixels (button pill, bands), so the
   visual spec is expected to **fail on Linux** until the baselines are regenerated.
2. **The regeneration job exists but has not been run.** VERIFIED: `.github/workflows/deploy.yml`
   defines the `update_visual_baselines` input and an `update-visual-baselines` job that
   regenerates the baselines for **that runner's** platform, deliberately gated behind
   `workflow_dispatch` and explicitly excluded from deploying. Nothing in this change set shows it
   having run.
3. **CI has therefore not been green for v1.1**, and **v1.1 is not deployed** — every check above
   is a local win32 result.
4. **No automated contrast check exists.** VERIFIED by search: nothing under `src/`, `e2e/` or
   `scripts/` computes a contrast ratio. The "27/27 pairs pass" figure in `handoff.md` is a
   one-off measurement, and the token-level ratios quoted in `theme.css`'s own comments (4.45:1,
   5.8:1, 4.2:1) are implementer assertions with no regression guard. The related open item on the
   ink-reading labels is in feature-ink-reading-overlay.md.

**To reach `verified done`:** run the `update-visual-baselines` dispatch on every platform CI uses,
commit the regenerated baselines, get CI green on `main`, then deploy and confirm the live bundle.
**→ Partly done, and reason 1 above was WRONG:** the dispatch ran (30560085196) and the stale
baselines had been passing CI all along. See the 2026-07-30 entry.

## Open Questions
1. **Should the visual baselines be per-platform at all?** They already are, on purpose — a
   baseline is a picture of one operating system's font rendering. **Recommendation:** unchanged;
   the cost is the manual dispatch, and that cost is exactly what is unpaid right now.
2. **Should there be a machine-checked contrast floor?** **Recommendation:** yes, as a small unit
   test over the token pairs. Not a v1.1 blocker, but the current state means an accessibility
   regression ships silently.
3. **Does the amber storage notice still read as a warning beside BOSS blue?** It was kept
   deliberately. **Recommendation:** confirm with Cam by eye once v1.1 is live.

## Notes & Decisions
- **`--brand-dark` for filled controls is not a style choice.** White on `#0b7ebb` is 4.45:1 —
  below AA — so the fill had to be the darker token. `theme.css` records the numbers beside the
  tokens so a future session cannot "simplify" them back.
- **Amber was kept, not replaced.** `--boss-warn` keeps the storage notice meaning *warning*
  rather than *brand*; folding it into the palette would have cost a real signal.
- **Retheme lands with the amendment on purpose.** It changes exported bytes, and the repo
  convention is that anything touching `src/export/**` or the PNG renderer goes behind
  `npm run roundtrip:smoke` before merge (CLAUDE.md → Conventions).
- **A pre-existing AA failure was fixed in passing** (`handoff.md`, 2026-07-29): the SidePanel
  placeholder went from 3.76:1 to 4.70:1. Recorded here because it is part of the same pass, not
  because this stage introduced it.
