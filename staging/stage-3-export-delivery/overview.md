# Stage 3 — Export & Delivery

## Goal
A finished sketch becomes the **Claude-ready package** — `site.json` + `brief.md` +
`pages/*.png` + `assets/*` in one zip — and reaches Cam through the gated submit. This is the
product's entire point: everything before this stage exists to fill the package, everything
after it (Stage 4) only measures whether the package works.

The binding contract for this stage is **`docs/export-format.md`** (schemaVersion 1, adopted
2026-07-28). It is frozen: §1 zip layout, §2 schema, §3 brief template + template rules, §4
generation rules, §5 validator rules V1–V24, §6 forward compatibility, §7 the worked example,
Appendix A the required tests. Nothing in this stage may contradict it; the two places we
extend it (a WARN rule and a conditional brief marker for right-overflowing blocks) are
additive per §6.2 and are recorded as Open Questions below until ruled.

Delivery follows the debate #2 verdict (`docs/decisions.md` 2026-07-28): **download-first
hybrid**. The zip ALWAYS downloads — that path cannot fail and is fully machine-verifiable.
The notification relay is a swappable port that ships as a no-op stub in this stage and gets
wired LAST, per Cam. Submit is fully functional without it.

## Features
- [x] feature-site-json-generator.md — document v2 → `site.json` (id remap §4.8, slugs §4.1,
      heights §4.2, `''→null`, discriminators §4.7, asset manifest §4.6, pen roles §4.5) plus
      the shared validator module (V1–V24 + the two additions) with a red-path test per rule
- [x] feature-brief-generator.md — `generateBrief(siteJson)`, the §3.2 template + [N1]–[N12]
      narration algorithms, escaping §3.3, and the byte-exact CI equality test against §7.2
- [x] feature-png-renderer.md — one page PNG at exactly `1200 × page.height`, pen baked in,
      snapdom → html-to-image behind ONE interface, sanity validation + retry + engine
      fallback, the x>1200 clip rule, tri-engine visual regression
- [x] feature-package-zip.md — §1 layout, deterministic compression ladder, size meter, UUID
      stamping, filename convention
- [x] feature-submit-gate.md — the gated submit: required fields, the validator gate UI
      (BLOCK / FIX / WARN), V23 filler warning, always-on download, two-step completion UX,
      spam honeypot, and the `DeliveryRelay` port with its no-op implementation
