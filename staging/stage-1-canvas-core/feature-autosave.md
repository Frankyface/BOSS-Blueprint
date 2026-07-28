# Feature: Autosave
_Stage: stage-1-canvas-core · Status: verified done_

## Goal
Work never disappears. The design persists in the browser automatically; reload, crash, or
accidental tab close and the client picks up exactly where they left off.

## Success Criteria
- [x] Canvas state saves to localStorage, debounced (~1s after the last change)
- [x] Reloading the page restores the design exactly (blocks, positions, text, selection cleared)
- [x] Storage payload carries a `schemaVersion`; loading an unknown/corrupt payload fails safe
      to a fresh canvas WITHOUT overwriting the stored data (preserved under a `-recovery` key)
- [x] "Start over" control asks for confirmation, then clears the design and the stored state
- [x] Approaching the localStorage quota (large designs) shows a non-blocking warning rather
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
  stability → **132 passed (1.3m)**. _(Superseded — see the Bounce fixes entry below: the suite
  has since grown to 141 tests and was re-run twice on the fixed timeout config.)_
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
  - `src/store/autosave.test.ts` (8 tests, Vitest **fake timers**): nothing written at
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

**Bounce fixes (2026-07-28):**
All bounces were evidence-quality or scoping, not behaviour — the review passed every Success
Criterion on all three engines, using probes written from the spec rather than from this code.
Status stays `awaiting verification`; the stage-close reviewer re-verifies.

- **HIGH-1 — `npm run e2e` is reproducibly green now.** Shared with feature-undo-redo.md: the
  `[webkit] a 10-edit session` test was passing on margin against Playwright's 30s default.
  `test.slow()` had already landed on it in commit `5a0e6b3`, after the reviewed SHA. Re-recorded
  below from the fixed config.
- **Re-recorded E2E evidence, from the fixed config, at default settings:**
  `npm run e2e` → exit 0, **141 passed (1.5m)**; immediately re-run → exit 0,
  **141 passed (1.5m)**. 47 tests × chromium/firefox/webkit; the 30 autosave/recovery/start-over
  tests are inside that total.
- **MEDIUM-1 — the `near-quota` → notice wiring is now covered.** It was the one uncovered line in
  `canvasSession.ts` and it backs the "approaching the quota shows a non-blocking warning" Success
  Criterion, so it was exactly the wrong line to leave untested. New session test drives an
  oversized document (one Text block whose text alone carries the payload past
  `STORAGE_WARNING_BYTES`) through the real wiring and asserts BOTH halves: the notice is set to
  `near-quota`, and the payload still reaches storage byte-identical to the current document — a
  warning, not a refusal. `canvasSession.ts` is now **98.76% lines**; the single remaining
  uncovered line is the `typeof window === 'undefined'` guard, which jsdom cannot reach.
- **MEDIUM-2 — RULED AND WIRED: the design is flushed when the page goes away.** The Goal promises
  the work survives an "accidental tab close", and that was only true if the client happened to
  pause for a second first — a change made and then immediately closed died in the debounce timer.
  `startCanvasSession` now installs `pagehide` and `visibilitychange` listeners that call
  `autosave.flush()`, torn down with the session. `beforeunload` is deliberately NOT used: it is
  unreliable on mobile, is skipped when a page is discarded, and merely registering it
  disqualifies the page from the back/forward cache — a real cost for a guarantee it does not
  actually provide. 4 new unit tests: a block added and the tab closed immediately writes on
  `pagehide` without waiting out the debounce; the same on `visibilitychange` when
  `visibilityState` is `hidden`; nothing is written when the tab is merely becoming visible again;
  and the listeners stop firing once the session is torn down. `autosave.ts`'s `flush` doc comment
  now names the actual wiring point instead of describing it aspirationally.
