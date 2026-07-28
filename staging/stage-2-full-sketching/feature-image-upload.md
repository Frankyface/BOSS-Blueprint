# Feature: Image Upload
_Stage: stage-2-full-sketching · Status: awaiting verification_

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

**Implementer run (2026-07-28):**

_Files:_ `src/canvas/imageAssets.ts` (accepted types, size cap, scaling maths, data-URL guard),
`src/canvas/imageCompression.ts` (the ingest algorithm, over injectable ports),
`src/platform/browserImagePorts.ts` (the `<img>`/`<canvas>` adapter),
`src/components/ImageSlot.tsx` (the slot: render, button, drop target, hidden file input),
`src/components/ImageSettings.tsx` (fit toggle, description, remove),
`src/components/BlockInspector.tsx` + `BlockContent.tsx` + `BlockView.tsx` (wiring, double-click),
`src/canvas/blockEdits.ts` (`withImageData` / `withImageFit` / `withImageDescription`, defaults,
equality), `src/canvas/blueprintBlock.ts` (per-field parsing), `src/store/canvasStore.ts`
(`setBlockImage` / `setBlockImageFit` / `setBlockImageDescription`), `src/canvas/types.ts`.

_Commands (all run on this machine, 2026-07-28):_

| Command | Result |
|---|---|
| `npm run lint` | clean, exit 0 |
| `npm test` | **619 passed** / 35 files (was 463 / 26 before this batch) |
| `npm run test:coverage` | exit 0 — `src/canvas` 99.7% lines, 99.52% funcs; `src/store` 96.96% lines, 97.14% funcs |
| `npm run build` | ✓ built, 263.19 kB (gzip 81.83 kB) |
| `npm run e2e` (×2) | **294 passed (3.1m)**, then **294 passed** — chromium + firefox + webkit |

_Unit coverage:_ `src/canvas/imageAssets.test.ts` (every accepted type, PDF/SVG/typeless
rejection, the 20MB cap and the empty file, long-edge scaling incl. portrait, never-enlarge, a
16000×20 banner that must not round to zero, data-URL guard against `svg+xml` / `text/html` /
`javascript:` / remote URLs); `src/canvas/imageCompression.test.ts` (validation before decode,
downscale, JPEG re-encode at q0.8 onto white, PNG kept only when smaller, WEBP encoded once,
decode failure becomes a readable message, the decoded image is released on both paths,
filename carried verbatim); `src/store/canvasStore.image.test.ts` (defaults, exact field set,
one-undo-step identity, no-ops, description survives removal, non-image blocks untouched);
`src/canvas/blueprintMedia.test.ts` (round trip incl. an awkward filename byte-for-byte,
pre-upload blocks default, injection URLs and an unknown `fit` are corruption, image fields are
dropped from non-image blocks); `src/store/imageQuota.test.ts` — the integration test that puts
five ~450KB photos in a design and proves the payload really does cross
`STORAGE_WARNING_BYTES` (4MB), that the `near-quota` notice fires, that the design is still
SAVED, that the notice clears when the photos go, and that everything survives a session restart.

_E2E_ (`e2e/image-upload.spec.ts`, ×3 engines, `test.slow()` on the decode-heavy tests). Fixtures
are **generated programmatically** by `makePhotoFixture` — a real JPEG drawn on a canvas inside
the browser under test and handed back to Node as bytes, so no binary files land in git and each
engine exercises its own encoder:
- `uploads a big photo, shrinks it, and shows it in the slot` — a 3000×2000 fixture, and the
  **stored data URL is decoded and measured: exactly 1600×1067**, long edge ≤ 1600; screenshot
- `keeps the photo, its filename and its framing through a reload`
- `switches how the photo fills its frame` — computed `object-fit` changes and survives reload
- `an upload is one undo step`
- `refuses a file that is not an image, and says so without losing the slot` — the toast names the
  file and the accepted formats; screenshot
- `refuses an absurdly large file before trying to decode it` (21MB)
- `an empty slot with a description is a "source an image" instruction` — the coaching placeholder
  and explainer copy are asserted, the description commits and survives reload, and the page
  itself shows the instruction
