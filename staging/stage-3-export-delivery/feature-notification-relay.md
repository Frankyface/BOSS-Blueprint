# Feature: Notification Relay (the real adapter behind the port)

_Stage: stage-3-export-delivery · Status: awaiting verification_

## Goal

Wire a REAL relay behind the `DeliveryRelay` port that Stage 3 shipped as a stub, so that when a
client submits, Cam gets a **kilobyte-scale text notification** — "a package exists, here is who
made it and what is in it" — without anything about the client's experience changing.

Binding shape (`docs/decisions.md` 2026-07-27 debate #2, download-first hybrid):

- the notification carries **client name/email, submission UUID, page count, `brief.md`, gzipped
  `site.json`**, with the degrade ladder **full → compressed → metadata-only** whose bottom rung
  always fits;
- it is **TEXT-ONLY**. The zip NEVER rides the relay — no free text tier carries attachments
  reliably, and silent attachment loss at the product's decisive moment is what the debate
  disqualified;
- it goes out **after the download has already happened**, is never awaited before it, and can
  never fail the submission;
- the completion screen may only say "we have also been notified" on a **genuine 200**. A relay
  that was skipped, refused or never fired says NOTHING. No lie on screen, ever.

This feature is **deferred by Cam's own sequencing ruling** — it is explicitly not in the Stage 3
Definition of Done, and Stage 3 closed `verified done` without it. Its non-negotiable constraint is
therefore the inverse of a normal feature's: **with no configuration present, the app must behave
EXACTLY as it does today, byte for byte, with zero new network calls.** The live gauntlet, the
round-trip runs and the Stage 3 DoD all rest on the shipped no-relay path, and none of them may
move because this landed.

## Success Criteria

### Config gating (the shipped state is OFF)

- [x] One constants block — `BOSS_RELAY` in `site.config.ts`, beside `BOSS_SUBMIT_EMAIL`, the same
      "one place to change it" pattern — holding the provider endpoint and key, **shipping EMPTY**
- [x] With the empty config the app binds **`NoopRelay`, constructed exactly as today**, with the
      same injected log sink: same status (`skipped`), same console line, same screen, **no fetch**
- [x] A config that is *touched but wrong* (endpoint that is not an absolute URL, https required
      off localhost, a credential field named but left blank) binds `NoopRelay` too and logs a
      named problem list — a typo must degrade to today's behaviour, never to a broken request
- [x] With a valid config the relay fires **after** `ports.download` has returned and is never
      awaited by the completion screen; a rejection is still swallowed by `submitFlow`

### The adapter (ONE module, provider-agnostic)

- [x] A single generic **form-POST adapter**: HTTPS POST, JSON body, credential carried in the
      body, `response.ok` = accepted. That is the whole shape of the free-tier text-POST class
      (Web3Forms / FormSubmit-ajax / Formspree / EmailJS REST), so one adapter plus a config record
      covers whichever Cam picks — **no provider is named anywhere in the code**
- [x] Config absorbs the per-provider differences: `endpoint`, `credential`, the field NAMES
      (credential/subject/name/email/message/honeypot), `staticFields` a provider requires, and
      `nestFieldsUnder` for providers that nest the human fields under one key (EmailJS)
- [x] Status mapping: 2xx → `sent` · 4xx/5xx → `failed` with the code in `detail` · network
      throw → `failed` (**resolved, never rejected** — the adapter owns its own failure)
- [x] `keepalive: true` on the request, because the client may close the tab the moment their
      download lands — and that is also the honest reason the byte budget is 64 kB

### The degrade ladder, wired to the real body

- [x] The ladder is measured against the **actual request body**, not the payload object: subject
      + message text + static fields are part of what the provider has to accept
- [x] `full` → (over the provider limit) `compressed` (drops `brief.md`) → (still over)
      `metadata-only` (drops the gzipped `site.json` too)
- [x] **The bottom rung is sent unconditionally.** It is bounded by a name, an email and four
      numbers, so "always fits" is a property of its shape, not a measurement we hope holds
- [x] Every rung still carries the identity block: name, email, submission UUID, uuid8, business
      name, page count, package filename and size, and the WARN list

### Content and privacy

- [x] The **submission UUID is in the subject line** (`BOSS Blueprint — <business> — <uuid8>`) so
      Cam can match a notification to the zip the client emails him without opening either
- [x] The message body is plain text: identity block, the WARN list, then `brief.md` verbatim
      (full only) and gzipped-base64 `site.json` (full + compressed), each under a labelled marker
- [x] **The honeypot value is forwarded** as the provider's own bot-check field — and the adapter
      **refuses to send at all** if it is non-empty, resolving `skipped` before any fetch. The
      store already refuses a tripped honeypot before the pipeline starts; this is belt and braces
- [x] **No PII beyond what the client typed into the submit form** — no IP, no user agent, no
      timestamps beyond the ones already inside `site.json`, no analytics, nothing derived

### Nothing else moves

- [x] `npm run lint`, `npm test`, `npm run test:coverage`, `npm run build`, `npm run e2e` green
- [x] `src/export/**` stays at ≥80% lines and functions with the new modules inside the gate
- [ ] `npm run roundtrip:smoke` still passes (this touches `src/export/**`) — **BLOCKED, not
      skipped**: the harness stops at its own PRECONDITION with `401 OAuth access token has
      expired`, the Cam-only blocker already standing in `help.md`. Nothing was built, so there is
      nothing to score. See the Verification Log for what stands in for it

## How We'll Verify

1. **Unit — the adapter (`src/export/delivery/formRelay.test.ts`)**, with `fetch` injected as a
   port (no global stubbing): 200 → `sent`; 400/422 → `failed` carrying the code; 500 → `failed`;
   a rejected fetch → `failed` **without rejecting**; the request is a POST to the configured
   endpoint with the configured credential field, the mapped human fields, the static fields, and
   the nested-fields variant when `nestFieldsUnder` is set.
2. **Unit — the ladder rungs**: a config limit above the full body keeps `full`; one byte under the
   full body's real length yields `compressed`; a limit of 1 yields `metadata-only` **and still
   sends** (the always-fits bottom rung — asserted as a sent request, not just a chosen variant).
3. **Unit — the honeypot**: a payload with a non-empty honeypot resolves `skipped` and `fetch` is
   never called; the empty honeypot rides along in the mapped bot-check field.
4. **Unit — config gating (`src/export/delivery/relayConfig.test.ts`)**: the shipped `BOSS_RELAY`
   is untouched, so `createConfiguredRelay` returns a relay whose `id` is `noop`; a touched-but-
   invalid config also returns `noop` **and** logs the problems; only a valid config returns the
   form relay. Endpoint rules: absolute URL required, `https:` required off localhost.
5. **Unit — payload additions (`payload.test.ts`)**: `honeypot` survives the builder; demoting a
   payload is pure (the source object is unchanged) and never promotes.
6. **E2E ×3 engines (`e2e/notification-relay.spec.ts`)**
   - *unconfigured is byte-identical to today* — a full submit with the shipped config, with every
     request the page makes recorded via `page.on('request')`. Assert: **zero** cross-origin
     requests and zero requests to the relay path; the download fires; the completion screen is
     the same; **no** `submit-relay-note`.
   - *configured, 200* — the E2E-only seam injects a test config pointing at a same-origin path
     that `page.route` fulfils **after a deliberate delay**. Assert: the completion screen and the
     filename are up and the note is ABSENT while the relay is still in flight (proving nothing
     waits on it), then the note appears; the intercepted body carries the uuid8 in the subject,
     the credential field, and no key outside the expected set.
   - *configured, 500* — same seam, route fulfils 500. Assert: no note, **no error anywhere on
     screen** (`[role="alert"]` count 0), the mailto link and copyable address unaffected.
7. **Zero-behaviour-change proof, recorded**: the E2E request log for the unconfigured run, and
   the diff showing `appPorts.ts` still constructs `createNoopRelay` with the same log sink.
8. **Real inbox — CANNOT RUN HERE.** There is no relay account (`help.md`). Everything above is
   mock-verified; the sent-to-inbox leg is Cam's, and the status stays `awaiting verification`
   until he runs it. Nothing in this file may be read as "an email arrived".

## Verification Log

### 2026-07-29 — built and mock-verified; the real-inbox leg is Cam's (awaiting verification)

**What cannot be claimed.** There is no relay account, so **no notification has ever reached an
inbox and this session did not send one.** Every "sent" below is a `200` from a mock this spec
controls. The remaining step is listed under *What Cam does next*.

**Unit — `npx vitest run src/export/delivery`** → 6 files, **68 passed**. Full suite
`npm test` → **1685 passed / 2 skipped** (1636 before this batch, +49).

- `formRelay.test.ts` (22) — the request is a `POST` to the configured endpoint with
  `keepalive: true` and `Content-Type: application/json`; the body carries `access_key`, the
  mapped name/email/subject/message, and the subject contains `3f2a9c1e`. Status mapping is
  table-driven: `200`/`202` → `sent`; `400`/`422`/`500`/`503` → `failed` with the code in
  `detail`. A **rejecting** fetch resolves `{ status: 'failed' }` and logs — it does not throw.
  The renamed/nested/static-field configs produce EmailJS-shaped bodies
  (`user_id` + `service_id` + `template_id`, human fields under `template_params`) from the same
  adapter. Ladder: the full body stays `full`; a limit of `full.byteLength - 1` yields
  `compressed`; a limit one under THAT yields `metadata-only`; a limit of **1** still **sends**,
  and the sent message still contains `Dana Whitfield`, `dana@bluebirdbakery.ca`, `3f2a9c1e` and
  `Pages:     2`. A payload that arrived already degraded never climbs back up.
- The closed-key-set assertion is the privacy test: the posted body's keys sort to exactly
  `['access_key','botcheck','email','message','name','subject']` — nothing derived, nothing
  observed, nothing the client did not type.
- Honeypot: a filled decoy resolves `{ status: 'skipped', detail: 'honeypot filled — nothing
  sent' }` with **zero** fetch calls; an empty one is forwarded as `botcheck: ''`.
- `relayConfig.test.ts` (13) — the first assertion is the gate: the **shipped** `BOSS_RELAY` has
  an empty endpoint and key, `isRelayTouched` is `false`, and `createConfiguredRelay` returns a
  relay whose `id` is `noop` while `fetch` is never called and only the Stage 3
  `NOOP_RELAY_LOG_PREFIX` is logged. A touched-but-broken config (`endpoint: 'api.example.com'`,
  blank key) also returns `noop` and logs BOTH problems under `RELAY_MISCONFIGURED_PREFIX`.
  `http:` is refused for a real host and allowed for `localhost`/`127.0.0.1`.
- `notificationText.test.ts` (11) — subject is
  `BOSS Blueprint — Bluebird Bakery — 3f2a9c1e`; a 400-character business name is truncated but
  the reference survives inside the 120-char cap. The body's identity block, the `[V15]`/`[V23]`
  warning lines, the two markers, and the metadata-only "too large for this notification" line
  are each asserted.
- `payload.test.ts` (+7) — `honeypot` defaults to `''` and rides every rung;
  `demoteNotificationPayload` sheds in order, **leaves the source object untouched** (immutability),
  and returns the same reference rather than promoting.

**Coverage — `npm run test:coverage`** → exit **0**. `src/export/delivery` **97.22% lines /
100% functions / 96.96% statements** (the whole `src/export/**` glob stays over its 80% gate);
`src/submit` 95.83% lines / 96% functions, unchanged.

**Lint / typecheck / build** — `npm run lint` clean, `npx tsc -b` clean, `npm run build` clean.

**THE ZERO-BEHAVIOUR-CHANGE PROOF** (three independent angles):

1. *Runtime, in three engines.* `e2e/notification-relay.spec.ts` records **every** request the
   page makes via `page.on('request')` across a complete submit on the shipped config, then
   asserts the set of `http(s)` requests outside the app's own origin is `[]` and that nothing
   hit the relay path. The download fires, the completion screen is unchanged, and
   `submit-relay-note` has count 0 — as does `[role="alert"]`.
2. *Construction.* `appPorts.ts` now calls `createConfiguredRelay(BOSS_RELAY, …)`, which for an
   untouched config returns `createNoopRelay({ log })` — the identical object the previous line
   built, with the identical injected sink. Asserted directly in `formRelay.test.ts`.
3. *Bundle.* `grep -c "relay-live\|__relay-e2e\|e2e-not-a-real-key" dist/assets/*.js` after
   `npm run build` → **0** in all three chunks. The E2E seam folds away exactly like the existing
   `render-fail` / `relay-fail` stubs.

**E2E — `npm run e2e`** → **687 passed / 3 skipped, exit 0**, chromium + firefox + webkit, 6.2 min
(678 before this batch, +9). `e2e/notification-relay.spec.ts`, 3 tests × 3 engines:

1. *the shipped state* — as described in the proof above. Green in all three engines.
2. *configured, 200* — the seam injects a config pointing at a same-origin `__relay-e2e` path;
   the route handler **holds the response open** (a gate, not a timer, so the ordering claim is
   not a timing race). While it is held: `submit-complete` is visible, `submit-filename` equals
   the real `suggestedFilename()`, and the note has count 0. Release → the note appears reading
   "been notified". The intercepted body then proves itself: keys exactly the six above,
   `access_key === 'e2e-not-a-real-key'`, the subject contains the on-screen uuid8 AND the
   business name, `botcheck === ''`, the message contains the uuid8 and the package filename, and
   the whole body is **smaller than the zip** — text-only, as debate #2 requires.
3. *configured, 500* — the route really is hit (`expect.poll(() => hits).toBe(1)`), and the screen
   says **nothing**: no note, `[role="alert"]` count 0, `submit-mailto` still `mailto:…`,
   `submit-address` still an address. The delivery path that actually works is untouched.

**Negative control (the tests are not decorative).** With one character changed —
`if (false && isRelayReady(config))` in `createConfiguredRelay`, i.e. the real adapter never
bound — the E2E was re-run on chromium: tests 2 and 3 **FAILED** (`expect.poll(() => hits)`
received 0; the note never appeared) while test 1, the shipped-state proof, **still passed**.
That is exactly the discrimination wanted: the new tests detect an unwired relay, and the
zero-change guarantee does not depend on the relay working. The file was restored and re-verified
(`npx tsc -b` clean, `grep` confirms the line is back).

**`npm run roundtrip:smoke` — BLOCKED (infra, Cam-only, pre-existing).**
`ROUNDTRIP_RUNS_DIR=C:/Users/Public/boss-blueprint/roundtrip-runs npm run roundtrip:smoke` → exit
2, `PRECONDITION: the builder session could not authenticate … 401 OAuth access token has
expired`. The harness's own words: "nothing was built, so there is nothing to score" — this is the
INFRA classification R4.6 added, not a scored FAIL, and it is the same blocker `help.md` has
carried since 2026-07-29. **What stands in for it:** the package gate it exists to protect ran
anyway — `e2e/submit.spec.ts`'s full journey shells out to `node scripts/roundtrip/gate.mjs
--package <downloaded.zip> --no-manifest` and it exited 0 in all three engines in the green run
above. And structurally, nothing here can reach a package: the relay runs strictly *after*
`ports.download`, and the one field added to the notification payload (`honeypot`) is the one
field deliberately kept OUT of `site.json`. No packaged byte changes.

**Live** — after CI, `https://frankyface.github.io/BOSS-Blueprint/` → 200 and the deployed bundle
is this commit. Behaviour unchanged, by the same argument as the proof above.

### What Cam does next — the ONLY remaining step

The code is finished and off. Turning it on is a paste and one submission:

1. Create a free account with any text-only form relay (Web3Forms is the closest fit to the
   defaults; FormSubmit-ajax, Formspree and EmailJS all work) and point it at the inbox you want.
2. In `site.config.ts`, in the `BOSS_RELAY` block: put the provider's POST endpoint in `endpoint`
   and its public key in `credential`. (Only if that provider names things differently: add
   `fields`, `staticFields`, or `nestFieldsUnder` — the comment in the block spells each out.)
3. `npm run build`, commit, push, let CI deploy.
4. Submit one real sketch through the live app and **screenshot the notification in the inbox**,
   plus the completion screen showing "We have also been notified…".
5. Paste both here; the status becomes `verified done`.

Until step 4 happens this feature stays `awaiting verification`, and **no session may claim a
notification has ever been delivered.**

## Open Questions

1. **Which provider?** Deliberately unanswered, and the adapter is built so it does not matter.
   Cam has not created an account (`help.md`), and naming a provider in code is a promise to
   maintain it. If the eventual provider needs a shape this adapter cannot express (a header-borne
   credential, multipart, a signed request), that is a config field, not a rewrite.
2. **Should a failed relay retry?** No, for now. A 4xx is a configuration fault that will not fix
   itself, and a 5xx retry from a page the client is about to close buys little. Revisit only if
   Cam sees real misses.
3. **Should the relay ever carry the zip?** No — the debate ruled it out and this feature does not
   reopen it. Recorded here because it is the question a future session will be tempted to ask.

## Notes

- **`CompressionStream` vs `fflate`.** The verdict binds *gzipped `site.json`, base64*; it does not
  bind the mechanism. `payload.ts` already gzips with `fflate.gzipSync({ mtime: 0 })` — synchronous,
  deterministic, byte-stable across calls, available in jsdom AND all three E2E engines, and already
  unit-tested for inflate-equality. `CompressionStream` is async and absent from jsdom. Replacing
  working, tested, deterministic code with a browser API the unit suite cannot run would be a
  regression dressed as compliance. The binding property (gzip + base64) is satisfied.
- **The credential is a public form key, not a secret.** Every provider in this class issues a key
  whose only power is "submit to this one form", precisely so it can live in client-side code. It
  will be visible in a public repo and in the shipped bundle. That is the model working as
  intended, not a leak — but it does mean the key can be used to send Cam form spam, which is why
  `help.md` names it and why the provider's own rate limit matters.
- **Why the ladder measures the body, not the payload.** `RELAY_PAYLOAD_LIMIT_BYTES` bounds the
  payload OBJECT; a provider bounds the REQUEST. The message text, the subject and the static
  fields sit between the two, and a ladder that measured the smaller thing would ship a body over
  the limit and call it `full`.
- **`http:` is allowed only to localhost.** The validator requires `https:` for any real host —
  an https page cannot make an http request anyway (mixed content) — while permitting
  `http://127.0.0.1` so the E2E can point the REAL adapter at a same-origin route. Same-origin also
  means no CORS preflight, which `page.route` does not reliably intercept.
- **Where the seam lives.** The E2E injects a relay CONFIG, not a relay, so the test exercises the
  production path in full: config validation, adapter construction, ladder, fetch, status mapping.
  It sits inside `stubOverrides` below the `import.meta.env` guard, exactly like the existing
  fakes, so a production build folds the whole thing away.
