# Feature: Autosave
_Stage: stage-1-canvas-core · Status: awaiting verification_

## Goal
Work never disappears. The design persists in the browser automatically; reload, crash, or
accidental tab close and the client picks up exactly where they left off.

## Success Criteria
- [ ] Canvas state saves to localStorage, debounced (~1s after the last change)
- [ ] Reloading the page restores the design exactly (blocks, positions, text, selection cleared)
- [ ] Storage payload carries a `schemaVersion`; loading an unknown/corrupt payload fails safe
      to a fresh canvas WITHOUT overwriting the stored data (preserved under a `-recovery` key)
- [ ] "Start over" control asks for confirmation, then clears the design and the stored state
- [ ] Approaching the localStorage quota (large designs) shows a non-blocking warning rather
      than silently failing to save

## How We'll Verify
1. Unit: serialize/deserialize round-trip (deep-equal), corrupt-payload fail-safe path,
   version-mismatch path, debounce behavior (fake timers).
2. E2E: build a page → wait past debounce → `page.reload()` → assert identical structure.
   Inject corrupt JSON into the storage key → reload → assert fresh canvas + recovery key
   present. Exercise Start over → confirm → assert empty canvas and cleared storage.
3. Record outputs below.

## Verification Log

**Implementer run (2026-07-28):**
- `npm run lint` → exit 0, no errors/warnings.
- `npm test` → exit 0, **16 files / 229 tests passed** (7.9s).
- `npm run test:coverage` → exit 0; `src/canvas/**` 100% lines / 100% functions,
  `src/store/**` 95.76% lines / 97.36% functions, against an enforced 80% gate.
- `npm run build` → exit 0, 213.67 kB JS (gzip 67.42 kB).
- `npm run e2e` → exit 0, **132 passed (1.2m)** across chromium/firefox/webkit; re-run for
  stability → **132 passed (1.3m)**.
- Unit coverage for this feature:
  - `src/canvas/blueprintFile.test.ts` (20 tests): every payload carries `schemaVersion` ·
    multi-block round-trip `toEqual` a `structuredClone` and returns fresh (non-aliased) objects ·
    a second trip through the format is byte-identical · corrupt paths — not JSON, not an object,
    array/string/null at the root, missing `schemaVersion`, `blocks` not a list, unknown block
    type, and per-field validation (missing id, empty id, string coordinate, NaN, zero width,
    negative height, non-string text), duplicate ids · version mismatch reported *separately* from
    corruption for both a newer and an older schema.
  - `src/store/canvasStorage.test.ts` (15 tests): writes under the versioned key · quota failure
    surfaced instead of swallowed and nothing written · near-quota warning still writes ·
    read-only/other failures reported · no-storage path · **corrupt and unknown-version payloads
    quarantined verbatim under the `-recovery` key with the main key freed** · the original left
    untouched when quarantining itself fails · a later save fills the freed slot while the recovery
    copy stays intact · `clearStoredDocument` removes both.
  - `src/store/autosave.test.ts` (9 tests, Vitest **fake timers**): nothing written at
    `AUTOSAVE_DEBOUNCE_MS - 1`, written at exactly `AUTOSAVE_DEBOUNCE_MS` · a burst of three
    changes writes once with only the newest value · a second quiet period writes again ·
    flush/cancel/isPending.
  - `src/store/canvasSession.test.ts`: debounced write of the real document · **every write's
    payload is byte-identical to the history entry that was current at that instant**, checked
    across the whole 10-action sequence plus an undo (this is the "history commits before storage"
    invariant, asserted rather than assumed) · an undone state is what gets persisted · a selection
    change writes nothing · quota failure raises a non-blocking notice and leaves the design intact ·
    a later successful save clears its own warning but **never** the unread recovery warning ·
    simulated reload restores the document exactly with selection cleared and history empty ·
    corrupt and unknown-schema reloads start fresh, quarantine the file and raise the notice ·
    running with no storage at all still works · start-over clears design + history + both keys,
    cannot be undone into, and survives the autosave that its own reset queued.
  - `src/components/StorageNotice.test.tsx` (4 tests): renders nothing when silent, renders as
    `role="status"` (not a dialog), tags the kind, dismisses.
