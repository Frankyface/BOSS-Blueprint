# Feature: Starter Templates
_Stage: stage-2-full-sketching · Status: verified done_

## Goal
First-open experience: pick Restaurant, Trades/Services, Portfolio, or Shop — a pre-built
multi-page skeleton with typical sections to rearrange and overwrite — or start blank.
Templates cure blank-canvas paralysis and teach the blocks by example.

## Success Criteria
- [x] First visit (no saved design) shows a template picker: 4 templates with preview
      thumbnails + Blank
- [x] Each template loads a sensible 3-page skeleton (e.g. Restaurant: Home hero + about +
      gallery, Menu, Contact) built ONLY from real block types, nav pre-wired, with
      instructive placeholder copy ("Your dish photos here")
- [x] Everything template-created is fully editable/deletable — it's just pre-placed state
- [x] Returning visitors with a saved design skip the picker (a "new design" path re-offers it)

## How We'll Verify
Unit: each template fixture validates against the store schema. E2E: pick each template,
assert pages + nav exist and blocks are editable; saved-design path skips picker. Screenshots
of all four. Record below.

## Verification Log

### 2026-07-28 — implementer evidence (batch 3)
Built and measured locally; independent verification still owed.

**Unit — `npm run test:coverage`:** 40 files / **805 tests green**. Of those:
- `src/templates/starterTemplates.test.ts` — **62 tests**, the port of
  `design-assets/templates/validate-fixtures.mjs`, over 4 templates / 12 pages / **138 blocks**:
  grid alignment, page bounds, per-type `minSize`, band stacking with no gaps, content nested
  inside a band, paint order (bands first by y, then content in reading order), the two
  deliberate hero overlaps and no others, one uncovered nav bar per page with one item per page
  and `text` ↔ `items` agreement, every `link.kind: 'page'` resolving, 5–12 blocks per page,
  per-type field hygiene, text-fits-its-box against the landed sketch typography, drafted counts
  (35 / 36 / 33 / 34 blocks; 1 / 2 / 1 / 2 generate; 3 / 4 / 3 / 3 cross-page buttons), globally
  unique block ids, `businessName === ''`, and the flag scope rule below. Plus a real schema
  check: `parseBlueprint(serialiseDocument(documentFromTemplate(t)))` is `ok` and **deep-equal**
  for all four.
- `src/store/canvasStore.template.test.ts` — **17 tests** on the flag's state machine.
- `src/canvas/blockEdits.test.ts` / `blueprintFile.test.ts` — flag equality, clearing, the
  type-scope table, serialisation and the corrupt/normalised parse paths.

**Coverage gates:** `src/canvas/**` 99.73% lines / 99.55% functions · `src/store/**` 96.87% /
97.34% (gate 80/80). Whole-project 80.89% lines.

**E2E — `npx playwright test`, all three engines: 134 tests × 3 = 402 green**
(chromium 38.6s · firefox 1.4m · webkit 3.0m). `e2e/templates.spec.ts` adds **15**:
- picker on a first visit with all four cards + Blank, each card's miniature carrying ≥5 real
  blocks and exactly one nav bar (screenshot attached: `template-picker.png`)
- one test per template: page names (`Home/Menu/Visit Us`, `Home/Services/Get a Quote`,
  `Work/About/Contact`, `Home/Shop/Find Us`), 5–12 blocks per page, one nav bar per page with
  one item per page all resolving, every page-link resolving, `businessName === ''`, the blocks
  actually drawn — screenshot each (`template-restaurant.png` … `template-shop.png`)
- every page one click away, with the right block count drawn on each
- pre-placed state: retype a heading, delete a seeded button, add a new block — all ordinary
- flag transitions asserted **via the store bridge**: edit clears, move keeps, bands never carry
- flag survives autosave + reload
- Blank: zero blocks, zero strokes, one page, coach card up → dismiss → stays dismissed;
  first block retires it and it does not come back when that block is deleted; the card's last
  line reopens the picker and a template can be chosen from there
  (screenshot: `blank-start-coach.png`)
- a saved design skips the picker; "Start over" re-offers it and the next pick really starts

**Build:** `npm run build` clean (294.85 kB / 90.99 kB gzip). `npm run lint` clean.

_Not yet verified:_ deployed-site behaviour (CI/live check follows the push) and independent
review.

