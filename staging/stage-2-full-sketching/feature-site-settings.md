# Feature: Site Settings
_Stage: stage-2-full-sketching · Status: verified done_

## Goal
A small settings panel for site-wide facts the layout can't express: business name, tagline,
what the business does, style vibe, and color preferences. This context makes the Stage 3
brief dramatically better ("modern & warm, sage green + cream" beats guessing from blocks).

## Success Criteria
- [x] Settings panel captures: business name*, tagline, one-paragraph "about", vibe pick-list
      (e.g. modern / classic / playful / bold / warm) + free-text style notes, and up to 3
      preferred colors (swatch picker or hex)
- [x] Only business name is required — everything else optional and skippable
- [x] Values serialize with the design and survive reload + `.blueprint` round trip

## How We'll Verify
Unit: serializer round-trip. E2E: fill settings, reload, assert persisted; leave optionals
blank, assert no validation nagging. Record below.

## Verification Log

**Implementer run (2026-07-28):**

_Files:_ `src/canvas/siteSettings.ts` (defaults, the vibe list, colour rules, parsing),
`src/components/SiteSettingsPanel.tsx` (the panel + colour slots),
`src/components/SidePanel.tsx` (the tabbed host), `src/store/canvasStore.ts`
(`updateSiteSettings` / `setSiteColor` / `removeSiteColor`), `src/canvas/blueprintFile.ts`
(settings serialise into the v2 payload alongside `pages`).

_Commands (all run on this machine, 2026-07-28):_

| Command | Result |
|---|---|
| `npm run lint` | clean, exit 0 |
| `npm test` | **463 passed** / 26 files |
| `npm run test:coverage` | exit 0 — `src/canvas` 100% lines, 100% funcs; `src/store` 97.14% lines, 97.33% funcs |
| `npm run build` | ✓ built, 243.60 kB (gzip 75.09 kB) |
| `npm run e2e` (×2) | **237 passed (2.6m)** then **237 passed (2.5m)** — chromium + firefox + webkit |

_Unit coverage:_ `src/canvas/siteSettings.test.ts` — including a test that pins `VIBE_OPTIONS`
to the export schema's own enum and order, so a schema change fails here first;
`src/store/canvasStore.pages.test.ts` (patching one field at a time, no-op identity, colour
add/replace/remove, no mutation); `src/canvas/blueprintFile.test.ts` (every field round-trips;
an unknown vibe, a non-hex colour, a fourth colour and a non-list `colors` are all corruption).

_E2E_ (`e2e/site-settings.spec.ts`, ×3 engines):
- `captures every field and keeps them through a reload` (store + the rendered field values)
- `the vibe list is exactly the five the export schema allows` (reads the `<option>` values)
- `everything except the business name is skippable, with no nagging` — asserts
  `[role="alert"]` count is 0 with the whole panel blank
- `refuses a colour that is not a hex value, and says why`
- `offers three colour slots and no more, and clearing one removes it`
- `a settings change is an undo step, one per field`
- `settings alone are enough to make "start over" meaningful`

_Real-browser spot check:_ production preview at 1600×900 — the Site tab renders all six controls
inside the 304px column and the panel scrolls internally (`scrollHeight` 794 in a ~740px view).

**Independent review (2026-07-28):**

Re-run from a clean checkout of b5d0885 in a detached worktree: `lint` clean · `test` **463 passed
/ 26 files** · `test:coverage` exit 0 (`src/canvas` 100% lines + funcs) · `build` 243.60 kB ·
`e2e` run 1 236 passed / 1 unrelated firefox flake, run 2 **237 passed**. CI green, live URL 200,
deployed bundle sha256-identical to a local build.

_Independent probe:_ the rendered option values of the vibe select were compared against
`docs/export-format.md` §2.2 directly — one "Not sure yet" sentinel followed by
`modern, classic, playful, bold, warm` in the schema's own order and nothing else — and every value
was then selected and confirmed to reach the store, with the sentinel storing `null`. The unit test
pinning `VIBE_OPTIONS` to the literal enum was read and is genuine, so schema drift fails here
first. A full v2 payload carrying all six settings fields round-tripped deep-equal through a reload;
an unknown vibe, a non-hex colour, a fourth colour and a non-list `colors` each quarantine the
payload rather than being silently dropped. Colours normalise to lower case, and the whole panel
left blank produces `[role="alert"]` count 0.