- E2E for this feature (`e2e/autosave.spec.ts`, 10 tests × 3 engines = 30):
  - **Reload persistence**: build a page (nav bar, section, heading + typed text, dragged, button +
    typed label) → wait past the debounce → `page.reload()` → the store JSON `toEqual`s the
    pre-reload blocks **and** the DOM geometry attributes of every block match, in paint order.
    Screenshots `autosave-before-reload.png` / `autosave-after-reload.png` attached.
  - Restored page comes back with `selectedBlockId` and `editingBlockId` null and both history
    buttons disabled (a block was definitely selected before the reload — asserted).
  - The stored payload carries `schemaVersion: 1`.
  - Selection is not persisted: clicking around leaves the payload byte-identical, and the payload
    has exactly the keys `['blocks', 'schemaVersion']`.
  - **Corrupt-storage recovery**: inject `'{ this is not a blueprint at all'` → reload → empty
    canvas, `storage-notice` visible with `data-notice-kind="recovered"`, the byte-identical
    original under the `-recovery` key, and the main key gone. Screenshot attached.
  - Same for an unknown schema version (`schemaVersion: 100`).
  - The warning is genuinely non-blocking: a block can still be added while it is up, it can be
    dismissed, and the fresh work then saves into the freed slot.
  - **Start over**: the confirm strip appears and nothing has happened yet → confirm → canvas
    empty, both history buttons disabled, the stored key gone, and it stays cleared through a
    reload. Backing out changes neither the document nor storage. Disabled when there is nothing
    to clear.
- Bug found and fixed during the E2E run (WebKit, then Firefox): a *successful* autosave was
  calling `setNotice(null)` and so wiping the "we couldn't read your old design" warning about a
  second after the client placed their first block — the banner vanished mid-read. The save path
  now only clears notices it owns (`near-quota`, `save-failed`, `unavailable`); `recovered` is a
  one-off message only the client dismisses. Covered by a dedicated unit test.

## Open Questions
- ~~none yet~~ — none outstanding.

## Notes & Decisions
- The localStorage payload IS the `.blueprint` file format (Stage 2 export/import reuses the
  same serializer) — keep the serializer a standalone pure module.
- **`src/canvas/blueprintFile.ts` is that module**: `serialiseDocument` / `parseBlueprint` /
  `emptyDocument`, pure, no storage and no globals, `BLUEPRINT_SCHEMA_VERSION = 1`. Stage 2
  export/import and the Stage 3 `site.json` build package all read and write through it, so there
  is exactly one definition of the on-disk shape. `parseBlueprint` never throws and never trusts
  `JSON.parse` — every field of every block is validated, and duplicate ids are corruption
  (they are React keys and the handle every action takes).
- **Key names**: `boss-blueprint:canvas:v1` and `boss-blueprint:canvas:v1-recovery`. The `v1` in
  the KEY is the storage *slot* version, not the document schema — the schema version travels
  inside the payload. That split is deliberate: if the key carried the schema version, a payload
  written by a future build would sit at a key this build never looks at, and the "fail safe
  without overwriting" requirement could not be met. The key only changes if we ever need a clean
  parallel slot.
- **Failing safe = quarantine, not delete.** A payload that will not parse (or carries an unknown
  schema) is copied verbatim to the `-recovery` key and the main key is *removed*, which both
  preserves the client's file and frees the slot so the next autosave has somewhere to go. If even
  the quarantine write fails, the original is left exactly where it is rather than throwing during
  start-up.
- **Ordering: history first, storage second.** Both react to the same store change inside one
  subscriber, in that order, so an autosaved payload can never describe a state the undo stack has
  not recorded. Asserted directly in `canvasSession.test.ts` by comparing every write's payload
  against the history entry current at that instant.
- **Quota**: a size check before the write warns from 4 MB of the ~5 MB every browser allows
  (UTF-16, so bytes = characters × 2), and a real `QuotaExceededError` — under any of its three
  engine-specific names/codes — surfaces as a red "could NOT be saved" banner. Never a silent
  failure. The banner is `role="status"`, dismissible, and never blocks the canvas.
- **A successful save clears only save-owned notices.** See the bug in the log above.
- **"Start over" uses an in-app two-step confirmation, not `window.confirm`.** A native dialog
  blocks the page, looks like a browser warning rather than part of the tool, and is the one bit of
  UI that behaves differently in all three engines. The button is disabled while the page is
  already empty. Confirming clears the design, the history and BOTH storage keys, and cancels the
  queued autosave *before* removing them so a timer already ticking cannot write the old design
  back afterwards.
- **Storage is injected, never reached for.** `startCanvasSession({ storage })` takes a
  `StorageLike`; the app passes `getBrowserStorage()`, which returns `null` when localStorage is
  unusable (private windows, blocked cookies — merely *reading* the property throws there). The app
  then runs normally with a standing "your work is not being saved" notice instead of failing to
  start.
- Hydration happens in `main.tsx` **before** `createRoot().render()`, so a restored design paints in
  one go instead of flashing an empty page, and React never sees a document with no history.
