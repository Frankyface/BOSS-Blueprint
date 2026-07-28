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
- **Gated submit + email relay** — name/email form (the lead gate), client-side relay send
  (service per Fable debate #2), success/failure UX, spam honeypot
- **Size budget + fallback** — package size meter, in-app warnings, and the "download the zip
  + email it yourself" fallback when the relay's attachment cap is exceeded

## Definition of done (rough — firmed when specced)
- E2E: a full test design submits; the package arrives in a test inbox; the zip's site.json
  validates against the schema; PNGs match the canvas (visual diff); brief.md lists all
  GENERATE items. Fallback path exercised. All green in CI.
