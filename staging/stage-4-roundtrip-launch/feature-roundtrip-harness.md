# Feature: Round-Trip Harness
_Stage: stage-4-roundtrip-launch · Status: awaiting verification_

**Built 2026-07-29. Everything that can be proven without spending a builder budget is
proven and green; the three live gating runs are not done, so no Success Criterion is
ticked.** See the Verification Log for what was measured and Notes for every call made
along the way.

## Goal
Turn `docs/roundtrip-protocol.md` into runnable code: a fake client sketches a real business
site through the real UI, submits, the package goes to a **fresh zero-context Claude Code
session**, and a merged deterministic + agent evaluation issues a hard PASS/FAIL on "visibly
matches, zero clarifying questions." Exit code 0 ⇔ PASS. This is v1's definition of done — the
one test the whole product was designed around (`docs/master_plan.md`, Architecture Sketch).

**The protocol is binding, exactly as `docs/export-format.md` is binding for Stage 3.** This
feature implements it; it does not redesign it. Every threshold, regex, tolerance and gate below
is copied from the protocol or resolves a place where the protocol is silent — and where it
resolves, it says so and owes a `docs/decisions.md` entry.

## Scope
**This feature builds:** the orchestrator, both scenario files, the fixtures generator, the
client driver, the manifest diff, the sandboxed builder invocation, the transcript scanner, the
built-site capture, the deterministic evaluator, the evaluator-agent procedure, the report
merger, the ship-gate checker, and the evidence archive.

