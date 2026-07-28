# Feature: Starter Templates
_Stage: stage-2-full-sketching · Status: not started_

## Goal
First-open experience: pick Restaurant, Trades/Services, Portfolio, or Shop — a pre-built
multi-page skeleton with typical sections to rearrange and overwrite — or start blank.
Templates cure blank-canvas paralysis and teach the blocks by example.

## Success Criteria
- [ ] First visit (no saved design) shows a template picker: 4 templates with preview
      thumbnails + Blank
- [ ] Each template loads a sensible 3-page skeleton (e.g. Restaurant: Home hero + about +
      gallery, Menu, Contact) built ONLY from real block types, nav pre-wired, with
      instructive placeholder copy ("Your dish photos here")
- [ ] Everything template-created is fully editable/deletable — it's just pre-placed state
- [ ] Returning visitors with a saved design skip the picker (a "new design" path re-offers it)

## How We'll Verify
Unit: each template fixture validates against the store schema. E2E: pick each template,
assert pages + nav exist and blocks are editable; saved-design path skips picker. Screenshots
of all four. Record below.

## Verification Log
_Empty — nothing verified yet._

## Open Questions
- Template content quality is a design task — draft in code as data fixtures, iterate on
  screenshots.

## Notes & Decisions
- Templates are plain design-state JSON (same schema as autosave) — no special machinery.