**Independent review (2026-07-28):** re-ran everything from a clean `npm ci` in a detached
worktree pinned at 57fb042. `npm run lint` clean · `npm test` **805 passed / 40 files** ·
`npm run test:coverage` exit 0 with `src/canvas/**` **99.73%** lines / **99.55%** functions and
`src/store/**` **96.87%** / **97.34%** (gates 80/80), project 80.89% lines · `npm run build`
294.85 kB / 90.99 kB gzip · `npx playwright test` twice: **402/402** (5.1m) and 401/402 — the
one failure is a WebKit load flake in the pre-existing `multipage-nav.spec.ts:387`
(`switchToPage` timeout), **5/5 green re-run in isolation**, and CI's `retries: 2` covers it.

Independent probes beyond the suite (own spec, 39 tests × 3 engines, all green; deleted after):
all four templates read out of the live store — **138 blocks, 31 sections, 107 flagged content,
zero flagged sections anywhere**; a **real south-east resize gesture keeps the flag** in all
three engines (the suite only tested moving); move-then-edit keeps then clears; a seeded nav
item rename clears it. Picker-from-storage confirmed both ways: Blank + place nothing + reload
**re-offers the picker**, Blank + one block + reload does not. Node probe against the read-only
`design-assets/templates/starterTemplates.ts`: the landed data is **byte-identical block for
block** modulo the two recorded transforms (slug dropped, band flag dropped);
`parseBlueprint(serialiseDocument(documentFromTemplate(t)))` is `deepStrictEqual` for all four;
a hand-edited payload with 9 flagged sections has **every flag dropped at parse**; explicit
`false` normalises to absent; a non-boolean is corruption. The `fromTemplate?: never` guard is
real — writing a flagged band is **TS2322 at compile time**. The ported fixture spec is the
genuine validator (15 checks × 4 + 2 = 62), strengthened rather than weakened on the flag rule.

CI run 30397571360 green at 57fb042 (lint, coverage, build, E2E, deploy). Live site **HTTP 200**;
the deployed bundle is **byte-identical** to the local production build (sha256
`5ec9e63d26bec2faa18b2b4741ebe77190088093705eaa1911c7f1c39d46b3e2`), carries all four picker
cards, the miniatures and the fixture copy, and correctly does **not** carry `__blueprintStore`.

Recorded deviations judged and ACCEPTED: geometry-keeps-flag (follows §2.6's own words and the
reasoning is right), semantic page ids (§4.8 remaps at package time), slug dropped
(RECONCILIATION §5 authorised it), picker-from-storage (consequence is correct and recorded),
whole-shell drag-drop. Findings: no CRITICAL, no HIGH. LOW — `layout.ts` says "30 band blocks",
actual is 31; the page-id ruling and the picker consequence are in this file but not in
`docs/decisions.md`; the flag unit spec omits `setBlockImageFit` / `setBlockImageDescription` /
`addNavItem` / `removeNavItem` / `setNavItemLink` (all funnel through one `withUpdatedBlock`).
**VERIFIED DONE.**

**UX hardening (2026-07-28):**
Status unchanged. One BLOCKER from the live-deploy UX audit, one review LOW, and this feature's
half of the Stage 2 capstone.
- **BLOCKER — the picker was a wall for a returning client.** The start overlay covers the whole
  editor, and its scrim intercepts the header's "Open design" button (the auditor verified it
  with `elementFromPoint` and a real click). The picker only appears when nothing is saved —
  which is exactly the state someone is in on a new machine, in a new browser, or after clearing
  their history: holding the `.blueprint` they were told to keep safe, with no way to open it
  short of picking a starter template they do not want and then overwriting it.
  **Decision: the picker carries the file route itself** rather than the header being exempted
  from the scrim. A z-index carve-out would leave the client hunting for a small button in a
  dark bar behind a modal they have not answered, and "aria-modal with a live control outside
  it" is a lie to a screen reader; putting _"Been here before? → Open a design file…"_ inside
  the sheet answers the question where it is asked. Same `requestDesignImport` flow, so the
  refusal messages, the migration path and the "nothing to overwrite, so no confirmation" rule
  all come for free. Dropping the file on the picker already worked (the whole shell is the drop
  target) and is now pinned by a test so it cannot quietly stop.
- **LOW — `src/templates/layout.ts` said "30 band blocks"; it is 31** (9 + 7 + 7 + 8, counted).
  Comment corrected.
- **LOW — the template-flag unit spec now names every content action.**
  `canvasStore.template.test.ts` gained a table for `setBlockImageFit`,
  `setBlockImageDescription`, `addNavItem`, `removeNavItem` and `setNavItemLink`, each asserting
  the flag is set before and cleared after. They do all funnel through one `withUpdatedBlock` —
  which is exactly the kind of claim that stops being true without anyone noticing.
