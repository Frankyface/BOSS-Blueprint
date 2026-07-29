# Feature: Gated Submit + Download-First Delivery
_Stage: stage-3-export-delivery · Status: awaiting verification_

## Goal
The one button the whole product leads to. Submit captures the lead (name + email + business
name), runs the validator gate, produces the package, **always downloads it**, and walks the
client through the two-step completion — "1. Downloaded ✓ → 2. Email it to us" — with a
prefilled mailto and a copyable address.

Delivery follows debate #2 (`docs/decisions.md` 2026-07-28): the local Blob download **cannot
fail and is fully machine-verifiable**; the notification relay is a swappable port that ships as
a no-op stub in this stage and is wired LAST, per Cam. **Submit is fully functional with no
relay at all** — that is a Stage 3 DoD item, not a caveat.

## Success Criteria

### The gate (fields enforced only at submit)
- [ ] Submit collects **your name**, **your email** and **business name**, all required *here and
      only here* — the Site panel keeps its one calm hint and never nags while sketching
      (`feature-site-settings.md` Notes)
- [ ] Business name writes through to `siteSettings.businessName` (one source of truth, one undo
      step); it is not a second copy that can disagree with the design
- [ ] Empty or malformed entries are reported inline with `role="alert"`, and submission does not
      start (V8 — this is the lead gate, and it is client-facing form validation, not a bug path)
- [ ] A **spam honeypot** field is present, off-screen, `tabIndex={-1}`, `autoComplete="off"`,
      `aria-hidden`, and not named/typed like anything a password manager autofills. If it is
      non-empty the submission is refused — per `docs/roundtrip-protocol.md` §1.4 rule 4, filling
      it legitimately blocks — and the refusal still shows BOSS's email address so a false
      positive is never a dead end