- **LOW-4 — `startOver()` no longer clears a notice it does not own.** It called `setNotice(null)`
  unconditionally, which wiped the `unavailable` ("this browser will not let us save your work")
  banner — a standing fact about the BROWSER that clearing the design does nothing to fix, so
  dismissing it told the client their work was safe when it was not. Scoped the same way the save
  path already is, via a named `NOTICE_KINDS_RESOLVED_BY_START_OVER` set covering `near-quota`,
  `save-failed` and `recovered` (all three genuinely stop being true once the design and the
  quarantined file are gone). Tested both directions: the three owned kinds are cleared, and
  `unavailable` survives untouched.
- **LOW-2 — stale comments fixed.** `e2e/support/canvas.ts` said the E2E suite compiles under
  `tsconfig.node.json`; it has compiled under `tsconfig.e2e.json` since the project split, and
  that config's `include` is `e2e/**` only, which is the actual reason the storage keys are
  duplicated rather than imported. `canvasStorage.ts` now carries the matching pointer back, so
  whoever changes either key literal is told about the other copy.
  **LOW-3** — the Notes sentence claiming a "size check before the write" was wrong: the payload
  is measured and classified AFTER `setItem` returns successfully. Corrected below, along with the
  distinction that `near-quota` means "written, and getting big" while `quota-exceeded` means
  "nothing was written at all".
- Results after the fixes: `npm run lint` → exit 0 (including the new `design-assets/**` ignore) ·
  `npx tsc -b` → exit 0 · `npm test` → **17 files / 249 tests passed** (12.3s) ·
  `npm run test:coverage` → exit 0 with the 80% gate held (`src/canvas/**` 100% lines / 100%
  functions, `src/store/**` 96.24% / 95.34%) · `npm run build` → exit 0, 214.19 kB JS
  (gzip 67.57 kB) · `npm run e2e` → **141 passed** twice, as recorded above.
- The two new behaviours were checked for discrimination rather than assumed: removing the
  `pagehide` listener and un-scoping `startOver`'s `setNotice(null)` failed exactly those two
  tests and nothing else; both were then restored and the suite re-run green.

**Stage-close review (2026-07-28):**
Independent re-verification at `abba415` in a detached worktree, `npm ci` from scratch.
- `npm run lint` → exit 0 · `npm test` → exit 0, **17 files / 249 tests** (14.24s) ·
  `npm run test:coverage` → exit 0, `src/canvas/**` 100%/100%, `src/store/**` 96.24%/95.34%,
  `canvasSession.ts` **98.76% lines** with only the `typeof window === 'undefined'` guard
  uncovered · `npm run build` → exit 0, 214.19 kB JS.
- **HIGH-1 (shared) RESOLVED:** e2e ×2 → 141 passed both runs; the 30 autosave/recovery/
  start-over tests green in both, zero retries.
- **MEDIUM-2 (pagehide flush) re-verified deterministically:** in one synchronous JS turn — no
  timer can fire mid-probe — add block → `localStorage` read (**null**, debounce has NOT fired)
  → `dispatchEvent(new Event('pagehide'))` → payload present with the new block. Repeated via a
  real palette click, and via `visibilitychange` with `visibilityState='hidden'`. All three
  engines. The `before === null` read makes it non-vacuous. `beforeunload` confirmed absent
  (bfcache decision).
- **MEDIUM-1 (near-quota) confirmed wired and covered** at `canvasSession.test.ts:276-281` —
  drives an oversized document through the real store + storage adapter, asserts BOTH the
  `near-quota` notice and that the payload still reached storage. Proven at integration level
  (a >4 MB Playwright payload is impractical); the "non-blocking" half IS E2E-proven via the
  `recovered`/`save-failed` notice kinds.
- **LOW-4 confirmed in source:** `NOTICE_KINDS_RESOLVED_BY_START_OVER` (canvasSession.ts:249)
  covers near-quota/save-failed/recovered, applied at :274 — `unavailable` survives Start over.
  LOW-2/LOW-3 comment corrections spot-checked.
