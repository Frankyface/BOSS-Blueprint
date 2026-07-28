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
