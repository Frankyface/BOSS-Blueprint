# Round-Trip Test Harness — Protocol v1

_BOSS Blueprint · Stage 4's gating instrument · drafted 2026-07-28 · consumes export-format-draft.md (schemaVersion 1)_

This document specifies the fully automated protocol that decides whether v1 ships: a fake
client sketches a real business site through the **real deployed UI**, submits, the package
goes to a **fresh zero-context Claude Code session**, that session builds a site, and an
evaluation issues a hard PASS/FAIL on "visibly matches, zero clarifying questions."

Design constraints honored throughout:
- **No human gate** (Cam's mandate; decisions.md 2026-07-27 verification convention).
- **No store injection for the sketch** — the client path is the product under test. The
  test-only `window.__blueprintStore` seam is absent from production builds anyway
  (handoff.md Watch-Out); the client driver uses pure UI interactions.
- **No `--dangerously-skip-permissions`** (house rule, hooks.md) — the builder runs under a
  scoped allowlist in an isolated config dir instead.
- **Repeatable** — one declarative scenario file drives the client, the package diff, and
  the evaluation expectations; reruns are deterministic modulo LLM output.
- **Archived evidence** — every run leaves a self-contained run directory; verdicts land in
  the Stage 4 feature file's Verification Log per repo convention.

---

## 0. Pipeline overview

```
scenario.json ──┐
                ▼
[SEG-1 CLIENT]  Playwright drives the real UI → downloads package.zip (+ design.blueprint)
                ▼
[SEG-2 GATE]    unzip → layout check → ajv schema → V1–V12 validator replay
                → expected-manifest diff (scenario vs site.json)          ← hard gate H1
                ▼
[SEG-3 BUILD]   fresh `claude -p` in a sterile sandbox, package only
                → site/ + BUILD_NOTES.md + transcript.jsonl
                ▼
[SEG-4 SCAN]    zero-questions transcript scan + BUILD_NOTES triage       ← hard gate H2
                ▼
[SEG-5 SHOTS]   serve site/ statically → Playwright: crawl nav, console
                errors, full-page screenshots at 1200px per page
                ▼
[SEG-6 EVAL]    deterministic checks (evaluate.mjs) + evaluator agent
                (judgment items) → merged report.json / report.md         ← PASS / FAIL
                ▼
[SEG-7 ROUTE]   on FAIL: classify every miss → fix owner → loop
```

Orchestrator: `scripts/roundtrip/run.mjs` (Node, matches the repo stack), invoked as
`npm run roundtrip:full -- --scenario A` / `npm run roundtrip:smoke`. Each segment writes
its status + artifacts into the run directory and the orchestrator halts at the first
failed hard gate (later segments are pointless and would burn tokens). Exit code 0 ⇔ PASS.

**Run directory** (the archived evidence, one per run):

```
roundtrip-runs/<UTC-timestamp>_<scenario>_<gitsha7>/
├── run-manifest.json        # segment statuses, timings, versions, model ids, verdict
├── client/                  # SEG-1: playwright trace.zip, video, per-step screenshots
├── package.zip              # exactly as downloaded
├── design.blueprint         # the design file, downloaded same run (enables cheap re-export)
├── package/                 # extracted zip
├── gate/                    # SEG-2: ajv output, validator replay, manifest-diff.json
├── builder/                 # SEG-3/4: prompt.txt, transcript.jsonl, scan-report.json,
│   └── sandbox/             #   the sterile working dir: package/ + site/ + BUILD_NOTES.md
├── shots/                   # SEG-5: <slug>.png full-page screenshots, crawl.json, console.json
├── eval/                    # SEG-6: evaluate.json (deterministic), judgments.json (agent),
│                            #   report.json, report.md
└── verdict.txt              # PASS | FAIL <score> — the one-line answer
```

`roundtrip-runs/` is gitignored (zips + videos are heavy). The Verification Log entry in
`staging/stage-4-roundtrip-launch/feature-roundtrip.md` records the run path, the verdict
line, the score table, and copies `report.md` + 2 representative side-by-side screenshots
into `staging/stage-4-roundtrip-launch/evidence/` (small, committed).

**What runs the client against what.** Two targets:

- **`preview` target (default, all regression runs):** `npm run build` at the current
  commit, served by `vite preview` — the exact production bundle (no test seams), local,
  hermetic, CI-able.
- **`deployed` target (ship gate only):** the live GitHub Pages URL
  (`https://frankyface.github.io/BOSS-Blueprint/`). Proves the value chain on the REAL
  deployed UI, per the Stage 4 DoD wording. Network-dependent, so it gates ship, not CI.

The v1 ship verdict requires: Scenario A PASS on `preview`, Scenario A PASS on `deployed`,
Scenario B PASS on `preview` — all three as clean uninterrupted runs (§8).

---

## 1. Scenarios and the fake client

### 1.1 Scripted client, not free-driving agent (decision)

The "agent acting as a client" is realized as a **deterministic Playwright spec executing a
declarative scenario file** — agent-authored once, then frozen. Rationale: the harness must
double as a regression suite after schema changes; a free-driving LLM client is
non-deterministic, so a regression FAIL could mean "the client sketched differently today,"
which destroys the signal. The scenario file is the single source of truth consumed three
times: (a) the client driver executes it, (b) the package gate diffs `site.json` against it,
(c) the evaluator receives it as the expectation list. One source → the three consumers can
never drift from each other.

Optional, non-gating: a "chaos client" run pre-ship — a Claude agent with browser tools
free-forms a sketch from a one-paragraph persona brief. Its package still goes through
SEG-2..6 but there is no manifest diff (no script to diff against) and its verdict is
advisory. Catches UI affordance gaps a script can't; never blocks.

### 1.2 Scenario A (primary, gating): template-start — "Cedar & Stone Landscaping"

Starts from the **Trades/Services template** (recommended as the primary because it
exercises the highest-risk export machinery: `fromTemplate` clearing, the placeholder-leak
guard, template nav rewiring, and it mirrors the realistic client path — decisions.md
2026-07-28 template guardrails). File: `scripts/roundtrip/scenarios/scenario-A.json`.

**Persona / site settings** (typed into the real settings panel):

| Field | Value |
|---|---|
| businessName | `Cedar & Stone Landscaping` |
| tagline | `Yards built to last in Guelph` |
| about | `We're a two-crew landscaping company serving Guelph and Wellington County since 2016. We design and build patios, retaining walls, and full backyard makeovers, and we handle seasonal maintenance for about forty regular clients.` |
| vibe | `modern` (pick-list) |
| styleNotes | `Clean and outdoorsy. Big photos, lots of green, nothing corporate-looking.` |
| colors | `#2F5233` (deep green), `#D9C7A7` (sand) — 2 of 3 slots used |
| submit form | name `Riley Hodgson`, email `riley@cedarstonelandscaping.ca` |

**Pages (4 — satisfies "3+"), final state after edits.** The driver renames/edits template
pages and adds one, ensuring every template-seeded block it keeps gets touched (clears
`fromTemplate`; two seeded filler blocks are deliberately left untouched on no page — i.e.
all kept blocks are edited, so the placeholder-leak WARN path is exercised in Scenario B
instead, see 1.3).

1. **Home** (`/`) — nav bar (Home · Services · Our Work · Contact, all wired); hero section:
   heading REAL `Outdoor spaces you'll actually use` (full-width-ish, top); text GENERATE —
   description `Two friendly sentences introducing a local landscaping company that designs
   and builds patios and full backyards`, lengthHint `~2 sentences`; button `Get a free
   quote` → Contact; image slot with **uploaded** `fixture-patio.jpg`, fit cover, description
   `Finished flagstone patio with a fire pit`. Second section: heading REAL `Why folks pick
   us`; text REAL with a **deliberate typo, preserved verbatim by rule**:
   `We beleive every yard deserves a plan, not just a crew with shovels. Fixed quotes, tidy
   sites, and we answer the phone.`; button `Leave us a Google review` →
   external `https://g.page/cedar-stone-example`.
   **Pen annotation** (role `annotation`): the word `BIG!` hand-written as 4 strokes beside
   the hero heading + an arrow stroke pointing at it (deterministic point arrays in the
   scenario file). This deliberately stress-tests 1× PNG handwriting legibility — the known
   revisit trigger (decisions.md 2026-07-28 export rulings).
2. **Services** (`/services`) — nav (identical); heading REAL `What we do`; three text blocks
   REAL (`Patios & walkways…`, `Retaining walls…`, `Seasonal maintenance…` — 1–2 sentences
   each, exact strings in the scenario file); one text GENERATE — description `A short
   reassuring paragraph about how our quoting process works, from site visit to fixed
   quote`, **no lengthHint** (exercises the frame-size length-estimate fallback); image slot
   with uploaded `fixture-wall.jpg`, description `Crew building a stone retaining wall`.
3. **Our Work** (`/our-work`) — nav (identical); heading REAL `Recent projects`; image slot
   with uploaded `fixture-garden.jpg`, fit contain (exercises the non-default fit),
   description `Perennial garden bed we planted last June`; **empty image slot** (no upload),
   description `Drone shot of a full backyard makeover — we don't have this photo yet`,
   with a **pen imageSketch inside it**: a simple house-outline + two tree-lobes + a
   winding-path polyline (deterministic point arrays; ≥60% of stroke bbox inside the slot so
   export computes `role: "imageSketch"` per §4.5); heading GENERATE — description
   `A one-line invitation to browse our project photos`.
4. **Contact** (`/contact`) — nav (identical); heading REAL `Let's talk about your yard`;
   text REAL `hello@cedarstonelandscaping.ca\n519-555-0142\nMon–Sat 7am–6pm` (newlines
   preserved); button `Get a free quote` → Contact-page… no — this one is the deliberate
   **unlinked** control: button `Instagram` with link left as None (exercises the brief's
   unlinked-flag path and the builder's obvious-target judgment).

Coverage checklist this scenario hits: all six block types · both copy modes (3 GENERATE,
7+ REAL) · lengthHint present and absent · 3 uploaded images + 1 empty-with-description
slot · both fits · both pen roles · internal, external, and none links · identical navs
(shared-nav path) · template start with fromTemplate clearing · a verbatim-typo trap.

**Fixture images** — `scripts/roundtrip/fixtures/fixture-{patio,wall,garden}.jpg`, each
1600×1200 JPEG, generated once by `scripts/roundtrip/fixtures/make-fixtures.mjs` (sharp;
seeded — regeneration is byte-identical) and **committed**. Each is a distinct
dominant-color composition (terracotta / grey-green / leaf-green) with large baked-in label
text (`PATIO FIXTURE` etc.) plus simple shapes. They don't need to be beautiful; they need
to be (a) byte-stable, (b) visually distinct enough for perceptual-hash matching in SEG-6,
(c) obviously identifiable in human review of evidence.

### 1.3 Scenario B (secondary, gating on preview; doubles as the smoke scenario): blank-start — "North Star Dog Grooming"

Blank start (coach overlay dismissed, zero seeded blocks — decisions.md template
guardrails). 3 pages (Home / Pricing / Contact), everything hand-placed: one nav bar built
from scratch on each page (identical items — still exercises shared-nav detection, but this
time client-built), 1 uploaded image (`fixture-dog.jpg`, same generator), 1 empty slot with
description, 1 GENERATE text block, 1 REAL heading + 2 REAL text blocks, 1 annotation
stroke (circle around the phone number), buttons wired Home→Pricing and Pricing→Contact.
Settings: businessName `North Star Dog Grooming`, vibe `playful`, one color `#3B6FB5`,
tagline skipped (exercises null-optional fallbacks in the brief). Additionally, Scenario B
leaves **no** deliberate typo and no external link — it is the minimal-path control.

Recommendation (adopted): **run both.** A is the primary ship gate (template path = the
realistic client path + the riskiest export machinery). B proves the blank path and, being
small, is reused verbatim as the smoke round-trip (§9).

### 1.4 The client driver — `e2e/roundtrip/client.spec.ts`

Playwright (Chromium, the client-default engine; the tri-engine sweep already lives in the
Stage 2/3 E2E suites — the round trip doesn't re-prove browser compat). Viewport
1440×900, `deviceScaleFactor: 1`, **retries: 0** (a flaky client run is a real UX-bug
signal, not noise to retry away), `trace: 'on'`, `video: 'on'`.

Driver rules:

1. **UI-only.** Every action is a user-visible affordance: template picker click, palette
   insert, drag with `page.mouse` (positions from the scenario file, all multiples of the
   8px grid), inline text edit via the block's textarea, mode toggle clicks, the links-to
   picker, `setInputFiles` on the image slot's real `<input type="file">` (that IS the
   client path for upload), pen-tool toggle + `mouse.move` polylines for strokes, settings
   panel form fill, submit form fill, Submit click. **Never** `page.evaluate` into app
   state; the production bundle has no seam to reach anyway.
2. **Placement tolerance.** Drag targets are scenario frames; after each placement the
   driver asserts the block's rendered bounding box is within **±24px** of target (drag +
   snap jitter). The manifest diff (SEG-2) uses the same tolerance. We deliberately do NOT
   add any test-only precision affordance to the app — region-accuracy is what a real
   client achieves, and the whole premise is that region-accuracy is enough to build from.
   (If the app grows arrow-key nudge as a real client feature, the driver may use it and
   the tolerance tightens to ±8.)
3. **Every step screenshots** into `client/steps/NN-<step>.png` (cheap, and turns any
   client-segment failure into an instantly triageable filmstrip).
4. **Honeypot discipline:** the driver fills only fields visible to a human (the spam
   honeypot must remain untouched — touching it would legitimately block the submission).
5. **Downloads.** On Submit, capture via `page.waitForEvent('download')` →
   `download.saveAs(runDir/package.zip)`. Before submitting, the driver also uses the
   design-file feature to download `design.blueprint` (this is a real UI feature —
   feature-design-file.md — and it enables the cheap re-export loop in §8). Assert the
   two-step completion UX rendered ("Downloaded ✓ → Email it to us") and that the mailto
   link exists — but never activate mailto (no OS mail client in CI).
6. The notification relay is **out of scope** of the gating run (it's wired LAST per Cam,
   and delivery already has its own Stage 3 E2E). An optional `--check-relay` segment can
   later poll a test inbox; OFF by default.

Runtime target for SEG-1: ≤ 8 minutes per scenario.

---

## 2. Package handoff and the SEG-2 gate (hard gate H1)

`scripts/roundtrip/gate.mjs`, pure Node, no LLM. Steps, all must pass:

1. **Zip naming + layout.** Filename matches
   `blueprint_<slug>_<uuid8>.zip` with the expected business slug. Extract (adm-zip).
   Entry list must EXACTLY equal export-format §1: `site.json`, `brief.md`, one
   `pages/NN-<slug>.png` per page, expected `assets/img_NNN.<ext>` files, nothing else.
2. **Schema.** `site.json` validates against `src/export/schema/site.v1.schema.json` via
   ajv (draft-07). The harness imports the schema file from the app source — one schema,
   no copy.
3. **Validator replay.** Run the app's own shared validator module (export-format §5: "the
   same validator module runs in three places") against the extracted package: referential
   integrity, z-sort, asset bijection, PNG decode + exact `1200 × page.height` dims +
   non-blank variance, brief cross-checks (V7: `WRITE THIS COPY` count == generate-block
   count, `SOURCE AN IMAGE` count == empty-slot count, every page slug heading present).
4. **Expected-manifest diff** — the sketch-fidelity check that proves the UI recorded what
   the client did. Diff `site.json` against the scenario file, ignoring minted ids,
   timestamps, and exact stroke geometry:
   - page count, names, slugs, order (homepage first) — exact
   - per page: block multiset by type — exact; per block: copyMode, text (verbatim,
     including the typo), generateDescription, lengthHint, label, link target (resolved to
     page name / URL / none), assetId presence, fit, description — exact
   - frames — within ±24px per edge of scenario intent
   - pen strokes: count per page — exact; per stroke: `role` and `targetBlockId`
     resolution as intended (the imageSketch MUST have computed `role: "imageSketch"`
     targeting the right slot — this checks §4.5's 60% rule against a real drawn stroke)
   - assets: count, mimeTypes, first-use numbering order, dims ≤ 1600 long edge
   - `siteSettings` fields verbatim; `submission.client` matches the form input;
     `fromTemplate` leakage: no untouched-filler flags on blocks the scenario edited
5. Emit `gate/manifest-diff.json` + human summary. **Any mismatch fails H1** and the run
   stops before spending builder tokens.

---

## 3. The builder session (SEG-3)

### 3.1 Sterile sandbox

```
<runDir>/builder/sandbox/
├── package/          ← the extracted zip, read-only intent (site.json, brief.md, pages/, assets/)
└── (builder creates site/, BUILD_NOTES.md here)
```

Isolation mechanics (Windows):

- `CLAUDE_CONFIG_DIR` → `<runDir>/builder/claude-home/` — a bare, harness-generated config
  dir. No user `~/.claude/CLAUDE.md`, no rules files, no MCP servers, no memory, no
  project CLAUDE.md anywhere above the sandbox (the sandbox lives under `roundtrip-runs/`,
  outside the repo tree, so no ancestor CLAUDE.md can leak — **verify this in the harness**:
  assert no `CLAUDE.md` exists in any ancestor of the sandbox).
- `claude-home/settings.json` grants the scoped allowlist (this is how we avoid the
  banned skip-permissions flag):

  ```json
  {
    "permissions": {
      "allow": [
        "Read", "Glob", "Grep", "Write", "Edit",
        "Bash(mkdir *)", "Bash(dir *)", "Bash(ls *)", "Bash(copy *)", "Bash(cp *)",
        "Bash(node *)", "Bash(npx serve*)", "Bash(npx http-server*)"
      ],
      "deny": ["WebFetch", "WebSearch", "Bash(curl *)", "Bash(git *)", "Bash(npm install*)"]
    }
  }
  ```

  Network is denied: the build must be hermetic (deterministic, no context leak via
  fetched pages). Consequence: empty-slot placeholders are locally generated (inline SVG /
  CSS), which satisfies the brief's "fitting, clearly-swappable placeholder". Recorded as
  open question #2 (§10) — recommendation is to keep deny.
- Invocation (PowerShell, from `run.mjs` via child process):

  ```
  claude -p (Get-Content prompt.txt -Raw) `
    --output-format stream-json --verbose `
    --max-turns 250 `
    --model <strongest-available-alias>   # gating runs: the model class Cam actually builds with
  ```

  stdout → `builder/transcript.jsonl`. Timeout 45 min (segment fails as INFRA on breach).
  Per performance.md, no version-pinned model ids in the harness — model aliases come from
  `run.mjs` config and the resolved id is recorded in `run-manifest.json`.

### 3.2 The prompt — exact wording (verbatim, `builder/prompt.txt`)

```
A client has delivered a package for you in ./package/ — it contains its own
instructions. Read ./package/brief.md and carry out what it says. Create your build
output in ./site/ inside the current directory. Work until you are finished, then print
exactly BUILD COMPLETE as your final line.
```

Wording rules (binding on the harness):

- **Nothing about the business, the tool, BOSS, sketches, PNGs, copy modes, or "don't ask
  questions" may appear in the prompt.** The brief must carry all of that — if the builder
  needs domain framing from the prompt, that is a brief defect the test exists to catch.
  In particular the no-questions instruction lives ONLY in brief.md; the harness prompt
  staying silent on it is what makes the zero-questions gate measure the package, not the
  harness.
- The only harness-owned content is plumbing: where the package is, where output goes, the
  completion sentinel. These are facts the messenger (Cam) would say when handing over a
  zip; they leak nothing.
- The prompt file is committed and versioned; changing it requires a decisions.md entry
  (it is part of the measured contract).

### 3.3 What "output" must be

Per the brief's own Definition of Done: a static multi-page site in `./site/`, one page
per slug, homepage at `index.html`, runnable by opening `index.html` or a single stated
command, `BUILD_NOTES.md` at the build root. SEG-5 serves `site/` with a plain static
server (`npx http-server -p 4173 ./site`); if BUILD_NOTES declares a different run
command, SEG-5 honors it only if it is on a tiny allowlist (`npx http-server` / `npx
serve` / plain files); anything needing installs or builds fails H3 as "not
static-friendly" (the brief said dependency-light — this is a brief-compliance failure,
classified builder-judgment).

---

## 4. Zero-clarifying-questions detection (SEG-4, hard gate H2)

`scripts/roundtrip/scan-transcript.mjs` over `transcript.jsonl`:

1. **Tool-level:** any `AskUserQuestion` (or equivalent user-input tool) tool_use event
   anywhere → FAIL H2. In `-p` print mode the session cannot actually receive an answer,
   which makes any attempt to ask unambiguous.
2. **Final-message scan** (the only place a `-p` session can address the user): take the
   final assistant text. Strip fenced code blocks, inline code, and «…»/"…" quoted spans
   (client copy may legitimately contain `?`). Then FAIL H2 if any remaining sentence:
   - ends in `?` AND contains a second-person interrogative lead
     (`\b(do|would|could|can|should|shall|which|what|where|who|how)\b.*\byou(r)?\b`), or
   - matches the phrase list: `let me know`, `please (clarify|confirm|provide|specify)`,
     `need (more|additional) (info|information|details)`, `before i (proceed|continue)`,
     `awaiting (your|further)`, `unable to proceed without`, `which (option|one) (do you|would you)`.
3. **Completion cross-check:** `BUILD COMPLETE` sentinel present as the final line AND
   `site/index.html` exists AND `BUILD_NOTES.md` exists (H8). A session that stopped
   without the sentinel is scanned rule-2 first (it probably stalled on a question); if no
   question matched, it fails as INCOMPLETE BUILD (H3), which routes differently (§7).
4. **False-positive discipline:** every rule-2 hit is auto-FAIL for the gating verdict —
   no waving runs through by hand. If triage decides a hit was rhetorical, the fix is a
   committed change to the scan rules (with the sentence added to a regression corpus in
   `scan-corpus.json`), then a rerun. The scan rules are code; their history is auditable.
5. **BUILD_NOTES triage (signal, not gate):** parse `BUILD_NOTES.md` entries. Entries
   matching `missing|contradict|couldn'?t find|not provided|no .* (given|specified)|broken|
   invalid` are flagged **package-defect candidates** — they don't fail H2 (the builder
   judged instead of asking, which is the designed behavior) but each one enters §7 triage
   as a potential format defect. More than **6 judgment-call entries per 4-page site**
   (scaled: 1.5 × page count) raises a `FRICTION` warning in the report: the brief is
   making the builder guess too much, even if it passes.

---

## 5. Built-site capture (SEG-5)

`scripts/roundtrip/capture.mjs` + Playwright:

1. Serve `site/` at `http://127.0.0.1:4173`.
2. **Crawl:** start at `/`, resolve every `<a>`/button navigation, build the actual nav
   graph `crawl.json` (from → label → to). Assert every page reachable.
3. **Console:** collect console messages + failed requests per page → `console.json`.
   Any `error`-severity console entry or 404'd local resource fails H3.
4. **Screenshots:** for each site.json page, navigate to its slug, viewport
   **1200×900, deviceScaleFactor 1** (matching the 1200px design width so sketch and shot
   are comparable), `prefers-reduced-motion: reduce`, wait for fonts + network idle +
   250ms settle, then full-page screenshot → `shots/<slug>.png`.
5. Extract per-page structured text: reading-order list of visible headings, paragraphs,
   buttons/links (text + bounding box), and images (resolved src bytes + rendered box) →
   `shots/<slug>.dom.json`. This is the input for deterministic order/placement checks.

---

## 6. Evaluation (SEG-6) — rubric, procedure, PASS/FAIL

Two layers, merged by `scripts/roundtrip/report.mjs`:

- **`evaluate.mjs` — deterministic layer.** Everything checkable by code is checked by
  code. LLM judgment is reserved for the four genuinely perceptual questions.
- **Evaluator agent — judgment layer.** A separate fresh `claude -p` session (same
  isolation mechanics as the builder; different sandbox) whose inputs are: `site.json`,
  the scenario file, `package/pages/*.png` (sketches), `shots/*.png` (built pages),
  `BUILD_NOTES.md`, and `rubric.md` with a strict output contract. It never sees the
  builder transcript (no anchoring on the builder's self-report). It outputs
  `judgments.json` (schema-validated; one malformed output → single retry → then the run
  fails as INFRA, not as product FAIL). For each judged item it must cite evidence
  ("in shots/our-work.png the empty-slot placeholder shows a house-and-path graphic
  consistent with the sketch") — uncited scores are rejected by the report merger.

### 6.1 Hard gates (all must pass; any failure = FAIL regardless of score)

| Gate | Check | Layer |
|---|---|---|
| H1 | SEG-2 package gate (layout, schema, V1–V12 replay, manifest diff) | det |
| H2 | Zero clarifying questions (§4 rules 1–2) | det |
| H3 | Build completes: sentinel + `site/index.html` + serves with zero console errors / no broken local resources + static-friendly run path | det |
| H4 | Page inventory: exactly one route per site.json slug; `pages[0]` slug is the homepage/index; no extra top-level pages | det |
| H5 | Nav graph: every wired link (buttons + nav items) navigates to its exact target (internal → right page, external → right href); shared nav present on every page when the brief declared identical navs | det (crawl.json vs site.json) |
| H6 | Real copy verbatim: 100% of `copyMode:"real"` strings present on their page, whitespace-normalized but character-exact otherwise — **the Scenario A typo must survive** | det |
| H7 | Uploaded assets: every `assets/` image appears on its correct page — matched by dHash (hamming ≤ 10) against rendered `<img>`/background bytes (byte-compare short-circuits) | det |
| H8 | `BUILD_NOTES.md` exists at the build root | det |

### 6.2 Soft score (100 points; PASS additionally requires total ≥ 85 and every floor met)

| Dim | What | How | Pts | Floor |
|---|---|---|---|---|
| S1 | Per-page block order/arrangement | For each page: expected reading order from site.json (§4.4 grouping: sort groups by top edge, blocks by y-then-x) vs built reading order from `dom.json`; align by LCS over (type, text-prefix) tokens; page score = matched/expected. Pts = 25 × mean | 25 | mean ≥ 0.85, no page < 0.75 |
| S2 | Visual layout similarity | Evaluator, per page, sketch PNG vs shot PNG side by side: 0 = doesn't resemble the sketch; 1 = same content, notably different arrangement (hero split flipped, section order changed); 2 = same arrangement and rough proportions. Structured sub-checks required in rationale: top-to-bottom order? left/right splits? hero prominence? Pts = 20 × mean/2 | 20 | no page = 0 |
| S3 | GENERATE copy quality | Det sanity per item: non-empty; not lorem ipsum; no `[`/`TODO`/`placeholder`; not a verbatim echo of generateDescription; length within lengthHint or 0.3–3× the frame estimate. Evaluator per item: 0 = off-topic/generic filler; 1 = on-topic; 2 = on-topic, on-vibe, uses business specifics. Pts = 15 × mean/2 | 15 | all items pass det sanity AND score ≥ 1 |
| S4 | Image placement + empty slots | Det: each matched asset's rendered box center falls in the same page-third (vertical) and same half (horizontal) as its sketch frame; empty slots: an `<img>`/`<svg>` placeholder exists in-region with alt text derived from the description. Pts = 15 × fraction | 15 | ≥ 0.8 |
| S5 | Style / vibe | Det: if client gave colors, ≥ 1 of them appears among the 8 dominant colors of any shot (ΔE00 < 12); site is not unstyled default (≥ 2 non-grayscale dominant colors, custom fonts or spacing present). Evaluator: 0–2 "does this read as ‹vibe› for this business?" Pts = 7 det + 8 × eval/2 | 15 | det color check passes when colors were given |
| S6 | Pen intent | Evaluator per brief-listed pen cluster: annotation — did the build honor the intent (e.g. `BIG!` → hero heading visually dominant) AND does BUILD_NOTES record a reading? imageSketch — does the empty-slot placeholder/graphic relate to the sketched subject? 0–2 each. Pts = 10 × mean/2 | 10 | imageSketch placeholder must not contradict the sketch subject |

**Verdict:** `PASS` = all H gates ∧ total ≥ 85 ∧ all floors. `NEAR MISS` (reported as FAIL,
score 70–84 or a single floor miss): targeted fixes, rerun. `FAIL` (< 70 or any H gate):
structural problem, full §7 triage. `report.md` renders the score table, every miss with
its evidence link, side-by-side sketch/shot thumbnails per page, and the routing table
(§7) pre-filled for every miss. `verdict.txt` gets the one-liner.

### 6.3 Mismatch taxonomy (what counts against what)

The classification question, asked per miss: **"Could a competent developer, given ONLY
this package, have gotten this right?"**

- **No → format defect.** The package failed to carry the information. Examples: a page
  missing from the brief inventory; nav map listing the wrong target; asset usage line
  pointing at the wrong page; generate item lacking its context line; PNG too illegible
  to read the annotation; empty-slot description absent from walkthrough. → Stage 3 fix.
- **Yes, and site.json/brief carried it → builder deviation.** Examples: reordered
  sections despite correct walkthrough; "fixed" the client's typo (H6); ignored a
  `WRITE THIS COPY` marker; heavy framework despite dependency-light instruction. → fix is
  brief-template wording/emphasis (§3 rules) or, rarely, the harness prompt; if the same
  deviation recurs across two runs with strengthened wording, escalate (§8).
- **Acceptable interpretation — never penalized:** typography, exact colors beyond the
  client's stated ones, spacing polish, responsive/mobile behavior (unscored — sketches
  are desktop; only 1200px is evaluated), heading-level choices, section background when
  `null`, placeholder aesthetic, inert-vs-guessed target for `none` links **when**
  BUILD_NOTES records the call, copy wording beyond the description's asks.

---

## 7. Failure routing

Every miss in `report.md` carries one of these routes. One class per iteration (change one
variable — reasoning.md).

| Failure class (detector) | Likely defect | Fix lands in |
|---|---|---|
| SEG-1 driver can't perform a scenario step | real UX affordance gap | Stage 2 feature (the app), or scenario if it asked for a non-feature |
| H1 zip layout / naming | packaging module | Stage 3 zip packaging |
| H1 schema invalid | export generator vs schema drift | `src/export/` generator or `site.v1.schema.json` (+ decisions entry if contract changes) |
| H1 manifest diff (UI didn't record the action) | store/export mapping bug, or template guardrail leak | Stage 2 store / Stage 3 export mapper |
| H1 PNG sanity or SEG-6 finds sketch unreadable | renderer fidelity | snapdom→html-to-image path; then the 1×→2× render revisit ruling; last resort: deterministic offscreen renderer (debate #1 ladder) |
| H2 question asked — about missing *content* | brief lacks a fallback phrase for that absence | brief.md generator §3 (fallback strings are binding rules) |
| H2 question — about *process* ("where do I put output?") | harness prompt defect | `prompt.txt` (harness, not product; decisions entry) |
| H3 incomplete/broken build | brief DoD unclear, or builder ran out of turns | brief DoD wording; or raise `--max-turns` (infra) — inspect transcript to tell |
| H4/H5 inventory or nav wrong | brief inventory/nav-map generation | brief generator §4.4 nav-map algorithm |
| H6 real copy altered | builder editorializing | strengthen brief DoD item 4 wording |
| H7/S4 image on wrong page/region | asset-manifest usage lines or walkthrough position phrases | brief generator §4.4 / assets section |
| S1/S2 arrangement misses | section grouping / position phrases too vague, or PNG ambiguity | brief §4.4 algorithms; PNG contract |
| S3 generate-copy floor | thin context lines, bad length estimate | brief copy-list generation; if the client description itself was uselessly vague yet passed V5 → strengthen V5 / the description-field coaching (Stage 2 copy-blocks UI) |
| S5 vibe/color miss | look-&-feel section rendering of settings | brief generator |
| S6 pen intent missed | cluster narration or legibility | brief §4.5 narration; legibility → renderer ruling |
| Evaluator malformed / infra timeout | harness | harness only; never counts as product FAIL |

**BUILD_NOTES package-defect candidates (§4.5 triage)** route through the same table even
when all gates passed — a passing run can still emit Stage 3 fix tickets. That is the loop
working as designed.

---

## 8. Loop-until-pass discipline

1. **Fix one class, rerun from the earliest affected segment.** Cached-artifact shortcuts
   during iteration: a brief/schema/export fix does NOT require re-sketching — re-import
   the archived `design.blueprint` through the real UI (import is itself a client feature)
   and resubmit: SEG-1 shrinks to ~1 minute. A builder-prompt or scan-rule fix reruns from
   SEG-3 on the existing package. An evaluator-only fix reruns SEG-6.
2. **The ship verdict never comes from a patchwork.** After the loop goes green, run the
   full clean sequence from scratch — Scenario A on `preview`, Scenario A on `deployed`,
   Scenario B on `preview` — no cached segments, no scan-rule edits mid-run. Those three
   PASS reports are the Stage 4 Verification Log evidence.
3. **Two strikes rule** (reasoning.md): the same failure class failing again after its fix
   → stop iterating, escalate: open a Fable debate if it's a design question (e.g. "1×
   PNGs fundamentally too coarse"), or surface to Cam if it's scope (e.g. "builder needs
   network for placeholders"). Record in decisions.md.
4. **Flake policy:** retries are 0 everywhere. A segment that fails on rerun without any
   code change is a real defect (client UX, renderer nondeterminism, or harness bug) and
   gets triaged, never re-rolled.
5. Every iteration — pass or fail — appends one line to the Stage 4 feature file's
   Verification Log: date, run dir, verdict, score, classes fixed since last run.

---

## 9. Budget and the smoke round-trip

Costs are Claude-token costs on the existing subscription (no new infra — hard-free
constraint intact; fixture images are committed files, hosting is the existing Pages
deploy, harness is Node + Playwright already in the stack).

**Full gating run (per scenario), estimates:**

| Segment | Wall time | LLM cost |
|---|---|---|
| SEG-1 client (fresh sketch) | 4–8 min | $0 (scripted) |
| SEG-2 gate | < 1 min | $0 |
| SEG-3 builder (strongest model; brief ~5k tok + 4 sketch PNGs ~2k tok each + a 4-page static build) | 10–25 min | ≈ $8–20 |
| SEG-4/5 scan + capture | 2–3 min | $0 |
| SEG-6 evaluator (8 images + rubric, strongest model) | 4–8 min | ≈ $2–5 |
| **Total** | **~25–45 min** (cap 60) | **≈ $10–25** |

Ship gate (A-preview + A-deployed + B-preview) ≈ 1.5–2.5 h, ≈ $25–60, run a handful of
times through the loop → expect the whole Stage 4 campaign to land in the low hundreds of
dollars of tokens worst case. Runaway guards: builder `--max-turns 250` + 45-min segment
timeout; orchestrator hard-stops the run at 60 min per segment.

**Smoke round-trip (`npm run roundtrip:smoke`)** — the repeated-use regression form:

- Scenario **B** exactly (already minimal: 3 pages, 1 image, 1 generate, 1 stroke).
- Builder on a **small fast model** (performance.md economics); evaluator agent **skipped**
  entirely — hard gates H1–H8 plus the deterministic halves of S1/S3/S4/S5 only, with the
  same floors. No judgment scores, verdict = SMOKE-PASS/FAIL on gates + floors.
- Cached-sketch mode by default: re-import the committed golden `design.blueprint` for
  Scenario B and resubmit (full UI submit path still exercised); `--fresh-sketch` flag
  forces the full driver when Stage 2 UI code changed.
- Target: **≤ 12 min, ≈ $1–3.**
- **When it runs:** mandatory locally before merging any change touching
  `src/export/**`, the schema, the brief generator, templates, or the PNG renderer;
  on-demand otherwise (not on a nightly cron — token spend without a triggering change
  buys nothing). The full protocol reruns at every `schemaVersion`-relevant change and
  before any re-ship.

---

## 10. Open questions (with recommendations)

1. **Live-deploy leg** — network-flaky for CI. **Rec:** required once for the ship gate
   (the DoD says "real deployed UI"), never for regression; regression uses `vite preview`
   of the production bundle, which is byte-comparable.
2. **Builder network access** (real stock photos for empty slots) — **Rec: deny.**
   Hermetic builds, deterministic reruns, zero context leak; local SVG placeholders
   satisfy the brief's "clearly-swappable placeholder". Revisit only if Cam wants the
   production workflow to fetch stock, in which case add a non-gating variant run.
3. **Scripted vs LLM free-driving client** — **Rec: scripted gates** (repeatability
   mandate); one advisory "chaos client" agent run pre-ship for UX discovery.
4. **Builder model** — **Rec: strongest available for gating** (it must match what Cam
   will actually feed packages to), small fast model for smoke. Aliases only, resolved ids
   recorded per run.
5. **Handwriting legibility at 1×** — Scenario A's `BIG!` annotation intentionally probes
   the known revisit trigger. **Rec:** keep it; if S6/legibility fails twice, that IS the
   evidence the 2× ruling revisit needs — escalate per §8.3 rather than softening the
   scenario.
6. **Placement precision** — no test-only placement affordance. **Rec:** ±24px region
   tolerance end-to-end; tighten to ±8 only if the app grows arrow-key nudge as a real
   client feature.

---

## Appendix A — scenario file shape (consumed by driver, gate, evaluator)

```jsonc
{
  "id": "A",
  "start": { "mode": "template", "template": "trades" },   // or { "mode": "blank" }
  "settings": { "businessName": "…", "tagline": "…", "about": "…",
                "vibe": "modern", "styleNotes": "…", "colors": ["#2F5233", "#D9C7A7"] },
  "submit": { "name": "Riley Hodgson", "email": "riley@cedarstonelandscaping.ca" },
  "pages": [
    { "name": "Home", "slug": "home",
      "blocks": [
        { "ref": "hero-heading", "type": "heading", "copyMode": "real",
          "text": "Outdoor spaces you'll actually use", "frame": [80, 152, 720, 96] },
        { "ref": "hero-intro", "type": "text", "copyMode": "generate",
          "generateDescription": "Two friendly sentences introducing …",
          "lengthHint": "~2 sentences", "frame": [80, 272, 560, 112] },
        { "ref": "hero-cta", "type": "button", "label": "Get a free quote",
          "link": { "kind": "page", "page": "Contact" }, "frame": [80, 416, 216, 56] },
        { "ref": "hero-img", "type": "imageSlot", "upload": "fixture-patio.jpg",
          "fit": "cover", "description": "Finished flagstone patio with a fire pit",
          "frame": [760, 144, 360, 400] }
        // …
      ],
      "pen": [
        { "ref": "big-note", "role": "annotation", "target": "hero-heading",
          "color": "#D94F30", "width": 4,
          "strokes": [ [[832,120],[832,196],[878,138],[832,158],[884,196]] /* B */,
                       [[904,124],[904,196]] /* I */, /* G, ! */ ] }
      ] }
    // Services, Our Work, Contact …
  ]
}
```

`ref` is the harness-side handle (drives the diff and evaluator narration); it never
appears in the product. Every string that must survive verbatim lives here once.

## Appendix B — evaluator output contract (`judgments.json`)

```jsonc
{
  "scenario": "A",
  "items": [
    { "id": "S2:home", "score": 2,
      "evidence": "shots/home.png vs pages/01-home.png: nav/hero/two-section order matches; text-left image-right split preserved",
      "confidence": "high" },
    { "id": "S3:hero-intro", "score": 2, "evidence": "…" },
    { "id": "S6:big-note", "score": 1,
      "evidence": "hero heading is largest element (intent honored) but BUILD_NOTES has no reading recorded" }
  ]
}
```

Schema-validated; every item id must come from the rubric manifest the harness generated;
uncited or out-of-range scores reject the file (one retry, then INFRA fail).

---
_End of protocol. On adoption this becomes
`staging/stage-4-roundtrip-launch/feature-roundtrip.md`'s spec (or `docs/roundtrip-protocol.md`
with the feature file pointing at it), and the harness lands under `scripts/roundtrip/` +
`e2e/roundtrip/` with the scenario/fixture files committed._
