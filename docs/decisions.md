# Decision Log — BOSS Blueprint

Append-only. One entry per significant choice. Future sessions append; never rewrite history.

## 2026-07-27 — Platform: desktop-first web app
**Chose:** browser SPA, desktop-first · **Because:** sketching page layouts needs canvas space
and pointer precision; zero install friction for clients; free hosting · **Rejected:** Expo
mobile app (cramped canvas, store friction), responsive+PWA (small-screen canvas work not worth
it for v1) · **Revisit if:** clients demonstrably try to use it on phones.

## 2026-07-27 — Access: public with gated submit
**Chose:** anyone can sketch via public link; submitting requires name+email · **Because:**
zero-friction trial + every submission is a captured lead for BOSS · **Rejected:** invite-only
(no lead-gen value), fully open (anonymous spam) · **Revisit if:** spam volume or relay caps hurt.

## 2026-07-27 — Delivery: email-only, no backend
**Chose:** package emailed to Cam via client-side relay; no server, no DB · **Because:** Cam's
explicit pick — zero maintenance beats convenience · **Rejected:** Supabase backend+inbox
(recommended, but adds infra), private-GitHub-drop (needs token proxy = backend anyway) ·
**Revisit if:** attachment limits prove unworkable in Stage 3 or volume outgrows an inbox.

## 2026-07-27 — Canvas model: hybrid blocks + pen layer
**Chose:** structured, snappable block elements PLUS a freehand pen layer per page ·
**Because:** blocks give the export clean machine-readable structure; pen preserves hand-drawn
intent (annotations, image sketches) — matches Cam's "PowerPoint/Paint" framing · **Rejected:**
blocks-only (loses sketching), paint-only (export would be unstructured pixels) · **Revisit if:** never — this is the product.

## 2026-07-27 — Pages: multi-page with navigation map
**Chose:** clients add pages and wire buttons/nav items to them · **Because:** real client sites
are 3–5 pages; the brief must carry link structure to be buildable · **Rejected:** single-page v1
(incomplete briefs), multi-page without linking (lossier) · **Revisit if:** n/a.

## 2026-07-27 — Copy: described placeholders, no live AI
**Chose:** "generate later" copy blocks carrying a client-written description; Claude writes the
copy at build time · **Because:** zero API cost/keys in a public no-backend app; copy written
with full-site context is better anyway · **Rejected:** live Claude API in-app (needs proxy,
costs, worse copy), real-copy-only (blank-page paralysis) · **Revisit if:** a backend ever exists.

## 2026-07-27 — Name & home: BOSS Blueprint, Frankyface/BOSS-Blueprint (public), GitHub Pages
**Chose:** name "BOSS Blueprint"; own public repo; GitHub Pages at
frankyface.github.io/BOSS-Blueprint, custom subdomain sketch.bossolutions.pro later (help.md) ·
**Because:** blueprint = a sketch that becomes a building; public repo unlocks free Pages;
separate repo keeps app tooling out of the static BOSS-website repo · **Rejected:** shipping
inside BOSS-website, Vercel hosting, names "BOSS Sketch"/"Draft by BOSS" · **Revisit if:** n/a.

## 2026-07-27 — Onboarding: starter templates + blank
**Chose:** template picker (Restaurant, Trades/Services, Portfolio, Shop) + blank option ·
**Because:** non-technical users freeze on empty canvases; templates teach blocks by example ·
**Rejected:** blank+tour only (paralysis), wizard-first (a second product's worth of logic — v2)
· **Revisit if:** templates go unused in practice.

## 2026-07-27 — Verification convention: fully automated, no human gate
**Chose:** every feature = unit tests + Playwright E2E, evidence recorded in Verification Logs;
stages close on green without Cam's manual pass · **Because:** Cam's explicit pick — agents
prove everything · **Rejected:** Cam-gated stages (recommended), demo-heavy · **Revisit if:**
an automated-green feature turns out broken in real use.

## 2026-07-27 — v1 definition of done: the round-trip test
**Chose:** v1 ships when an agent-as-client sketches a full fake business site, submits, and a
fresh Claude Code session given only the emailed package builds a visibly matching site with
zero clarifying questions · **Because:** proves the entire value chain including the export
format — which is the product's whole bet · **Rejected:** "email arrives" bar (defers the real
test), real-client pilot (couples to sales timing) · **Revisit if:** n/a.

## 2026-07-27 — Constraints: hard-free, no deadline
**Chose:** free tiers only (Pages, relay), ship when round-trip passes · **Because:** Cam's
standing pattern across all projects · **Rejected:** paid tiers, date-driven roadmap ·
**Revisit if:** a free tier blocks a core capability.

## 2026-07-27 — Process: Fable debates decide open questions; Opus implements and reviews
**Chose:** open design questions get two Fable agents arguing opposing positions, main session
judges and records the verdict here; implementation is done by Opus agents and reviewed by
separate Opus agents against pre-written success criteria · **Because:** Cam's kickoff
instruction · **Rejected:** n/a (process mandate) · **Revisit if:** Cam changes the process.

