# Handoff — BOSS Blueprint
_2026-07-30 · Stage: **v1.1 "ink is design" — COMMITTED, CI red on one real layout defect, not
deployed.** v1 is live; v1.1 answers Cam's four gaps plus the BOSS rebrand under one contract
amendment (**v2.4 → v2.5**, schemaVersion still 1)._

## 📍 Current State
- **Committed: `c82d917`** on `main`, 143 files, +17185/−306 — the "everything is uncommitted"
  caveat in older records is **obsolete**. Deploy has not run since Stage 4: the live site is v1.
- **CI run 30556114726** (push of `c82d917`, ubuntu): unit **116 files / 2241 tests / 0 failed**;
  lint, build, `schema:check`, `roundtrip:gate:selftest` 45/45 green. **E2E RED** — see below.
- **`e2e/pen-only-site.spec.ts` is the release's proof**, 6 tests × 3 engines green in that run: a
  **zero-block** design submits, ships `penRegions`, gets one `**BUILD THIS FROM INK**` marker per
  top-level region *counted against the package's own `site.json`*, renders a PNG with measurably
  real ink, and passes `gate.mjs --no-manifest`. Closed the named blocker on F0, F4 and F5 at once.

## 📂 Files I'm Working On
- `pen-reading` layout fix, **in flight and uncommitted** (`CanvasToolbar.*`, `PenControls.*`,
  `PageSpaceControls.*`, `PenSettings.*`); `scripts/roundtrip/**` + `docs/decisions.md` mid-edit elsewhere; `lib/legibility.mjs` is post-v1 backlog 1 — do NOT sweep it in.

## ✅ Things I've Changed
- 2026-07-30: committed v2.5 as `c82d917`; `penStroke.role` scoped to unclaimed ink and `panel`
  given `card`/`mediaBox` variants (found by three zero-context builder runs); measured that the
  visual gate cannot see the rebrand; regenerated the Linux baselines. (2026-07-29's amendment,
  retheme and pen relabel are recorded in the stage files.)

## ❌ Watch Out
- **CI IS RED, on two things, neither of them the export.** (1) `pen-reading.spec.ts:172` "never
  costs the client a row of canvas" — the toolbar wraps under ubuntu font metrics and steals a row
  of drawing area: **chromium +31px** (89.375→120.375), **firefox +32px**; passes on webkit and on
  Windows. **A real platform-metrics defect the Windows-only local runs could not see, not flake.**
  Fix in flight. (2) `launch-polish.spec.ts:399` opacity `1` vs `0.998593` — flaky.
- **`roundtrip:smoke` has NOT been run against `c82d917`.** The `SMOKE-PASS 47` on record belongs
  to run root `2026-07-30T01-12-34-144Z_B_70454b9` — an **earlier tree** (sha 70454b9 + 129 dirty
  files, no `pen-only-site.spec.ts`); a later attempt died on `"OAuth session expired"` without
  building. Mandatory for `src/export/**`; **the merge happened without it.** It could not cover
  the pen anyway — `penCluster` requires a `target`, so smoke proves buildability, never pen content.
- **Visual baselines are HYGIENE, NOT A GATE — any record saying otherwise is false.** The stale
  pre-rebrand `-linux` baselines **passed** CI. Measured: **23.099%** of pixels differ at all,
  **0.756%** past the per-pixel threshold, allowance **2.000%** (`docs/decisions.md` 2026-07-30).
  The job has run (**30560085196**, artifact `visual-baselines-linux`) — **not yet committed**;
  regeneration is `workflow_dispatch`-only, by design.
- **TRANSCRIPTION IS NOT PROVEN.** Three builders proved a drawn *box* becomes a styled card in the
  right place and converged on nav labels; they did **not** prove handwritten **words** survive —
  no fixture carries letterforms and those runs shipped no page PNG. **"Structure verified,
  transcription unverified."** Never round this up.
- Keep TS rules and their `scripts/roundtrip/lib/rules/*.mjs` twins in step — `npm test` runs both.
  Contract frozen: decisions entry + version bump + smoke run. Relay is OFF — never say a
  notification was emailed. Fresh clone: `npm ci --prefix scripts/roundtrip`. snapdom: dpr/scale 1.

## ➡️ Next Up
1. Land the toolbar fix → CI green; commit the baselines artifact; run `roundtrip:smoke` against
   the committed tree; then deploy v1.1.
2. Test transcription: draw real words, ship the page PNG, see what a builder returns.
3. Backlog: F1 legibility, F7 vacuous scorer, F8's two candidates, teach the harness the pen, a
   machine-checked contrast floor.
4. Cam (help.md): BOSS-website PR #1 · relay account + two strings · public submit address · DNS.

## 🔗 Pointer
→ `staging/stage-5-ink-is-design/overview.md` (5 of 8 `verified done`; the 3 open ones name their
own blockers) · rulings `docs/decisions.md` · spec `docs/export-format.md`
