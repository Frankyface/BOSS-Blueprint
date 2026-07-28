# Stage 2 — Full Sketching

## Goal
Everything a client needs to express a complete website: multiple linked pages, the pen layer,
copy blocks with generate-later placeholders, image uploads, site settings, starter templates,
and a portable design file. After this stage a design contains every kind of information the
Stage 3 export needs.

_Moderately specified on purpose — details firm up as Stage 1 lands (progressive detail rule)._

## Features
- [ ] feature-multipage-nav.md — page manager + wiring buttons/nav items to pages
- [ ] feature-pen-layer.md — freehand pen/eraser per page, over the blocks
- [x] feature-copy-blocks.md — real text vs "generate later" placeholder with description
- [x] feature-image-upload.md — upload into image slots, client-side compression
- [x] feature-site-settings.md — business name, tagline, vibe/style + color preferences
- [ ] feature-templates.md — Restaurant, Trades/Services, Portfolio, Shop starters + blank
- [ ] feature-design-file.md — download/import the `.blueprint` file

## Definition of Done (testable checklist)
- [ ] E2E: starting from the Restaurant template, build a 3-page site (Home, Menu, Contact)
      that uses every element type: blocks of all six kinds, a pen annotation, one real copy
      block, one generate-later copy block, one uploaded image, nav wired to all pages
- [ ] E2E: that design survives a reload AND a download → clear → re-import round trip
      (deep-equal state both times)
- [ ] Undo/redo covers all new mutation types (pen strokes, page ops, uploads, settings)
- [ ] `npm test` + `npm run e2e` green in CI; every feature file `verified done` with evidence