- [ ] **V23 pre-flight:** before the client can send, any block still carrying
      `fromTemplate: true` is listed ("Some template placeholder text is still in your design —
      want to review it?") with jump links. It is a WARN: reviewing is offered, never forced; if
      they send anyway the brief's [N12] marker tells the builder to replace the filler

### The validator gate UI
- [ ] **BLOCK stops the submission** and shows the finding's client-facing message plus a
      **jump-to-block** control that returns to editing with the offending page open and the
      block selected (V5 "Tell us what to write here", V14 "Tell us what image goes here", V19
      "This text box is empty…", V26 if ruled). Bug-class BLOCKs (V1, V2, V6, V7, V12, V16, V21,
      V24) instead show "something went wrong" with the detail logged to the console — the client
      cannot fix a generator bug and must not be asked to
- [ ] **FIX applies silently and proceeds** (V3, V4, V11, V17, V20). The applied fixes are listed
      in the console and carried in the report, not paraded at the client
- [ ] **WARN ships and is listed** (V9-near-empty, V10, V13, V15, V18, V22, V23, V25 if ruled) —
      shown as a short "things worth knowing" list on the completion screen and carried into the
      notification payload for Cam
- [ ] Progress is visible during generation ("Rendering page 2 of 4…") because PNG rendering of a
      multi-page site is seconds, not milliseconds

### Download-first
- [ ] **The zip download is the first side effect after validation passes**, before any network
      call, and it happens whether or not a relay exists or succeeds
- [ ] The completion screen shows **step 1 as already done**: `Downloaded ✓ <filename> (~N KB)`,
      with a "Download it again" control that re-uses the retained Blob (no regeneration, no new
      UUID)
- [ ] **Step 2 — "Email it to us"** offers (a) a real `<a href="mailto:…">` prefilled with a
      subject carrying the business name and the uuid8 and a short body naming the exact file to
      attach, and (b) the address as **copyable text** with a clipboard button and a visible,
      selectable fallback. The app never auto-opens the mail client
- [ ] The submission UUID appears on screen so the client can quote it, and it matches the one in
      the filename, `site.json` and `brief.md`

### The DeliveryRelay port
- [ ] `DeliveryRelay` is an interface with one method; the app depends on the interface, never on
      a provider. Stage 3 ships **`NoopRelay`** — logs in dev, resolves `{ status: 'skipped' }`
- [ ] **Submit never awaits the relay before downloading**, and a rejected relay promise is
      caught and never shown to the client as a failure — the package is already on their disk.
      Only a `status: 'sent'` outcome adds a line to the completion screen
- [ ] The notification payload builder is a pure function producing the debate #2 shape
      (client name/email, submission UUID, page count, `brief.md`, gzipped `site.json`, plus the
      WARN list) with the **degrade ladder full → compressed → metadata-only** as a pure,
      unit-tested size decision — built and tested now even though nothing sends it yet, so
      wiring the real relay later is one adapter and no redesign

## How We'll Verify

1. **Unit (`npm test`)**
   - `src/export/delivery/relay.test.ts` — `NoopRelay` resolves `skipped`; a stub relay that
     rejects does not reject `submit()`; a stub that resolves `sent` surfaces the line. The
     submit orchestrator is called with a fake renderer/packer so this is fast and deterministic.
   - `src/export/delivery/payload.test.ts` — degrade ladder boundaries: a payload under the limit
     stays `full`; just over → `compressed`; far over → `metadata-only`; each variant still
     carries name, email, UUID and page count.
   - `src/export/delivery/mailto.test.ts` — subject/body encoding (spaces, `&`, newlines, a
     business name with `«»` and accents), total URL length under the named cap, and the exact
     filename appearing in the body.
   - `src/submit/submitFlow.test.ts` — the orchestration order is asserted with a call log:
     mint UUID → build `site.json` → FIX pass → **client-facing BLOCK checks** → render PNGs →
     V6 → brief → V7 → zip + ladder → V10/V12 → **download** → relay. A client-facing BLOCK
     short-circuits *before* any PNG is rendered (fail fast: rendering first would make the
     client wait ten seconds to be told their text box is empty).
   - `src/submit/honeypot.test.ts` — non-empty honeypot refuses; empty proceeds; the refusal
     message contains the fallback address.
2. **E2E — the happy path with NO relay (`npm run e2e`)** — `e2e/submit.spec.ts`, ×3 engines:
   build/seed a valid design, open Submit, fill the three fields, send. Assert: a download event
   fires and `suggestedFilename()` matches the convention; the completion screen shows
   `Downloaded ✓` with the same filename and a size within 1 KB of the file on disk; the mailto
   `href` starts `mailto:` and contains the uuid8; the copy button puts the address on the
   clipboard (read back via `navigator.clipboard.readText()` where the engine permits, else
   assert the fallback input's value); the UUID on screen equals `submission.id` in the
   downloaded `site.json`. **The relay stays bound to `NoopRelay` for this test** — this is the
   DoD item "submit is fully functional without any relay".
3. **E2E — BLOCK path** — seed a design with a `generate` block whose description is empty (V5)
   and a `real` heading with blank text (V19). Assert: no download event fires; both messages are
   visible with `role="alert"`; clicking a jump control returns to the canvas with the right page
   open and the right block selected (`data-selected` on the block). Then fix them in the UI and
   assert the submission now completes.
4. **E2E — FIX and WARN paths** — seed an external link typed as a bare domain (V11 FIX) and a
   page unreachable from the homepage (V15 WARN) plus an untouched template block (V23). Assert:
   the submission completes; the downloaded `site.json` has `https://` prepended; the completion
   screen lists the V15 and V23 warnings; the V23 pre-flight list appeared before sending and
   offered jumps.
5. **E2E — honeypot** — fill the hidden field via `page.evaluate` on the input's value (a bot
   would); assert no download and a refusal message containing the address. Then assert a normal
   scripted client run never touches it (the roundtrip driver's rule 4 must stay satisfiable).
6. **E2E — relay isolation** — bind a failing relay through the test-only seam and assert the
   download and the completion screen are unaffected and no error is shown.
7. **Accessibility spot-check** — with the form blank and untouched, `[role="alert"]` count is 0
   (matching the Stage 2 no-nagging convention); after a failed send it is non-zero and focus
   moves to the first finding.
8. Record commands, exit codes, filenames, sizes and screenshots below.

## Verification Log

### 2026-07-28 — built and exercised end to end (awaiting independent verification)

**Unit — `npx vitest run src/submit src/store/submitStore.test.ts src/export/delivery`**
→ 39 + 16 tests, 0 failed. Full suite: **1312 passed** (1203 before this batch).

- `src/submit/submitFlow.test.ts` (12) — the orchestration order is asserted with a
  literal call log:
  `['progress:checking', 'mint:uuid', 'progress:rendering', 'render:page-home',
  'progress:rendering', 'render:page-contact', 'progress:packaging',
  'progress:finishing', 'download:blueprint_bluebird-bakery_3f2a9c1e.zip', 'relay:send']`.
  A separate assertion pins the load-bearing property on its own: with a client-facing
  BLOCK seeded (V19 blank heading), **no `render:` entry appears at all** and no download
  happens. The download index is asserted to precede the relay index. The receipt's zip
  unzips to the §1 entry list; `ladderFired` is `false` on a normal package; a
  non-render error is rethrown rather than swallowed as a render failure.
- `src/submit/honeypot.test.ts` (9) — a non-empty decoy refuses, an untouched one
  proceeds, and `HONEYPOT_REFUSAL` contains `BOSS_SUBMIT_EMAIL`. The three fields report
  every problem at once; a missing email and a malformed one get different sentences.
- `src/submit/submission.test.ts` (6) — `browserRandomUuid` matches the schema's v4
  pattern via `crypto.randomUUID` **and** via the `getRandomValues` fallback (stubbed by
  removing `randomUUID` from `crypto`), including the all-zero and all-`0xff` byte cases,
  which is where a hand-rolled version/variant nibble would break.
- `src/submit/templateFiller.test.ts` (5) — the pre-flight walk agrees with the
  validator's `v23TemplateFiller` on the same design, and ignores a `section` carrying
  the flag exactly as §2.6 requires.
- `src/store/submitStore.test.ts` (8) — both refusals happen before any port is touched;
  the business name is read from `siteSettings` rather than copied; `jumpToBlock` opens
  the page, selects the block and closes the submit surface.
- `src/export/delivery/relay.test.ts` (3) — `NoopRelay` resolves `{ status: 'skipped' }`,
  never `sent`, and logs the payload it WOULD have sent through an injected sink.
- `src/export/delivery/payload.test.ts` (8) — the degrade ladder's boundaries are driven
  off the real serialized length: a limit one byte under the `full` payload's own size
  produces `compressed`; a limit of 1 produces `metadata-only`. Name, email, UUID, uuid8,
  page count, filename and the WARN list survive **all three** variants. The gzipped
  `site.json` inflates back to a deep-equal object and is byte-stable across calls
  (`mtime: 0`, so no wall clock in the gzip header).
- `src/export/delivery/mailto.test.ts` (8) — spaces, `&` and newlines are percent-encoded
  (the href contains no literal space or newline); a `«Café Ürsula»` business name
  survives a decode round trip in both subject and body; the exact package filename
  appears in the body; a 600-character business name still yields a URL under
  `MAX_MAILTO_URL_LENGTH` with the filename intact.

**Coverage — `npm run test:coverage`** → `src/submit` 93.33% statements, 95.83% lines,
96% functions; `src/store` 92.66% lines, 96.13% functions; `src/export` 94.03% statements,
97.43% lines, 100% functions. `src/submit/**` was ADDED to the 80% coverage gate in this
batch, with `src/submit/appPorts.ts` excluded under the same rule `src/platform/**`
follows (it is the one file that names a renderer, a download and a relay).

**E2E — `npx playwright test`** → **532 passed / 2 skipped** on chromium + firefox +
webkit, 7.4 min locally. `e2e/submit.spec.ts` (6 tests × 3 engines):

1. *the full journey* — seed a design, open Submit, and:
   - send with the business name missing → `submit-error-businessName` visible with
     `role="alert"`, the view stays on `data-screen="form"`, no progress, no download;
   - the V23 pre-flight lists exactly one block and shows its text (`123 Agricola St…`);
   - fill the business name and send → `data-screen="blocked"`, exactly two findings,
     one `data-rule="V05"` ("Tell us what to write here") and one `data-rule="V19"`
     ("This text box is empty"); clicking V19's jump returns to the canvas with
     `currentPageId === 'page-home'` and the block carrying `data-selected="true"`;
   - fix both **through the UI** (double-click + type for the heading, the block
     inspector's `copy-description` field for the generate block) and send again;
   - the download fires, `suggestedFilename()` matches
     `/^blueprint_[a-z0-9-]+_[0-9a-f]{8}\.zip$/`, and the unzipped entry list equals the
     expectation derived from the package's own `site.json`;
   - `node scripts/roundtrip/gate.mjs --package <zip> --no-manifest` **exits 0** and
     prints `GATE PASSED`; the same gate on a copy with an extra `notes.txt` exits
     non-zero naming **V12**;
   - the completion screen shows the filename, `~<round(bytes/1024)> KB` of the file's
     real size on disk, a `mailto:` href containing both the uuid8 and the filename, a
     copyable address, `submit-uuid` equal to the JSON's first 8 hex, both WARNs (V15
     "Nothing links to Contact", V23 template filler), **no** relay note, and the "stays
     saved here" reassurance;
   - "Download it again" re-issues the SAME filename and the SAME byte count.
2. *honeypot refuses* — filled through the native value setter (as a bot would), no
   download fires and the refusal carries an address with `role="alert"`.
3. *honeypot is never touched by a normal run* — value `''`, `tabindex="-1"`,
   `aria-hidden="true"`, bounding box off-screen to the left, and six successive Tab
   presses from the first field never land in it (protocol §1.4 rule 4 stays satisfiable).
4. *relay isolation* — `?submit-stub=relay-fail` makes the relay reject; the completion
   screen is identical, `[role="alert"]` count is 0, and the gate still exits 0.
5. *renderer failure* — `?submit-stub=render-fail` surfaces the typed V6 wording with a
   retry, fires no download, and offers no partial package.
6. *no nagging* — a freshly opened form has `[role="alert"]` count 0; after a failed send
   it is non-zero.

**Relay payload actually logged** (dev console, `NoopRelay`) —
`variant: 'full'`, `submissionId`, `uuid8`, `client: { name, email }`, `businessName`,
`pageCount`, `packageFileName`, `packageBytes`, `warnings: [{ rule, message }]`,
`brief`, `siteJsonGzipBase64`. Nothing was sent, and the UI never says otherwise.

**Blocked on Cam:** the destination address in `site.config.ts` is
`cammer3034@gmail.com`, the working address `help.md` already names. Confirming it or
swapping in a BOSS mailbox is a one-constant change and is now an open item in `help.md`.

## Open Questions
- **Where Submit lives.** **Recommendation: a dedicated Submit view that takes over the canvas
  area** with a "Back to editing" control — not a modal. Stage 2 rejected modals for the settings
  and nav panels for concrete reasons (focus trap + scroll lock behave differently in all three
  engines, and a modal covers the design), and here there is a second reason: BLOCK findings need
  jump-to-block, which means leaving the submit surface and coming back. A takeover view makes
  that a normal state change instead of a modal dance. The 304px side panel is too narrow for a
  form plus a findings list.
- **BOSS's destination email address** lives in `site.config.ts` beside the other deployment
  constants, not inline in a component. It is a public business address, not a secret.
- **`appVersion` source.** **Recommendation:** inject `package.json`'s `version` at build time via
  a Vite `define` constant, so the value in `submission.appVersion` and the brief header is the
  build's, not a hand-maintained string.
- **Clipboard permissions differ per engine.** WebKit restricts `readText()`. **Recommendation:**
  assert the write path where permitted and always assert the visible fallback input's value, so
  the test proves the client can get the address on every engine.
- **Should a successful submit clear the design or mark it submitted?** **Recommendation: no.**
  The client may resubmit after edits, and each submit mints a fresh UUID (§2.3). Autosave and
  Start Over keep their existing semantics untouched.

## Notes & Decisions
- **Binding contract:** `docs/decisions.md` 2026-07-27 "Access: public with gated submit" and
  2026-07-28 "Delivery: download-first hybrid" (the zip always downloads; DeliveryRelay port
  isolation; two-step completion UX; always-visible download receipt; UUID stamping; relay wired
  LAST). `docs/export-format.md` §5 for the rule outcomes and their audiences.
- **Fail fast, before the expensive part.** Client-facing BLOCK checks run before PNG rendering.
  Rendering a 4-page site takes seconds; making a client wait through it only to be told a text
  box is empty is the kind of small cruelty that makes people abandon a submission.
- **BLOCK messages have two audiences and must never be confused** (§5): things the client can
  fix get plain words plus a jump; generator bugs get "something went wrong" plus console detail.
  Showing a client an ajv error path is a failure of this feature, not of ajv.
- **The download is the receipt.** Debate #2's binding "always-visible download receipt": the
  completion screen states the filename and size and can re-issue the same Blob. Regenerating on
  "download again" would mint a second UUID and produce a second, different package — the one
  thing that would make Cam's inbox ambiguous.
- **The relay is a port so that wiring it later changes one file.** Its interface is defined and
  its payload builder (including the degrade ladder) is written and tested *now*, while the
  requirements are fresh, even though `NoopRelay` is all that ships. That is the difference
  between a seam and a promise of a seam.
- **The honeypot blocks, and that is deliberate** (`docs/roundtrip-protocol.md` §1.4 rule 4 —
  the scripted client is required to leave it untouched, and the harness relies on filling it
  being fatal). The mitigations against false positives are structural: an implausible field name,
  `autoComplete="off"`, no email/name typing, off-screen and unfocusable — plus a refusal message
  that still hands over the address.
- **`flushAutosave` finally gets its caller.** The Stage 1 close-out flagged it as a dead export
  kept for exactly this: an explicit save at submit, so a client who submits and closes the tab
  still has their design on next visit.
- **Nothing here weakens a success criterion to make a path pass.** If the validator blocks, the
  submission stops; there is no "send anyway" override. CLAUDE.md's rule about not weakening
  criteria applies to the product's own gates too — and V10's deliberate WARN-not-BLOCK is the
  one place the contract already made that call for us.

### Implementation calls (2026-07-28)

- **The rule-by-rule order is realised as TWO validator passes, and this is a deviation worth
  naming.** `validatePackage` is a whole-bundle pipeline, not a menu of individually callable
  stages, so the spec's "FIX → client BLOCKs → render → V6 → brief → V7 → zip → V10/V12"
  becomes: a **pre-flight** pass with no render/zip evidence (FIX pass, the brief, every
  client-facing and bug-class BLOCK that does not need pixels), then rendering, then packing,
  then a **final** pass carrying the render, staging and zip evidence (V6, V10, V12, V21). The
  load-bearing property is unchanged and is asserted directly: a client-facing BLOCK
  short-circuits before the first render. V6 is additionally enforced *at* render time by
  construction — the renderer's own sanity ladder throws `PngRenderError` rather than handing
  back a bad picture — so the final pass re-asserts it on the shipped artifacts rather than
  discovering it there. The rules that need evidence return `[]` when they have none, which is
  exactly the design `validate/types.ts` describes.
- **The completion screen appears BEFORE the relay settles.** `runSubmit` returns
  `{ kind: 'done', receipt, relayResult }` with `relayResult` a promise that never rejects; the
  store awaits it afterwards and only a `status: 'sent'` adds a line. Awaiting it inline would
  have let a future slow provider delay the one screen that is supposed to be unconditional.
- **`jumpTo` is translated once, in the flow.** The validator speaks in export ids
  (`pg_0001`/`blk_0007`) because that is what a package contains; the canvas navigates by
  internal ids. `submitFlow` inverts `buildExportPayload`'s remap and hands the UI internal
  ids, so no component knows the remap exists — and §4.8 rule 3 (internal ids never ship) is
  untouched, because the translation runs on findings, never on the package.
- **The business name is BOUND, not copied.** The form field is `useCommittedField` over
  `siteSettings.businessName` — one source of truth, one undo step, and the submit store holds
  only the two fields that genuinely belong to the submission (plus the honeypot).
- **Honeypot field name: `quill`.** Not `email2`, not `url`, not `company` — nothing a password
  manager or an autofill heuristic recognises. Off-screen via `position: absolute; left:
  -9999px` rather than `display: none`, because a bot that skips undisplayed inputs is exactly
  the bot the decoy is for; `tabIndex={-1}` and `aria-hidden` keep every human out of it, and
  the E2E proves six Tab presses never reach it.
- **Relay payload shape** (`buildNotificationPayload`, pure, degrade ladder full →
  compressed → metadata-only against a 64 kB budget — the smallest documented body limit among
  the free text relays debate #2 surveyed):
  ```
  { variant, submissionId, uuid8, client: { name, email }, businessName, pageCount,
    packageFileName, packageBytes, warnings: [{ rule, message }],
    brief: string | null,                 // `full` only
    siteJsonGzipBase64: string | null }   // `full` + `compressed`, gzip mtime 0
  ```
  The identity block is never shed: `metadata-only` always fits, by construction.
- **`appVersion` comes from `package.json` via a Vite `define`** (`__APP_VERSION__`), so
  `submission.appVersion` and the brief's header comment name the build that produced them.
- **BOSS's address lives in `site.config.ts`**, beside the other deployment constants — a
  public business address, not a secret, and one line to change (see the Verification Log's
  blocked-on-Cam note and the new `help.md` item).
- **The stub seam is a query string, not a window bridge** — `?submit-stub=render-fail |
  relay-fail | relay-sent`, behind the same inline `import.meta.env` guard
  `src/export/png/engineOrder.ts` uses. **Its SHAPE is load-bearing and was corrected after
  measuring:** the first version returned a mode string from the guarded function and branched
  on it outside, which left `submit-stub`, `render-fail`, `relay-fail`, `stub-failing` and the
  fake error class in `npm run build`'s bundle (grepped — the guard folded the URL parsing and
  nothing else, because the bundler cannot prove a returned value). Moving the fakes *inside*
  the guarded body, so it returns port overrides rather than a mode, folds the whole thing:
  re-grepped after the change, `submit-stub`, `relay-fail`, `stub-failing`,
  `__blueprintRenderPagePng`, `__blueprintStore` and `export-engine` are all **0 occurrences**
  in `dist/`, and the only surviving `render-fail` match is the product's own
  `kind: 'render-failed'` outcome. Production build 565.07 kB.
- **Submit takes over the whole editor body.** Not a modal (Stage 2's reasons), and not the
  304px panel (too narrow for a form plus a findings list). Unmounting the canvas costs
  nothing: the document lives in the store, and the PNG renderer mounts its own offscreen root.
