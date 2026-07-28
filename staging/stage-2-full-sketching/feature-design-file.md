# Feature: Design File (download / import)
_Stage: stage-2-full-sketching · Status: awaiting verification_

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

### 2026-07-28 — implementer evidence (batch 3)
Built and measured locally; independent verification still owed.

**Unit — `npm run test:coverage`:** 40 files / **805 tests green**. Of those:
- `src/canvas/designFile.test.ts` — **23 tests**: the slug rule (accents folded, punctuation
  collapsed, capped at 60 chars, never a trailing hyphen, `my-site` fallback for the empty
  business name templates deliberately ship), the extension check, the size and empty-file
  guards, and `interpretDesignFile` across a real design, a schema-1 migration, nonsense, an
  empty object, a page-less design, a `data:text/html` payload smuggled into an image slot, and
  a future `schemaVersion` — every refusal naming the file and saying the design is untouched.
- `src/store/designFileSession.test.ts` — **16 tests** through the real session wiring (only
  `<a download>` and `Blob.text()` faked): the saved payload is byte-identical to
  `serialiseDocument(getCanvasDocument())`, an embedded photo rides along verbatim, a file opens
  deep-equal onto an empty page, a photo round-trips, opening is not an undo step
  (`history.past` empty), a schema-1 file migrates through the FILE route and says so, the
  confirm/cancel path leaves `pages` **identical by reference**, a file that will be refused is
  never confirmed about, a non-design is refused **without being read at all**, and a browser
  that refuses to hand the file over is survived.
- `src/canvas/blueprintFile.test.ts` — the serialiser side, unchanged plus the new flag cases.

**Coverage gates:** `src/canvas/**` 99.73% lines / 99.55% functions · `src/store/**` 96.87% /
97.34% (gate 80/80). `src/store/designFileSession.ts` 100% lines / 100% functions.

**E2E — `npx playwright test`, all three engines: 134 tests × 3 = 402 green**
(chromium 38.6s · firefox 1.4m · webkit 3.0m). `e2e/design-file.spec.ts` adds **11**, all
through real browser downloads and real `setInputFiles`:
- download names the file `the-copper-pot.blueprint` from the business name, its bytes parse to
  `schemaVersion: 2` with `{pages, siteSettings}` **deep-equal to the live document**, the photo
  is inside the file (`data:image/…`), and the toast says where it went
- download falls back to `my-site.blueprint` before the business name is filled in
- **the round trip:** build a design (settings, two pages, nav/heading/text blocks, a real
  uploaded photo) → download → "Start over" → import the downloaded bytes → **deep-equal**, the
  photo drawn on the page, and still deep-equal after an autosave and a reload
- confirm-before-overwrite: the prompt appears, the design is untouched while it is up, "Keep
  what I have" changes nothing, "Yes, open it" replaces
- opening is a starting point, not an undo step (undo disabled afterwards)
- a schema-1 `.blueprint` **migrates through the file route** and the toast says it was brought
  up to date
- a design can be **dropped onto the editor** instead of picked
- a truncated file is refused with a friendly message, no confirmation is ever offered, and the
  design on screen is untouched
- a future-`schemaVersion` file is refused rather than half-read
- a `data:text/html` "photo" in an otherwise valid file is refused, and `'pwned' in window` is
  false afterwards
- a `.txt` is named and refused

**WebKit headroom:** slowest is the full round trip at 23.3s; that test and the three other
download/drag-drop tests carry `test.slow()` (90s budget). Everything else is ≤8s.

**Build:** `npm run build` clean (294.85 kB / 90.99 kB gzip). `npm run lint` clean.

_Not yet verified:_ deployed-site behaviour (CI/live check follows the push) and independent
review.

## Open Questions
- none yet — revisit when starting.
  → Still none. The format questions were all settled in batch 1; this feature added a file
    name, a size guard and the words a client reads, nothing about the payload.

## Notes & Decisions
- Same serializer module as autosave (see feature-autosave Notes) — one format, three uses
  (storage, file, Stage 3 export input).

