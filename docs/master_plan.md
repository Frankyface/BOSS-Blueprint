# BOSS Blueprint — Master Plan

_Written 2026-07-27. This doc assumes zero prior context — a brand-new session should be able
to rebuild the whole vision from this file alone._

## Pitch

BOSS Blueprint is a free, browser-based sketch tool where clients of BOSS (Cam's website-building
business, bossolutions.pro) lay out their future website like a PowerPoint deck — structured
blocks, real or placeholder copy, uploaded images, freehand pen scribbles, multiple linked
pages — and hitting Submit emails Cam a **Claude-ready build package** from which a fresh
Claude Code session can construct the real site exactly as sketched.

## Problem & Why

Today, discovering what a client actually wants means long email/call back-and-forth: they
describe layouts in words, Cam interprets, drafts get bounced. Non-technical clients *can't
say* what they want but they *can show* it. Blueprint turns "show me" into a structured
artifact that is simultaneously (a) the client's creative act, (b) BOSS's requirements doc,
and (c) a machine-consumable build brief. Secondary win: a public "sketch your site" tool on
bossolutions.pro is lead capture — every gated submission includes name + email.

## Target Users & Use Cases

**Primary:** non-technical small-business owners (restaurants, trades, portfolios, small shops)
— prospects or signed clients of BOSS, on a desktop/laptop browser.

Top jobs-to-be-done:
1. "Show BOSS exactly what I want without explaining it in words" — the core job.
2. "Play with my site idea before committing money" — the lead-gen hook.
3. "Hand over my content (text, photos) in one organized go" — kills the asset-chasing emails.

**Secondary user: Cam** — receives the package, feeds it to Claude Code, builds the site.
The export format is designed for this consumer (see Architecture).

## v1 Scope

**IN:**
- Desktop-first web app, free on GitHub Pages, BOSS-branded, no login, no backend
- Structured block canvas: section bands, headings, text boxes, image slots, buttons, nav bar —
  drag, resize, snap-to-grid, inline text edit, z-order, delete
- Freehand pen layer per page (annotate + sketch what images should contain)
- Copy blocks: real text OR "generate later" placeholder with client-written description
- Image upload (client-side compression) placed into image slots
- Multi-page sites + navigation map (buttons/nav items link to pages)
- Site settings: business name, tagline, vibe/style hints, color preferences
- 4 starter templates (Restaurant, Trades/Services, Portfolio, Shop) + blank start
- Drafts: localStorage autosave + downloadable/re-importable `.blueprint` design file
- Gated submit (name/email required) → email relay delivers the package to Cam:
  `site.json` (structured layout), `brief.md` (build prompt), per-page PNG renders, assets

**OUT (explicit non-goals for v1):** any backend/database, client accounts, live AI copy
generation in-app, a good phone sketching experience, guided wizard onboarding, payments,
admin dashboard, collaboration/sharing between clients.

## Future Roadmap (6–12 months, sketch only)

- Guided wizard onboarding (answer questions → pre-built skeleton sketch)
- Revision sketches: client marks up screenshots of their *delivered* site to request changes
- Supabase backend + submission inbox if volume outgrows email
- Live AI copy behind a tiny proxy, tablet support, more/industry-specific templates

**Don't paint into a corner:** `site.json` carries a `schemaVersion` field from day one so
future tooling can read old exports; export generation stays a pure client-side module so a
future backend can reuse it unchanged; canvas state model stays serializable JSON.

## Tech Stack & Key Decisions

