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
