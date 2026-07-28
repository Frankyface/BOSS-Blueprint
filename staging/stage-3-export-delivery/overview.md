# Stage 3 — Export & Delivery

_Sketch only — this stage gets fully specced (feature files written) when Stage 2 nears done.
The export schema design is important enough that it gets its own Fable debate / spec pass at
that point. Progressive detail rule: don't flesh this out earlier._

## Goal
A finished sketch becomes the **Claude-ready package** and reaches Cam's inbox through the
gated submit — the product's entire point.

## Planned features (files created when this stage is specced)
- **site.json schema + generator** — schemaVersion, siteSettings, pages[] with typed blocks,
  positions, copy modes + descriptions, image refs, pen-stroke data, nav graph
- **brief.md generator** — the build prompt: what to build, page inventory, per-page walkthrough,
  every GENERATE copy item with description + context, style/vibe section, asset manifest
- **Page PNG renderer** — each page rendered to a PNG (blocks + pen layer baked in) at the
  1200px design width; the visual ground truth that resolves any json ambiguity
- **Zip packaging** — site.json + brief.md + pages/*.png + assets/* in one archive
- **Gated submit + download-first delivery** (debate #2 verdict) — name/email form (the lead
  gate); the zip ALWAYS downloads locally; two-step completion UX ("1. Downloaded ✓ →
  2. Email it to us") with prefilled mailto + copyable address; submission UUID stamped into
  zip and notification alike
- **Notification relay (wired LAST, per Cam)** — kilobyte text-only payload (name/email, UUID,
  page count, brief.md, gzipped site.json with degrade ladder) behind a swappable DeliveryRelay
  port; spam honeypot; until wired, submit = download + mailto and is fully functional
- **Size budget** — deterministic compression ladder on images/renders keeps the zip small
  (eases the client's manual forward); package size meter in the submit UI

## Definition of done (rough — firmed when specced)
- E2E: a full test design submits; the package arrives in a test inbox; the zip's site.json
  validates against the schema; PNGs match the canvas (visual diff); brief.md lists all
  GENERATE items. Fallback path exercised. All green in CI.