**This feature does NOT rebuild `scripts/roundtrip/gate.mjs` steps 1–3.** Zip layout + naming,
ajv schema validation and the app-validator replay are **Stage 3 deliverables**, built in
parallel and already gating that stage's DoD (`staging/stage-3-export-delivery/overview.md`).
Stage 4 consumes `gate.mjs` and adds protocol §2 step 4 — the expected-manifest diff — as a
separate module `manifest-diff.mjs` that `gate.mjs` calls when `--scenario` is passed (the flag
that is the inverse of Stage 3's `--no-manifest`).

**Dependency contract on `gate.mjs`** (assert these in a harness unit test against a fixture
package; if any is untrue, fix `gate.mjs` in Stage 3, do not shim around it here):

| Requirement | Detail |
|---|---|
| CLI | `node scripts/roundtrip/gate.mjs --package <zip> [--scenario <file>] [--out <dir>] [--no-manifest]` |
| Exit code | `0` = all checks pass · `1` = a check failed · `2` = harness/infra error (unreadable zip, missing schema) |
| Machine output | writes `<out>/gate-report.json`: `{ ok, steps: [{ id, ok, detail }], failures: [{ code, message, path }] }` |
| Schema source | **extracted at run time from the §2.2 fenced block in `docs/export-format.md`** — the spec is the single source of truth, and `src/export/schema/site.v1.schema.json` is proven byte-identical to it by Appendix A equality test A. `--schema <file>` overrides for the deliberate gate-against-the-repo-file case. |
| Validator source | **none — the gate imports no app code at all** and re-derives §5 V1–V27 from the spec and the package bytes (`docs/export-format.md` §5). A gate that called `src/export/validate` would agree with the app by construction and could never catch a validator bug. |

## Deliverables

```
scripts/roundtrip/
├── run.mjs                  # orchestrator: segments, halt-on-hard-gate, run dir, manifest
├── thresholds.mjs           # EVERY number in this spec, exported as named constants
├── manifest-diff.mjs        # protocol §2 step 4 (Stage 4's half of the package gate)
├── sandbox.mjs              # config-dir isolation, env scrub, ancestor-CLAUDE.md assertion
├── claude-session.mjs       # spawn + stream-json capture + R4.6, shared by builder and evaluator
├── builtin-manifest.json    # R4.6's version-keyed baseline — the CLI's OWN agents/skills/commands
├── builtin-manifest.mjs     # reads it; `builtinsFor(version)` is the only way in
├── lib/resolve-command.mjs  # R4.3a — PATH × PATHEXT → an absolute image, never a shell
├── scan-transcript.mjs      # §4 zero-questions + completion + BUILD_NOTES triage
├── static-server.mjs        # dependency-free node:http static server for SEG-5
├── capture.mjs              # SEG-5 crawl / console / screenshots / dom.json
├── evaluate.mjs             # SEG-6 deterministic layer
├── report.mjs               # merges det + agent → report.json / report.md / verdict.txt
├── ship-gate.mjs            # validates the three clean runs as a set (stage DoD checker)
├── prompt.txt               # the builder prompt — FROZEN, hash-pinned
├── rubric.md                # the evaluator agent's instructions + output contract
├── scan-corpus.json         # regression corpus for the zero-questions rules
├── scenarios/scenario.schema.json
├── scenarios/scenario-A.json
├── scenarios/scenario-B.json
├── fixtures/make-fixtures.mjs
├── fixtures/fixture-{patio,wall,garden,dog}.jpg   # committed, byte-stable
├── golden/scenario-B.blueprint                    # committed, for smoke cached-sketch mode
└── *.test.mjs               # unit tests for every rule below
e2e/roundtrip/client.spec.ts # the scripted fake client
playwright.roundtrip.config.ts
```

`package.json` scripts: `roundtrip:full` → `node scripts/roundtrip/run.mjs`,
`roundtrip:smoke` → `node scripts/roundtrip/run.mjs --scenario B --target preview --smoke`,
`roundtrip:fixtures` → `node scripts/roundtrip/fixtures/make-fixtures.mjs`,
`roundtrip:shipgate` → `node scripts/roundtrip/ship-gate.mjs`.

`vite.config.ts`'s `test.include` gains `'scripts/**/*.test.mjs'` so the harness's own rules are
covered by `npm test`. `playwright.config.ts` gains `testIgnore: ['roundtrip/**']` — the round
trip must never be dragged into the tri-engine suite (it would run three times and inherit
`retries: 2` in CI, both fatal to the protocol's determinism and flake policy).

## Success Criteria
- [ ] `npm run roundtrip:full -- --scenario A --target preview` runs end to end unattended,
      halts at the first failed hard gate, and exits 0 only on PASS
- [ ] Scenario A and Scenario B files exist, are the single source of truth for the driver, the
      manifest diff and the evaluator, and are schema-validated at load (R1.4)
- [ ] Scenario A covers **all six block types** (the Home Section band, R1.2a) and exercises the
      template-filler path end to end: one untouched `fromTemplate` block, the V23 WARN shown at
      submit, the package shipped anyway (R1.2b)
- [ ] The builder's sterile config dir contains `settings.json` plus **at most one** credential
      file, the auth method is recorded in `run-manifest.json`, and the allowlist contains no
      `npx`/`npm` entry (R3.3–R3.5)
- [ ] The client driver performs every scenario step through visible UI affordances only, with
      zero `page.evaluate` into app state and zero use of the `__blueprintStore` seam (R2.2)
- [ ] The builder session runs in a sterile sandbox with an isolated `CLAUDE_CONFIG_DIR`, a
      scoped allowlist, no MCP servers, no ancestor `CLAUDE.md`, and **no**
      `--dangerously-skip-permissions` — all four asserted mechanically, not by inspection (R3)
- [ ] Zero-questions detection implements R5 exactly: tool-level rule, final-message rules, the
      strip order, the two regexes and the phrase list, with a red test per rule and a green
      corpus of rhetorical near-misses
- [ ] A permission-denied tool result anywhere in the transcript is detected and, when H2 also
      fails, routes the FAIL to **harness**, never to the product (R5.6)
- [ ] The evaluator agent runs in its own sandbox, never receives the builder transcript, emits
      schema-valid `judgments.json` with evidence on every item, and one malformed output →
      single retry → INFRA fail (R7)
- [ ] `report.md`, `report.json` and `verdict.txt` are produced for every run, with every miss
      carrying its evidence link and its pre-filled routing row
- [ ] Every run leaves a self-contained archived run directory outside the repo tree, and
      `run-manifest.json` records the start/end hashes of every rule file (R9.3)
- [ ] `node scripts/roundtrip/ship-gate.mjs` verifies the three clean runs as a set and fails if
      they disagree on commit, are not all PASS, or had any rule file change between them
- [ ] `npm run roundtrip:smoke` completes in ≤ 12 minutes with the evaluator agent skipped and
      the same hard gates and deterministic floors applied

---

## R1 — Scenario files (the single source of truth)

**R1.1** One declarative file per scenario, shape per `docs/roundtrip-protocol.md` Appendix A,
consumed three times: the driver executes it, `manifest-diff.mjs` diffs `site.json` against it,
the evaluator receives it as the expectation list. Three consumers, one file — they cannot drift.

**R1.2 Scenario A — "Cedar & Stone Landscaping"** (primary ship gate, template start).
Settings, pages, blocks, copy modes, pen strokes and coverage exactly as protocol §1.2, **as
amended by the rulings of 2026-07-28** (Open Questions 3, 4 and 8 below):

- **R1.2a — `section` bands are declared, not invented** (ruling 3, applied as amended by the
  fixture). Ruling 3 said "add one Section band behind the Home hero"; reading
  `design-assets/templates/starterTemplates.ts` shows **the Trades template already seeds them** —
  Home has `trade-home-hero-band` (y 72, h 424) and `trade-home-services-band` (y 496, h 480),
  Services has three, Get-a-Quote has three, all via the `band()` helper at `x = 0`,
  `width = PAGE_WIDTH_PX`. Protocol §1.2's page listing simply omitted them. So the correct
  application is: **Scenario A declares the template's Home bands explicitly in the scenario file
  and keeps them** (no client action needed beyond leaving them in place; the driver may resize
  the hero band if the edited hero group outgrows it, within `POSITION_TOLERANCE_PX`). The
  manifest diff asserts both bands export with discriminator `section`, full width, and at the
  **back** of the page's block array (paint order = array order, index 0 furthest back —
  `staging/stage-1-canvas-core/feature-block-canvas.md`), and that the hero blocks resolve into
  the hero band's §4.4 grouping. **All six block types are now genuinely covered, and the coverage
  claim is backed by an assertion rather than by a page description.**
- **R1.2b — exactly one untouched copy-bearing `fromTemplate` filler block** (ruling 4), a filler
  **text** block on **Services**, left completely unedited by the driver. This is the only path
  that exercises V23's filler WARN *for real client copy*, the brief's [N12] filler narration, and
  the submit gate's WARN-ships-anyway path end to end — protocol §1.2 deferred it to Scenario B,
  which is a blank start with zero seeded blocks and therefore cannot carry template filler at
  all. Binding consequences:
  - **"exactly one" is scoped to copy-bearing blocks** (heading / text / button / image-slot
    description). It cannot be scoped to *all* blocks: `docs/export-format.md` §2.7 says
    `fromTemplate` clears on a **content** edit and explicitly **not** on move/resize, and the
    template's Section bands carry no content at all — so every band exports `fromTemplate: true`
    permanently, no matter what the client does. See the upstream finding in Notes.
  - the manifest diff therefore checks **per-block expectations declared in the scenario file**
    (`"fromTemplate": true|false` on every block), not a blanket "true on one, false on the rest".
    That assertion stays correct whichever way the upstream V23/`band()` question is ruled.
  - the driver asserts the submit gate displayed the V23 WARN, listed the Services filler block,
    and **still shipped** (WARN never blocks —
    `staging/stage-3-export-delivery/feature-submit-gate.md`);
  - the filler block's expected exported `text` / `copyMode` are **read from the committed
    template fixture** (`design-assets/templates/starterTemplates.ts`, the `trades` entry), never
    re-typed into the scenario file — the scenario stores the block's `ref` and the fixture id, so
    a template edit can never leave a stale duplicate in the harness;
  - every `fromTemplate: true` block is excluded from H6's verbatim set and from evaluator
    penalty (R8.1 H6 carve-out, R8.5).
- **R1.2c — Contact carries exactly one button** (ruling 8): `Instagram`, link `none`. Protocol
  §1.2's page-4 bullet contradicted itself mid-sentence; internal links are already covered by the
  Home hero CTA and external by the Google-review button, so the `none` path is what this page is
  there to test — the brief's unlinked flag and the builder's obvious-target judgment.

- **R1.2d — page-level actions the template start implies.** The `trades` fixture ships three
  pages — **Home · Services · Get a Quote** — and Scenario A's target is four in the order
  **Home · Services · Our Work · Contact**. The driver therefore: renames `Get a Quote` → `Contact`
  (inline rename), adds `Our Work` (inline add-page form, which appends it last), and **moves it
  left one position** to reach the target order. All three are real page-strip affordances and all
  three are scenario-declared; the manifest diff's "page count, names, slugs, order — exact" check
  is what proves they were recorded. Nav items are re-labelled and re-wired on every page to the
  identical four-item set, which is what feeds the shared-nav path.

Fixtures `fixture-{patio,wall,garden}.jpg`.

**R1.3 Scenario B — "North Star Dog Grooming"** (blank start, gating on `preview`, doubles as
smoke) exactly as protocol §1.3. Fixture `fixture-dog.jpg`.

**R1.4** Scenario files validate at load against `scripts/roundtrip/scenarios/scenario.schema.json`
(ajv, `strict: true`). A scenario that fails validation aborts the run as INFRA before the
browser opens. `ref` handles are unique within a scenario and never appear in the product.

**R1.5 Fixtures** are generated once by `make-fixtures.mjs` (seeded, byte-identical on
regeneration) and **committed**. A unit test regenerates to a temp dir and asserts byte equality
with the committed files — a fixture that silently drifts would move every perceptual-hash and
dominant-colour result in R8 without anyone noticing.

**R1.6** Every string that must survive verbatim (including Scenario A's deliberate typo
`We beleive every yard deserves a plan…`) lives in the scenario file **once**. No second copy in
the driver, the diff or the rubric.

---

## R2 — The client driver (SEG-1)

**R2.1 Config.** `playwright.roundtrip.config.ts`: `testDir: './e2e/roundtrip'`, chromium only,
`viewport: { width: 1440, height: 900 }`, `deviceScaleFactor: 1`, **`retries: 0` unconditionally
(not `isCi ? 2 : 0`)**, `trace: 'on'`, `video: 'on'`, `baseURL` from `--target`
(`preview` → `PREVIEW_BASE_URL` from `site.config.ts`; `deployed` → `DEPLOYED_BASE_URL`, added
to `site.config.ts` by this feature). A unit test asserts `retries === 0` in that config.

**R2.2 UI-only, mechanically enforced.** Every action is a user-visible affordance: template
picker click, palette insert, `page.mouse` drags, inline text edit, mode toggles, the links-to
picker, `setInputFiles` on the real `<input type="file">`, pen-tool toggle + `mouse.move`
polylines, settings panel fill, submit form fill, Submit click. A unit test greps
`e2e/roundtrip/client.spec.ts` for `page.evaluate(`, `evaluateHandle(`, `__blueprintStore` and
`addInitScript(` and **fails if any appears**. (Reading a value with `locator.inputValue()` or
`getAttribute()` is not state injection and is allowed.)

**R2.3 The tour is dismissed via its real control** (feature-onboarding-tour.md) — `tour-skip` —
and the dismissal is screenshotted as its own filmstrip step. It runs at the FIRST POINT THE TOUR
CAN EXIST, not literally step 00: the shipped tour suppresses itself behind the template picker
(`OnboardingTour.tsx` suppression order — template picker > desktop guard > tour), so the driver
picks the start template first and dismisses the tour immediately after the canvas is up. The
driver may not seed the seen-flag instead: `addInitScript` is banned by R2.2, and seeding would
skip the path this step exists to prove. Absence of the tour on a fresh profile is a regression
and fails the run. The guard notice must not be present at 1440×900; if it is, that is a
desktop-guard defect and the run aborts as PRECONDITION.

**R2.4 Placement tolerance ±24px per edge**, `POSITION_TOLERANCE_PX` in `thresholds.mjs`, used by
both the driver's post-placement assertion and the manifest diff. All scenario coordinates are
multiples of the 8px grid. No test-only precision affordance may be added to the app to make
this easier — region accuracy is what a real client achieves and the premise under test is that
region accuracy is enough.

**R2.5 Every step screenshots** to `client/steps/NN-<step>.png`.

**R2.6 Honeypot discipline.** The driver fills only human-visible fields and, after filling the
submit form, asserts the honeypot input's value is still `''`. Touching it would legitimately
block the submission (`staging/stage-3-export-delivery/feature-submit-gate.md`).

**R2.7 Downloads.** Before Submit: download `design.blueprint` via the real design-file control
→ `<runDir>/design.blueprint`. On Submit: `page.waitForEvent('download')` →
`download.saveAs(<runDir>/package.zip)`. Assert the two-step completion UX rendered
(`Downloaded ✓` then "Email it to us") and that the `mailto:` anchor exists — **never activate
it** (no OS mail client in CI).

**R2.8** The notification relay is out of scope of the gating run (wired LAST, Cam's directive).
`--check-relay` may exist but is OFF by default and never affects the verdict.

**R2.9** Runtime budget ≤ 8 min per scenario; breach fails the segment as INFRA.

---

## R3 — Sandbox and isolation (SEG-3 precondition)

**R3.1 Run root lives OUTSIDE the repo** (ruled 2026-07-28, Open Question 2). Default
`%LOCALAPPDATA%\boss-blueprint\roundtrip-runs\` (override: `ROUNDTRIP_RUNS_DIR`). The protocol
simultaneously says the sandbox sits outside the repo tree *and* that `roundtrip-runs/` is
gitignored — mutually exclusive, and the repo-internal reading would put the project's own
`CLAUDE.md` in the builder's ancestor chain, defeating the entire zero-context premise. Outside
wins; `.gitignore` still gains `roundtrip-runs/` as belt-and-braces for anyone who overrides
`ROUNDTRIP_RUNS_DIR` back into the repo; **R3.2's ancestor walk is the real guard** and runs
regardless of where the root points.

**R3.2 Ancestor assertion (hard).** Walk from `builder/sandbox/` to the filesystem root; if any
directory contains `CLAUDE.md`, `.claude/CLAUDE.md`, `AGENTS.md` or `.claude/settings.json`,
abort the run as PRECONDITION and print the offending path. This assertion runs for the builder
sandbox and the evaluator sandbox, every run, before either session starts.

**R3.3 Config-dir isolation.** `CLAUDE_CONFIG_DIR` → `<runDir>/builder/claude-home/`, created
fresh by the harness. After creation, assert its contents are **exactly** `settings.json` (the
allowlist below) **plus at most one further file**: the credential copied per R3.4. Any other
entry — memory, agents, skills, plugins, MCP config, a stray `CLAUDE.md` — aborts as
PRECONDITION. The assertion is on the recursive listing, not the top level: a nested
`claude-home/projects/**` or `claude-home/agents/**` fails it too.

**R3.4 Credentials — exactly one, method recorded** (ruled 2026-07-28, Open Question 1). A bare
config dir has no auth, so the session cannot start at all; the protocol never said how the
isolated session logs in.

- **Preferred method `cli-credentials`:** copy the CLI's credentials file from the real
  `CLAUDE_CONFIG_DIR` / `~/.claude` into the sterile dir. This is the default because Cam's setup
  uses CLI auth.
- **Fallback method `api-key-env`:** when no credentials file is found, pass `ANTHROPIC_API_KEY`
  through from the parent environment (R3.7's env allowlist) and copy **nothing**.
- **Neither available** → abort as PRECONDITION with "no credential for the sterile session".

No other file is ever copied under any circumstance. `run-manifest.json` records
`{ "auth": { "method": "cli-credentials" | "api-key-env", "copiedFrom": <path|null> } }`, and the
sterile-dir listing (R3.3) is recorded alongside it so the evidence shows exactly what the
builder could see. The credential file's **contents are never logged, printed or archived** — the
run directory is committed evidence in part, so only the path and method are recorded.

**Post-run credential scrub.** The copy itself still sits in the run tree for the life of the
run, and the run root is a long-lived folder that may not be private (see the operator note in
the Verification Log). So at run end — **on both exits, pass and fail** — every `claude-home/`
under the run directory is deleted and `run-manifest.json` records
`credentialScrubbed: true` plus the paths removed. The recorded LISTING survives the scrub,
because it is data: the evidence that the dir WAS sterile outlives the dir.

**R3.5 Allowlist** (`claude-home/settings.json`) — this is how the house ban on
`--dangerously-skip-permissions` (`hooks.md`) is honoured:

```json
{
  "permissions": {
    "allow": [
      "Read", "Glob", "Grep", "Write", "Edit",
      "Bash(mkdir *)", "Bash(dir *)", "Bash(ls *)", "Bash(copy *)", "Bash(cp *)",
      "Bash(node *)"
    ],
    "deny": [
      "WebFetch", "WebSearch", "Bash(curl *)", "Bash(git *)",
      "Bash(npm *)", "Bash(npx *)", "Bash(pip *)", "Bash(powershell *)"
    ]
  }
}
```

Deviation from protocol §3.1, ruled 2026-07-28 (Open Question 5): the protocol allowed
`Bash(npx serve*)` / `Bash(npx http-server*)` while also declaring the build hermetic — but
`npx` fetches from the npm registry on a cold cache, so the allowlist contradicted its own
network-denial rationale. **`npx` and `npm` are dropped from the builder allowlist entirely and
added to deny.** The builder does not need to serve the site: SEG-5 serves it with the committed
dependency-free `static-server.mjs` (R6.1), which also removes the harness's own network
dependency. `Bash(node *)` remains so the builder can self-check with a loopback one-liner if it
wants to. A unit test asserts the generated `settings.json` contains no allow entry matching
`/^Bash\((npx|npm)\b/` — a hermeticity hole must not be reintroduced by a convenience edit.

**R3.6 Deployed-target bundle identity — freshness precondition** (ruled 2026-07-28, Open
Question 7). For `--target deployed`, before SEG-1: run `npm run build` at `HEAD`, read the hashed
entry filename from `dist/index.html`, fetch the deployed `index.html`, and assert it references
the **same** `assets/index-<hash>.js` filename. Mismatch → **abort as PRECONDITION** with
"deployed bundle is not HEAD — wait for the Pages deploy", never as a product FAIL, and never as
a scored run (an aborted run is not written to `verdict.txt` and `ship-gate.mjs` ignores it).
Both filenames and the fetched URL are recorded in `run-manifest.json`. (This is the check the
Stage 1 independent review already used; Vite's content hash makes it free.) Also assert
`git status --porcelain` is empty for any gating run.

Rationale worth keeping: the 2026-07-28 UX audit found the live deploy had no Submit control, no
image upload and no pen at all. A `deployed` leg against that build would have burned a full
builder budget to produce a spectacular, meaningless FAIL.

**R3.7 Environment scrub.** The child process gets an explicit env allowlist (`PATH`,
`SystemRoot`, `TEMP`/`TMP`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `HOME`) plus
`CLAUDE_CONFIG_DIR` and, if used, `ANTHROPIC_API_KEY`. Every other `CLAUDE_*` / `ANTHROPIC_*` /
`CLAUDE_CODE_*` variable is dropped. Any machine-level managed-policy settings file that cannot
be isolated (e.g. `C:\ProgramData\ClaudeCode\managed-settings.json`) is **detected and recorded
in `run-manifest.json`** — a run where one exists is still valid, but the evidence says so.

---

## R4 — The builder session (SEG-3)

**R4.1 Sandbox layout:** `<runDir>/builder/sandbox/package/` (the extracted zip) — the builder
creates `site/` and `BUILD_NOTES.md` beside it. `cwd` = `sandbox/`. `--add-dir` is never passed.

**R4.2 The prompt is frozen** (`builder/prompt.txt`, committed), verbatim:

```
A client has delivered a package for you in ./package/ — it contains its own
instructions. Read ./package/brief.md and carry out what it says. Create your build
output in ./site/ inside the current directory. Work until you are finished, then print
exactly BUILD COMPLETE as your final line.
```

Binding wording rules (protocol §3.2): **nothing about the business, the tool, BOSS, sketches,
PNGs, copy modes, or "don't ask questions" may appear in the prompt.** The no-questions
instruction lives ONLY in `brief.md` — the harness prompt staying silent on it is precisely what
makes H2 measure the package instead of the harness. Enforcement: a unit test asserts
`sha256(prompt.txt)` equals a constant in `thresholds.mjs`. Changing either requires a
`docs/decisions.md` entry; the prompt is part of the measured contract.

**R4.3 Invocation.** `claude -p --output-format stream-json --verbose --max-turns 250 --model
<alias>`, spawned from `run.mjs`, prompt written to **stdin** (byte-identical to `prompt.txt`;
stdin instead of an argv string purely to sidestep Windows quoting — plumbing, not content).
stdout → `builder/transcript.jsonl`. Model **aliases only**, never pinned version ids
(`performance.md`); the resolved id from the init event is recorded in `run-manifest.json`.
Gating runs use the strongest available alias (it must match what Cam actually feeds packages
to); smoke uses a small fast alias.

**R4.3a Executable resolution** (added 2026-07-29 after live-run attempt 1). The CLI is resolved
to an **absolute image** before spawning, by probing `PATH` × `PATHEXT` ourselves; the child is
always spawned with `shell: false`. Neither obvious spelling works on Windows: `spawn('claude')`
is ENOENT (the bare name is an `sh` shim `CreateProcess` will not run) and `spawn('claude.cmd')`
is EINVAL (Node refuses `.cmd`/`.bat` without a shell, post CVE-2024-27980) — and `shell: true`
is the thing that CVE is about, so it stays banned. Directly spawnable images (`.exe`, `.com`)
win; when the only hit is an npm shim, the shim is **read** (never run) and the `.exe` it
delegates to is followed. Failure to resolve is INFRA, naming every candidate found. The
resolved path, and whether it came via PATH or via a shim, go in `run-manifest.json`.

**R4.3b Authentication failure is INFRA, not a product FAIL** (added 2026-07-29). If the
terminal `result` event names an auth failure (`Failed to authenticate`, `OAuth access token has
expired`, `Not logged in`, `Invalid API key`, `Please run /login`), the run aborts as
PRECONDITION in SEG-3. A session that never logged in leaves an empty sandbox, and an empty
sandbox is indistinguishable at H3 from a builder that ignored the brief — so without this the
harness scores a dead credential as "FAIL — H3 incomplete build" and writes it to `verdict.txt`.
The pattern set is deliberately narrow: a builder that RAN and did the job badly stays a product
verdict.

**R4.4 Timeouts:** builder segment 45 min; orchestrator hard-stops any segment at 60 min. Breach
= INFRA fail, not product FAIL.

**R4.5 Banned-flag assertion.** Before spawning, assert the assembled argv contains no
`--dangerously-skip-permissions` and the settings object has no `bypassPermissions` /
`acceptEdits` default. Unit-tested against a mutated-argv fixture.

**R4.6 Session-purity assertion — BASELINE STERILITY** (amended 2026-07-29, `docs/decisions.md`;
the original "these arrays must be empty" wording is unsatisfiable on a CLI that ships built-ins
inside its binary). Parse the `system`/`init` event **as it streams**, before any builder budget
is spent, and assert:

- zero MCP servers and zero plugins — those are pure config, so any at all is a leak;
- `agents`, `skills` and `slash_commands` are **set-equal** to the committed, version-keyed
  `builtin-manifest.json` entry for the version the session reported. An **extra** entry is a
  LEAK and the abort names it; a **missing** builtin means this is not the pinned CLI, which is a
  **version mismatch**. Both abort as PRECONDITION; they are reported differently because they
  need different fixes;
- the reported `claude_code_version` has a manifest entry at all;
- every memory path the CLI lists resolves **inside this run's own `claude-home/`**. The field is
  `memory_paths` on 2.1.190; the older `project_memory` / `memory_files` / `claude_md_files`
  spellings are still checked when present, and an init that emits the manifest's named memory
  field **not at all** is a mismatch rather than a vacuous pass.

The assertion fires on the streaming init and **kills the child** on failure; a post-session
re-check covers an init that never arrived. The mock builder emits the same realistic init, so
`--mock-builder` exercises the real predicate rather than agreeing with itself.
`builtin-manifest.json` is hashed as a rule file (R9.3): relaxing the baseline mid-run is the
cheapest possible way to fake sterility.

---

## R5 — Zero-clarifying-questions detection (SEG-4, hard gate H2)

`scan-transcript.mjs`. All of this is code with unit tests; none of it is judgment at run time.

**R5.1 Parsing.** `transcript.jsonl` is parsed line by line as JSON. A malformed line is an
**INFRA failure**, never a skipped line — silently skipping is how a question hides.
- `toolUses` = every content item with `type === "tool_use"` across all `type: "assistant"` events.
- `finalText` = the `result` string of the terminal `type: "result"` event when
  `subtype === "success"`; otherwise the concatenation of the `text` parts of the **last**
  assistant event. If neither exists, H2 is unevaluable → the run fails H3 as INCOMPLETE with an
  INFRA note.

**R5.2 Rule 1 — tool level (auto-FAIL H2).** Any `tool_use` whose `name` matches
`USER_INPUT_TOOLS` fails H2 immediately. The constant is
`["AskUserQuestion", "ExitPlanMode"]` plus the catch-all predicate
`/askuser|userinput|user_input/i` on the tool name. In `-p` print mode the session cannot
receive an answer, which makes any attempt to ask unambiguous.

**R5.3 Rule 2 — final-message scan.** Applied to `finalText`, in this exact order:

1. Normalise line endings to `\n`.
2. Remove fenced blocks: `` /^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[ \t]*$/gm ``.
3. Remove inline code spans: `` /`[^`\n]*`/g ``.
4. Remove quoted spans (client copy may legitimately contain `?`): `/«[^»]*»/g`,
   `/"[^"\n]{0,400}"/g`, `/\u201C[^\u201D\n]{0,400}\u201D/g`. The 400-char cap stops one stray
   quote mark from swallowing the rest of the message.
5. Split on `\n` first, then each line on `/(?<=[.!?])\s+/`. Trim each candidate; drop empties.

A candidate sentence **fails H2** if either:

- **2a (interrogative):** after stripping trailing `*_)]"` and whitespace it ends with `?`
  **and** matches **either** direction of second-person address:
  - lead → you:
    `/\b(do|does|did|would|could|can|may|might|should|shall|will|is|are|was|were|which|what|where|when|who|whom|whose|why|how)\b[^?]*\byou(r|rs)?\b/i`
  - you → verb of choice:
    `/\byou(r|rs)?\b[^?]*\b(want|prefer|like|need|confirm|decide|choose|pick)\b/i`
  - **first-person offer (added 2026-07-29, before run 1):**
    `/\b(should i|shall (i|we)|want me to|anything else)\b/i` — both clauses above need the
    word `you` somewhere, so every offer the builder makes about ITSELF passed H2 untouched:
    "Should I add a favicon?", "Shall we wire the footer nav too?", "Want me to swap the hero
    photo?", "Anything else?". Deliberately four literal forms, not a general "lead → I"
    clause, which would swallow the rhetorical self-questions a builder legitimately writes
    ("Why did I choose a two-column hero?" — a `mustPass` corpus row). It is part of 2a, so
    the `?` is still required.
- **2b (phrase list, case-insensitive):**
  `/let me know/`, `/please (clarify|confirm|provide|specify)/`,
  `/need (more|additional) (info|information|details)/`, `/before i (proceed|continue)/`,
  `/awaiting (your|further)/`, `/unable to proceed without/`,
  `/which (option|one) (do you|would you)/`

Every hit is written to `builder/scan-report.json` with the offending sentence, the rule id and
its character offset.

**All three 2a clauses are stronger than protocol §4.2's original wording, and that is
deliberate** (ruled 2026-07-28, Open Question 6; clause 3 ruled 2026-07-29). The protocol's lead
set was
`(do|would|could|can|should|shall|which|what|where|who|how)` — `\b(do)\b` does not match "does",
so "Is this what you wanted?", "Are you happy for me to proceed?" and "You want me to use the
green?" all passed H2 as written. **This strengthening predates the first gating run by design:**
changing a scan rule after a run has produced evidence is precisely what R10.2 and R5.5 forbid,
so the rule set is fixed *before* any verdict exists, recorded in `docs/decisions.md`, and pinned
by the constant-value test in R10.1. No further loosening or tightening is permitted without a
fresh decisions entry and a full rerun.

**R5.4 Rule 3 — completion cross-check (H8/H3).** `BUILD COMPLETE` present as the final
non-empty line of `finalText` **and** `site/index.html` exists **and** `BUILD_NOTES.md` exists at
the build root. A session that stopped without the sentinel is scanned by rule 2 first (it
probably stalled on a question); if no question matched, it fails as INCOMPLETE BUILD (H3), which
routes differently. `subtype: "error_max_turns"` on the result event → H3 INCOMPLETE, routed to
infra/turns.

**R5.5 False-positive discipline (anti-weakening).** Every rule-2 hit is **auto-FAIL for the
verdict — no waving a run through by hand, ever.** If triage decides a hit was rhetorical, the
only permitted fix is a committed change to the scan rules, the sentence added to
`scan-corpus.json`, a `docs/decisions.md` entry, and a **full rerun**. `scan-corpus.json` holds
two labelled arrays — `mustFail` (real questions) and `mustPass` (rhetorical near-misses such as
"Here's how you can run it locally.") — and a unit test runs the live rules over both.

**R5.6 Permission-denial detection (new, harness-protective).** Scan `type: "user"` events for
`tool_result` items with `is_error: true` whose content matches
`/permission|not allowed|denied|requires approval/i`. Count them into `scan-report.json`. If the
count is ≥ 1 **and** H2 failed, the FAIL is classified **harness (allowlist too tight)** — a
builder forced to ask because a tool was blocked is measuring the harness, not the package.
Denials with H2 passing are still reported as a WARN.

**R5.7 BUILD_NOTES triage (signal, not gate).** Parse `BUILD_NOTES.md` entries; those matching
`/missing|contradict|couldn'?t find|not provided|no .* (given|specified)|broken|invalid/i` are
flagged **package-defect candidates**. They do not fail H2 (the builder judged instead of asking
— the designed behaviour) but each enters the routing table as a potential format defect. A
`FRICTION` warning is raised when `entries > 1.5 × pageCount` (strict `>`, no rounding): the
brief is making the builder guess too much even though it passed.

---

## R6 — Built-site capture (SEG-5)

**R6.1** `static-server.mjs` (node:http, zero dependencies) serves `site/` at
`http://127.0.0.1:4173`: correct MIME types, `/` → `index.html`, and `/<slug>` →
`<slug>.html` fallback (the brief permits either form — `docs/export-format.md` §3.2 DoD item 1).
Which resolution each page needed is recorded in `crawl.json`.

**R6.2 Run-path compliance.** SEG-5 always serves statically. If `BUILD_NOTES.md` declares a run
command that requires an install or a build step, H3 fails as "not static-friendly" — a
brief-compliance failure classified **builder deviation**, not an infra problem.

**R6.3 Crawl.** From `/`, resolve every `<a>`/button navigation into `crawl.json`
(`from → label → to`). Every page must be reachable.

**R6.4 Console.** Collect console messages and failed requests per page → `console.json`. Any
`error`-severity entry or 404'd local resource fails H3.

**R6.5 Screenshots.** Per `site.json` page: viewport **1200×900**, `deviceScaleFactor: 1`
(matching the 1200px design width so sketch and shot are comparable),
`prefers-reduced-motion: reduce`, wait for fonts + network idle + 250 ms settle, full-page
screenshot → `shots/<slug>.png`.

**R6.6 Structured extraction.** Per page → `shots/<slug>.dom.json`: reading-order list of visible
headings, paragraphs, buttons/links (text + bounding box) and images (resolved src bytes +
rendered box). This is the input for the deterministic order and placement checks.

---

## R7 — The evaluator agent (SEG-6, judgment layer)

**R7.1 Isolation.** A separate fresh `claude -p` session with the same R3 mechanics and its **own
sandbox** (`<runDir>/eval/sandbox/`), never the builder's. **"The same R3 mechanics" includes
R4.6:** the evaluator's `system`/`init` event is parsed and asserted **baseline-sterile** against
the same committed manifest, on the same streaming path, by the same one function — exactly as
the builder's is, and a failure aborts as PRECONDITION. `run-manifest.json` records the evaluator's sterile-dir listing, auth method,
dropped env, exit code, elapsed time and resolved model per attempt, in parallel with the
builder's — a verdict produced by a contaminated evaluator is worth no more than one produced by
a contaminated builder, and until 2026-07-29 only the builder's was proven.

**R7.2 Inputs — exhaustive and closed.** `site.json`, the scenario file, `package/pages/*.png`,
`shots/*.png`, `BUILD_NOTES.md`, `rubric.md`, and a harness-generated `rubric-manifest.json`
listing the exact item ids it must score. **The builder transcript is never copied into the
evaluator sandbox** (no anchoring on the builder's self-report) — asserted by listing the sandbox
contents after staging and comparing to the closed expected set.

**R7.3 Output contract.** `judgments.json` per protocol Appendix B, ajv-validated:
`{ scenario, items: [{ id, score, evidence, confidence }] }`. Every `id` must come from
`rubric-manifest.json`; scores must be integers in range; **`evidence` must be a non-empty string
that names at least one artefact file** (regex `/(shots|pages)\/[\w.-]+\.png|BUILD_NOTES\.md/`)
**and at least one of the files it names must be in the staged listing** — the shape check alone
accepted `shots/homepage.png` for a site whose only shot is `shots/home.png`, which is exactly
the shape a hallucinated citation takes. Uncited, mis-cited or out-of-range items are rejected by
the merger.

**R7.4 Retry policy.** One malformed output → exactly one retry → then the run fails as **INFRA,
never as a product FAIL**. A flaky evaluator must never be able to manufacture a product verdict
in either direction.

**R7.5** In `--smoke` mode the evaluator is skipped entirely; the verdict is SMOKE-PASS/FAIL on
hard gates plus the deterministic halves of S1/S3/S4/S5 with the same floors. **`SMOKE_BUDGET_MIN`
is ENFORCED, not merely pinned:** the orchestrator records `elapsedMin` for every run and a smoke
run that overruns 12 minutes is written as `SMOKE-FAIL` with exit 1, whatever the gates said —
"completes in ≤ 12 minutes" is a Success Criterion, and a criterion nothing checks is a wish.

---

## R8 — Gates, score, floors, verdict

**R8.1 Hard gates — any failure = FAIL regardless of score.**

| Gate | Check | Layer |
|---|---|---|
| H1 | SEG-2 package gate: layout + naming, ajv schema, app-validator replay, manifest diff | det |
| H2 | Zero clarifying questions (R5.2 + R5.3) | det |
| H3 | Build completes: sentinel + `site/index.html` + serves with zero console errors / no broken local resources + static-friendly run path | det |
| H4 | Page inventory: exactly one route per `site.json` slug; `pages[0]` is the homepage/index; no extra top-level pages | det |
| H5 | Nav graph: every wired link reaches its exact target (internal → right page, external → right href); shared nav on every page when the brief declared identical navs | det |
| H6 | Real copy verbatim: 100% of `copyMode: "real"` strings present on their page, whitespace-normalised but otherwise character-exact — **Scenario A's typo must survive**. **Carve-out:** blocks with `fromTemplate: true` are excluded from the verbatim set (R8.5) | det |
| H7 | Uploaded assets: every `assets/` image appears on its correct page, matched by dHash (hamming ≤ 10; byte-compare short-circuits) | det |
| H8 | `BUILD_NOTES.md` exists at the build root | det |

**R8.2 Soft score — 100 points; PASS additionally requires total ≥ 85 and every floor met.**

| Dim | What | Pts | Floor |
|---|---|---|---|
| S1 | Per-page block order/arrangement: expected reading order from `site.json` (§4.4 grouping) vs built order from `dom.json`, aligned by LCS over `(type, text-prefix)` tokens; page score = matched/expected; pts = 25 × mean | 25 | mean ≥ 0.85, **no page < 0.75** |
| S2 | Visual layout similarity (evaluator, sketch PNG vs shot PNG): 0 = doesn't resemble · 1 = same content, notably different arrangement · 2 = same arrangement and rough proportions; rationale must answer top-to-bottom order / left-right splits / hero prominence; pts = 20 × mean/2 | 20 | **no page = 0** |
| S3 | GENERATE copy quality. Det sanity, **per block, against that block's own copy** (nearest by relative vertical position among nodes of its kind that are not another block's real copy — not "the longest string on the page", which graded every generate block on a page against the same string): non-empty, not lorem ipsum, no `[`/`TODO`/`placeholder`, not a verbatim echo of `generateDescription`, **length within `lengthHint` (±1 sentence, or 0.3–3× a word/character count) or 0.3–3× the frame estimate** (`⌊w/8⌋ × ⌊h/24⌋` characters). Evaluator: 0 off-topic · 1 on-topic · 2 on-topic, on-vibe, uses business specifics; pts = 15 × mean/2 | 15 | **all items pass det sanity AND score ≥ 1** |
| S4 | Image placement + empty slots. Det: matched asset's rendered box centre in the same vertical third and horizontal half as its sketch frame; empty slots have an in-region `<img>`/`<svg>` placeholder with alt text derived from the description; pts = 15 × fraction | 15 | ≥ 0.8 |
| S5 | Style / vibe. Det: ≥ 1 client colour among the 8 dominant colours of any shot (ΔE00 < 12) when colours were given; not unstyled default (≥ 2 non-grayscale dominants, custom fonts or spacing). Evaluator 0–2 on "does this read as ‹vibe›?"; pts = 7 det + 8 × eval/2 | 15 | **det colour check passes when colours were given** |
| S6 | Pen intent (evaluator, per brief-listed cluster): annotation — intent honoured AND a reading recorded in BUILD_NOTES; imageSketch — placeholder relates to the sketched subject; 0–2 each; pts = 10 × mean/2 | 10 | **imageSketch placeholder must not contradict the sketch subject** |

**Floors over an EMPTY score array read UNMET, never met.** `[].every(…)` is `true`, so an
evaluator that returned nothing for a dimension used to clear that dimension's floor by saying
nothing at all — the one direction a missing measurement must never be allowed to fall (R10.7: a
criterion that passes vacuously has been weakened). Every judged floor now requires `n ≥ 1`
alongside its predicate. In `--smoke` the judged dimensions are skipped outright, which is a
different thing from being silently satisfied.

**R8.3 Verdict.** `PASS` = all H gates ∧ total ≥ 85 ∧ all floors. `NEAR MISS` (**reported as
FAIL**; score 70–84 or a single floor miss) → targeted fixes, rerun. `FAIL` (< 70 or any H gate)
→ full triage. `verdict.txt` carries the one-liner; `report.md` renders the score table, every
miss with its evidence link, per-page side-by-side sketch/shot thumbnails, and the pre-filled
routing rows.

**R8.4 Mismatch taxonomy** — the classification question, asked per miss: *"Could a competent
developer, given ONLY this package, have gotten this right?"* **No** → format defect (Stage 3
fix). **Yes, and site.json/brief carried it** → builder deviation (brief wording/emphasis, or
rarely the harness prompt). **Never penalised:** typography, exact colours beyond the client's
stated ones, spacing polish, responsive/mobile behaviour (unscored — sketches are desktop, only
1200px is evaluated), heading-level choices, `null` section backgrounds, placeholder aesthetic,
inert-vs-guessed target for `none` links *when BUILD_NOTES records the call* (Scenario A's
Contact `Instagram` button is exactly this case — R1.2c), and copy wording beyond what the
description asked for.

**R8.5 Template-filler handling (new — forced by ruling 4).** Scenario A's untouched
`fromTemplate: true` blocks sit in a contradiction the rulings exposed: H6 would demand the
template's own filler text appear verbatim in the built site, while the brief's [N12] marker tells
the builder that same text is filler to replace. Resolution, in three parts:

- **H6 excludes `fromTemplate: true` blocks.** A builder that keeps, drops or placeholders the
  filler is not failing a hard gate.
- **What IS gated is the product side, not the builder side:** the driver asserts the submit gate
  raised the V23 filler WARN and shipped anyway (R1.2b), and the manifest diff asserts the flag is
  `true` on exactly that block and `false` everywhere else. That is what "the WARN path is
  exercised end to end" means here.
- **The evaluator is told.** The scenario file marks the block `"expect": "untouched-filler"`, and
  `rubric.md` states that any reasonable handling scores neutral — it is never counted against
  S1/S2. Whatever the builder did with it **is** reported in `report.md` as signal for the brief
  generator's filler narration.

---

## R9 — Evidence archiving

**R9.1** Run directory exactly as protocol §0 (`run-manifest.json`, `client/`, `package.zip`,
`design.blueprint`, `package/`, `gate/`, `builder/` incl. `sandbox/`, `shots/`, `eval/`,
`verdict.txt`), rooted per R3.1.

**R9.2** The Verification Log below records, per run: the run path, the verdict line, the score
table, and the classes fixed since the previous run — one line per iteration, pass or fail
(protocol §8.5). `report.md` plus **two** representative side-by-side sketch/shot pairs per
scenario are copied into `staging/stage-4-roundtrip-launch/evidence/` and committed (small).

**R9.3 Rule-file hashing (anti-weakening).** `run-manifest.json` records `sha256` of
`prompt.txt`, `rubric.md`, `thresholds.mjs`, `scan-transcript.mjs`, `manifest-diff.mjs` and the
scenario file **at run start and again at run end**. Any difference marks the run `INVALID` and
`ship-gate.mjs` refuses it. Editing a rule mid-run is the single easiest way to fake a PASS; this
makes it visible in the evidence.

**R9.4 `ship-gate.mjs`** takes three run directories (or finds the three most recent PASS runs)
and asserts: all three `INVALID: false`; identical `HEAD` sha; clean worktree recorded for each;
the set of `(scenario, target)` is exactly `{(A, preview), (A, deployed), (B, preview)}`; every
rule-file hash identical across all three; every verdict `PASS`; no segment served from cache.
Exit 0 ⇔ the stage DoD's round-trip criterion is met.

---

## R10 — Anti-weakening rules (binding; these exist because the gate is only as strong as its weakest reinterpretation)

1. **Every number AND every frozen rule set in this spec lives in `thresholds.mjs`**, and a unit
   test asserts each exact value. Lowering or loosening one fails a test and shows up in the diff.
   The inventory:

   | Constant | Value | Source |
   |---|---|---|
   | `PASS_SCORE` | 85 | R8.3 |
   | `NEAR_MISS_FLOOR` | 70 | R8.3 |
   | `S1_MEAN_FLOOR` / `S1_PAGE_FLOOR` | 0.85 / 0.75 | R8.2 |
   | `S3_MIN_ITEM_SCORE` | 1 | R8.2 |
   | `S4_FLOOR` | 0.8 | R8.2 |
   | `POSITION_TOLERANCE_PX` | 24 | R2.4 |
   | `DHASH_MAX_HAMMING` | 10 | R8.1 H7 |
   | `DELTA_E_MAX` | 12 | R8.2 S5 |
   | `MAX_TURNS` | 250 | R4.3 |
   | `BUILDER_TIMEOUT_MIN` / `SEGMENT_HARD_STOP_MIN` | 45 / 60 | R4.4 |
   | `CLIENT_BUDGET_MIN` | 8 | R2.9 |
   | `SMOKE_BUDGET_MIN` | 12 | Success Criteria |
   | `FRICTION_PER_PAGE` | 1.5 | R5.7 |
   | `QUOTE_SPAN_CAP` | 400 | R5.3 step 4 |
   | `SHOT_VIEWPORT` / `CLIENT_VIEWPORT` | 1200×900 / 1440×900 | R6.5 / R2.1 |
   | `GUARD_ABSENT_AT` | 1440×900 | R2.3 |
   | `PROMPT_SHA256` | pinned hash of `prompt.txt` | R4.2 |
   | `USER_INPUT_TOOLS` | `["AskUserQuestion", "ExitPlanMode"]` + the `/askuser\|userinput\|user_input/i` predicate | R5.2 |
   | `INTERROGATIVE_LEAD_SET` | the extended set ruled 2026-07-28 | R5.3 2a |
   | `CHOICE_VERB_SET` | `want\|prefer\|like\|need\|confirm\|decide\|choose\|pick` | R5.3 2a |
   | `FIRST_PERSON_OFFER_SET` | `should i` · `shall (i\|we)` · `want me to` · `anything else` (2026-07-29) | R5.3 2a |
   | `QUESTION_PHRASES` | the seven phrase regexes | R5.3 2b |
   | `DENIED_BASH_PREFIXES` | includes `npx`, `npm` (ruling 5) | R3.5 |
   | `EVAL_SCORE_MIN` / `EVAL_SCORE_MAX` | 0 / 2 | R8.2, Appendix B |
   | `EVIDENCE_ARTEFACT_RE` | `(shots\|pages)/[\w.-]+\.png\|BUILD_NOTES\.md` | R7.3 |
   | `EVALUATOR_MAX_RETRIES` | 1 | R7.4 |
   | `EVALUATOR_SANDBOX_ALLOWED` | the closed input set — and it does NOT contain the transcript | R7.2 |
   | `S3_LENGTH_MIN_RATIO` / `S3_LENGTH_MAX_RATIO` | 0.3 / 3 | R8.2 S3 |
   | `FRAME_CHAR_WIDTH_PX` / `FRAME_LINE_HEIGHT_PX` | 8 / 24 | R8.2 S3 |
   | `S3_SENTENCE_HINT_TOLERANCE` | 1 | R8.2 S3 |

   The rule sets are pinned as data, not spelled inline in `scan-transcript.mjs`, precisely
   because ruling 6 changed one of them: a rule set that lives in one hash-tested constant cannot
   be quietly edited between runs (R9.3 hashes the file too).
2. **No verdict may be produced by a human decision at run time.** There is no `--force-pass`, no
   waiver file, no "known flaky" list. A rule that is wrong gets changed in code, with a
   `docs/decisions.md` entry, and the run is repeated from scratch.
3. **Retries are 0 everywhere.** A segment that fails on rerun without a code change is a real
   defect (client UX, renderer nondeterminism, or a harness bug) and gets triaged, never
   re-rolled (protocol §8.4).
4. **Cached-segment shortcuts are for iteration only.** `run-manifest.json` records which
   segments were cached; a run with any cached segment can never be part of the ship gate.
5. **The scenario is not a tuning knob.** A failing run is never fixed by making the scenario
   easier (dropping the typo, the empty slot, the `BIG!` annotation, the external link). If a
   scenario element is genuinely wrong, that is a `docs/decisions.md` ruling, and every prior
   run's evidence is superseded.
6. **Two strikes** (`reasoning.md`, protocol §8.3): the same failure class failing again after
   its fix → stop iterating and escalate — a Fable debate for a design question (e.g. "1× PNGs
   are fundamentally too coarse for handwriting"), or surface to Cam for scope.
7. **Success criteria are never weakened to pass** (CLAUDE.md): changes need user sign-off plus a
   `docs/decisions.md` entry.

---

## Failure-class routing

One class per iteration — change one variable (`reasoning.md`). Rows marked ★ are additions to
protocol §7 introduced by this feature.

| Failure class (detector) | Likely defect | Fix lands in |
|---|---|---|
| SEG-1 driver can't perform a scenario step | real UX affordance gap | Stage 2 feature (the app), or the scenario if it asked for a non-feature |
| ★ PRECONDITION: deployed bundle ≠ HEAD, dirty worktree, ancestor `CLAUDE.md`, non-sterile config dir | environment, not product | harness / wait for deploy; never a product FAIL |
| H1 zip layout / naming | packaging module | Stage 3 zip packaging |
| H1 schema invalid | export generator vs schema drift | `src/export/` generator or `site.v1.schema.json` (+ decisions entry if the contract changes) |
| H1 manifest diff (the UI didn't record the action) | store/export mapping bug, or template guardrail leak | Stage 2 store / Stage 3 export mapper |
| ★ `fromTemplate` flag wrong on the Scenario A filler block (true where the driver edited, or false on the untouched one) | template guardrail: the flag is not cleared on first content edit, or is cleared spuriously | Stage 2 templates |
| ★ Submit gate did not raise the V23 filler WARN, or the WARN blocked submission | validator classification or the WARN branch of the gate UI | Stage 3 submit-gate |
| ★ Brief carries no filler narration for the untouched block | filler branch of the brief generator | Stage 3 brief generator |
| H1 PNG sanity, or SEG-6 finds the sketch unreadable | renderer fidelity | snapdom→html-to-image path; then the 1×→2× render revisit ruling; last resort a deterministic offscreen renderer (debate #1 ladder) |
| H2 question about missing *content* | brief lacks a fallback phrase for that absence | brief generator §3 (fallback strings are binding rules) |
| H2 question about *process* ("where do I put output?") | harness prompt defect | `prompt.txt` (harness, not product; decisions entry) |
| ★ H2 with ≥1 permission denial in the transcript | allowlist too tight | harness allowlist (R3.5); never scored as a product FAIL |
| H3 incomplete/broken build | brief DoD unclear, or the builder ran out of turns | brief DoD wording, or raise `--max-turns` (infra) — read the transcript to tell which |
| H4/H5 inventory or nav wrong | brief inventory / nav-map generation | brief generator §4.4 nav-map algorithm |
| H6 real copy altered | builder editorialising | strengthen brief DoD item 4 wording |
| H7/S4 image on the wrong page or region | asset-manifest usage lines or walkthrough position phrases | brief generator §4.4 / assets section |
| S1/S2 arrangement misses | section grouping / position phrases too vague, or PNG ambiguity | brief §4.4 algorithms; PNG contract |
| S3 generate-copy floor | thin context lines, bad length estimate | brief copy-list generation; if the client description itself was uselessly vague yet passed V5 → strengthen V5 / the description-field coaching (Stage 2 copy-blocks UI) |
| S5 vibe/colour miss | look-&-feel rendering of settings | brief generator |
| S6 pen intent missed | cluster narration or legibility | brief §4.5 narration; legibility → renderer ruling |
| ★ Evaluator uncited / malformed / schema-invalid | harness | harness only; INFRA, never a product FAIL |
| Evaluator or segment timeout | harness | harness only; never a product FAIL |

**BUILD_NOTES package-defect candidates route through this same table even when every gate
passed** — a passing run can still emit Stage 3 fix tickets. That is the loop working as designed.

---

## How We'll Verify

Harness unit + config tests (fast, run first):
1. `npm test` — includes `scripts/**/*.test.mjs`: thresholds exact-value test; `prompt.txt` hash
   test; scan-rule red tests (one per R5.2/R5.3 rule) + `scan-corpus.json` mustFail/mustPass
   sweep; banned-flag argv test; driver-purity grep test (no `page.evaluate` / `__blueprintStore`);
   `retries === 0` config test; fixture byte-stability test; scenario schema validation test;
   `gate.mjs` dependency-contract test against a fixture package.
2. `npm run lint` → exit 0.
3. `npm run roundtrip:fixtures` → regenerates fixtures; `git status --porcelain scripts/roundtrip/fixtures` must be empty.

Segment-level dry runs (cheap, no builder tokens):
4. `npx playwright test --config playwright.roundtrip.config.ts` → the client driver alone,
   producing `package.zip` + `design.blueprint` + the step filmstrip.
5. `node scripts/roundtrip/gate.mjs --package <runDir>/package.zip --scenario scripts/roundtrip/scenarios/scenario-A.json --out <runDir>/gate` → exit 0, `manifest-diff.json` clean.

Full gating runs (the evidence):
6. `npm run roundtrip:full -- --scenario A --target preview` → exit 0, `verdict.txt` = `PASS <score>`.
7. `npm run roundtrip:full -- --scenario A --target deployed` → exit 0.
8. `npm run roundtrip:full -- --scenario B --target preview` → exit 0.
9. `npm run roundtrip:shipgate` → exit 0 (three runs, same commit, all PASS, no cached segments,
   no rule-file drift).
10. `npm run roundtrip:smoke` → exit 0 in ≤ 12 min.
11. Copy `report.md` + 2 side-by-side pairs per scenario into
    `staging/stage-4-roundtrip-launch/evidence/`; record run paths, verdict lines, score tables
    and elapsed/cost per run below.

## Verification Log

### 2026-07-29 — harness built; everything except the live builder/evaluator legs is green

Branch `stage4-harness` (base `770c346`). Commands were run from the worktree; every number
below is a measured result, not an estimate.

**Fast checks (How-We'll-Verify items 1–3)**

| # | Command | Result |
|---|---|---|
| 1 | `npm test` | **84 files / 1467 tests passed**, including the 154 new harness tests in `scripts/**/*.test.mjs` |
| 1a | `npx vitest run scripts/` (×3, incl. two consecutive clean runs) | **8 files / 154 tests passed** each time |
| 2 | `npm run lint` | **exit 0**, no errors, no warnings |
| 2a | `npm run build` | **exit 0** (`tsc -b` + `vite build`) |
| 3 | `npm run roundtrip:fixtures` then byte-compare | all four fixtures regenerate **byte-identically** (sha256 match, asserted by `fixtures.test.mjs`) |
| — | `node scripts/roundtrip/selftest/run.mjs` (Stage 3's gate self-test, re-run after the step-4 wiring) | **SELF-TEST PASSED — green package clean, 45/45 mutations caught by the right check** |

**Segment dry runs (How-We'll-Verify items 4–5) — the acceptance bar, no builder tokens**

| Scenario | Driver | Package | Gate incl. §2 step 4 |
|---|---|---|---|
| **A** — Cedar & Stone Landscaping, template start | `npx playwright test --config playwright.roundtrip.config.ts` → **1 passed (40.5s)**, 16-frame filmstrip _(pre-tour build; see the 2026-07-29 re-run below for the current counts)_ | `blueprint_cedar-stone-landscaping_f259ffe8.zip`, 1367.6 KB, 9 entries | **GATE PASSED — 37 pass, 1 warn, 0 fail, 0 skip (38 checks) · exit 0**; `M04` reports `33 block(s) matched within ±24px` |
| **B** — North Star Dog Grooming, blank start | **1 passed (18.1s)**, 16-frame filmstrip _(pre-tour build)_ | `blueprint_north-star-dog-grooming_38eb941b.zip`, 713.1 KB, 6 entries | **GATE PASSED — 38 pass, 0 warn, 0 fail, 0 skip · exit 0**; `M04` reports `11 block(s) matched within ±24px` |

_Filmstrip counts move with the journey: the numbers in this table were measured before the tour
landed. The tour added its own dismissal step, and the pre-flight batch added a second frame
inside it, so the current counts are recorded per-run in the entries below rather than restated
here. A "16-step filmstrip" claim that nobody re-measures is exactly the kind of stale number
this note exists to stop._

Scenario A's single WARN is `V23` on `pg_0002 / blk_0018` — **exactly the untouched filler
block R1.2b requires**, and the package shipped anyway. The driver independently asserted
that the submit gate rendered the V23 pre-flight warning and listed exactly one block
(`submit-filler-item` count), so the WARN-ships-anyway path is proven from both ends.
Scenario B, which cannot carry filler, asserts the warning is **absent** — 0 warns confirms it.

**Mock-builder pipeline proof (SEG-3 → SEG-6 wired end to end, mechanically, for zero tokens)**

```
ROUNDTRIP_RUNS_DIR=C:\Users\Public\boss-blueprint\roundtrip-runs \
  node scripts/roundtrip/run.mjs --scenario B --target preview --smoke \
       --mock-builder <canned site>
→ SMOKE-FAIL 30.81
  C:\Users\Public\boss-blueprint\roundtrip-runs\2026-07-29T05-31-44-518Z_B_770c346
```

| Gate | H1 | H2 | H3 | H4 | H5 | H6 | H7 | H8 |
|---|---|---|---|---|---|---|---|---|
| | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

| Dim | S1 | S2 | S3 | S4 | S5 | S6 | Total |
|---|---|---|---|---|---|---|---|
| | 23.8 / 25 | skipped (smoke) | floor missed | 0.0 / 15 | 7.0 / 15 | skipped (smoke) | **30.81** |

Segment timings from `run-manifest.json`: SEG-1 24.0 s · SEG-2 0.8 s · SEG-3 0.02 s (mock)
· SEG-4 0.005 s · SEG-5 3.0 s. Rule-file hashes recorded at start and end for all six files
(five rule files + `scenario-B.json`); `drift: []`, `invalid: false`, `cached: true`,
`managedPolicy: []`.

**All eight hard gates pass against a mocked build, which is what this run was for.** The two
remaining misses are the harness grading the mock correctly, not harness defects:

- **S3** — the mock's stand-in copy is derived from `generateDescription`, so the det sanity
  rule "not a verbatim echo of `generateDescription`" fires. That rule working is the point.
- **S4** — the mock renders a single vertical stack, so no image lands in the same page-third
  *and* horizontal half as its sketch frame. A real builder reproducing the two-column hero
  is exactly what S4 exists to reward.

`node scripts/roundtrip/ship-gate.mjs` against that single run **exits 1** and names all five
reasons independently: not three runs, dirty worktree, a cached segment (R10.4), a non-PASS
verdict, and the wrong leg set. The ship gate refuses on every axis it is supposed to.

**Not yet verified — the live legs (How-We'll-Verify items 6–11).** Nothing below has been
run, and nothing below is ticked above:

- `npm run roundtrip:full -- --scenario A --target preview`
- `npm run roundtrip:full -- --scenario A --target deployed`
- `npm run roundtrip:full -- --scenario B --target preview`
- `npm run roundtrip:shipgate` over those three
- `npm run roundtrip:smoke` end to end with a real small-model builder, timed against the
  12-minute budget
- the evidence copy into `staging/stage-4-roundtrip-launch/evidence/`

**Two things the operator must know before starting a live run**

1. **`ROUNDTRIP_RUNS_DIR` must point at a PRIVATE directory with a clean ancestor chain.** The
   ruled default (`%LOCALAPPDATA%\boss-blueprint\roundtrip-runs\`) sits under the user profile,
   and on this machine `C:\Users\Cam\.claude\settings.json` is an ancestor — so R3.2 aborts the
   run as PRECONDITION and prints the offending path. That is the guard working, not a bug.
   **Both properties are needed, and the obvious fix only buys one of them:**
   `C:\Users\Public\boss-blueprint\roundtrip-runs` has a clean chain (which is why the
   zero-token proofs above used it) but is **world-readable on this machine**, and a gating run
   copies a live credential into `builder/claude-home/` while it runs. For the live runs, prefer
   a dedicated drive root (e.g. `D:\bp-roundtrip-runs`) or another non-profile folder that is
   not world-readable. Two things reduce the exposure either way: the credential's contents are
   never read, printed or archived (R3.4), and every `claude-home/` in the run tree is deleted
   at run end, pass or fail, with `credentialScrubbed: true` recorded in the manifest. The
   remaining window is the run itself — hence "private", not merely "clean".
2. **RESOLVED 2026-07-29 — the tour and the desktop guard have both landed.** This note used to
   say they did not exist yet. `feature-onboarding-tour.md` and `feature-desktop-guard.md` are
   both `awaiting verification` with their code shipped, and the driver needed no change: the
   reviewer's Scenario A dry run recorded **`tourPresent: true`, `tourFirstStep: 1`,
   `tourStepCount: 5`** in `client/driver-report.json` and the guard absent at 1440×900. The
   tour's own filmstrip frame is now taken **before** the Skip click as well as after
   (`onboarding tour before dismissal`), so the evidence shows the bubble that was dismissed
   rather than only the canvas it left behind.

**Independent review (2026-07-29) — MECHANICAL LAYER ONLY; the three live gating runs remain
the stage DoD.** Detached worktree at fb7eaf6, no tracked edits; npm ci clean at root and in
scripts/roundtrip. `npm test` **1523/89** incl. `vitest run scripts/` **154/8**; lint, tsc,
build, coverage exit 0; e2e ×2 spaced 625/2/0 each. CI green; the deployed bundle name matches
the local HEAD build, so R3.6's freshness precondition would pass today.

**Segment dry runs, run by the reviewer.** Scenario A driver → 1 passed (34.5s), 20-frame
filmstrip incl. its own tour-dismissal step, driver-report.json recording **tourPresent:
true, tourFirstStep 1, tourStepCount 5** — the fb7eaf6 fix works against the shipped tour.
Gate A → **GATE PASSED — 37 pass, 1 warn, 0 fail, 0 skip, exit 0**, M04: 33 blocks within
±24px, the single WARN being V23 on the untouched filler R1.2b requires (driver independently
recorded the submit gate showing exactly one filler item, package shipped). Scenario B →
1 passed (13.7s), fillerWarn.shown false; gate → **38/0/0/0, exit 0**, M04: 11 blocks.
Scenario A verified to carry all SIX block types, both copy modes, 3 uploads + 1 empty slot,
both pen roles, exactly one untouched-filler; the deliberate typo appears once, only in
scenario-A.json.

**Mock-builder pipeline** → **SMOKE-FAIL 30.81, exit 1, all eight hard gates H1–H8 PASS**;
S1 23.8/25 — reproducing the built log to the decimal; run-manifest records invalid:false,
cached:true, no drift, start+end hashes for all six rule files. **ship-gate.mjs REFUSES on six
independent axes** (run count, dirty worktree, cached segment, non-PASS verdict, mixed
commits, wrong leg set).

**Anti-weakening proven to bite via untracked mutants:** thresholds weakened 3 ways + a
prompt mentioning questions → 5 failed, each naming its constant, plus the sha mismatch and
the prompt tripwire. prompt.txt sha pin verified (294 B, LF). R2.2 driver-purity proven by
planting a helper with banned APIs → 12 green → 3 failed naming the file → restored.
**Sandbox assertions exercised directly:** ancestor walk ABORTS from %LOCALAPPDATA% (names
C:\Users\Cam\.claude\settings.json) and from inside the repo (names CLAUDE.md); clean from
C:\Users\Public\boss-blueprint\roundtrip-runs (all dry runs rooted there). Sterile dir lists
exactly [.credentials.json, settings.json]; planted agents/leak.md aborts naming the
offender; api-key fallback copies nothing; credential NEVER logged (grep across a whole run
dir returns nothing). Allowlist has no npx/npm and a mutated npx entry is caught. Child env
is exactly {PATH, SystemRoot, USERPROFILE, CLAUDE_CONFIG_DIR}, closed.
**R5 scan rules verified by RUNNING them:** "Is this what you wanted?" → 2a-lead; "You want
me to use the green?" → 2a-reverse; 17 mustFail / 10 mustPass corpus incl. the inline-code
control and four rhetorical near-misses.

**Findings raised (routed to the pre-flight batch):** (H) the eight 2026-07-28 rulings still
lack decisions.md entries and the protocol §1.2/§3.1/§4.2 are unamended — R5.3/R10.1 make
that a precondition for run 1; (H) evaluator session purity never asserted + its
listing/auth/exit not recorded in run-manifest; (M) R7.3 evidence citation is shape-only;
(M) S3 misses R8.2's length rule and findWrittenCopy reads longest-on-page; (M) four
R10.1-class constants unpinned; (M) the Public run root is world-readable (operator note +
scrub); (M) empty score arrays make floors vacuously "met"; (L) stale filmstrip counts,
post-click tour frame, SMOKE_BUDGET_MIN unenforced, stale Notes item 2, jpeg-js in
devDependencies.

**Status: VERIFIED (MECHANICAL).** No Success Criterion ticked; the remaining gate is the
three live runs + shipgate + timed smoke + evidence copy (How-We'll-Verify 6–11), preceded by
the pre-flight batch above.

### 2026-07-29 — Pre-flight batch: the doc pass landed, the review findings are addressed, the scan rules were strengthened BEFORE run 1

**The doc pass was the blocking one, and it is done.** R5.3 and R10.1 make it a precondition:
a rule may not change once a verdict exists, so every ruling has to be recorded while there is
still no verdict to protect.

- **`docs/decisions.md` gains all eight 2026-07-28 rulings**, one entry each, in the house
  format — credentials (1), run root outside the repo (2), the Home Section bands (3), the single
  untouched filler block (4), the `npx`/`npm` denial (5), the extended interrogative set (6), the
  deployed-bundle freshness precondition (7), the single unlinked Contact button (8) — plus a
  ninth for the 2026-07-29 scan-rule strengthening below. The eight are dated to the day they
  were ruled and say they were recorded on the 29th; the log stayed append-only.
- **`docs/roundtrip-protocol.md` is amended to v1.1**, with a header block listing the nine and
  an **[AMENDED …]** marker at each passage so the original reading stays visible rather than
  being quietly replaced: §0 run root + deployed freshness · §1.2 the Section bands, the filler
  block and the one-button Contact page · §3.1 the single credential and the allowlist without
  `npx`/`npm` · §3.3 SEG-5 serves with `static-server.mjs`, not `npx http-server` · §4.2 the
  three-clause rule 2a as a table.

Every amendment records what the shipped code **already does** — this was a pass to make the
binding spec match reality, not to change the rules. The one genuine rule change is called out
as such:

**MEDIUM-2 — rule 2a gains a first-person-offer clause (now or never, per R5.5).** Both existing
clauses require the word `you` somewhere in the sentence, so every offer the builder makes about
ITSELF passed H2 untouched. `FIRST_PERSON_OFFER_SET` (`should i` · `shall (i|we)` ·
`want me to` · `anything else`) now fails a sentence that ends in `?` and matches one of them.
It is four literal forms rather than a general "lead → I" clause on purpose: the general version
swallows the rhetorical self-questions a builder legitimately writes. **Corpus after the change:
22 `mustFail` / 14 `mustPass`, every row behaving** — the five new `mustFail` rows are the five
forms, and the four new `mustPass` rows pin the limits ("Anything else the client sketched is
already on the page." has no `?`; "I should include the opening hours" is not "should I").
`Should the hero be full width?`, the pre-existing rhetorical row, still passes. Decisions entry
landed in the same commit, as R5.5 requires.

**Findings from the mechanical review, one line each:**

| Finding | What changed |
|---|---|
| **HIGH-3** evaluator purity never asserted | `assertSessionPurity` now runs on the evaluator transcript exactly as on the builder's; impure → PRECONDITION abort. `run-manifest.json` gains `evaluator.attempts[]` with the sterile-dir listing, auth method, dropped env, exit code, elapsed ms, resolved model and `pure` per attempt |
| **MEDIUM-1** R7.3 citations were shape-only | evidence must now name an artefact **that was staged**; `citedArtefacts()` extracts every filename and intersects with the staging listing. `shots/homepage.png` against a site whose only shot is `shots/home.png` is rejected — that is the shape a hallucinated citation takes |
| **MEDIUM-3** S3 missed R8.2's length rule | implemented: `lengthHint` wins (±1 sentence, or 0.3–3× a word/character count), else 0.3–3× the frame estimate `⌊w/8⌋ × ⌊h/24⌋`. All five constants pinned in `thresholds.test.mjs` |
| **MEDIUM-3** `findWrittenCopy` read longest-on-page | now reads the **block's own** copy: nearest by relative vertical position among nodes of its kind that are not another block's real copy. Every generate block on a page used to be graded against the same string |
| **MEDIUM-4** four R10.1-class constants unpinned | `EVAL_SCORE_MIN/MAX`, `EVIDENCE_ARTEFACT_RE`, `EVALUATOR_MAX_RETRIES`, `EVALUATOR_SANDBOX_ALLOWED` pinned as literals, plus an assertion that the allowed set does **not** contain the transcript |
| **MEDIUM-6** empty score arrays cleared floors vacuously | `floorOver()` requires `n ≥ 1`; a dimension the evaluator said nothing about now MISSES its floor. Test: `judged: []` → S2/S3/S6 all missed, verdict not PASS |
| **MEDIUM-5** world-readable run root | operator note rewritten to say **private** as well as clean-ancestor, and a post-run **credential scrub** implemented: every `claude-home/` under the run dir is deleted at run end on **both** exits, with `credentialScrubbed: true` + the removed paths in the manifest. The recorded listing survives, because it is data |
| **LOW-2** stale filmstrip counts | the pre-tour table is marked as such and counts are recorded per-run below instead of restated |
| **LOW-3** no pre-click tour frame | the driver takes `onboarding tour before dismissal` while the bubble is still up; A/B filmstrips are 21/18 frames |
| **LOW-4** `SMOKE_BUDGET_MIN` pinned but unread | enforced: `budget.mjs` fails a smoke run that overruns 12 minutes with exit 1, keeping the gate result in the line. `elapsedMin` is recorded on every run |
| **LOW-5** stale Notes item 2 | marked RESOLVED — the tour and the guard have both landed, with the driver's measured numbers |
| **LOW-6** `jpeg-js` in devDependencies | moved to `dependencies` in `scripts/roundtrip/package.json` (`lib/image-metrics.mjs` imports it at run time) and the lock regenerated. The ROOT `package.json` keeps it in devDependencies deliberately: the whole harness is dev tooling there and never enters the app bundle |

**Measured, this session (Windows 10, Node 24):** `npx eslint .` **exit 0** · `npx tsc -b`
**exit 0** · `npm test` **92 files / 1603 tests**, exit 0 · `npx vitest run scripts/`
**8 files / 179 tests** (was 154) · `npm run test:coverage` **exit 0** — 87.54% stmt, 80.25%
branch, 85.66% func, 88.68% line · `npm run build` **exit 0** · `npm run e2e` **672 passed,
3 skipped, 0 failed**, exit 0, 5.0 min.

**Segment dry runs, re-run against the fixed tour** (the tour fix changes the DOM the driver
walks, so this is the check that matters):

| Scenario | Driver | Filmstrip | driver-report | Gate |
|---|---|---|---|---|
| **A** | 1 passed (35.9s) | **21 frames**, incl. the new pre-click tour frame | `tourPresent: true · tourFirstStep: 1 · tourStepCount: 5`; filler WARN shown with **exactly one** item | **37 pass, 1 warn, 0 fail, 0 skip · exit 0**; `M04` 33 blocks within ±24px |
| **B** | 1 passed (14.6s) | **18 frames** | same tour numbers; `fillerWarn.shown: false` | **38 pass, 0 warn, 0 fail, 0 skip · exit 0**; `M04` 11 blocks |

**Mock-builder pipeline, re-run end to end** (`--mock-builder`, zero tokens) → **SMOKE-FAIL
30.81, exit 1**, reproducing the built log to the decimal: all eight hard gates **H1–H8 PASS**,
S1 **23.8/25** floor met, S4 0.0 and the S3 floor missed for the same two correct reasons as
before (the mock echoes `generateDescription`; it renders a single vertical stack). Segment
timings SEG-1 18.2 s · SEG-2 0.6 s · SEG-3 0.01 s · SEG-4 0.00 s · SEG-5 3.0 s. New manifest
fields land: `elapsedMin: 0.37`, `smokeBudgetBreached: false`, **`credentialScrubbed: true`**,
`cached: true`, `invalid: false`, `ruleDrift: []`. The S3 item now carries its length verdict
alongside the echo failure (`lengthHint`, sentences, measured 1 in 1–3).

`ship-gate.mjs` still **refuses on every axis**, and R9.3 proved itself in passing: run against
the two mock runs it names the dirty worktree, the cached segments, the non-PASS verdicts, the
two different commits, the wrong leg set **and** that `thresholds.mjs` and `scan-transcript.mjs`
differ from the `fb7eaf6` run's copies — which is exactly what a scan-rule change between runs
is supposed to look like in the evidence.

**Status: unchanged — VERIFIED (MECHANICAL), no Success Criterion ticked.** The pre-flight batch
is complete, so the remaining gate is now only How-We'll-Verify 6–11: the three live runs, the
shipgate, the timed smoke, and the evidence copy.

### 2026-07-29 — LIVE RUN ATTEMPTED AND BLOCKED: three aborts, no verdict, nothing ticked

**Attempt at How-We'll-Verify 6–11. It got no further than the timed smoke, and no product
verdict exists.** All three attempts aborted before SEG-6; every `run-manifest.json` carries an
`error` block and no `verdict`, so none is a scored run and `ship-gate.mjs` ignores all three
(R3.6, R9.4). **Nothing in this entry is evidence about the product**, and no Success Criterion is
ticked. Recorded per protocol §8.5 — one line per iteration, pass or fail.

**Operator setup.** `ROUNDTRIP_RUNS_DIR=C:\bp-runs`, created empty; the ancestor walk from
`builder/sandbox/` to the drive root is clean (no `CLAUDE.md`, `.claude/CLAUDE.md`, `AGENTS.md` or
`.claude/settings.json` above it), which is why R3.2 never fired. Main tree at `52fecbe`;
`git status --porcelain` was empty before, between and after every attempt, and each manifest
independently records `git.clean: true`. **R3.6's freshness precondition PASSES today:**
`npm run build` at HEAD emits `assets/index-B4kZM208.js` and the live Pages `index.html`
references the same filename. `managedPolicy: []` and `credentialScrubbed: true` on all three.

| # | Run dir (`C:\bp-runs\…`) | Segments | Abort | Elapsed |
|---|---|---|---|---|
| 1 | `2026-07-29T10-48-33-883Z_B_52fecbe` | SEG-1 ok 43.8 s · SEG-2 ok 1.3 s | **INFRA** `spawn claude ENOENT` (SEG-3, 29 ms) | 0.76 min |
| 2 | `2026-07-29T10-53-42-804Z_B_52fecbe` | — | **INFRA** SEG-1: Playwright could not start (1.7 s) | 0.03 min |
| 3 | `2026-07-29T10-56-34-241Z_B_52fecbe` | SEG-1 ok 20.3 s · SEG-2 ok 0.6 s | **PRECONDITION** "the builder session was not sterile" (SEG-3, 4.3 s) | 0.42 min |

**The smoke never completed, so `SMOKE_BUDGET_MIN` has still never been measured against a real
builder.** Attempts 1 and 2 were fixed operationally (no repo file touched, no rule file touched);
attempt 3's blocker is a rule question and is where this stopped, per R10.2/R10.7.

**BLOCKER A — the CLI's OAuth token is expired, machine-wide (operator action, Cam only).**
Attempt 3's builder transcript is five events: `init` → `api_retry` ×2 → `assistant` → `result`,
whose text is `Failed to authenticate. API Error: 401 OAuth access token has expired.
Re-authenticate to continue.` This is **not** a sterile-copy artefact: the same `claude -p` probe
run against the REAL config dir in a neutral cwd returns the identical 401, and
`C:\Users\Cam\.claude\.credentials.json` was last written 2026-07-02. So R3.4's `cli-credentials`
method faithfully copied a credential that is dead at source. Re-authenticating is an interactive
OAuth flow and is Cam's to perform; it was not attempted here. `api-key-env` is not a workaround
as specified — R3.4 only falls back to it when **no** credentials file is found, and one is.

**BLOCKER B — R4.6's purity predicate is unsatisfiable on Claude Code 2.1.190 (needs a ruling).**
The abort names `14 skills`, `5 agents`, `27 slash_commands`. **The sandbox is not leaking; those
are the CLI's own built-ins, which ship inside the binary and no `CLAUDE_CONFIG_DIR` can remove.**
Measured contrast, same machine, same binary:

| init field | sterile sandbox (attempt 3) | real config dir (probe) |
|---|---|---|
| `mcp_servers` | 0 | 0 |
| `plugins` | **0** | 1 |
| `agents` | **5** — `claude, Explore, general-purpose, Plan, statusline-setup` | 16 (adds `claude-ads:*`) |
| `skills` | **14** — `deep-research, design-sync, update-config, verify, debug, code-review, simplify, batch, fewer-permission-prompts, loop, schedule, claude-api, run, run-skill-generator` | 99 |
| `slash_commands` | **27** (the 14 + `clear, compact, config, context, heapdump, init, reload-skills, review, security-review, usage, insights, goal, team-onboarding`) | 114 |

99 skills → 14, 114 commands → 27, 16 agents → 5, 1 plugin → 0, and `memory_paths.auto` resolves
**inside** the run's own `claude-home/` — the isolation R3.3/R3.7 promises is demonstrably working.
What R4.6 asserts, as implemented, is that those arrays are *empty*, which this CLI can never
satisfy. **Amending the predicate to "no non-built-in skills/agents/commands" is a rule change
touching a Success Criterion, so it needs Cam's sign-off plus a `docs/decisions.md` entry
(R10.7, CLAUDE.md) — it was NOT made here.**

**Why the mechanical review missed it: the purity check had only ever judged a transcript the
harness wrote itself.** `runMockBuilder` (`run.mjs:330`) emits
`{ type:'system', subtype:'init', model:'mock-builder', mcp_servers:[], plugins:[], agents:[], skills:[] }`,
so `--mock-builder` satisfies `assertSessionPurity` by construction — the same
agrees-with-itself failure mode the gate's own README rejects for `src/export/validate`.

**Three further harness defects found, none of them the product's:**

| # | Finding | Evidence | Routes to |
|---|---|---|---|
| 1 | **The harness cannot start the CLI on Windows.** `runSession` spawns `command = 'claude'` with `shell: false`; the npm shim is `claude` (bash) + `claude.cmd`. Measured: `spawn('claude')` → **ENOENT**; `spawn('claude.cmd')` → **EINVAL** (Node's post-CVE-2024-27980 `.cmd` guard). Not the env scrub — `ENV_ALLOWLIST` already carries `PATHEXT` and `COMSPEC`. Worked around operationally by prepending the directory holding the real `claude.exe` (same 2.1.190 binary the `claude` command resolves to) to `PATH`; nothing in the repo was changed. | attempt 1 | harness — `claude-session.mjs` binary resolution |
| 2 | **R4.6's memory assertion is checking fields this CLI does not emit.** It tests `project_memory` / `memory_files` / `claude_md_files`; 2.1.190 emits `memory_paths`. The half of R4.6 that proves "no project memory" therefore passes **vacuously** — the exact class MEDIUM-6 already fixed for empty score arrays (R10.7). No actual leak occurred: the emitted `memory_paths.auto` is inside the sterile dir. | attempt 3 init event | harness — `assertSessionPurity` |
| 3 | **Purity is asserted AFTER the session returns, so it cannot fail fast.** `runSession` completes, *then* `assertSessionPurity` runs. This was free here only because auth died in 4.3 s; with working auth each attempt would spend a full Opus builder budget (§9: ≈ $10–25, 25–45 min) and *then* abort as PRECONDITION. The check should run on the `init` event as it streams. | `run.mjs:203-212` | harness — orchestrator |

**Environmental, not a defect:** attempt 2 died because port 4173 was held by a **concurrent**
`vite preview` from another session's review worktree (`%TEMP%\bp-review-wt11`, `npm run e2e`,
started 10:50:30Z), and `playwright.roundtrip.config.ts` sets `reuseExistingServer: false`. That
process was left alone — it belonged to a live run — and attempt 3 started once it exited. Worth
knowing for the next operator: **the round trip needs sole use of port 4173 for its whole run.**

**Nothing was weakened to get past any of this.** No threshold, scan rule, scenario, prompt or
rubric was edited; the rule-file hashes are identical at start and end of all three runs
(`invalid: false`, `ruleDrift: []`). **Status stays `awaiting verification`.** The live legs
resume when Blocker A is cleared by Cam and Blocker B is ruled.

### 2026-07-29 — Blocker B RULED and implemented; the Windows spawn defect fixed; Blocker A still Cam's

**Status unchanged: `awaiting verification`.** Nothing here is a product verdict and no Success
Criterion is ticked. What changed is that the two harness defects which made a gating run
*impossible* are gone, and the third — the dead credential — now fails honestly instead of
being scored.

**How the builtin manifest was captured.** Not by hand and not from the docs: by running the
harness's own sterile-session path — `createSterileConfigDir` (settings.json + exactly one
credential, R3.3/R3.4) → `scrubEnvironment` (R3.7) → `runSession` — against a sandbox with a
clean ancestor chain, and reading the sets straight off the streamed `system`/`init` event.
**The CLI's OAuth token is expired and the init still arrives before the 401** — verified: the
transcript is `init → api_retry → api_retry → assistant → result("…401 OAuth access token has
expired…")`, and the init it carries lists **exactly the same** agents, skills and
slash_commands as the one live-run attempt 3 recorded in
`C:\bp-runs\2026-07-29T10-56-34-241Z_B_52fecbe`, name for name. So the manifest is measured from
a live run of the pinned binary, not reconstructed from a transcript.

**Measured while capturing it, and worth knowing: the builtin set is not a constant of the
binary — it moves with things the harness already pins.** Same machine, same 2.1.190, same hour:

| Conditions | plugins | agents | skills | slash_commands |
|---|---|---|---|---|
| sterile dir + one credential + scrubbed env — **what a run does** | 0 | **5** | **14** | **27** |
| sterile dir + NO credential + scrubbed env | 0 | 5 | 13 | 26 |
| sterile dir + NO credential + inherited env | 0 | 6 | 13 | 26 |

`schedule` is entitlement-gated (it needs a credential to resolve) and `claude-code-guide` rides
in on an inherited `CLAUDE_*` variable. R3.4 guarantees exactly one credential or aborts, and
R3.7 always scrubs, so a harness run only ever sees row 1 — and a run that somehow sees another
one **should** abort, which is precisely what the version-mismatch branch does. The manifest
records this sensitivity in its own header so the next person to re-capture knows what to hold
fixed.

**What landed**

| # | Change | Where |
|---|---|---|
| 1 | **R4.6 amended to baseline sterility**, per the decisions entry: plugins/MCP zero; agents/skills/slash_commands set-equal to the committed manifest; extra = LEAK (named), missing = VERSION MISMATCH; version must have a manifest entry; memory paths must resolve inside the run's own `claude-home` | `builtin-manifest.json` + `builtin-manifest.mjs` + `claude-session.mjs` |
| 2 | **The assertion fires on the STREAMING init** and kills the child — `runSession` gained an `onInit` hook fed by a line-splitter on stdout, so an impure session dies in seconds instead of after a full builder budget (finding 3) | `claude-session.mjs`, `run.mjs` |
| 3 | **The memory check reads `memory_paths`**, the field 2.1.190 actually emits, with the three old spellings kept as also-checked-if-present — and it can no longer pass vacuously: the manifest names the field the pinned version emits, and an init without it is a mismatch (finding 2) | `claude-session.mjs` |
| 4 | **The mock builder emits a REALISTIC init** — the manifest's own sets, not empty arrays — so `--mock-builder` exercises the real predicate. This closes the mask that let the unsatisfiable predicate through review | `run.mjs` |
| 5 | **Windows spawn fixed** (finding 1): PATH × PATHEXT probe, `.exe`/`.com` preferred, npm shim **read** (never run) to follow the `.exe` it delegates to, absolute path spawned with `shell: false`. No `shell: true` anywhere — that is the CVE this works around, not a workaround to use | `lib/resolve-command.mjs`, `run.mjs` (R4.3a) |
| 6 | **An auth failure is now INFRA** (R4.3b). Found by fixing the above: once purity stopped aborting first, the expired credential reached SEG-4 as an empty sandbox and was scored `FAIL — H3 incomplete build` — a real, measured instance of the harness reporting an environment failure as a product one (`C:\bp-runs\2026-07-29T11-49-45-751Z_B_ff69834`, verdict written; **not a product verdict, disregard it**) | `claude-session.mjs`, `run.mjs` |
| 7 | `builtin-manifest.json` added to `RULE_FILES` — the baseline is hashed at run start and end like every other rule | `thresholds.mjs` |

**Evidence**

- **A real sterile session now runs and passes the amended predicate.**
  `ROUNDTRIP_RUNS_DIR=C:\bp-runs npm run roundtrip:smoke` →
  SEG-1 19.1 s ok · SEG-2 0.5 s ok · **SEG-3 3.8 s ok** (was: ENOENT in 29 ms), with
  `builder.command = {path: …\@anthropic-ai\claude-code\bin\claude.exe, via: "shim", shim: …\claude.cmd}`
  and `builder.purity = {ok: true, kind: null, cliVersion: "2.1.190", baseline: "2.1.190",
  problems: []}`. `credentialScrubbed: true`, `ruleDrift: []`, and the rule hashes now list
  **seven** files (six + `scenario-B.json`).
- **The same run after R4.3b landed** aborts as
  `PRECONDITION: the builder session could not authenticate — nothing was built, so there is
  nothing to score`, writes **no** `verdict.txt`, and is invisible to `ship-gate.mjs`
  (`C:\bp-runs\2026-07-29T11-52-31-549Z_B_ff69834`, 0.37 min).
- **Mock pipeline re-run end to end** (`--mock-builder`, zero tokens) → **SMOKE-FAIL 30.81,
  exit 1** — the same shape to the decimal, with **H1–H8 all PASS**, and the purity check now
  genuinely exercised: the mock init carries 0 plugins / 5 agents / 14 skills / 27 commands and
  `builder.purity.ok: true` against baseline `2.1.190`. Segments SEG-1 17.9 s · SEG-2 0.5 s ·
  SEG-3 0.01 s · SEG-4 0.00 s · SEG-5 2.9 s; `cached: true`, `invalid: false`, `ruleDrift: []`,
  `smokeBudgetBreached: false`, `elapsedMin: 0.37`.
- **The leak proof.** Feeding the real emitter a planted non-builtin skill aborts:
  `mockBuilderEvents({ extra: { skills: [...builtins, 'supabase'] } })` →
  `{ok: false, kind: "leak", problems: ["non-builtin skills leaked in: supabase"]}`. Pinned as a
  unit test that uses the production emitter, so it cannot drift from what the mock actually
  writes.
- **The fail-fast proof.** A real child process that emits a leaking init and then would sit for
  a minute is killed in well under half that, and the impure transcript survives the abort
  (`sandbox.test.mjs`, "kills the child instead of waiting for the session to finish").
- **Suites:** `npm run lint` clean · `npm test` **93 files / 1636 passed, 2 skipped** ·
  `npx vitest run scripts/` **208 passed, 2 skipped** (was 179; +29 = the rewritten R4.6 suite,
  the resolver's fixture-PATH suite, the streaming and auth-guard proofs — the 2 skips are the
  POSIX resolver cases, which only a POSIX box can build a `:`-separated PATH for, and they run
  on the ubuntu CI runner) · coverage exit 0 · build exit 0 · gate self-test **45/45** ·
  schema check OK.
- **Driver dry-runs, both green, both gates exit 0:** A — 1 passed (36.3 s), 21 steps, filler
  WARN shown with exactly one item, **37 pass / 1 warn / 0 fail / 0 skip**, `M04` 33 blocks
  within ±24 px. B — 1 passed (14.3 s), 18 steps, `fillerWarn.shown: false`, **38 pass / 0 warn /
  0 fail / 0 skip**, `M04` 11 blocks.

**Blocker A is unchanged and is still Cam's alone:** the CLI's OAuth token is expired
machine-wide (`.credentials.json` last written 2026-07-02), re-authenticating is an interactive
flow, and R3.4 copies a dead credential faithfully. The three gating runs resume the moment it is
cleared — every mechanical obstacle in front of them is now gone.

**Nothing was weakened.** No threshold, scan rule, scenario, prompt or rubric was edited. The one
Success Criterion touched is R4.6's, amended by the ruling recorded in `docs/decisions.md` on the
grounds that the old predicate was impossible rather than merely strict — and the new one is
strictly harder in practice: the old one never passed a real transcript, this one passes exactly
one configuration and names anything else.

## Open Questions — ALL RULED 2026-07-28, kept for context

**Every question below was ruled the same day and is already applied in the rules above.
Implementers follow the amended spec: single-credential sterile config dir (Q1), run root outside
the repo (Q2), Scenario A gains a Section band (Q3) and one untouched template filler block (Q4),
`npx`/`npm` denied to the builder (Q5), the extended interrogative set (Q6), the deployed-bundle
freshness precondition (Q7), and one unlinked `Instagram` button on Contact (Q8). Each ruling owes
a `docs/decisions.md` entry; `docs/roundtrip-protocol.md` §1.2, §3.1 and §4.2 are amended
accordingly in the same doc pass.**

1. **A sterile `CLAUDE_CONFIG_DIR` has no credentials, so the builder cannot authenticate.** The
   protocol never said how the isolated session logs in — a fresh implementer stops dead here.
   **RULED:** exactly one credential, `cli-credentials` preferred (Cam's setup uses CLI auth) with
   `api-key-env` as fallback; the sterile dir asserts to `settings.json` + at most that one file;
   the method and source path (never the contents) go in `run-manifest.json`. → R3.3, R3.4
2. **Where does the run directory live?** §0 says `roundtrip-runs/` is gitignored (inside the
   repo); §3.1 says the sandbox is outside the repo tree so no ancestor `CLAUDE.md` can leak.
   These cannot both be true, and the inside-the-repo reading silently destroys the zero-context
   premise. **RULED:** run root outside the repo at
   `%LOCALAPPDATA%\boss-blueprint\roundtrip-runs\`; the `.gitignore` line stays for safety; the
   ancestor walk is the real guard and runs regardless. → R3.1, R3.2
3. **Scenario A never places a `section` block, but claims "all six block types".** Section bands
   are load-bearing for the brief's DoD item 2 and §4.4 row grouping, and were untested by either
   scenario. **RULED:** one full-width Section band behind the Home hero; the manifest diff
   asserts the `section` discriminator at the back of the paint order. Coverage of all six types
   is now true rather than claimed. → R1.2a
4. **`fromTemplate` filler leakage is exercised by neither scenario.** §1.2 deferred the WARN path
   to Scenario B, but B is a blank start with zero seeded blocks and cannot carry template filler
   — so V23's WARN, the brief's filler narration and the submit gate's WARN-ships-anyway path
   never ran end to end. **RULED:** Scenario A keeps exactly one untouched filler text block on
   Services; the driver asserts the WARN was shown and the package still shipped; the manifest
   diff asserts the flag; the expected text is read from the committed template fixture, never
   duplicated. → R1.2b, R8.5
5. **The allowlist contradicts the hermetic-build claim.** §3.1 allowed `Bash(npx serve*)` /
   `Bash(npx http-server*)` while declaring network denied; `npx` fetches from the registry on a
   cold cache. **RULED:** `npx` and `npm` dropped from allow and added to deny, unit-tested; SEG-5
   serves with the committed dependency-free `static-server.mjs`, which also removes the harness's
   own network dependency. → R3.5, R6.1
6. **Rule 2a's interrogative lead set was too narrow.** `\b(do)\b` does not match "does", so "Is
   this what you wanted?", "Are you happy for me to proceed?" and "You want me to use the green?"
   all passed H2. **RULED:** extend the lead set and add a reverse-order (you → verb-of-choice)
   clause, **now, before any gating run exists** — changing a scan rule after a verdict exists is
   what R5.5/R10.2 forbid, so the strengthening deliberately predates the first run. Corpus
   entries and a decisions entry land with it. → R5.3
7. **The `deployed` leg had no freshness check.** Nothing stopped a run against a stale Pages
   deploy — and the 2026-07-28 UX audit found the live build lacked Submit, image upload and pen
   entirely. **RULED:** hashed-bundle identity assert against the local `HEAD` build; mismatch
   aborts as PRECONDITION, is never scored, and is invisible to `ship-gate.mjs`. → R3.6
8. **The two-buttons-on-Contact sentence in §1.2 page 4 was self-contradictory** ("button `Get a
   free quote` → Contact-page… no — this one is the deliberate **unlinked** control"). **RULED:**
   Contact carries exactly one button, `Instagram`, link `none`. Internal and external links are
   already covered on Home; the `none` path is what this page exists to test. → R1.2c

## Notes & Decisions

### Calls made while building it (2026-07-29)

Everything here is a decision the spec did not already make, or a place where reality
disagreed with it. Nothing was quietly absorbed.

1. **`gate.mjs` was not runnable from the repo root at all.** `node scripts/roundtrip/gate.mjs`
   died with `ERR_MODULE_NOT_FOUND: adm-zip` — the gate's own README §5 step 2 ("add the
   runtime deps to the repo's `package.json`") had never been carried out, so `--no-manifest`
   could never have been run from CI either. **Fixed:** `adm-zip@^0.6.0`, `pngjs@^7` and
   `jpeg-js@^0.4` added as devDependencies, plus the `roundtrip:gate` /
   `roundtrip:gate:selftest` / `schema:check` scripts the README asks for. The Stage 3
   self-test then passed 45/45 unchanged.

2. **Two rows of the "Dependency contract on `gate.mjs`" table are FALSE, deliberately, and
   were NOT shimmed around.** Reported here for the main session to rule on:
   - *Schema source.* The contract says the gate imports `src/export/schema/site.v1.schema.json`.
     It does not: it **extracts the schema from the fenced block in `docs/export-format.md`
     §2.2** at run time, and `extract-schema.mjs --check` is the equality test. That is a
     documented Stage 3 decision (gate README §1), and it is the stronger arrangement — the
     repo file did not exist when the gate was written, and a gate that reads the app's copy
     cannot catch the app's copy drifting from the spec.
   - *Validator source.* The contract says the gate imports the app's shared validator module.
     It deliberately **imports no app code at all**: "a gate that called `src/export/validate`
     would agree with the app by construction and could never catch a validator bug."
   Both readings are defensible; what is not defensible is the feature file asserting one
   thing and the code doing another. **The contract table should be amended to match the
   code**, not the other way round. `gate-contract.test.mjs` asserts the rows that ARE true
   (CLI surface, exit codes 0/1/2, machine output) so the contract stops being a claim.

3. **`gate.mjs` now also writes `<out>/gate-report.json`** in the contract's
   `{ ok, steps, failures }` shape, alongside Stage 3's richer `report.json` (unchanged) and
   the new `manifest-diff.json`. Derived from the same checks — one source, two renderings.

4. **The "at the back of the paint order" assertion (R1.2a) means "behind every content
   block", not "at index 0".** A nav bar is the other full-width stacked block and
   legitimately paints furthest back (`src/templates/layout.ts` invariant 3;
   `blockTypes.ts` `placement: 'stacked'`), so the trades template's Home array is
   `[nav, band, band, …]`. Asserting index 0 would fail every correct template start. The
   diff now asserts no `section` paints in front of any content block, plus full width, plus
   the declared count — which is the property §4.4's row grouping actually depends on.

5. **The R1.2b filler fixture is read from `src/templates/trades.ts`, not
   `design-assets/templates/starterTemplates.ts`.** R1.2b names the design-asset file, but
   that is a pre-landing review draft; the app seeds from `src/templates/`, and the two
   disagree (see 6). Reading the draft would compare the export against words the product
   never used. Node 24's native type stripping makes the landed module importable from the
   harness, so `manifest-diff.mjs` reads the same data the product seeded.

6. **The UPSTREAM FINDING recorded below is RESOLVED — `band()` no longer sets
   `fromTemplate`.** `src/templates/layout.ts` ships `SectionBlock` with
   `readonly fromTemplate?: never` and a comment citing the same 2026-07-28 ruling, and
   `canCarryTemplateFlag` excludes `section`. So a template start does **not** trip the filler
   WARN forever. Measured: Scenario A's package carries exactly one flagged block. The Notes
   entry below is left in place for history but is no longer live.

7. **NEW UPSTREAM FINDING — §4.5's degenerate-bbox fallback misclassifies straight strokes.**
   `containedRatio` (`src/export/penRoles.ts`) handles a zero-area bbox by measuring the
   overlap along whichever axis has length — and **ignores the other axis entirely**. So a
   perfectly vertical stroke drawn anywhere on the page is classified `imageSketch` for any
   image slot whose *vertical* extent contains it, however far away it is horizontally. Found
   for real: two strokes of Scenario A's `BIG!` (the `I` and the `!`, drawn at x≈550 and
   x≈634) were assigned `role: "imageSketch"` targeting the hero photo at x 744–1120, whose
   `intersectionArea` with them is exactly zero. **Fix belongs in Stage 3
   `src/export/penRoles.ts`:** the degenerate branch should still require the zero-extent axis
   to fall inside the frame. Scenario A's strokes now carry the slant and jitter real
   handwriting has, which is faithful to "hand-written" rather than a dodge — but the bug is
   real and unfixed, and a client who draws a straight underline beside a photo will hit it.

8. **Scenario A's Home hero CTA is an INSERTED button, and `trade-home-hero-cta` is deleted.**
   Protocol §1.2 asks for a `Get a free quote` button linked to Contact; the trades template's
   hero CTA *already* has that exact label and already points at the page that becomes
   Contact. `withUpdatedBlock` returns the original object when nothing changed, so no content
   edit ever occurs and `fromTemplate` never clears — which produced **two** untouched filler
   blocks and broke R1.2b's "exactly one". Deleting it and inserting the button is a real
   client action, keeps the frame and the coverage identical, and makes the filler count
   deterministic. (Measured before the fix: the submit gate listed 2 filler items.)

9. **The driver is an INTERPRETER of the scenario file, not a spec per scenario.** R1.1 makes
   the scenario the single source of truth for three consumers and R1.6 forbids a second copy
   of any string; two hand-written specs would have been exactly that. `client.spec.ts` walks
   the declarative file, and `e2e/roundtrip/actions.ts` holds the affordance vocabulary.

10. **The driver may not reuse `e2e/support/`.** `openCanvas` waits on the test-only store
    bridge, `makePhotoFixture` builds its bytes by running script in the page, and
    `scrollCanvasTo` sets `scrollTop` through the DOM. All three are fine E2E tools and all
    three are disqualified by R2.2, so the round-trip driver has its own helpers and scrolls
    with `mouse.wheel`. `driver-purity.test.mjs` greps the whole `e2e/roundtrip/` directory,
    not just `client.spec.ts` — a helper module would otherwise be the obvious hiding place.

11. **At 1440×900 the page is NOT 1:1.** The tri-engine suite uses 1920 wide precisely so the
    fit scale is 1; R2.1 mandates 1440, where the scale is ≈0.69. Every driver coordinate goes
    through the live placement (`canvas-page` bounding box + `data-page-scale`), and long
    moves hop — scroll, drag what fits, repeat — because a single drag needs the grab point
    and the drop point on screen at once.

12. **SEG-1 invokes Playwright through `node node_modules/@playwright/test/cli.js`, not a
    package runner.** Ruling 5 keeps the whole harness off the npm registry, and spawning a
    `.cmd` shim on Windows needs a shell we would rather not hand a child process. The
    no-package-runner test matches an actual child-process invocation rather than the word, so
    the deny list and the rationale comments can keep naming it.

13. **`--mock-builder <dir>` exists, and any run that uses it is marked `cached: true`.** It
    copies a canned site into the sandbox and writes the transcript a clean session would have
    produced, which is how SEG-4/5/6 were proven without a builder budget. R10.4 bars a cached
    run from the ship gate, and `ship-gate.mjs` refuses it by that rule specifically.

14. **Two harness bugs the mock run found and fixed.** Worth recording because the mock run is
    the only thing that could have found them: (a) H5 treated the homepage as unreachable
    because it only matched `<slug>.html`, when `index.html` and `/` are both explicitly
    permitted by the brief's DoD; (b) S1 tokenised a nav bar as one opaque token and a
    `generate` block by its description, so a correct build scored 0.58. Nav bars now expand
    to one token per item and generate blocks are wildcards — S1 asks about ORDER, and copy
    quality is S3's question. After the fix the mock scores 23.8/25.

15. **`.mjs` sources must stay LF.** Two files picked up CRLF during editing and vitest failed
    to parse them with a bare `SyntaxError: Invalid or unexpected token` that named no line.
    `.gitattributes` already normalises on commit; this is a note for whoever edits them next
    with a tool that does not.

### Earlier notes

- **Eight protocol ambiguities were ruled 2026-07-28 and are applied in place above** (see Open
  Questions). Three of them amend `docs/roundtrip-protocol.md` itself — §1.2 (Scenario A gains a
  Section band, a filler block and a single unlinked Contact button), §3.1 (run root, credentials,
  allowlist) and §4.2 (the interrogative set) — and all eight owe a `docs/decisions.md` entry in
  the same doc pass. Until that pass lands, this file is ahead of the protocol; the truth
  hierarchy (CLAUDE.md) says fix the docs and say you did.
- **UPSTREAM FINDING raised while applying ruling 4 — NOT Stage 4's to fix, but it will make the
  round-trip noisy until someone rules on it.** `design-assets/templates/starterTemplates.ts`
  creates every full-width band via `band()`, which hard-codes `fromTemplate: true` and `text: ''`;
  `docs/export-format.md` §2.7 says the flag clears only on a **content** edit and explicitly not
  on move/resize; a Section has no content to edit. V23 WARNs on *any* block with
  `fromTemplate: true`. Therefore **every template-start submission trips the filler WARN
  forever**, even when the client has rewritten every word — the warning can never be cleared, so
  it cries wolf on the exact path Scenario A is testing. Two candidate fixes, both upstream:
  (a) `band()` stops setting `fromTemplate` (bands carry no client copy, so they are not filler),
  or (b) V23 scopes to copy-bearing block types. **Recommendation: (a)** — it is a one-line
  fixture change, it keeps V23's rule simple, and `fromTemplate` then means what its own doc
  comment says ("the client never touched its content"), which is vacuous for a block with no
  content. Owner: Stage 2 `feature-templates.md` (with a `docs/decisions.md` entry); the harness
  is written to be correct either way (R1.2b per-block expectations).
- Binding spec: `docs/roundtrip-protocol.md` (v1, drafted 2026-07-28). Package contract:
  `docs/export-format.md` v2.2 (§1 layout, §2 schema, §3 brief template + the no-questions
  instruction, §4.5 pen roles, §5 V1–V26, Appendix A). Stage 3's DoD already runs
  `gate.mjs --no-manifest` on a real E2E zip, so H1 steps 1–3 arrive pre-proven.
- **The no-questions instruction lives only in `brief.md`** (`docs/export-format.md` §3.2: "Do
  not ask clarifying questions. Every decision this brief leaves open is yours to make with
  professional judgment."). If a fresh implementer ever "helpfully" adds it to `prompt.txt`, H2
  stops measuring the product. R4.2's hash test is the tripwire.
- **No store injection, by construction.** `window.__blueprintStore` is folded out of the
  production bundle at build time (`staging/stage-1-canvas-core/feature-block-canvas.md` Notes),
  and both round-trip targets serve production bundles — so the seam is not merely unused, it is
  absent. R2.2's grep test keeps it that way in the driver source.
- **`preview` vs `deployed`:** `preview` (a `vite preview` of `npm run build` at HEAD) is the
  hermetic, CI-able regression target; `deployed` (the live Pages URL) runs once for the ship
  gate because the Stage 4 DoD says "the REAL deployed UI" (protocol §10.1).
- **Costs** (protocol §9): ≈ $10–25 and 25–45 min per full gating run; the three-run ship gate
  ≈ $25–60 and 1.5–2.5 h; smoke ≈ $1–3 and ≤ 12 min. No new infrastructure — Node + Playwright
  are already in the stack, fixtures are committed files, hosting is the existing Pages deploy.
- **Smoke is mandatory from Stage 3 close onward** (protocol §9): before merging any change to
  `src/export/**`, the schema, the brief generator, templates or the PNG renderer. It is not on a
  cron — token spend without a triggering change buys nothing.
- **The optional "chaos client"** (protocol §1.1) — a browser-tooled agent free-forming a sketch
  from a persona brief — may be run once pre-ship for UX discovery. Its package still passes
  through SEG-2..6, it has no manifest diff, and **its verdict is advisory and never blocks.**
- Handwriting legibility at 1× is a known revisit trigger; Scenario A's `BIG!` annotation probes
  it deliberately. If S6/legibility fails twice, that IS the evidence the 2× ruling needs —
  escalate per §8.3 rather than softening the scenario (protocol §10.5).
