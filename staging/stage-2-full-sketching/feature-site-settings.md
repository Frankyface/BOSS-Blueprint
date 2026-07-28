# Feature: Site Settings
_Stage: stage-2-full-sketching · Status: not started_

## Goal
A small settings panel for site-wide facts the layout can't express: business name, tagline,
what the business does, style vibe, and color preferences. This context makes the Stage 3
brief dramatically better ("modern & warm, sage green + cream" beats guessing from blocks).

## Success Criteria
- [ ] Settings panel captures: business name*, tagline, one-paragraph "about", vibe pick-list
      (e.g. modern / classic / playful / bold / warm) + free-text style notes, and up to 3
      preferred colors (swatch picker or hex)
- [ ] Only business name is required — everything else optional and skippable
- [ ] Values serialize with the design and survive reload + `.blueprint` round trip

## How We'll Verify
Unit: serializer round-trip. E2E: fill settings, reload, assert persisted; leave optionals
blank, assert no validation nagging. Record below.

## Verification Log
_Empty — nothing verified yet._

## Open Questions
- Where the panel lives (toolbar modal vs sidebar tab) — decide at build.

## Notes & Decisions
- none yet — revisit when starting.