_Deviations judged:_ sidebar tab over modal **accepted** (a modal would hide the design being
described and needs a focus trap + scroll lock in three engines); hex text fields over the native
color input **accepted** (the native widget differs per engine and cannot express "no colour");
`businessName` required at submit rather than while sketching **accepted** and consistent with
the Stage 3 gate.

**Follow-up probe (2026-07-28), prompted by the live-site UX audit's "settings not saved" report:**
the autosave subscriber guard was read in source — it compares BOTH `pages` and `siteSettings`
slices — and a settings-ONLY session (zero block/page edits, real UI input, 3s wall-clock wait)
was proven to persist: the captured localStorage payload carried every field with
`pages[0].blocks: []`, and a reload restored store AND rendered panel. The pagehide flush inside
the debounce window also passed. The audit's symptom was traced instead to **HIGH-3**: a
typed-but-uncommitted draft (focus still in the field) lives only in component state and dies on
reload — a shared `useCommittedField`-layer defect affecting multiple features, filed
cross-cutting with a single hook-level fix assigned. This feature's criterion is met.

**Status: VERIFIED DONE.**

## Open Questions
- ~~Where the panel lives (toolbar modal vs sidebar tab)~~ **Decided at build:** a docked
  right-hand sidebar tab (see Notes).

## Notes & Decisions
- **Panel placement: the "Site" tab of a docked right-hand sidebar**, not a toolbar modal. These
  are facts the client fills in as they think of them while looking at the design; a modal would
  cover the very thing they are describing, and would need a focus trap plus a scroll lock to be
  correct — three engines' worth of behaviour for no gain. The same sidebar hosts the Block
  inspector and the Nav map.
- **The vibe pick-list is derived from the export schema enum, not invented.**
  `docs/export-format.md` §2.2 defines `siteSettings.vibe` as
  `["modern","classic","playful","bold","warm"]` and §2.4 names that enum the source of truth for
  this list ("the Stage 2 settings panel offers exactly these values; extending the list means
  extending this enum first"). `VIBE_OPTIONS` in `src/canvas/siteSettings.ts` copies it verbatim,
  in the schema's order, with a unit test pinning it so drift fails CI rather than export
  validation. Each option carries a plain-English gloss for non-designers; the gloss is UI-only.
- **`businessName` is required at SUBMIT, never while sketching.** The panel shows one calm hint
  ("We'll need this before you send the design in — the rest is optional") and produces no error,
  no red field and no blocked action. Stage 3's submit gate enforces it.
- **Optional text is `''` internally and `null` in the export.** An empty input has no other
  honest value, and it keeps every field a plain controlled string; the Stage 3 generator maps
  `'' → null`. `vibe` is the exception — it is genuinely `null` when unset, because "not sure yet"
  is not a vibe.
- **Colours are hex text fields with a live swatch, NOT `<input type="color">`.** The native
  picker is a different widget in every engine, cannot express "no colour", and hex is exactly
  what the export stores anyway. Values are normalised to lower case so `#2F6F4F` and `#2f6f4f`
  can never read as two colours. Three slots maximum (§2.4), rendered as "filled + one empty", so
  the client cannot leave a gap — and `withColorAt` refuses an index past the end for the same
  reason. Clearing a slot removes the colour and closes the gap.
- **Every field commits once, on Enter or blur** (the shared `useCommittedField` hook), so a
  settings edit is ONE undo step rather than one per keystroke. Settings changes are ordinary
  history steps and are autosaved like any other document change.
- **Settings live in the document, beside `pages`** — `{ schemaVersion: 2, siteSettings, pages }`
  — so they ride along with autosave, undo/redo, the `.blueprint` file and (Stage 3) `site.json`
  with no separate persistence path.
- **"Start over" is enabled by settings alone**, not just by blocks: a client who has typed their
  business name and nothing else still has something to clear (`selectHasContent`).
