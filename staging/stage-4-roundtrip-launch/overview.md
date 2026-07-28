# Stage 4 — Round-trip & Launch

## Goal
Prove the entire value chain with the round-trip test, then polish and go live as a BOSS
lead-capture tool.

Stage 3 makes the package. **This stage only measures whether the package works** — and then
puts a front door on the thing. Nothing in this stage may weaken the measurement to make it
pass: the gating instrument is `docs/roundtrip-protocol.md`, which is executable spec, and the
feature files below turn it into runnable code without softening a single threshold.

## Features
- [ ] feature-roundtrip-harness.md — the protocol as runnable scripts: scenario files A + B,
      the scripted Playwright fake client, package capture, the sandboxed zero-context builder,
      zero-questions detection, the evaluator agent + 8 hard gates + 100-pt rubric, evidence
      archiving, failure routing. **This is the stage.**
- [ ] feature-onboarding-tour.md — 30-second first-run pointers (palette · pen · pages · side
      panel · submit); dismissible, never blocking, once per browser, re-openable from a help
      control
- [ ] feature-desktop-guard.md — small-viewport notice ("Blueprint works best on a computer")
      that warns about *editing* and never blocks *reading*
- [ ] feature-launch-polish.md — BOSS branding pass, favicon, footer link to bossolutions.pro,
      title/meta/social card, the UX audit's POLISH items, Lighthouse targets, README refresh,
      and the help.md launch items surfaced as awaiting-human

**Build order** (dependencies, not preference): the harness's scenario files + fixtures + client
driver can be written the moment Stage 3's submit path is green; the tour and the guard must
land **before** the three clean gating runs, because they change the first-run DOM the client
driver walks through and the deployed UI the ship-gate leg exercises. Launch polish lands last —
it is the only feature whose changes cannot invalidate a round-trip run (see Notes).

## Stage entry conditions (assert before starting, don't assume)
1. Stage 3 is `verified done` — its DoD includes the package gate passing on a real E2E zip
   (`staging/stage-3-export-delivery/overview.md` DoD), which is this stage's SEG-2.
2. `scripts/roundtrip/gate.mjs` exists and exits 0 with `--no-manifest` on a Stage 3 zip. Stage 4
   adds step 4 (the scenario manifest diff) behind `--scenario`; it does not rebuild steps 1–3.
3. The **deployed** GitHub Pages bundle is the commit under test. As of the 2026-07-28 UX audit
   the live deploy had no Submit control, no image upload and no pen at all — a `deployed` leg
   run against that build would fail for a reason that has nothing to do with the package. The
   harness asserts bundle identity mechanically (feature-roundtrip-harness.md R3.6); a mismatch
   aborts as PRECONDITION, never as a product FAIL.

## Definition of Done (testable checklist)
- [ ] **Three clean uncached round-trip runs PASS**, per `docs/roundtrip-protocol.md` §8.2 — no
      cached segments, no scan-rule or scenario edits mid-sequence, `git status` clean and the
      same `HEAD` sha recorded in all three `run-manifest.json` files:
  - [ ] Scenario A (Cedar & Stone Landscaping, template start) on target `preview`
  - [ ] Scenario A on target `deployed` (the live Pages URL — this is the leg that satisfies
        "the REAL deployed UI")
  - [ ] Scenario B (North Star Dog Grooming, blank start) on target `preview`
- [ ] Each of the three: all hard gates H1–H8 green, total score **≥ 85**, **every** per-dimension
      floor met, `verdict.txt` reads `PASS <score>`, exit code 0
- [ ] Evidence recorded per repo convention: run paths, verdict lines and score tables in
      feature-roundtrip-harness.md's Verification Log; `report.md` + 2 representative
      side-by-side sketch/shot pairs per scenario copied into
      `staging/stage-4-roundtrip-launch/evidence/` and committed
- [ ] `npm run roundtrip:smoke` green and ≤ 12 minutes, and the "run smoke before merging any
      change to `src/export/**`, the schema, the brief generator, templates or the PNG renderer"
      rule is recorded in `handoff.md` and `CLAUDE.md` conventions
- [ ] **App live** on GitHub Pages at the shipped commit: CI green on `main`, live URL returns
      HTTP 200, and the deployed hashed bundle filename equals the local `npm run build` output
      at that commit (the same identity check the harness uses)
- [ ] **Tour verified by E2E**: first visit shows the pointers; they never block interaction;
      dismissal persists across reload; a fresh profile sees them again; the help control
      re-opens them (`npx playwright test e2e/onboarding-tour.spec.ts`, 3 engines, green)
- [ ] **Guard verified by E2E**: at a mobile viewport the notice appears and the canvas remains
      readable, scrollable and hit-testable underneath it; above the threshold the notice is
      absent (`npx playwright test e2e/desktop-guard.spec.ts`, 3 engines, green)
- [ ] `npm run lint`, `npm test`, `npm run build`, `npm run e2e` all green in CI on `main`
- [ ] Lighthouse desktop on the deployed URL meets the targets in feature-launch-polish.md and
      the named-audit floor list has zero failures
- [ ] **Launch checklist closed or explicitly awaiting-human.** Every item is either done with
      evidence, or listed in `help.md` under Open with a dated blocker line and repeated here.
      Currently awaiting Cam (`help.md`):
  - [ ] "Sketch your site" link on bossolutions.pro — **awaiting human**, blocks nothing else
  - [ ] DNS `sketch.bossolutions.pro` → GitHub Pages — **awaiting human, optional**, rides on
        the pending BOSS DNS repoint off GoHighLevel; the app ships on
        `https://frankyface.github.io/BOSS-Blueprint/` regardless
  - [ ] The email relay account (`help.md`) is a Stage 3 blocker, not Stage 4's — but if it is
        still open at stage close, say so here rather than letting it look resolved
