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
