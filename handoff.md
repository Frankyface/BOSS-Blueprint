# Handoff — BOSS Blueprint
_Last updated: 2026-07-29 · Current stage: **v1 COMPLETE** (post-v1 backlog below)_

## 🎯 Goals
v1 is done and live. What remains is Cam's three optional launch items (help.md) and a small
post-v1 backlog — no stage is in flight.

## 📍 Current State
- **ALL FOUR STAGES CLOSED. 22/22 features `verified done`** with independent-review evidence.
- **The round-trip PASSED** at `f016d82`: A/preview **96.36**, A/deployed **96.04**,
  B/preview **92.00** (pass mark 85), smoke 4.18 min, **24/24 hard gates**, every floor met,
  `ship-gate.mjs` exit 0 over the three as a set. Forensically audited at `835fa8f`: committed
  evidence byte-identical to the live run dirs, all five ruled harness fixes proven to bite.
- Live: https://frankyface.github.io/BOSS-Blueprint/ — deployed bundle sha256-identical to the
  local build; `src/` untouched since the gauntlet commit.
- 1740 unit / 687 E2E green ×3 engines; 263 harness tests; CI green at HEAD.
- Relay BUILT, config-gated **OFF** (`BOSS_RELAY` in `site.config.ts`) — zero network calls
  until Cam fills two fields. Report for Cam: `docs/v1-completion-report.md`.

## 📂 Files I'm Working On
- None. Next work is the post-v1 backlog or Cam's launch items.

## ✅ Things I've Changed
- 2026-07-29: Stage 4 CLOSED — harness verified done after final forensic review; DoD met.
- 2026-07-29: round-trip gauntlet PASSED (7 attempts; all 5 defects were in the harness).
- 2026-07-29: notification relay built config-gated off; tour + guard + launch polish verified.
- 2026-07-28: Stage 3 closed; export contract FROZEN at v2.4.

## ❌ Watch Out
- **`npm run roundtrip:smoke` before merging ANY change to `src/export/**`, the schema, the brief
  generator, templates or the PNG renderer** (also in CLAUDE.md). It is the only check that
  proves the package is still buildable by a zero-context session.
- The export contract is FROZEN — changes need a decisions entry + version bump + a smoke run.
- Never say a notification was emailed: nothing has reached an inbox; the relay is OFF.
- Fresh clone: `npm ci --prefix scripts/roundtrip` or the submit E2E fails confusingly.
- snapdom needs dpr:1 + scale:1; visual baselines regenerate ONLY via the workflow_dispatch job.

## ➡️ Next Up (post-v1 backlog — none urgent, all recorded in docs/decisions.md)
1. Rule on a deterministic legibility check (final review F1: a builder's CSS collision rendered
   one CTA label invisible; every hard gate correctly passed it — R8 measures no rendered text).
2. Close F7 (vacuous `scoreImagePlacement` over an empty item set) and triage F8's two Stage-3
   package-defect candidates from the A/preview BUILD_NOTES.
3. Cam's launch items (help.md): merge BOSS-website PR #1 · relay account + two strings ·
   confirm the public submit address · optional `sketch.bossolutions.pro` DNS.

## 🔗 Pointer
→ v1 report: `docs/v1-completion-report.md` · evidence: `staging/stage-4-roundtrip-launch/evidence/` · backlog: `docs/decisions.md` (2026-07-29 entries)
