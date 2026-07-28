# Feature: Design File (download / import)
_Stage: stage-2-full-sketching · Status: not started_

## Goal
Because there's no backend, the `.blueprint` file is the client's portable save: download the
whole design as one file, re-import it later or on another machine to continue.

## Success Criteria
- [ ] "Download design" produces `<business-name>.blueprint` (JSON, schemaVersion'd, images
      embedded) via the same serializer as autosave
- [ ] "Open design" imports a `.blueprint` file and restores the design exactly (deep-equal),
      after a confirm if it would overwrite current work
- [ ] Invalid/corrupt/wrong-version files are rejected with a friendly error and current work
      untouched (validate at the boundary)

## How We'll Verify
Unit: export → import round-trip deep-equal, including images; rejection paths for corrupt,
truncated, and future-schemaVersion fixtures. E2E: build design → download → clear → import →
assert identical structure. Record below.

## Verification Log
_Empty — nothing verified yet._

## Open Questions
- none yet — revisit when starting.

## Notes & Decisions
- Same serializer module as autosave (see feature-autosave Notes) — one format, three uses
  (storage, file, Stage 3 export input).
