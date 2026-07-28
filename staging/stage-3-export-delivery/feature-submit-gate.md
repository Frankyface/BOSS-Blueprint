# Feature: Gated Submit + Download-First Delivery
_Stage: stage-3-export-delivery · Status: not started_

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
_Empty — nothing verified yet._

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