- `removing a photo keeps what the client said about it`
- `a double-click on the slot opens the picker` (asserted via the browser's `filechooser` event)

## Open Questions
- ~~Store as base64 in state vs IndexedDB blobs~~ **Decided at build:** base64 data URLs inside
  the document (see Notes) — measured, and the existing near-quota warning is the guardrail.

## Notes & Decisions
- **Storage format: `data:` URLs on the block, inside the document.** The image block carries
  `{ imageData, originalFilename, fit, description }`. Chosen over IndexedDB blobs because the
  whole product rests on the document being ONE serialisable JSON value: undo/redo snapshots it,
  autosave writes it, the `.blueprint` file is it, and Stage 3's `site.json` is generated from it.
  A blob store would need a parallel lifecycle in all four (and a way to garbage-collect orphans
  after an undo), for a design where the realistic ceiling is a handful of photos.
  **Export mapping:** §4.6 derives `img_NNN` assets from `imageData` at package time — `assetId`
  is the PUBLIC identity and is deliberately not stored here, exactly as internal page/block ids
  are remapped at export (§4.8).
- **Measured payload cost:** a 1600px-long-edge JPEG at q0.8 is ~250–400KB ⇒ ~340–550K base64
  characters ⇒ ~0.7–1.1MB of localStorage each (UTF-16). Five photos cross the 4MB `near-quota`
  line, which is the point of that warning — `src/store/imageQuota.test.ts` asserts exactly this,
  end to end through the real session wiring.
- **`originalFilename` is stored, verbatim.** §2.3/§4.6 require the asset manifest to carry the
  client's own file name, and it cannot be reconstructed at export — the compressed data URL has
  no memory of where it came from. Never trimmed, never sanitised, never used as a path; the
  export owns naming. It is cleared with the photo, so an emptied slot cannot leave a filename in
  the manifest for an asset that is not in the package.
- **Compression parameters:** long edge ≤ **1600px** (never enlarged — a 900px logo stays 900px),
  JPEG quality **0.8**, JPEG painted onto **white** first so a transparent source never comes out
  on black. A **PNG source is encoded both ways and the smaller wins** (screenshots and logos stay
  PNG; a photo someone saved as PNG becomes a JPEG a fraction of the size). **WEBP is re-encoded
  to JPEG, deliberately:** Safari only gained WEBP *encoding* recently and a silent encode failure
  there would be far worse than a slightly larger JPEG. Upload cap **20MB**; accepted types
  `image/jpeg`, `image/png`, `image/webp`.
- **The algorithm and the browser are separated by a port.** `compressImage(file, ports)` is pure
  orchestration and is unit-tested against fakes in jsdom (which has neither `<canvas>` nor image
  decoding); `src/platform/browserImagePorts.ts` is the thin `<img>` + `<canvas>` adapter, proven
  by the cross-engine E2E instead. `src/platform/**` is deliberately outside the coverage-gated
  globs for that reason — the same rationale `vite.config.ts` already gives for UI components.
- **Validation happens at the boundary, and rejection is a DESIGN message.** `validateImageFile`
  runs before any decoding, so a 21MB file is refused without loading it. Failures go to
  `DesignToast` (the design strip), never to `StorageNotice` (the saving strip) — the batch-1
  separation. Messages name the file and say what to do instead.
- **The stored data URL is validated on the way back IN, as a security boundary.** A `.blueprint`
  file is untrusted input, and a `data:image/svg+xml` or `data:text/html` URL rendered into an
  `<img>` on our own origin is a script-injection vector. `isImageDataUrl` accepts only base64
  payloads of the three raster MIME types; anything else is corruption.
- **Three ways in, one ingest path:** the button on the slot, a double-click anywhere on the slot
  (an image block has no inline text editor for that to collide with), and dropping a file onto
  it. The button stops its own `pointerdown` so the block's drag gesture cannot capture the
  pointer and swallow the click.
- **An empty slot with a description is a deliberate instruction, and the copy says so.** The
  inspector reads "No photo yet? That's fine — describe what should go here and we'll source or
  create it when we build your site. An empty box with a description is an instruction, not a
  gap", and the description shows on the slot itself. The placeholder coaches the answer:
  "What should this photo show? e.g. 'Our dining room at golden hour'".
- **The description is NOT alt text** (§2.7) and is never used as one: the rendered `<img>` is
  `alt=""` (decorative in the sketch), and the export writes real alt text FROM the description at
  build time, so client meta-commentary ("we'll take this next week") can never ship.
- **The description survives both upload and removal.** A client who uploads a stand-in and then
  removes it still meant everything they wrote about the picture they want.
- **Every image change is one undo step**, via `useCommittedField` for the description (one step
  per field, not per keystroke) and a single store write per upload — the compression finishes
  before the document is touched, so it never holds a half-processed photo.
- Total-design size budget matters for Stage 3 email delivery — surface a running size indicator
  if cheap. **Not built:** the near-quota notice already tells the client the one thing they can
  act on, and a live byte counter on every autosave is noise a non-technical client cannot use.
  Left for Stage 3, where the package size is the thing being sent.