- **Stage 2 capstone (`e2e/stage2-capstone.spec.ts`), this feature's half:** the capstone design
  STARTS from the restaurant template and builds on top of it, so a single flow now proves a
  template start survives the client's own additions, a reload and a file round trip with the
  seeded and hand-placed blocks intact. Green ×3 engines (chromium 4.1s, firefox 9.5s,
  webkit 27.7s — inside the `test.slow()` headroom).
- Evidence: `npm run test:coverage` exit 0, **43 files / 934 tests**; E2E `design-file.spec.ts`
  "opening a design from the starting-point picker" (2 tests × 3 engines — the picker's own file
  input, and a file dropped onto the picker; both assert the design opens with no template
  chosen and no confirmation prompt).

## Open Questions
- Template content quality is a design task — draft in code as data fixtures, iterate on
  screenshots.
  → **Closed at landing.** The fixture data landed pre-validated from
    `design-assets/templates/` (content draft → `starterTemplates.ts` → `RECONCILIATION.md`).
    Every deviation from the content draft is recorded there; the deviations THIS batch made
    on top of it are in Notes below. Screenshots of all four are attached to the E2E run.

## Notes & Decisions
- Templates are plain design-state JSON (same schema as autosave) — no special machinery.

### The fixture, and how it landed
- **Lifted from `design-assets/templates/starterTemplates.ts` (read-only source) into
  `src/templates/`, split per that file's own recommendation:** `layout.ts` (types, column
  system, the two builders) + `restaurant.ts` / `trades.ts` / `portfolio.ts` / `shop.ts` +
  `index.ts`. The source is 1,573 lines against a 400-line house limit; the split files are
  321–343 lines each. Content is byte-identical apart from the transforms below.
- **`slug` dropped from `TemplatePage`.** The landed `Page` has no slug: `docs/export-format.md`
  §4.1 derives one from the page name at every export so a rename cannot leave a stale one, and
  `src/canvas/pages.ts` says the same. `RECONCILIATION.md` §5 explicitly said to delete the
  field if Stage 2 made slugs derived. It did.
- **`documentFromTemplate` runs `withTypeDefaults` on every block.** The fixture writes only the
  fields it needs (a heading with `copyMode: 'real'` carries no `generateDescription`); the
  parser fills the rest in on read. Without this a template block would be a DIFFERENT SHAPE
  after one autosave-and-reload — the exact defect batch 1 caught on the reload path. The
  round-trip test above is what pins it.
- **Page ids stay the fixture's semantic ones** (`home`, `menu`, `visit`), not `createPage`'s
  `page-home` form. `parseBlueprint` accepts any non-empty id, the export remaps every id at
  package time (§4.8), and stable ids give the E2E suite real handles. Ids are unique
  site-wide within a template, and the unit spec also asserts they are unique across all four.
- **Portfolio's home page is named "Work"** — kept, per decisions.md "page names are free-form".

