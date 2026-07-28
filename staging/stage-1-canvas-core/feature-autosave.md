# Feature: Autosave
_Stage: stage-1-canvas-core · Status: not started_

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
_Empty — nothing verified yet._

## Open Questions
- none yet — revisit when starting.

## Notes & Decisions
- The localStorage payload IS the `.blueprint` file format (Stage 2 export/import reuses the
  same serializer) — keep the serializer a standalone pure module.