- [ ] Every feature file above is `verified done` with Verification Log evidence

**Nothing on the awaiting-human list may be silently checked off, reworded into a done state, or
absorbed into another item.** If Cam has not done it, the stage closes with the item visible and
the status line saying so (CLAUDE.md verification protocol: blocked-on-Cam stays
`awaiting verification` + a help.md entry).

## Open Questions
1. **Does a launch-polish change invalidate an already-green round-trip run?** Polish touches the
   header, footer, favicon, `<title>`/meta and the tour/guard chrome — none of which the package
   contract or the builder ever sees, but all of which are in the DOM the client driver walks.
   **Recommendation:** polish lands *before* the three clean runs and the runs are the last thing
   that happens; if a polish fix is genuinely needed afterwards, re-run **A-preview only** (the
   cheapest of the three) and record why. Never ship on runs older than the shipped commit.
2. **Does the tour interfere with the client driver?** It will: the driver's first action is a
   palette click and the tour's first pointer sits on the palette. **Recommendation:** the driver
   dismisses the tour explicitly as its first scripted step (a real client action, UI-only,
   §1.4 rule 1 compliant) and screenshots it — that also makes the tour's dismissal path part of
   the gating evidence rather than something the harness routes around. (Already written into
   feature-roundtrip-harness.md R2.3; the open part is whether that is the right call, not
   whether it is specified.)
3. **RULED 2026-07-28 (same day):** `fromTemplate` is only ever set on content-bearing block
   types; Section bands NEVER carry it. Applied three ways: the batch-3 templates implementer
   strips it on fixture lift, export-format v2.3 (§2.6) carries the producer constraint, and V23
   defensively strips flagged sections (FIX-class). The original finding, kept for context:
   `band()` sets `fromTemplate: true` on every full-width Section, the flag clears only on a
   **content** edit, and a Section has no content — so V23's filler WARN would fire on every
   template-start submission forever, however thoroughly the client edited. **Recommendation:**
   `band()` stops setting `fromTemplate` (Stage 2 `feature-templates.md` + a `docs/decisions.md`
   entry). The harness is written to pass either way (feature-roundtrip-harness.md R1.2b), but
   Scenario A's V23 assertion is clearer once this is ruled.
4. **Stage close vs. the awaiting-human launch items.** **Recommendation:** Stage 4 closes as
   `verified done` on everything machine-checkable, with the two `help.md` items carried as an
   explicit open block in `handoff.md`. v1 "ships" when the three runs pass and the app is live;
   the bossolutions.pro link is distribution, not product.

## Notes & Decisions
- **`docs/roundtrip-protocol.md` is the binding spec for the harness feature**, exactly as
  `docs/export-format.md` is binding for Stage 3. Where the protocol is silent or contradicts
  itself, the resolution goes in the harness feature's Open Questions with a recommendation and
  lands as a `docs/decisions.md` entry — never as a quiet local choice.
- **Eight such ambiguities were found and RULED 2026-07-28** (feature-roundtrip-harness.md, Open
  Questions — all ruled, kept for context): sterile-config credentials, run root outside the repo,
  Scenario A's missing Section band, the untouched template-filler block, `npx`/`npm` denied to
  the builder, the extended interrogative scan set, the deployed-bundle freshness precondition,
  and Contact's single unlinked button. They are applied in the spec rules; three of them amend
  `docs/roundtrip-protocol.md` §1.2 / §3.1 / §4.2, and all eight owe `docs/decisions.md` entries
  in the same doc pass. **Stage 4 must not start implementation with the protocol still saying the
  old thing** — the doc pass is the first task of the stage.
- The protocol's closing paragraph names the harness feature file `feature-roundtrip.md`. It is
  `feature-roundtrip-harness.md` here (the tour, guard and polish are also round-trip-stage
  files; "harness" says which one it is). Update the protocol's closing line in the same doc pass.
- **Failures route backwards, not forwards.** A round-trip FAIL is overwhelmingly a Stage 2 or
  Stage 3 defect (`docs/roundtrip-protocol.md` §7). Stage 4 fixes belong in Stage 4 only when the
  detector says harness/prompt/scan-rule. Resist the pull to "fix" a miss by editing the scenario.
- **The UX audit (2026-07-28, persona Rosa) is not a Stage 4 backlog.** Its 2 BLOCKERs (site
  settings not persisted; no submit affordance) and 10 MAJORs are Stage 2/3 work and several are
  already spec'd there. Stage 4 takes only the MINOR/POLISH tail, split between the tour
  (discoverability: N1, N3, N5) and launch polish (P1–P5 plus the label-level MINORs N4, N7, N9).
  Every other finding is cross-referenced with its real owner, never re-opened here.
- **Budget** (`docs/roundtrip-protocol.md` §9): the ship gate is ≈ 1.5–2.5 h and ≈ $25–60 of
  tokens per clean sequence; the whole campaign lands in the low hundreds worst case. Runaway
  guards are `--max-turns 250`, a 45-min builder timeout and a 60-min per-segment orchestrator
  hard stop. No new infrastructure and no paid tier — the hard-free constraint stays intact.