### `fromTemplate`
- **Additive field, no `schemaVersion` bump** (handoff's standing rule): `fromTemplate?: boolean`
  on `Block`, absent = false, validated at the `parseBlock` boundary like every other field.
- **RULING APPLIED — the flag is only ever set on content-bearing types; section bands NEVER
  carry it** (`docs/decisions.md` 2026-07-28 "Export format v2.3" · `docs/export-format.md`
  §2.6). The reviewed fixture source flags bands via its `band()` helper; that is wrong, because
  a band has no text, label or description, so the flag could never clear and the submit-time
  untouched-filler warning (V23) would be permanent for every template start no matter how
  thoroughly the client rewrote the design. Applied as a **producer-side transform when lifting
  the data** (`band()` in `src/templates/layout.ts` simply does not set it) rather than by
  editing the read-only source. Held three ways: `SectionBlock` is a separate type whose
  `fromTemplate?: never` makes a flagged band a **compile error**; the fixture spec asserts
  flag-set == content-type for all 138 blocks; and `parseBlock` drops the flag from a section
  read out of any file, so a hand-edited payload cannot reintroduce it either. Together with
  V23's defensive strip at export, both ends are closed.
- **CLEARING RULE — content edits clear it; MOVING AND RESIZING DO NOT.** This follows the
  binding contract's own words (§2.6: "the client never touched its content … moving/resizing
  doesn't clear it, editing content does") and **deliberately reverses the earlier working lean**
  ("any block mutation except z-order"). The contract is right: dragging our example heading four
  grid squares left does not make "Martina's Trattoria" the client's business name — it is still
  filler, and a brief that stopped saying so because a box moved would mislead the builder.
  Precisely: everything that is not `x/y/width/height` counts as content — the words, copy mode,
  the generate prompt and length hint, a button's target, a menu's items, a photo, its fit and
  its description. Z-order cannot reach the clearing code at all (`bringForward`/`sendBackward`
  reorder the array without producing a new block object), and neither can adding or deleting.
- **Cleared in exactly ONE place:** `withUpdatedBlock` in `src/store/canvasState.ts`, which every
  one of the store's fifteen per-block actions already funnels through. "The client edited this
  block's content" therefore has one definition instead of fifteen that could drift.
- **Cleared by REMOVING the key, never by writing `false`.** The flag has two shapes — present
  and `true`, or absent — so an edited template block is byte-identical to a hand-placed one, and
  a saved-then-reloaded block is identical to the one that was on screen. `parseBlock` normalises
  an explicit `false` from a hand-edited file the same way; a non-boolean is corruption.
- **`blocksEqual` now sees the field** (batch-1 review LOW-2). It is split into
  `blockContentEqual` (everything but the box) plus the four geometry fields plus the flag, so
  the "did the content change?" question the flag needs and the "did anything change?" question
  the no-op contract needs share one field list and cannot fall out of step.
- **A duplicated page keeps the flag on its copies.** The client asked for a copy of a page whose
  words are still ours; the copy's words are still ours too.

### The picker, Blank, and getting back to them
- **Shown when, and only when, there is no saved design to restore** — read straight off the
  `loadDocument` outcome at session start. Deliberately NOT a second persisted "has chosen" key:
  that would be another thing that can fall out of step with the design itself, and the honest
  answer to "should we offer a starting point?" is exactly "is there any work here to come back
  to?". Consequence, accepted: a client who picks Blank, places nothing and reloads is offered
  the picker again — correct, since they have nothing to come back to. `recovered` and
  `unavailable` load outcomes also show it, with the storage notice still on screen behind it.
- **"Start over" IS the new-design path.** Clearing puts a client exactly where a first visit
  finds them, so it re-opens the picker — one action, one meaning, and no second control that
  also means "empty page". No new button was added for it.
- **Start state is one value, not two booleans:** `startState: 'picker' | 'coaching' | 'editing'`
  in `editorStore` (chrome state, not document state). Exactly one start surface can be up, by
  construction. It defaults to `editing`, so every component test renders the plain editor.
- **Choosing a template is a plain document swap** (`openDesign` in `canvasSession.ts`) — the
  same door an opened `.blueprint` file comes through. Flagged as a replay so it does not land on
  the undo stack it replaces (Ctrl+Z right after choosing must not restore the empty page), with
  history rebuilt around the document the store actually holds; autosave still runs, so the
  choice survives a reload with no second persistence path.
- **Blank writes nothing at all.** It is already the page the client is standing on, so the
  document is untouched — zero blocks, zero store writes, no undo step (decisions.md: seeding
  Blank with "just a nav bar" would put content in the export the client never chose).
- **The coach card is UI, not blocks**, and its copy is the content draft's §8.1 verbatim,
  including the last line back to the picker. It retires itself on the first content of any kind
  — latched in the session subscriber that already sees every document change, so it is gone for
  good rather than flickering back when that block is deleted. Doing it there rather than in the
  component avoids an effect that would paint the stale card first (the repo's ESLint config
  bans `set-state-in-effect`, and this is why that rule is right here).
- **Thumbnails are a live miniature render, not shipped PNGs** — the real fixture blocks, same
  coordinates, same paint order, inside a 288×180 frame at 0.24 scale. A picture would be a
  second copy of the layout no test could compare against the data, and it would go stale the
  first time a heading moved. The blocks are deliberately wordless: at that scale real copy is a
  grey smudge, and what survives shrinking is the SHAPE (menu strip, big picture, three columns),
  which is what the card is for. Each type gets a recognisable treatment (dark nav strip, hatched
  photo, grey text bars, accent pill).
- **The picker is a plain absolutely-positioned overlay** — no portal, no focus-trap library, no
  scroll lock. Consistent with the reasoning already recorded for `StartOverButton` and
  `SidePanel`: hand-rolled modal machinery is the one thing that behaves differently in all three
  engines. Sheet capped at 78rem so the four cards sit in one row at desktop sizes; narrower
  windows wrap and the overlay scrolls (`overflow: auto`).

### Cost paid elsewhere
- **`e2e/support/canvas.ts` gained `dismissStartSurfaces`**, called by `openCanvas` and
  `reloadCanvas` unless a spec passes `{ keepStart: true }`. Every pre-existing spec starts with
  empty storage and therefore now meets the picker; dismissing it centrally (choose Blank,
  dismiss the coach) keeps all 108 of them running against exactly the state they did before,
  because neither click touches the document. `e2e/templates.spec.ts` is the spec that keeps it.