## 2026-07-27 — Stack baseline: React + Vite + TypeScript, Zustand, Vitest + Playwright
**Chose:** the boring modern SPA stack with immutable Zustand state · **Because:** best tooling
for a stateful canvas app + automated E2E; immutability makes undo/redo cheap · **Rejected:**
vanilla JS (test/refactor pain at this app's complexity), Redux (overkill) · **Revisit if:**
the canvas-engine verdict (debate #1) forces a different frame.

## 2026-07-27 — Canvas engine: hand-rolled DOM/SVG (Fable debate #1 verdict)
**Chose:** blocks as absolutely-positioned React DOM elements in a scaled 1200px page container;
pen layer as perfect-freehand strokes rendered to an SVG overlay (pure DOM, no canvas element);
drag/resize/snap as pure unit-tested functions; PNG export via snapdom (primary) with
html-to-image as API-comparable fallback behind one export interface · **Because:** the product's
objects ARE html things and its most-used interaction is typing (native text editing, real web
typography — which is also what the built site will have); real DOM = first-class Playwright
selectors for a fully-automated-verification project; no second reconciler (react-konva has a
verified StrictMode/version-coupling breakage history); all deps MIT · **Rejected:** react-konva
+ Konva (strongest counter: editor==exporter via stage.toDataURL — outweighed by text fidelity +
testability; canvas text diverges from real browser typography), tldraw (proprietary license,
commercial use paid + watermark — disqualified), Excalidraw (MIT but freeform whiteboard, ~2.3MB
bundle, wrong data model) · **Debate-mandated mitigations for the export subsystem (binding):**
client-side PNG sanity validation (decode + dimensions + non-blank pixel variance) with retry and
engine fallback at export time; day-one CI visual-regression on exported page PNGs across
Chromium/Firefox/WebKit; constrained block style vocabulary (system/self-hosted fonts, simple
backgrounds, same-origin data-URI images); window-exposed store seam in test builds; textarea-based
inline editing (NOT contentEditable — its native undo stack fights Zustand history); rasterize-pen
escape hatch if stroke count ever janks; last-resort deterministic offscreen-canvas renderer of
site.json if DOM capture proves unreliable in practice · **Revisit if:** export-PNG defects
survive the mitigations in real browser testing.

## 2026-07-27 — Delivery: download-first hybrid (Fable debate #2 verdict)
**Chose:** on submit the zip is ALWAYS produced as a local Blob download (cannot fail, fully
machine-verifiable); a kilobyte-scale notification (client name/email, submission UUID, page
count, brief.md, gzipped site.json with degrade ladder full → compressed → metadata-only) goes to
Cam via a text-only relay behind a swappable DeliveryRelay port (dual free providers; text-only
free tiers all suffice); client forwards the zip via prefilled mailto + copyable-address fallback;
two-step completion UX ("1. Downloaded ✓ → 2. Email it to us") · **Because:** the only
free-with-attachments relay (FormSubmit.co) has field-reported SILENT attachment loss (200 OK,
file never arrives), Spamhaus/DNS-blocklist incidents on the domain, and no canary can reliably
watch its file path — silent loss at the product's decisive moment is disqualifying; both debaters
verified EmailJS/Web3Forms/Formspree free tiers exclude attachments entirely · **Rejected:**
FormSubmit direct attachment (its real strengths — no key to leak, no quota to drain — noted for
possible opportunistic re-add later), paid relay tiers (violates hard-free), cloud-storage links
(credential in public repo), Apps Script (backend by another name) · **Adopted from the losing
side (binding):** deterministic compression ladder on the zip, submission-UUID stamping in both
artifacts, DeliveryRelay port isolation, always-visible download receipt · **Sequencing:** per
Cam, relay integration is wired LAST — until then submit = download + prefilled mailto, which is
fully functional · **Revisit if:** zip-forward abandonment proves high in practice → consider
opportunistic FormSubmit attachment attempt as a bonus channel on top (never as the primary).

## 2026-07-28 — Template guardrails (ruled on template designer's flags)
**Chose:** (1) every template-seeded block carries `fromTemplate: true`, cleared on first client
edit — brief.md flags untouched filler and submit warns (placeholder-leak guard); template
`siteSettings.businessName` ships EMPTY; (2) v1 block-type gaps are deliberate — no form, map,
footer, or repeating-list blocks; templates coach clients to DESCRIBE forms/maps in text blocks;
(3) Blank start = zero blocks + dismissible coach overlay, never pre-seeded blocks; (4) page
names are free-form (Portfolio template's landing page is "Work" at `/`) · **Because:** a client
who only edits the menu must not submit "Martina's Trattoria" as their business; nothing should
appear in an export the client didn't choose · **Rejected:** seeding Blank with a starter nav
(unchosen content in export), footer bands in templates (editability budget) · **Revisit if:**
submissions repeatedly describe contact forms in text → promote a form block in v2.

## 2026-07-28 — Export format rulings (on the Fable designer's open questions)
**Chose:** `submission` block (UUID, timestamps, contact, appVersion) is a TOP-LEVEL sibling of
`siteSettings`; `section.background` stays as optional/nullable schema headroom; page PNGs
render at 1× (1200 × height) — revisit 2× only if pen handwriting proves illegible in real
render tests; the schema's `vibe` enum is the source of truth for the Stage 2 pick-list; nav
items cap at 7 in UI while the schema allows 10 · **Because:** transaction facts ≠ website
facts; deterministic dims + email-forward size budget favor 1×; enum drift between schema and
UI would break validation · **Rejected:** folding submission into siteSettings, 2×-by-default
renders · **Revisit if:** first real pen-stroke render tests show illegible handwriting at 1×.

## 2026-07-28 — Export format v2 adopted (docs/export-format.md)
**Chose:** the Fable-designed package spec, hardened by an adversarial dry-run (an agent played
the zero-context builder against the spec's own worked example; 23 defects found and fixed —
row/column narration, honest PNG-carries table, responsive boilerplate, alt-text separation,
invention scope rules, client-text escaping, §4.8 ordinal id remapping with V24 leak-block,
byte-exact `generateBrief` CI requirement; 173 self-check assertions green) · **Because:** the
round-trip test is v1's bar and the spec is the product's core contract — it got the
debate-grade treatment before implementation exists · **Rejected (arbitrated):** reclassifying
filled-slot pen strokes as annotations (they are instructions about the image), an invalid
fixture state contradicting V14, 1.5× stroke-page renders (breaks the 1× dims contract; the
harness's legibility probe is the empirical test) · **Revisit if:** the Stage 4 round-trip
fails on a defect class the dry-run missed.

## 2026-07-28 — Round-trip harness protocol adopted (docs/roundtrip-protocol.md)
**Chose:** the Fable-designed protocol: one declarative scenario.json driving fake client, gate
and evaluator; two gating scenarios (template-start + blank-start/smoke); sandboxed zero-context
builder with mechanical no-questions detection; 8 hard gates + 100-pt rubric with floors;
per-failure-class routing; smoke run MANDATORY before merging any export/schema/brief/renderer
change once Stage 3 lands. All six designer recommendations adopted (deployed-leg ship-gate-only,
builder network denied, scripted client gates, strongest-model builder, keep the 1× legibility
probe, ±24px tolerance) · **Because:** v1's definition of done needs to be executable and
repeatable, not aspirational · **Revisit if:** two consecutive fix loops fail the same class
(protocol's own escalation: Fable debate).

## 2026-07-28 — Export format v2.1 amendment
**Chose:** five rulings applied after the Stage-3 spec pass found contract defects: (R1) the
brief generator emits UNWRAPPED logical lines — Appendix A's byte-exact test B was MEASURABLY
unsatisfiable against the hand-wrapped fixture (line 1454 forced wrap ≥88, line 1497 forced ≤86);
§7.2 regenerated mechanically with a whitespace-normalized equality proof (zero non-whitespace
change); (R2) V7 markers re-anchored on generator-emitted frame tuples (old anchor matched 0
times in the spec's own example); (R3) V25 WARN — blocks past x=1200 clip in the PNG, true
geometry stays in site.json, [N13] brief marker; (R4) V26 client-facing BLOCK for blank button
label / empty nav bar; (R5) page-height floor is 800 everywhere. Minors: derived-forms set for
«…» tracing, `business` slug fallback, `*` escaped. 189 self-check assertions green ·
**Because:** three independent adversarial passes (dry-run builder, fixture builder, spec author)
each found defect classes the others missed — cheap now, expensive after Stage 3 implements ·
**Rejected:** whitespace-normalizing the CI comparison instead of fixing the fixture (that is
the forbidden weaken-the-criterion move) · **Revisit if:** the round-trip test hits a defect
class all three passes missed.

## 2026-07-28 — File-size ceiling clarified: source <400, test/E2E-support <600
**Chose:** the CLAUDE.md "<400 lines" ceiling applies to SOURCE files; test files and E2E support
files get 600 before a split is required · **Because:** batch-1 review flagged three test files
over 400 while the same rule forced a source refactor — one rule meaning two things; test suites
read linearly and forced splits hurt discoverability · **Rejected:** a blanket 400 (churn without
clarity), no ceiling for tests (unbounded growth) · **Revisit if:** a test file approaches 600.

## 2026-07-28 — Export format v2.2: thin-at-commit truth + height unification
**Chose:** (1) §4.5 rewritten to the shipped truth — pen strokes are thinned ONCE at commit
(0.75px distance pre-pass, RDP ε=0.5px, 1-decimal coords); the in-memory strokes ARE the thinned
strokes; the PNG is a DOM capture of them, so editor, PNG and site.json show identical geometry;
the export's ε=0.75 pass stays as a near-idempotent contract guard (measured 93→94 pts,
0.741→0.743px); honest fidelity bound stated (≈0.5px typical, 1.09px worst over hand-like input).
(2) ONE shared editor/export page-height function: bottom = max(block bottoms, stroke point-y);
height = clamp(1600, ceil((bottom+160)/8)*8, 8000); schema minimum 1600; §4.3's "exactly as the
editor shows it" is now literally true. Worked example regenerated under a mechanical guard
proving exactly 4 height-derived lines changed. 199 self-check assertions green ·
**Because:** the batch-2 review found §4.5 false of accepted code (the thinning was ruled BETTER
than the contract — 0.51px vs 0.74px deviation) and three height formulas had drifted (editor
+160/1600, §4.2 +80/800, §4.3's promise); one shared function kills the drift class ·
**Rejected:** changing the thinning to match the stale doc; editor adopting §4.2's formula
(would visually resize every existing design); keeping two documented formulas ·
**Revisit if:** tall-but-empty pages make packages heavy (white PNG compresses cheaply).

## 2026-07-28 — Export format v2.3: prototype-hardened, fromTemplate scope, normative key order
**Chose:** (1) all 21 findings from the byte-exact brief-generator prototype applied — the
reference implementation reproduced §7.2 sha256-identically with ZERO special cases, proving the
contract implementable, and its 4 severity-A fixes (generate-block reference-text fallback,
backslash + quote escaping, CommonMark-correct digit-period escape), 4 doc-reconciliations
(incl. Appendix test C redefined whitespace-normalized — byte-exact was unsatisfiable by rule
10's own display-wrapping), and 13 under-specifications resolved by adopting the prototype's
behavior as normative; (2) `fromTemplate` is only ever set on content-bearing block types —
sections NEVER carry it (flag clears only on content edits; sections have none → the V23 filler
WARN would be permanent for every template start; found by the Stage-4 harness consistency
pass); V23 defensively strips it on sections (FIX-class); (3) site.json key order is NORMATIVE
(byte-diffable packages), canon = §7.1's order, new V27 WARN (§2.1/§7.1 had drifted). Fixture
byte-identical through the whole amendment (233 self-check assertions) · **Because:** every
defect fixed pre-implementation is a debugging session Stage 3 never has · **Rejected:** a
V-rule nagging uncaptioned photos (builder infers from the image; D13 fallback-phrase arm
chosen); guillemet-quoting filenames (fixture pins `"…"`) · **Revisit if:** the round-trip test
finds a class all four adversarial passes missed.

## 2026-07-28 — Export format v2.4: contract FROZEN
**Chose:** final pre-integration amendment: (1) §4.5 annotation targets exclude `section` blocks
(a full-width band always wins on overlap area — every annotation would target its background);
(2) §7.1 mechanically regenerated as canonical-serializer output under a four-guard script
(value-canon identity, key order, serializer round-trip, §7.2 hash untouched) — same defect
class as §7.2's hand-wrapping; Appendix A gains REQUIRED test D (`serialize(parse(§7.1)) ===
§7.1` byte-exact); (3) V22 scoped to annotation clusters only (imageSketch exempt);
(4) fromTemplate's serialized position blessed (after `frame`, before per-type fields).
244 self-check assertions green; §7.2 hash unchanged through the entire amendment trail and
independently reproduced by the Stage-3 implementation. THE CONTRACT NOW FREEZES — further
changes require a decisions entry with a version bump and a round-trip regression justification ·
**Because:** the export-core build (876 tests, A/B/C proven on its branch) surfaced these as its
only contract frictions; freezing before integration ends the amendment churn window ·
**Rejected:** leaving §7.1 hand-formatted (would force implementations to compare against a
re-serialization, weakening the byte-exact discipline that caught real defects five times) ·
**Revisit if:** the round-trip test demands it — via the frozen-contract change process only.

## 2026-07-28 — Round-trip harness ruling 1: one credential, method recorded
_(Ruled 2026-07-28 while specifying the harness; recorded here 2026-07-29 in the pre-run doc
pass that R5.3/R10.1 make a precondition for gating run 1.)_
**Chose:** the sterile `CLAUDE_CONFIG_DIR` gets **exactly one** credential — `cli-credentials`
(copy the CLI credentials file) preferred because Cam's setup uses CLI auth, `api-key-env`
(pass `ANTHROPIC_API_KEY` through, copy nothing) as fallback, neither available → abort as
PRECONDITION; the dir asserts to `settings.json` + at most that one file on its RECURSIVE
listing; the method and source path — **never the contents** — go in `run-manifest.json` ·
**Because:** a bare config dir has no auth, so the isolated session cannot start at all, and
the protocol never said how it logs in — a fresh implementer stops dead there · **Rejected:**
copying the whole real config dir (destroys the zero-context premise), leaving it unspecified ·
**Revisit if:** the CLI's credential storage moves out of a file. → harness R3.3/R3.4

## 2026-07-28 — Round-trip harness ruling 2: the run root lives OUTSIDE the repo
**Chose:** run root defaults to `%LOCALAPPDATA%\boss-blueprint\roundtrip-runs\` (override
`ROUNDTRIP_RUNS_DIR`); the `.gitignore` line for `roundtrip-runs/` stays as belt-and-braces;
the ancestor walk (R3.2) is the real guard and runs wherever the root points ·
**Because:** protocol §0 said `roundtrip-runs/` is gitignored (inside the repo) and §3.1 said
the sandbox sits outside the repo tree so no ancestor `CLAUDE.md` can leak — these cannot both
be true, and the inside-the-repo reading silently puts this project's own `CLAUDE.md` in the
builder's ancestor chain, destroying the entire premise · **Rejected:** in-repo with a
`.claudeignore`-style dodge (no such mechanism for ancestor walks) · **Revisit if:** never —
the ancestor assertion makes the location a preference rather than a load-bearing choice.
**Operator consequence, found in practice:** the ruled default sits under the user profile, so
`C:\Users\Cam\.claude\settings.json` is an ancestor and the run correctly aborts as
PRECONDITION. Point `ROUNDTRIP_RUNS_DIR` at a **private** directory with a clean ancestor chain
(a dedicated drive root or a non-profile private folder); `C:\Users\Public\...` has a clean
chain but is world-readable, which is why the post-run credential scrub exists. → R3.1/R3.2

## 2026-07-28 — Round-trip harness ruling 3: Scenario A declares the Home Section bands
**Chose:** Scenario A declares the trades template's two Home `section` bands explicitly and
keeps them; the manifest diff asserts the `section` discriminator, full width, and that no
section paints in front of a content block · **Because:** the scenario claimed "all six block
types" while placing no `section` at all, and section bands are load-bearing for the brief's
DoD item 2 and §4.4 row grouping · **Rejected:** having the driver INSERT a band (the template
already seeds them — inventing one would test a path no client takes), asserting index 0 (a nav
bar legitimately paints furthest back, so that would fail every correct template start) ·
**Revisit if:** the template stops seeding bands. → R1.2a

## 2026-07-28 — Round-trip harness ruling 4: exactly one untouched template filler block
**Chose:** Scenario A leaves exactly one copy-bearing `fromTemplate` text block on Services
completely unedited; the driver asserts the submit gate showed the V23 filler WARN and **still
shipped**; the manifest diff asserts the flag per block from the scenario file; the expected
text is read from the committed template fixture, never re-typed; H6 and the evaluator both
carve those blocks out · **Because:** protocol §1.2 deferred the WARN path to Scenario B, but B
is a blank start with zero seeded blocks and cannot carry template filler at all — so V23's
WARN, the brief's [N12] filler narration and the WARN-ships-anyway path had never run end to
end · **Rejected:** a blanket "true on one, false on the rest" assertion (untrue while
`band()` set the flag — since fixed upstream) · **Revisit if:** V23's scope changes. → R1.2b, R8.5

## 2026-07-28 — Round-trip harness ruling 5: `npx`/`npm` denied to the builder
**Chose:** `Bash(npx serve*)` and `Bash(npx http-server*)` are dropped from the builder
allowlist entirely and `Bash(npx *)` / `Bash(npm *)` added to deny; SEG-5 serves the built site
with the committed, dependency-free `static-server.mjs`; a unit test asserts no generated allow
entry matches `/^Bash\((npx|npm)\b/` · **Because:** the allowlist contradicted its own
network-denial rationale — `npx` fetches from the npm registry on a cold cache, so a "hermetic"
build could reach the network through its own serving command · **Rejected:** allowing `npx`
with a warmed cache (unverifiable per machine), letting the builder skip self-checking
(`Bash(node *)` covers a loopback one-liner) · **Revisit if:** never without a decisions entry —
this is the hermeticity boundary. → R3.5, R6.1

## 2026-07-28 — Round-trip harness ruling 6: the extended interrogative set
**Chose:** rule 2a's lead set is extended to 24 words (adds `does did may might will is are was
were when whom whose why`) and gains a second, reverse-order clause `you → (want|prefer|like|
need|confirm|decide|choose|pick)`; both live in `thresholds.mjs` as pinned data, with corpus
rows · **Because:** the protocol's set was
`(do|would|could|can|should|shall|which|what|where|who|how)` and `\b(do)\b` does not match
"does" — so "Is this what you wanted?", "Are you happy for me to proceed?" and "You want me to
use the green?" ALL passed the zero-questions gate as written · **Rejected:** leaving it and
triaging by hand (R5.5 forbids waving a hit through), fixing it after a run (changing a scan
rule once a verdict exists is exactly what R5.5/R10.2 forbid — hence "before run 1") ·
**Revisit if:** only with a fresh decisions entry and a full rerun. → R5.3

## 2026-07-28 — Round-trip harness ruling 7: the deployed leg needs a freshness precondition
**Chose:** for `--target deployed`, build at HEAD, read the hashed entry filename out of
`dist/index.html`, fetch the deployed `index.html` and assert the same `assets/index-<hash>.js`;
mismatch aborts as **PRECONDITION**, is never written to `verdict.txt`, and is invisible to
`ship-gate.mjs`; `git status --porcelain` must also be empty · **Because:** nothing stopped a
run against a stale Pages deploy, and the 2026-07-28 UX audit found the live build had no Submit
control, no image upload and no pen at all — that leg would have burned a full builder budget to
produce a spectacular, meaningless FAIL · **Rejected:** scoring a stale deploy as a product FAIL,
sleeping-and-retrying (hides the real state) · **Revisit if:** hosting stops content-hashing.
→ R3.6

## 2026-07-28 — Round-trip harness ruling 8: Contact carries exactly one, unlinked button
**Chose:** Scenario A's Contact page has exactly one button — `Instagram`, link `none` ·
**Because:** protocol §1.2's page-4 bullet contradicted itself mid-sentence ("button `Get a free
quote` → Contact-page… no — this one is the deliberate **unlinked** control"); internal links
are already covered by the Home hero CTA and external by the Google-review button, so the `none`
path is the only thing that page adds · **Rejected:** two buttons (duplicates coverage the Home
page already has) · **Revisit if:** the unlinked-flag brief path changes. → R1.2c, R8.4

## 2026-07-28 — Recorded from batch-3 review: semantic internal ids + picker-from-storage
**Chose:** (1) template/page/block internal ids stay semantic (`home`, `rest-home-hero-title`)
— the export remaps every id at package time (§4.8), so readable ids cost the package nothing
and buy real E2E selectors and debuggability; ids are minted once and never change on rename;
(2) the template picker's visibility is DERIVED from storage (no second persisted flag): pick
Blank, place nothing, reload → the picker re-offers, because there is nothing to come back to ·
**Because:** both were made and recorded in feature files during implementation; this entry
promotes them to the decision log per review LOW-3 · **Rejected:** `page-`prefixed generated
ids (worse selectors), a persisted picker-dismissed flag (a second source of truth that can
disagree with the design) · **Revisit if:** n/a.

## 2026-07-29 — Zero-questions rule 2a gains a first-person-offer clause (before run 1)
**Chose:** rule 2a gets a third clause matching four literal offer forms — `should i`,
`shall (i|we)`, `want me to`, `anything else` — in any sentence that already ends in `?`,
pinned in `thresholds.mjs` as `FIRST_PERSON_OFFER_SET` with five `mustFail` and four `mustPass`
corpus rows. Also pinned in the same pass: the S3 length rule's constants
(`S3_LENGTH_MIN_RATIO` 0.3, `S3_LENGTH_MAX_RATIO` 3, `FRAME_CHAR_WIDTH_PX` 8,
`FRAME_LINE_HEIGHT_PX` 24, `S3_SENTENCE_HINT_TOLERANCE` 1), which implement R8.2's
already-specified but never-implemented length check · **Because:** both existing 2a clauses
require the word `you` somewhere, so every offer a builder makes about ITSELF — "Should I add a
favicon?", "Want me to swap the hero photo?", "Anything else?" — passed H2 untouched. In `-p`
print mode none of those can be answered, which is the same argument ruling 6 used, applied to
the direction it missed. Landing it **before any gating run exists** is mandatory: R5.5/R10.2
forbid changing a scan rule once a verdict exists · **Rejected:** a general "lead → I" clause
(it swallows the rhetorical self-questions a builder legitimately writes — "Why did I choose a
two-column hero?" — which the corpus keeps in `mustPass`); adding these to 2b's no-question-mark
phrase list (too broad). **Cost accepted knowingly:** a rhetorical "Should I have used a table?
No — the sketch shows cards." now fails H2, and R5.5 allows no hand-waving; the honest place to
pay that is here, before any verdict exists · **Revisit if:** only with a fresh decisions entry
and a full rerun. → R5.3 2a clause 3, R8.2 S3

## 2026-07-29 — R4.6 purity predicate amended: baseline-sterility, not emptiness
**Chose:** the builder/evaluator session-purity assertion (roundtrip harness R4.6) is amended
from "zero plugins/agents/skills/slash_commands" to BASELINE STERILITY: plugins must be 0;
agents/skills/slash_commands must equal EXACTLY the CLI's built-in set for the pinned CLI
version (a committed builtin manifest, compared as sets — any entry beyond the builtins is a
leak and aborts); memory paths must resolve only inside the run's own claude-home; the
assertion fires on the STREAMING init event before any builder budget is spent; the memory
check uses the fields the current CLI actually emits (memory_paths on 2.1.190) ·
**Because:** the live-run attempt proved emptiness UNSATISFIABLE — Claude Code ships built-in
agents/skills/commands in the binary that no CLAUDE_CONFIG_DIR can remove; the measured
contrast (sterile: 0 plugins/5 agents/14 skills/27 commands vs the real config dir:
1/16/99/114) is precisely the evidence that isolation works; the mock builder had masked this
by emitting empty arrays; asserting post-session would burn a full builder budget before
aborting · **Sign-off:** criterion amendment under R10.7; Cam delegated rulings via the
standing /goal directive, and this corrects an impossible criterion rather than weakening a
satisfiable one — the new predicate is STRICTER in practice (the old one never passed a real
transcript; the new one catches any non-builtin leak) · **Rejected:** allowlisting counts
without names (a swapped skill would pass), skipping purity when the CLI has builtins (gives
up the leak check entirely) · **Revisit if:** a CLI upgrade changes the builtin set — the
manifest is version-keyed and a mismatch is a loud PRECONDITION, never a silent pass.

## 2026-07-29 — Relay adapter: one provider-agnostic form-POST module, shipped OFF
**Chose:** the real `DeliveryRelay` is ONE generic form-POST adapter
(`src/export/delivery/formRelay.ts`) parameterised by a config record — endpoint, credential,
field NAMES, `staticFields`, `nestFieldsUnder`, byte budget — with **no provider named anywhere
in the code**; it ships CONFIG-GATED via `BOSS_RELAY` in `site.config.ts` with both strings
EMPTY, in which state the app binds the identical Stage 3 `NoopRelay` and makes zero network
calls; a touched-but-invalid config also falls back to the stub and logs why; the degrade ladder
is measured against the REAL request body (subject + rendered message + static fields), not the
payload object, and the `metadata-only` rung is posted unconditionally; `fetch` is an injected
port so `src/export/**` still reaches for no global; `keepalive: true`, which is also the honest
reason the budget is 64 kB · **Because:** Cam has not created an account (`help.md`), so naming a
provider would be a guess and four per-provider modules would mean three dead on arrival; every
free tier the debate surveyed (Web3Forms, FormSubmit-ajax, Formspree, EmailJS REST) is the same
shape — POST to a fixed endpoint, JSON body, public form key IN the body, 2xx = accepted — so a
config record spans the whole class; and the feature is deferred precisely because the shipped
no-relay path carries the Stage 3 DoD, the live gauntlet and the round-trip runs, which makes
"nothing changes until two strings are pasted" the load-bearing property, asserted in three
engines by recording every request the page makes · **Mechanism note (not a spec change):** the
verdict binds *gzipped `site.json`, base64*, not `CompressionStream`; `payload.ts` already gzips
with `fflate.gzipSync({ mtime: 0 })` — synchronous, deterministic, byte-stable, available in
jsdom and all three engines and already inflate-tested — so it stays. Swapping tested
deterministic code for an async browser API jsdom lacks would be a regression dressed as
compliance · **Rejected:** per-provider adapters (3 of 4 untested by construction), a serverless
proxy (a backend by another name), retry on failure (a 4xx is a config fault that will not fix
itself; a 5xx retry from a page about to close buys little — revisit only if Cam sees real
misses), letting the relay ever carry the zip (debate #2 settled it) · **Verification honesty:**
implemented and MOCK-verified only. No notification has reached an inbox; the feature stays
`awaiting verification` until Cam pastes his provider values and runs one real submission ·
**Revisit if:** the provider Cam picks needs a shape this config cannot express (header-borne
credential, multipart, signed request) — that is a new config field, not a rewrite.

## 2026-07-29 — Builtin manifest extended to CLI 2.1.220; block-on-unknown-version policy affirmed
**Chose:** `scripts/roundtrip/builtin-manifest.json` gains a `2.1.220` entry taken verbatim from
the attempt-3 sterile capture (`C:\bp-runs\2026-07-29T15-21-12-533Z_B_b3129f9\builder\transcript.jsonl`
— the harness's OWN path: `createSterileConfigDir` → `scrubEnvironment` → `runSession`, exactly one
credential, scrubbed env, which is row 1 of the manifest's sensitivity table and the only
configuration a harness run can ever see). `2.1.190` is KEPT, oldest first; the newest entry is last
because `run.mjs`'s mock builder claims `.at(-1)`. The delta was reviewed **BY NAME** before adding,
and it is a pure superset — nothing removed: **agents 5 → 5, identical name for name**; **skills
14 → 16, `+dataviz`, `+doctor`**; **slash_commands 27 → 43, `+16`: `dataviz`, `doctor`, `agents`,
`color`, `effort`, `fast`, `mcp`, `model`, `__remote-workflow`, `workflow-launch-exec`, `rename`,
`ultrareview`, `recap`, `design`, `design-consent`, `design-revoke`**; **`plugins` and `mcp_servers`
still 0** — every addition is an Anthropic-shipped builtin, no third-party agent, skill, command,
plugin or MCP server anywhere in it. `output_style: default` and `memoryField: memory_paths` are
unchanged, so R4.6's vacuity guard keeps biting. **The block-on-unknown behavior STAYS:** a CLI
version this file has never measured still aborts as **PRECONDITION**, and its captured init becomes
the candidate entry for a named-delta review plus a decisions entry — this procedure, which is now
the only way the manifest ever grows · **Because:** an auto-updating binary must never silently
widen the builder's capabilities — that is exactly the "zero extra context" premise the round-trip
test exists to prove, and a manifest that waved new versions through would let a future update
introduce a real leak wearing a version bump as camouflage. The abort-capture-review loop makes
extension cheap (the data is already captured, faithfully, by the harness itself) without weakening
the guard by one predicate. The guard already proved its worth: attempt 3 caught the 2.1.190 →
2.1.220 update mid-run, wrote no `verdict.txt`, and stayed invisible to `ship-gate.mjs` ·
**Rejected:** waving new versions through / auto-recapturing on mismatch (silent capability creep —
the failure mode the whole rule exists to prevent, and it would make the manifest a rubber stamp);
pinning or downgrading the CLI to 2.1.190 (it is Cam's primary tool, no 2.1.190 image survives on
disk — `~/.local/share/claude/versions/` holds only `2.1.89` — so this means a machine-wide network
reinstall of the tool he works in, to serve a test harness); relaxing R4.6 to "no third-party
entries" instead of set equality (loses the version-mismatch branch that correctly classified this
event as *not the pinned CLI* rather than a leak) · **Rule-file note:** `builtin-manifest.json` is in
`RULE_FILES` and is hashed at run start and end (R9.3). This edit is committed BEFORE the gauntlet
and the hashes are byte-identical within each run, which is the distinction that matters: extending
the baseline between runs, on the record, is not the same act as relaxing it mid-run ·
**Verification:** manifest-shape tests now cover BOTH versions — the full R4.6 sterility suite is
parameterised over every pinned version, plus explicit assertions that 2.1.220 is a pure superset
with the 16 new commands named, that neither entry is an empty stub, and that an unmeasured version
still returns `null` so block-on-unknown has something to block. `npx vitest run scripts/` green,
227 passed · **Revisit if:** a delta ever contains a non-builtin or third-party entry — that is a
leak, not a version bump, and it routes to the leak branch and a stop, not to another manifest entry.

## 2026-07-29 — H3 BUILD_NOTES location fixed to the build root
**Chose:** the H3/H8 scan checks **`<sandbox>/site/BUILD_NOTES.md`** — the build root — instead of
`<sandbox>/BUILD_NOTES.md`. `run.mjs` SEG-4 now resolves the notes against the same `site/`
directory it already resolved `index.html` against. When the notes are absent from the build root
but a non-empty copy sits at the **sandbox root**, the gate **still FAILS** and attaches a named
hint (`BUILD_NOTES_MISPLACED_HINT`) saying the file is one level above `./site/` and that the
builder most likely read "the root of your build" as the sandbox root — **a precise diagnosis, not
an acceptance**. Both locations present is still a pass; the stray copy is only ever a diagnostic ·
**Because:** the brief says *"Record every judgment call in a `BUILD_NOTES.md` at the root of your
build"* and `prompt.txt` says *"Create your build output in `./site/`"* — so "the root of your
build" and `./site/` name the same directory, and that is the **only** reading available to the
builder. Verified against the run, not assumed: `brief.md` mentions "root of your build" exactly
once, never path-qualifies `BUILD_NOTES.md` anywhere, and **never mentions `./site/` at all** — the
sole statement locating the build is in `prompt.txt`. `run.mjs` was also internally inconsistent,
resolving `index.html` inside `site/` but the notes one level up. The first real builder session
that ever ran to completion (live-run attempt 4, `1fee28f`) proved it: `sentinelPresent: true`,
`indexHtmlExists: true`, `maxTurns: false`, export package 38 PASS / 0 WARN / 0 FAIL — and the run
still scored `FAIL — H3 incomplete build` on the single input `buildNotesExists: false`, purely
because the builder had put the file where its instructions pointed · **The brief generator is NOT
touched.** No product change; `src/export/` is untouched and Appendix test B is unaffected. This is
a harness bug fixed in the harness · **Rejected:** rewording the brief's DoD to name the sandbox
root (alters what every future client package tells every future builder, permanently, in order to
paper over a harness bug — and would make the brief *less* true, since the notes genuinely do
belong with the build); accepting **either** location (a gate that shrugs at two answers has
stopped measuring the thing it exists to measure — precision beats tolerance, so the misplacement
is named and still fails) · **Verification:** four unit tests pin all three placements — in the
build root PASSES; only at the sandbox root FAILS *with* the named hint; absent everywhere FAILS
plainly with no misleading hint; and a stray copy cannot rescue a build whose notes are correctly
placed. Beyond the fixtures, the **real attempt-4 transcript and sandbox were replayed through the
fixed scan**: the identical build now returns `h3.ok: true`, `h8.ok: true`, with the BUILD_NOTES
triage parsing 81 entries. `npx vitest run scripts/` green, 231 passed · **Revisit if:** a future
builder writes `BUILD_NOTES.md` somewhere other than the build root — with the instruction now
consistent between brief, prompt and gate, that is a genuine H3 incomplete build and routes to the
product, not to another harness edit.
