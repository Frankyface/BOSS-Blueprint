# Feature: Copy Blocks
_Stage: stage-2-full-sketching · Status: verified done_

## Goal
Text blocks carry either real client copy or a "generate later" placeholder with a client-written
description ("warm intro about our family bakery, ~2 sentences") that Claude fulfills at build
time. Kills blank-page paralysis and powers BOSS's "we handle the words" pitch.

## Success Criteria
- [x] Heading and Text blocks have a mode toggle: **My words** / **Write it for me**
- [x] "Write it for me" mode shows a description field + optional length hint; the block renders
      visibly as a placeholder (e.g. hatched background + the description in italics)
- [x] Mode + description serialize with the design and are distinguishable in the store as
      `copyMode: 'real' | 'generate'`
- [x] A design can mix both modes freely; switching modes preserves any text already entered

## How We'll Verify
Unit: store/serializer tests for both modes and mode-switching. E2E: create one of each,
assert distinct rendering, reload-persist, and that the store state carries the right flags.
Record below.

## Verification Log

**Implementer run (2026-07-28):**

_Files:_ `src/canvas/blockEdits.ts` (copy-mode transitions + per-type defaults, pure),
`src/components/CopyModeEditor.tsx` (the toggle, description and length hint),
`src/components/BlockContent.tsx` (the generate face), `src/components/BlockView.css`
(dashed + hatched styling), `src/hooks/useCommittedField.ts` (one undo step per field).

_Commands (all run on this machine, 2026-07-28):_

| Command | Result |
|---|---|
| `npm run lint` | clean, exit 0 |
| `npm test` | **463 passed** / 26 files |
| `npm run test:coverage` | exit 0 — `src/canvas` 100% lines, 100% funcs; `src/store` 97.14% lines, 97.33% funcs |
| `npm run build` | ✓ built, 243.60 kB (gzip 75.09 kB) |
| `npm run e2e` (×2) | **237 passed (2.6m)** then **237 passed (2.5m)** — chromium + firefox + webkit |

_Unit coverage:_ `src/canvas/blockEdits.test.ts` (mode switch preserves text in both directions,
description/hint trimming, refusal on non-copy types, `blocksEqual` sees each field),
`src/store/canvasStore.copy.test.ts` (`setBlockCopyMode` / `setBlockGenerateDescription` /
`setBlockLengthHint`, no-op identity, no mutation), `src/canvas/blueprintFile.test.ts`
(round-trip of a `generate` block; an unknown `copyMode` is corruption; migrated blocks default
to `real`).

_E2E_ (`e2e/copy-blocks.spec.ts`, ×3 engines):
- `a fresh copy block is the client's own words`
- `switching to "write it for me" renders visibly differently` — asserts the computed
  `border-style: dashed` and `font-style: italic` on the generate face, not just a class name
- `switching modes never throws away what was typed on either side`
- `a design mixes both modes and survives a reload` (deep-equal blocks before/after)
- `a mode change is one undo step, and the description is another`
- `blocks that carry no copy offer no copy controls`

**Independent review (2026-07-28):**

Re-run from a clean checkout of b5d0885 in a detached worktree: `lint` clean · `test` **463 passed
/ 26 files** · `test:coverage` exit 0 (`src/canvas` 100% lines + funcs) · `build` 243.60 kB ·
`e2e` run 1 236 passed / 1 unrelated firefox flake, run 2 **237 passed**. CI green, live URL 200,
deployed bundle sha256-identical to a local build.

_Independent probe:_ a copy block with **both** sides populated at once (`text` "Half-typed context",
`generateDescription` "Warm intro about the pub", `lengthHint` "~2 sentences") was flipped
generate → real → generate; all three fields survived every crossing intact. The generate face
was asserted by **computed style** — `border-top-style: dashed`, `font-style: italic` — and shown
to differ from the real face, to render the description, and never to leak the residual words.
Mode change, description and length hint were confirmed to be one undo step each, in that order,
and the mixed design reloaded deep-equal. `blueprintFile` treats an unknown `copyMode` as
corruption rather than coercing it, and migrated blocks default to `real`.

_Deviation judged:_ per-type defaults filled in at creation **accepted** — the factory and the
parser call the same `withTypeDefaults`, which is what makes a saved-and-reloaded block identical
to the one on screen; the migration probe confirms a migrated block and a fresh one carry the same
field set. Field names match `docs/export-format.md` §2.7 verbatim.

Cross-cutting note: HIGH-3 (typed-but-uncommitted drafts lost on reload/tab-close) touches this
feature's description/hint fields via the shared `useCommittedField` hook — filed against the
hook layer with a single fix + per-surface tests, not against this feature.

**Status: VERIFIED DONE.**

## Open Questions
- none — the coaching placeholder wording is settled (see Notes).

## Notes & Decisions
- Stage 3's brief.md lists every `generate` block with its description + page context — the
  descriptions here are the prompts, so the field's placeholder text should coach a good one.
- **Field names are the export contract's, verbatim** (`docs/export-format.md` §2.7):
  `copyMode: 'real' | 'generate'`, `text`, `generateDescription`, `lengthHint`. Stage 3 remaps
  ids, not field names.
- **Copy blocks ALWAYS carry all four fields**, filled in by `withTypeDefaults` at creation and by
  the same defaults on parse. That is not cosmetic: without it a block that had been saved and
  reloaded was a different shape from the one on screen, which `canvasSession.test.ts` caught as a
  failing deep-equal on the reload path.
- **Optional text is `''` internally, `null` in the export.** An empty input has no other honest
  value; the Stage 3 generator maps `'' → null`.
- **Nothing is thrown away on a mode switch.** `text` survives a switch to `generate` (the export
  contract calls it *context* in that mode) and `generateDescription` survives a switch back to
  `real` — a client flipping the toggle to see what it does must not lose either side. Only
  `copyMode` changes.
- **The generate face shows the DESCRIPTION, not the words** (there are no words yet), with three
  cues at once so it can never read as finished copy: a dashed border, a 45° hatch drawn with a
  `repeating-linear-gradient` (no image asset, scales with the page), and the description in
  italics. With no description yet it shows "Tell us what this should say…".
- **The description/hint fields commit once, on Enter or blur** — via the shared
  `useCommittedField` hook, because every store write is an undo step and a field that wrote per
  keystroke would cost the client one Ctrl+Z per character. Same rule `BlockTextEditor` already
  followed; Escape abandons the draft.
- **The draft re-syncs by adjusting state during render, not in an effect.** The repo's ESLint
  config enforces `react-hooks/set-state-in-effect`; the render-time adjustment is React's own
  recommended shape for it and avoids painting a stale draft first.
- **Non-copy blocks silently refuse copy fields** (`withCopyMode` and friends return the block
  unchanged) rather than throwing, so a stray call cannot corrupt a section or an image slot, and
  the inspector simply does not offer the controls.
