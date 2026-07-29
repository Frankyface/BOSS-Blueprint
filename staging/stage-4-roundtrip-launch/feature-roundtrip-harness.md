# Feature: Round-Trip Harness
_Stage: stage-4-roundtrip-launch · Status: not started_

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
├── claude-session.mjs       # spawn + stream-json capture, shared by builder and evaluator
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

**R2.3 First step is dismissing the tour** (feature-onboarding-tour.md) via its real dismiss
control, screenshotted as step 00. The guard notice must not be present at 1440×900; if it is,
that is a desktop-guard defect and the run aborts as PRECONDITION.

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

**R4.4 Timeouts:** builder segment 45 min; orchestrator hard-stops any segment at 60 min. Breach
= INFRA fail, not product FAIL.

**R4.5 Banned-flag assertion.** Before spawning, assert the assembled argv contains no
`--dangerously-skip-permissions` and the settings object has no `bypassPermissions` /
`acceptEdits` default. Unit-tested against a mutated-argv fixture.

**R4.6 Session-purity assertion.** Parse the `system`/`init` event and assert: zero MCP servers,
zero loaded plugins/skills/agents, and no project-memory files listed. Any of these non-empty →
PRECONDITION abort. This is the assertion that actually proves "zero context"; the config-dir
mechanics are just how it is achieved.

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
- **2b (phrase list, case-insensitive):**
  `/let me know/`, `/please (clarify|confirm|provide|specify)/`,
  `/need (more|additional) (info|information|details)/`, `/before i (proceed|continue)/`,
  `/awaiting (your|further)/`, `/unable to proceed without/`,
  `/which (option|one) (do you|would you)/`

Every hit is written to `builder/scan-report.json` with the offending sentence, the rule id and
its character offset.

**Both 2a clauses are stronger than protocol §4.2's original wording, and that is deliberate**
(ruled 2026-07-28, Open Question 6). The protocol's lead set was
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
sandbox** (`<runDir>/eval/sandbox/`), never the builder's.

**R7.2 Inputs — exhaustive and closed.** `site.json`, the scenario file, `package/pages/*.png`,
`shots/*.png`, `BUILD_NOTES.md`, `rubric.md`, and a harness-generated `rubric-manifest.json`
listing the exact item ids it must score. **The builder transcript is never copied into the
evaluator sandbox** (no anchoring on the builder's self-report) — asserted by listing the sandbox
contents after staging and comparing to the closed expected set.

**R7.3 Output contract.** `judgments.json` per protocol Appendix B, ajv-validated:
`{ scenario, items: [{ id, score, evidence, confidence }] }`. Every `id` must come from
`rubric-manifest.json`; scores must be integers in range; **`evidence` must be a non-empty string
that names at least one artefact file** (regex `/(shots|pages)\/[\w.-]+\.png|BUILD_NOTES\.md/`).
Uncited or out-of-range items are rejected by the merger.

**R7.4 Retry policy.** One malformed output → exactly one retry → then the run fails as **INFRA,
never as a product FAIL**. A flaky evaluator must never be able to manufacture a product verdict
in either direction.

**R7.5** In `--smoke` mode the evaluator is skipped entirely; the verdict is SMOKE-PASS/FAIL on
hard gates plus the deterministic halves of S1/S3/S4/S5 with the same floors.

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
| S3 | GENERATE copy quality. Det sanity: non-empty, not lorem ipsum, no `[`/`TODO`/`placeholder`, not a verbatim echo of `generateDescription`, length within `lengthHint` or 0.3–3× the frame estimate. Evaluator: 0 off-topic · 1 on-topic · 2 on-topic, on-vibe, uses business specifics; pts = 15 × mean/2 | 15 | **all items pass det sanity AND score ≥ 1** |
| S4 | Image placement + empty slots. Det: matched asset's rendered box centre in the same vertical third and horizontal half as its sketch frame; empty slots have an in-region `<img>`/`<svg>` placeholder with alt text derived from the description; pts = 15 × fraction | 15 | ≥ 0.8 |
| S5 | Style / vibe. Det: ≥ 1 client colour among the 8 dominant colours of any shot (ΔE00 < 12) when colours were given; not unstyled default (≥ 2 non-grayscale dominants, custom fonts or spacing). Evaluator 0–2 on "does this read as ‹vibe›?"; pts = 7 det + 8 × eval/2 | 15 | **det colour check passes when colours were given** |
| S6 | Pen intent (evaluator, per brief-listed cluster): annotation — intent honoured AND a reading recorded in BUILD_NOTES; imageSketch — placeholder relates to the sketched subject; 0–2 each; pts = 10 × mean/2 | 10 | **imageSketch placeholder must not contradict the sketch subject** |

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
   | `QUESTION_PHRASES` | the seven phrase regexes | R5.3 2b |
   | `DENIED_BASH_PREFIXES` | includes `npx`, `npm` (ruling 5) | R3.5 |

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
_Empty — nothing verified yet._

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