### Where the controls live
- **In the header bar, right-aligned: "Open design" and "Download design"** (`DesignFileControls`).
  Not the canvas toolbar — that toolbar is about the selected block and the page being drawn,
  while these two are about the WHOLE design and are used once at the start and once at the end
  of a session. The header was empty on the right, never scrolls away (App.css pins it), and is
  where every tool a client has already used puts Open and Save. Burying them in a menu would
  hide the one control that answers "what if I close this tab?".
- **Drag-and-drop lands on the whole shell**, not on the canvas: a client drags a file at the
  editor, not at one rectangle inside it. Two guards keep it out of everyone else's way — a drop
  an image slot has already claimed (`event.defaultPrevented`) is not reinterpreted, and any file
  whose name is not `.blueprint` falls through untouched.
- **The overwrite confirmation is its own component** driven by `pendingImport` in `editorStore`,
  not local state inside the button. The same "are you sure" has to serve both ways in — the
  header's picker and a dropped file — and two copies of it would eventually disagree.

### Shape and boundaries
- **`src/canvas/designFile.ts` is pure** (naming, the extension/size/empty guards, the
  parse-result → client-sentence mapping) and coverage-gated. **`src/platform/designFileIo.ts`**
  holds the two calls jsdom cannot run (`Blob` + `URL.createObjectURL` + `<a download>`, and
  `Blob.text()`), under the same rule `browserImagePorts.ts` already documents: adapters hold no
  decisions and are proven by the cross-engine E2E. Both are injectable, so
  `designFileSession.ts` — including every refusal path — is unit-tested in jsdom against fakes.
- **Nothing here serialises or validates anything itself.** Download is
  `serialiseDocument(getCanvasDocument())`; import is `parseBlueprint`, which already carries the
  schema-1 migration and the `data:` URL check that keeps a `data:text/html` "photo" out of an
  `<img>` on our own origin. One format, three uses — this feature only adds the boundary rules a
  FILE brings.
- **Order is always validate → read → parse → (ask) → apply.** Confirmation comes AFTER parsing
  because there is no point asking a client to risk their work for a file that turns out to be a
  photo, and a refusal arriving after they already said "yes, overwrite" reads like a failure.
  The design on screen is not touched until the final step, which is why the cancel test can
  assert `pages` is the same object by reference.
- **An empty page is not asked about.** With nothing to lose the prompt is ceremony; anything
  else — blocks, pen marks, a second page, even just a business name (`selectHasContent`) — gets
  the two-step confirmation the rest of the editor uses.
- **Opening goes through `openDesign`, the same door a starter template comes through.** Flagged
  as a replay so it does not land on the undo stack it replaces: Ctrl+Z straight after opening a
  file must not silently restore the design it just replaced. Autosave still runs, so an opened
  design survives a reload with no second persistence path.
- **File name = `slugify(businessName) || 'my-site'` + `.blueprint`,** by the export's own §4.1
  slug rule so the file a client keeps is named the way their package will be. `my-site` is not
  an edge case: templates ship `businessName` empty on purpose, so it is the normal name for
  anyone who downloads before filling the settings in.
- **Refused by extension before being read.** `parseBlueprint` is the real validation, but the
  name check is what turns dropping a holiday photo on the editor into a sentence instead of a
  silent nothing — and it is why a 900MB video never reaches the reader. Belt and braces: a 20MB
  cap too, well above any realistic design and well below "hang the tab".
- **Every message names the file and says the current design is untouched.** That is the one
  thing a client needs to know when an open fails, and it is asserted in both the unit and E2E
  refusal tests. Failures go to `DesignToast` (the design strip), never `StorageNotice` (the
  saving strip) — the batch-1 separation.
- **The object URL is revoked on a 60s timer, not in the same tick.** Revoking immediately is the
  usual advice and it is wrong here: WebKit starts the download asynchronously after the
  synthetic click, and pulling the URL out from under it cancels the save silently. The anchor is
  also appended to the document before clicking, which Firefox requires.