(Each decision's full reasoning: `docs/decisions.md`.)

- **React + Vite + TypeScript** — boring, safe, huge ecosystem for canvas/test tooling
- **Zustand, immutable updates** — cheap undo/redo, matches house style
- **Canvas: hand-rolled DOM/SVG, no engine** (Fable debate #1 verdict, 2026-07-27) — blocks are
  absolutely-positioned DOM in a scaled 1200px page; pen = perfect-freehand → SVG overlay;
  PNG export via snapdom (html-to-image fallback). Binding mitigations in docs/decisions.md.
- **Vitest + Playwright** — fully-automated verification convention (no human gate)
- **GitHub Pages via Actions** — free hosting; repo Frankyface/BOSS-Blueprint (public)
- **Delivery: download-first hybrid** (Fable debate #2 verdict, 2026-07-27) — zip always
  downloads locally; kilobyte notification via swappable text-only relay; client forwards zip
  via prefilled mailto. Relay integration wired LAST (Cam's directive).
- **No backend** — Cam's explicit choice: zero maintenance beats save-anywhere convenience

## Architecture Sketch

```
Browser (static SPA on GitHub Pages)
├── Canvas editor  — pages[] of blocks[] + pen strokes, Zustand store (serializable)
├── Persistence    — debounced localStorage autosave · .blueprint file export/import (JSON)
├── Export module (pure functions)
│   ├── site.json   — schemaVersion, siteSettings, pages[{blocks, penStrokes, navLinks}]
│   ├── brief.md    — human/Claude-readable build instructions incl. GENERATE copy items
│   ├── page PNGs   — rendered snapshot of each page (blocks + pen layer baked in)
│   └── assets/     — client-uploaded images (compressed)
└── Submit          — zip ALWAYS downloads locally (Blob) + kilobyte notification email via
                      swappable text relay · client forwards zip via prefilled mailto
                      (download-first hybrid, debate #2 verdict; relay wired last)
```

The **Claude-friendly package** is defined by one test: a fresh Claude Code session given only
the zip must build a visibly matching site without asking questions. That means site.json holds
machine-readable truth (exact layout, nav graph, copy, generate-flags), brief.md holds intent
and instructions, PNGs resolve ambiguity, assets arrive build-ready.

## Staged Roadmap

| Stage | Goal | Headline feature | Definition of done |
|---|---|---|---|
| 1 — canvas-core | Working single-page block editor | Drag/resize/edit blocks, undo/redo, autosave | E2E: build a page, reload persists, undo correct |
| 2 — full-sketching | Everything a client needs to express a site | Multi-page + nav map, pen, copy blocks, images, templates, settings | E2E: from template, build 3-page site using every element type |
| 3 — export-delivery | Sketch becomes a Claude-ready package | site.json + brief.md + PNGs + assets zipped, emailed via gated submit | E2E: submission arrives in test inbox, package validates against schema |
| 4 — roundtrip-launch | Prove the value chain, go live | **The round-trip test** | Agent-as-client sketch → package → fresh Claude session builds matching site, zero questions; deployed + linked |

Stage folders live in `staging/`; Stage 1 is fully specified, later stages get sketchier on
purpose (progressive detail — they're specced when we get close).

## Open Questions & Risks

1. ~~Email attachment limits~~ — RESOLVED 2026-07-27 by debate #2: download-first hybrid
   (zip never rides an attachment relay). Residual risk shifts to zip-forward abandonment;
   mitigated by the lead-capture floor (notification always carries brief.md + site.json).
2. ~~Canvas engine choice~~ — RESOLVED 2026-07-27 by debate #1: hand-rolled DOM/SVG. Residual
   risk shifts to DOM→PNG capture fidelity; binding mitigations recorded in docs/decisions.md.
3. **Export fidelity** — is the package truly enough for a zero-context build? The round-trip
   test (Stage 4 DoD) exists to falsify this; schema is specced deliberately in Stage 3.
4. Public tool spam through the relay — free tiers have monthly caps; mitigate with honeypot
   field + submit-only-with-valid-design rule. Revisit if abuse appears.

## Glossary

- **Block** — a structured element on a page: section band, heading, text box, image slot, button, nav bar.
- **Pen layer** — freehand strokes drawn over a page's blocks (annotations, image sketches).
- **Copy block** — text block flagged `real` (client wrote it) or `generate` (has a description; Claude writes it at build time).
- **`.blueprint` file** — downloadable JSON of the whole design; re-importable to resume work.
- **Package** — the zip a submission produces: `site.json`, `brief.md`, page PNGs, `assets/`.
- **Round-trip test** — sketch → package → fresh Claude session builds a visibly matching site with no clarifying questions. v1's definition of done.