- [ ] feature-notification-relay.md — **deferred, wired LAST** (not in this stage's DoD): the
      real relay behind the port, degrade ladder full → compressed → metadata-only.
      **2026-07-29: built and mock-verified, status `awaiting verification`** — a provider-agnostic
      form-POST adapter shipped CONFIG-GATED and OFF (`BOSS_RELAY` in `site.config.ts`). With the
      empty config the app binds the same `NoopRelay` and makes zero network calls, asserted in
      three engines. Cam's account + one real submission is the only thing outstanding (`help.md`).
      Stage 3's DoD and its `verified done` features are untouched by this

**Build order** (dependencies, not preference): site-json-generator → brief-generator →
package-zip; png-renderer runs in parallel from the start (it is the long-tail risk); submit-gate
lands last because it composes the other four. The generator and brief can be built and tested
entirely against committed fixtures before Stage 2's pen/image/template features land.

## Stage 2 fields this stage consumes
Stage 3 renames nothing — Stage 2 already names its fields after the export contract
(`feature-copy-blocks.md` Notes). What Stage 3 still needs from the unlanded Stage 2 features,
spelled with the contract's own names (`docs/export-format.md` §2.7):

| Source feature | Fields Stage 3 reads | State at time of writing |
|---|---|---|
| feature-image-upload | `block.imageData` (a compressed `data:image/(jpeg\|png\|webp);base64,…` URL, `''` = empty slot), `block.fit: 'cover' \| 'contain'`, `block.description` | **landing now** — `src/canvas/types.ts` + `src/canvas/imageAssets.ts` already carry these names |
| feature-pen-layer | `page.penStrokes: { id, points: [x, y][], color, width }[]` in page coordinates, in draw order (role and target are computed at export, never stored — §4.5) | **landing now** — `PenStroke` is in `src/canvas/types.ts` and `Page.penStrokes` is required |
| feature-templates | `block.fromTemplate: boolean`, cleared on first content edit | not started |

**There is no asset store and no `assetId` in the document** — the image *is* the block's
`imageData` field. `assets[]` and its `img_NNN` ids are therefore **derived at export** from the
distinct data URLs, exactly like every other export identity (§4.6/§4.8). See
`feature-site-json-generator.md`, which owns that derivation.

If a field arrives under a different name, the fix belongs in Stage 2, not in a translation
layer here (`docs/export-format.md` §6.6 — never let internal state leak into the export, and
never let the export grow a rename shim that hides drift).

## Definition of Done (testable checklist)
- [x] **Appendix A equality test A green:** the fenced JSON Schema in `docs/export-format.md`
      §2.2 byte-matches `src/export/schema/site.v1.schema.json` (`npm test`, one assertion,
      both sides read from disk at test time)
- [x] **Appendix A equality test B green:** `generateBrief(parse(§7.1)) === §7.2`, byte-exact,
      with both blocks extracted from `docs/export-format.md` itself (see Open Question 1 —
      this DoD item is what forces that ruling before the stage can close)
- [x] Every V-rule in §5 has a red-path unit test that fails without its implementation, and a
      green-path test on the §7.1 fixture; `npm run test:coverage` holds `src/export/**` at
      ≥80% lines and functions (same gate as `src/canvas/**`)
- [x] E2E: a full design submits through the real UI, the zip downloads, and its entry listing
      **exactly** equals §1 — no wrapper folder, no extra entries
- [x] **The round-trip protocol's package gate passes on that E2E-produced zip:**
      `node scripts/roundtrip/gate.mjs --package <downloaded.zip> --no-manifest` exits 0,
      covering `docs/roundtrip-protocol.md` §2 steps 1–3 (filename + layout, ajv schema
      validation, replay of the app's own validator module against the extracted package)
- [x] E2E: every page PNG decodes, is exactly `1200 × page.height`, is non-blank, and matches
      its committed per-engine baseline within tolerance on chromium + firefox + webkit
- [x] E2E: **submit is fully functional with NO relay** — with the `DeliveryRelay` port bound
      to the no-op stub, submit still validates, downloads the zip, and renders the two-step
      completion UX with a working prefilled mailto and a copyable address
- [x] E2E: the BLOCK path stops submission and points at the offending block; the FIX path
      auto-corrects and proceeds; the WARN path ships and lists what it warned about
- [x] `npm run lint`, `npm test`, `npm run build`, `npm run e2e` all green in CI on `main`
- [x] Every feature file above is `verified done` with Verification Log evidence

## Open Questions — ALL RULED 2026-07-28, kept for context
**Every question below was ruled the same day and applied as the export-format v2.1 amendment
(now live in `docs/export-format.md`; rulings + rationale in `docs/decisions.md`). Implementers
follow the amended spec: unwrapped logical lines + regenerated §7.2 (Q1), frame-tuple-anchored
V7 (Q2), V25 WARN right-overflow clip, V26 blank-label BLOCK, height floor 800. The feature
files' references to "pending ruling" are superseded accordingly.**
1. **§7.2 is hand-wrapped; byte-exact equality test B is unsatisfiable as written.** Measured
   this session against `docs/export-format.md`: line 1454 (`- **Client style notes:** …dark
   green`, 88 chars, next word `accents.»`) forces any greedy wrap width `W ≥ 88`, while line
   1497 (`- **Home** → …· button`, 80 chars, next word `«Visit`) forces `W ≤ 86`. No single
   deterministic wrapper produces both. **Recommendation:** the generator emits **unwrapped
   logical lines** (one paragraph = one line; Markdown renders identically, and hard wrapping
   would also let a wrap split the load-bearing `**WRITE THIS COPY**` token across lines and
   break V7 forever). §7.2 is then regenerated from the verified generator and committed as a
   **whitespace-only amendment** to `docs/export-format.md`, with a `docs/decisions.md` entry
   and a companion guard test asserting the new block is content-identical to today's under
   whitespace normalization. Detail lives in `feature-brief-generator.md`.
2. **V7's marker regex counts zero in the spec's own example.** `^\s*\*\*WRITE THIS COPY\*\*`
   matches 0 times in §7.2 (measured); the marker appears mid-bullet after the frame tuple,
   and the bare phrases also appear twice in the fixed Definition-of-done boilerplate — which
   is exactly why §3.3 rule 2 forbids a raw substring count. **Recommendation:** anchor on the
   frame tuple; exact regex in `feature-brief-generator.md`, with an adversarial-client-text
   unit test.
3. **Right-overflow has no rule.** V18 only fires at `x > 1200` (fully off-page); a block
   dragged to x=1100 with w=400 extends to 1500 and is silently clipped out of the PNG.
   **Recommendation (Cam's lean, adopted):** the PNG clips at exactly 1200 — the export width
   IS the page; `site.json` keeps true geometry (the schema already permits it, §2.6);
   `brief.md` marks the bullet via a new conditional rule **[N13]**; the validator **WARNs**
   via a new **V25**, never blocks. Additive per §6.2 (new WARN validations and new optional
   narration do not bump `schemaVersion`), and [N13] is inert on the §7.1 fixture so equality
   test B stays byte-exact. Needs a `docs/decisions.md` entry.
4. **A blank button label or an empty nav bar fails the schema, not a client-facing rule.**
   `button.label` is `minLength: 1` and `navBar.items` is `minItems: 1`, but no V-rule catches
   either — so a client who adds a button and never types a label gets V1's "something went
   wrong" instead of "give this button a label". **Recommendation:** **V26**, client-facing
   BLOCK, mirroring V19. Nothing that used to package successfully stops packaging — it is a
   reclassification of an existing BLOCK into a fixable one.
5. **§2.5's table says `height` is an "integer ≥ 400"; the schema says `minimum: 800` and
   §4.2's formula floors at 800.** **Recommendation:** 800 wins (two sources against one);
   the table line is stale — fix it in the same doc pass as items 1/3.
6. **Business-slug fallback is undefined.** §4.1 step 3 returns `page-N` for a name with no
   usable characters, which is meaningless for the zip filename. **Recommendation:** the
   business slug falls back to `business` (steps 5–6 already don't apply to it).
7. **Should `*` join the §3.3 rule-7 escape set?** Client text can currently carry literal
   `**bold**` into a `«…»` quote and visually mimic a generator marker. Escaping it is
   byte-neutral on §7.2 (no client string there contains `*`). **Recommendation:** yes, add it.

## Notes & Decisions
- **The contract is frozen; this stage implements it, it does not redesign it.** Where the
  spec is silent or self-contradictory, the resolution goes in Open Questions above with a
  recommendation and lands as a `docs/decisions.md` entry — never as a quiet local choice.
- **One validator module, three call sites** (§5, closing paragraph): the app at submit, unit
  tests against fixtures, and the Stage 4 harness against real packages. That is why the rules
  are pure functions over a package object rather than React-aware checks.
- **`site.json` and `.blueprint` are different contracts** (§6.6). The `.blueprint` file is
  Stage 2's internal serialization; `site.json` is derived from it at package time. No field
  crosses without passing through the generator.
- **Relay sequencing is Cam's ruling** (`docs/decisions.md` 2026-07-28 delivery entry): the
  relay is wired LAST. Until then submit = validate + download + prefilled mailto, and the DoD
  above proves that path stands on its own with the port bound to a stub.
- **Stage 4 depends on Stage 3's own scripts.** `docs/roundtrip-protocol.md` §2 steps 1–3 are
  package-gate work that belongs to this stage's artifacts (layout check, ajv, validator
  replay); building `scripts/roundtrip/gate.mjs` here — with the scenario manifest diff (step
  4) left as a Stage 4 addition behind `--no-manifest` — de-risks Stage 4 and gives this
  stage's DoD a real gate to point at.
- **The smoke round-trip becomes mandatory the moment this stage lands**
  (`docs/roundtrip-protocol.md` §9): any later change touching `src/export/**`, the schema,
  the brief generator, templates, or the PNG renderer must run `npm run roundtrip:smoke`
  before merge. Record that in `handoff.md` at stage close.
