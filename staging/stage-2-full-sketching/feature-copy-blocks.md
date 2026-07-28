# Feature: Copy Blocks
_Stage: stage-2-full-sketching · Status: not started_

## Goal
Text blocks carry either real client copy or a "generate later" placeholder with a client-written
description ("warm intro about our family bakery, ~2 sentences") that Claude fulfills at build
time. Kills blank-page paralysis and powers BOSS's "we handle the words" pitch.

## Success Criteria
- [ ] Heading and Text blocks have a mode toggle: **My words** / **Write it for me**
- [ ] "Write it for me" mode shows a description field + optional length hint; the block renders
      visibly as a placeholder (e.g. hatched background + the description in italics)
- [ ] Mode + description serialize with the design and are distinguishable in the store as
      `copyMode: 'real' | 'generate'`
- [ ] A design can mix both modes freely; switching modes preserves any text already entered

## How We'll Verify
Unit: store/serializer tests for both modes and mode-switching. E2E: create one of each,
assert distinct rendering, reload-persist, and that the store state carries the right flags.
Record below.

## Verification Log
_Empty — nothing verified yet._

## Open Questions
- none yet — revisit when starting.

## Notes & Decisions
- Stage 3's brief.md lists every `generate` block with its description + page context — the
  descriptions here are the prompts, so the field's placeholder text should coach a good one.
