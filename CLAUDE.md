# BOSS Blueprint

Browser-based website sketch tool for BOSS (bossolutions.pro) clients: lay out pages
PowerPoint-style (structured blocks + freehand pen), page by page, then Submit emails Cam
a Claude-ready build package (site.json + brief.md + page PNGs + assets).

**Stack:** React + Vite + TypeScript · Zustand (immutable updates) · Vitest + Playwright ·
GitHub Pages via Actions · hand-rolled DOM/SVG canvas — NO canvas engine (perfect-freehand pen,
snapdom→html-to-image PNG export; see debate verdict in docs/decisions.md) · delivery:
download-first hybrid (zip always downloads; tiny text-relay notification, wired LAST)

## Session start
1. **Read `handoff.md` first, then follow its Pointer** to the active stage/feature file.
2. Doc model: `CLAUDE.md` = constant · `handoff.md` = head (where we are now) ·
   `staging/<stage>/feature-*.md` = the ordered work list · full vision in `docs/master_plan.md`.
3. Truth hierarchy: actual code/system state > handoff.md > stage files > master_plan.md.
   When docs disagree with reality, fix the docs and say you did.

## Standing command
When the user says **"update all relevant files"**, run `/sync-docs`.

## Verification protocol (fully automated — no human gate)
- Status state machine: `not started → in progress → awaiting verification → verified done`.
- `verified done` REQUIRES a dated Verification Log entry with real output/evidence. No exceptions.
- Minimum bar for any code change: (1) runs without errors, (2) unit tests pass,
  (3) behavior exercised end-to-end via Playwright. All three or it isn't done.
- `/verify` executes the active feature's "How We'll Verify" steps and records evidence.
- Never weaken success criteria to pass; changes need user sign-off + a docs/decisions.md entry.
- If verification is blocked on something only Cam can do (account, key, DNS): status stays
  `awaiting verification`, add the blocker to help.md, and say so.

## Process rules (from kickoff)
- Open design questions → two Fable agents argue opposing positions; main session judges;
  verdict appended to `docs/decisions.md`. Implementation → Opus agents build; Opus agents review.
- Hard constraints: everything free-tier · NO backend/database/accounts · desktop-first ·
  export must stay buildable by a fresh Claude session with zero extra context (the round-trip test).

## Conventions
- Commits: conventional format (`feat:` `fix:` `docs:` `test:` `chore:`). NO AI attribution lines.
- Solo trunk workflow: work on `main`, commit at every verified-green checkpoint, push after commit.
- Code: immutable state updates only · TypeScript strict · source files <400 lines (test/E2E-support <600) ·
  named constants over magic numbers · validate at boundaries (file import, form submit).
- Run: `npm run dev` · unit: `npm test` · E2E: `npm run e2e` · build: `npm run build`.
  (Fresh clone: `npm ci --prefix scripts/roundtrip` once, or the submit E2E fails confusingly.)
- **`npm run roundtrip:smoke` is MANDATORY before merging any change to `src/export/**`, the
  schema, the brief generator, the starter templates or the PNG renderer** — it is the only
  check that proves the package is still buildable by a zero-context session (~12 min).
- `handoff.md` hard budget: ≤60 lines — snapshot, not journal.