- **Reload-restore re-proved beyond the shipped spec:** all SIX block types added, arranged,
  text-edited through the real editor, reloaded — store and DOM `toEqual` pre-reload, selection
  cleared, three engines. (Committed `buildPage` covers four of six — addendum assigned to the
  Stage 2 batch so the DoD item gains a committed regression test.)
- CI green (run `30374106775`); live 200, deployed bundle byte-identical to local build.
- **Verdict: VERIFIED DONE.**

**Addendum — the tab-close guarantee now genuinely holds for text fields (2026-07-28):**

Status stays `verified done`; this records a fix to a hole in the Goal's own promise, found by
the batch-1 review as HIGH-3 and fixed once, at the hook layer, during the review-fix batch.

_The hole:_ "accidental tab close and the client picks up exactly where they left off" was true
for anything that had reached the store, but every text field in the editor keeps a LOCAL draft
and commits once, on Enter or blur (`useCommittedField`, and `BlockTextEditor` before it) — that
is what makes a typed sentence one undo step instead of forty. A field the client was still
typing in had therefore never reached the store, so `installFlushOnHide` dutifully flushed a
document that did not contain what was visibly on the screen. The most exposed were the "about"
and "style notes" textareas, which do not commit on Enter at all: the client's longest answers
were the likeliest to be lost.

_The fix (`src/store/canvasSession.ts`):_ `installFlushOnHide` now calls `commitOpenDrafts()`
**before** `autosave.flush()`. It blurs the focused input/textarea/contenteditable, which fires
the commit path those components already have, synchronously — so the store is updated, the
subscriber schedules the save, and the flush then writes the client's last sentence. Deliberately
NOT a registry of live field instances: blurring works for fields nobody remembered to register,
and keeps one rule about when a draft becomes real.

_Evidence:_ five unit tests in `canvasSession.test.ts` (`saving when the page goes away`) driving a
real focused element and a real blur handler — draft committed before the flush on `pagehide` and
on `visibilitychange → hidden`, exactly one history step (the same as blurring by hand), a focused
button left alone, and nothing focused at all not throwing. Plus `e2e/draft-rescue.spec.ts`, ×3
engines, one test per surface: the site "about" textarea, business name + style notes together, a
colour slot, a copy block's "write it for me" description, a half-typed button URL, an image
description, and the inline block text editor — each types WITHOUT blurring, fires the real
`pagehide` event, reloads, and asserts the value is there.

_Confirmed to be a real fix, not a passing test:_ with `commitOpenDrafts()` removed and the bundle
rebuilt, all 7 E2E tests fail and 3 of the 5 unit tests fail; restored, all pass.

**UX hardening (2026-07-28):**
Two follow-ups from the batch-1 re-verification, both in the flush-on-hide path. Status
unchanged (`verified done`).
- **The pagehide flush is now `try { commitOpenDrafts() } finally { autosave.flush() }`.**
  `commitOpenDrafts` blurs whatever field has focus, which runs a blur handler this module does
  not own — any field in the app, now or in a future batch. A throw in one of them used to take
  the autosave down with it, and the tab was already going away: the client would have lost the
  whole session's work, not just the sentence the broken field was holding. Worst case is now
  the sentence.
- **`e2e/draft-rescue.spec.ts` test 2 renamed and strengthened.** It was called "the business
  name and style notes, typed and abandoned together", but only ONE field can be focused: filling
  the name and moving to the notes blurs the name, which commits it the ordinary way. It is now
  "the style notes left open after the business name was committed by blur", and it asserts both
  halves explicitly before the tab closes (name already in the store, notes still empty) instead
  of quietly proving something weaker than its title.
- Evidence: `npm run test:coverage` exit 0 (43 files / 934 tests; `src/store` 96.99% lines) and
  `e2e/draft-rescue.spec.ts` green ×3 engines in both full E2E runs.

