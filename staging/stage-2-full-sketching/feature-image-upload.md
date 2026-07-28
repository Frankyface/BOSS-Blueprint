# Feature: Image Upload
_Stage: stage-2-full-sketching · Status: not started_

## Goal
Clients drop their real photos/logo into image slots so the finished package arrives with
build-ready assets — no asset-chasing emails.

## Success Criteria
- [ ] Clicking an image slot (or dropping a file on it) uploads jpg/png/webp; the image renders
      in the slot with a fit choice (cover/contain)
- [ ] Images are compressed client-side on ingest (long edge ≤1600px, reasonable quality) —
      keeps autosave payloads and the Stage 3 email package small
- [ ] Non-image/oversized files are rejected with a friendly message (validate at the boundary)
- [ ] Images persist through reload and the `.blueprint` round trip; a slot can also stay
      empty-with-description ("photo of our storefront") as a generate/none marker

## How We'll Verify
Unit: compression + validation paths (fixture files, incl. a real >5MB photo). E2E: upload a
fixture into a slot, assert render + persistence after reload; reject path shows the message.
Record below.

## Verification Log
_Empty — nothing verified yet._

## Open Questions
- Store as base64 in state vs IndexedDB blobs (localStorage quota pressure) — decide at build
  with real payload measurements; record here.

## Notes & Decisions
- Total-design size budget matters for Stage 3 email delivery — surface a running size
  indicator if cheap.
