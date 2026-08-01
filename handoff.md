# Handoff — BOSS Blueprint
_2026-07-31 · Stage: **v1.1 "ink is design" — SHIPPED and LIVE at https://sketch.bossolutions.pro/**
(CI green, deployed). v1.1 answers Cam's four gaps plus the BOSS rebrand under one contract
amendment (**v2.4 → v2.5**, schemaVersion still 1)._

## 📍 Current State
- **LIVE at https://sketch.bossolutions.pro/** — custom domain, HTTPS enforced, `BASE_PATH` `/`,
  `public/CNAME` in the Pages artifact; the old `frankyface.github.io/BOSS-Blueprint/` redirects here.
- **Commits:** `c82d917` (v2.5) · `17c3f85` (toolbar/colour-gate/baselines) · `62036cc` (CI budget)
  · the domain repoint. CI **green**, deploy **succeeded**.
- **`e2e/pen-only-site.spec.ts` is the release's proof**, 6 tests × 3 engines: a **zero-block**
  design submits, ships `penRegions`, gets one `**BUILD THIS FROM INK**` marker per top-level
  region, renders a PNG with measurably real ink, and passes `gate.mjs --no-manifest`.
- **The visual gate has a baseline-free axis** — five probes assert the exported PNG's solid fills
  equal their tokens; proven to fail on the rebrand the ratio gate could not see.

## 📂 Files I'm Working On
- None. `scripts/roundtrip/lib/legibility.mjs` + tests are an EARLIER session's uncommitted
  backlog work — do NOT sweep it into a commit.

## ✅ Things I've Changed
- 2026-07-30/31: shipped v2.5 (`role` scoped to unclaimed ink, `panel` given `card`/`mediaBox`,
  toolbar height made a construction, custom domain). Trail: stage files + `docs/decisions.md`.

## ❌ Watch Out
- **A stale `BASE_PATH` is a silent white screen.** 07-31: DNS right, cert right, `200 OK`, blank
  page — assets 404'd against a bundle still built for `/BOSS-Blueprint/`. Neither suite caught it:
  both run against a preview URL *also* derived from `BASE_PATH`, so app and tests agreed with each
  other all the way to production. `src/meta/siteConfig.test.ts` now ties `BASE_PATH` to
  `public/CNAME` — a fact outside the config — and is proven to go red on it. **Self-consistency is
  not correctness.**
- **`roundtrip:smoke` has NOT been run against ANY v1.1 commit.** The `SMOKE-PASS 47` on record is
  an **earlier tree** (`..._B_70454b9`, no `pen-only-site.spec.ts`); the retry died on
  `"OAuth session expired"` without building. Mandatory for `src/export/**` — **v1.1 shipped
  without it.** It could not cover the pen anyway: `penCluster` requires a `target`, so smoke
  proves buildability, never pen content.
- **Visual baselines are HYGIENE, NOT A GATE.** Stale pre-rebrand `-linux` baselines **passed** CI:
  0.756% of pixels past the per-pixel threshold against a 2.000% allowance. Regenerated and
  committed; regeneration stays `workflow_dispatch`-only, by design (`docs/decisions.md` 07-30).
- **TRANSCRIPTION IS NOT PROVEN.** Three builders proved a drawn *box* becomes a styled card in the
  right place and converged on nav labels; they did **not** prove handwritten **words** survive —
  no fixture carries letterforms and those runs shipped no page PNG. **"Structure verified,
  transcription unverified."** Never round this up.
- Keep TS rules and their `scripts/roundtrip/lib/rules/*.mjs` twins in step — `npm test` runs both.
  Contract frozen: decisions entry + version bump + smoke run. Relay is OFF — never say a
  notification was emailed. Fresh clone: `npm ci --prefix scripts/roundtrip`. snapdom: dpr/scale 1.

## ➡️ Next Up
1. **`roundtrip:smoke` against the shipped tree.** PowerShell:
   `$env:ROUNDTRIP_RUNS_DIR = "C:/Users/Public/boss-blueprint/roundtrip-runs"; npm run roundtrip:smoke`
   — the override is required (default run root leaks `~/.claude` into the sterile session), and it
   exits 0 even when it refuses to run: look for `SMOKE-PASS <n>`, never the exit code.
2. Test transcription: draw real words, ship the page PNG, see what a builder returns.
3. Backlog: F1 legibility, F7 vacuous scorer, F8's two candidates, teach the harness the pen, a
   machine-checked contrast floor.
4. Cam (help.md): BOSS-website PR #1 · relay account + two strings · public submit address.

## 🔗 Pointer
→ `staging/stage-5-ink-is-design/overview.md` (5 of 8 done; the 3 open ones name their blockers) ·
rulings `docs/decisions.md` · spec `docs/export-format.md`