**Storage-quota messaging (2026-07-28, live UX audit MAJOR):**
The audit filled localStorage with photos — the 9th one pushed a real browser past ~5MB — and
reported blocks that rendered but vanished on reload. Status unchanged; the change is what we
SAY and what we offer when that happens. Explicitly NOT changed: the 5MB reality, the warning
threshold, or where the design is stored (out of scope, and none of them is fixable in a
browser).
- **Both quota messages now lead with "download your design".** The old ones advised _"consider
  starting a fresh page soon"_ and _"delete a few blocks or start over to free some room"_ —
  pointing a worried client at the single most destructive control in the app, and never
  mentioning the one action that loses nothing. Downloading does not touch localStorage, so it
  works exactly when saving has stopped (the auditor's own probe rescued a 6.4MB design that
  way). Freeing room is now the second sentence, phrased as how to carry on HERE.
- **The notice carries the button, not just the advice.** `StorageNotice` renders a "Download
  design" action for `near-quota`, `save-failed` and `unavailable` — the kinds where the browser
  has stopped being a safe place to keep the work. `recovered` deliberately does not get it: that
  message means we could not READ a payload, so the design on screen is an empty page and
  offering to download it would hand the client an empty file and call it a rescue. The button
  goes through the same `downloadDesignAndAnnounce` as the header, so the two cannot drift.
- **"Does the notice genuinely appear on a dropped write?" — verified, on the path that causes
  it.** Traced in source (`saveDocument` catches the quota error → `reportSave` → `setNotice`;
  nothing swallows it) and pinned by a new integration test in `imageQuota.test.ts` that
  reproduces the audit's sequence exactly: one photo saved, the browser then refuses writes, a
  second photo is ACCEPTED BY THE STORE and the autosave that follows is dropped. It asserts the
  `save-failed` notice appears, that its wording leads with downloading and never says "start
  over", that the photo is still in the store (unsaved, not lost), and that what is on disk is
  still the one-photo design. Two more tests pin the near-quota wording and the notice's own
  rescue button (`StorageNotice.test.tsx`, +5 including a real download through a faked
  `downloadTextFile`).
- **`canvasSession.ts` was split** to stay under the 400-line source ceiling: every sentence the
  client reads about storage, plus the two precedence rules for when one notice may replace
  another, now lives in `src/store/storageNotices.ts` (`noticeForSave`, `noticeForLoad`,
  `reportSave`, `clearNoticesResolvedByStartOver`). A real division rather than a filing
  convenience — the session file is the wiring (history, autosave, flush-on-hide), and this is
  the copy. 322 + 121 lines, no behaviour change, all 934 unit tests and both E2E runs green
  across the split.
- **One hole stays open, and is not closeable here:** the flush on `pagehide`. If THAT write is
  the one the browser refuses, the notice is set into a page that is already going away and the
  client never sees it. Nothing can be shown at that point without `beforeunload`, which this
  feature ruled out on purpose (see Notes). The near-quota warning arriving 1MB earlier is what
  stands between a client and that case.

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
- **Quota**: the payload is measured and classified AFTER `setItem` returns successfully — a
  write that lands but exceeds 4 MB of the ~5 MB every browser allows (UTF-16, so bytes =
  characters × 2) is reported as `near-quota`, so the client is warned while there is still room.
  A real `QuotaExceededError` — under any of its three engine-specific names/codes — means nothing
  was written at all and surfaces as a red "could NOT be saved" banner. Never a silent failure. The banner is `role="status"`, dismissible, and never blocks the canvas.
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
- **The debounce is flushed on `pagehide` and `visibilitychange`, never on `beforeunload`.** That
  is what makes "accidental tab close" in the Goal literally true rather than true-after-a-pause.
  `beforeunload` was ruled out on purpose: unreliable on mobile, skipped when a page is discarded,
  and registering it at all costs the page its back/forward-cache eligibility.
- **`startOver()` clears only the notices the cleared design made obsolete** (`near-quota`,
  `save-failed`, `recovered`). `unavailable` survives, because "this browser will not let us save
  your work" is a fact about the browser and is still true afterwards.
