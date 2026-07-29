# Feature: Launch Polish
_Stage: stage-4-roundtrip-launch · Status: awaiting verification_

## Goal
Make Blueprint look like a BOSS product and behave like a shipped one: branded header, real
favicon set, a footer that sends people to bossolutions.pro, a title/description/social card that
survive being pasted into a message, the UX audit's cosmetic tail cleared, Lighthouse in the
green, a README that matches reality — and the two launch steps only Cam can do surfaced as
**awaiting human**, never quietly marked done.

This is the last feature of the stage on purpose: it is the only one whose changes cannot alter
`site.json`, `brief.md`, the PNGs or the package, and therefore the only one that cannot
invalidate a round-trip verdict (see Notes, and stage overview Open Question 1).

## Success Criteria

### Branding
- [ ] Header carries the BOSS mark plus the product name, as inline SVG/CSS — **no new runtime
      dependency, no CDN font, no external asset** (hard constraint: everything free-tier, fully
      static on GitHub Pages)
- [ ] Favicon set, all self-hosted in `public/`: `favicon.svg` (BOSS-branded, replacing the Vite
      default), `favicon.ico` fallback, `apple-touch-icon.png` (180×180) — every one returns 200,
      **zero 404s in the network log on first load**
- [ ] Footer, present on every screen and every viewport: **"Built by BOSS → bossolutions.pro"**,
      an `<a href="https://bossolutions.pro" target="_blank" rel="noopener noreferrer">`,
      keyboard-reachable, and visually app chrome — it must never read as part of the client's
      sketch or appear inside an exported page PNG
- [ ] Colour and type tokens unified in one place; the calm, legible empty state the audit
      praised is preserved (branding pass ≠ redecoration)

### Title, meta, social card
- [ ] `<title>` contains "BOSS Blueprint", is ≤ 60 characters, and states the value
      ("Sketch your website — BOSS Blueprint")
- [ ] `<meta name="description">` is 110–160 characters and describes what the tool does
- [ ] Open Graph + Twitter tags present: `og:title`, `og:description`, `og:type=website`,
      `og:url`, `og:image`, `og:image:width/height`, `twitter:card=summary_large_image`
- [ ] `og:url` and `og:image` are **absolute** URLs built from a single new
      `DEPLOYED_BASE_URL` constant in `site.config.ts` — asserted by unit test, because a
      relative OG image silently produces a blank card and nothing in the browser complains
- [ ] The social card image is a committed 1200×630 PNG in `public/`; a test fetches it from the
      built preview and asserts status 200 and intrinsic dimensions 1200×630

### UX audit POLISH items (cross-referenced by finding number)
- [ ] **P1** — the inline editor matches the rendered block: computed `font-size`, `font-weight`,
      `font-family`, `color` and `text-align` of the open editor equal the rendered block's
      (asserted, not eyeballed). The WYSIWYG illusion holds while typing
- [ ] **P2** — "Section" is no longer the unexplained first item: it moves down the palette and
      gains the one-line explanation *"a coloured background band behind other blocks"*
- [ ] **P4 (UI half only)** — Preferred colours leads with the swatch picker; the hex field stays
      as the secondary input. *Accepting plain words like "dark green" is a data-shape change and
      is routed to Stage 2 site-settings, not done here*
- [ ] **P5** — the canvas scroller shows a persistent scrollbar (or a faded page edge) so there
      is a visible cue that the page continues

### UX audit MINOR items this feature owns (label/order/copy level only)
- [ ] **N4** — only one control labelled "Add page" is on screen at a time; the inline form's
      confirm reads **"Create page"** and, while disabled, says why ("Type a name first")
- [ ] **N7** — tab order follows reading order: palette → canvas → page strip → side panel
      (currently it starts in the right-hand panel)
- [ ] **N9** — Site-tab placeholders are visibly examples ("e.g. Martina's Trattoria") and
      lightened, so saved content and placeholder text can never be confused

### Quality gates
- [ ] Lighthouse **desktop** on the deployed URL: Performance ≥ 90 · Accessibility ≥ 90 ·
      Best Practices ≥ 95 · SEO ≥ 90
- [ ] Lighthouse named-audit floor — **zero failures** on: `document-title`, `meta-description`,
      `html-has-lang`, `html-lang-valid`, `viewport`, `image-alt`, `button-name`, `link-name`,
      `color-contrast`, `is-crawlable`, `errors-in-console`. (The numeric scores can drift with
      tooling versions; these named audits are what the launch pass actually owns.)
- [ ] `npm run build` bundle size does not regress by more than 10 KB gzip against the
      pre-polish build — a branding pass must not cost the app its speed

### README + docs
- [ ] README describes the **shipped** product: what it does, the live URL, start-from-template
      or blank, pen, images, multi-page + nav map, "Write it for me", the download-first submit
      and what arrives in the package
- [ ] README "Working on it" section lists the real commands: `npm run dev`, `npm test`,
      `npm run e2e`, `npm run build`, plus `npm run roundtrip:smoke` and when it is mandatory
- [ ] README states the doc model (CLAUDE.md · handoff.md · staging/ · docs/) so a fresh session
      can orient from the repo root

### Launch checklist (help.md items — surfaced, never silently closed)
- [ ] **App is live** at `https://frankyface.github.io/BOSS-Blueprint/` at the shipped commit:
      CI green on `main`, live URL HTTP 200, deployed hashed bundle filename equals the local
      `npm run build` output at that commit
- [ ] **"Sketch your site" link on bossolutions.pro** — **AWAITING HUMAN (Cam)**, `help.md` Open.
      Turns the tool into lead capture. Blocks nothing else in v1
- [ ] **DNS `sketch.bossolutions.pro` → GitHub Pages** — **AWAITING HUMAN (Cam), OPTIONAL**,
      `help.md` Open. Rides on the pending BOSS DNS repoint off GoHighLevel. The app ships on the
      `github.io` URL regardless; if it lands later, add the `CNAME` file and re-run the social
      card / OG absolute-URL assertions against the new origin
- [ ] **Email relay account** — Stage 3's blocker, not this stage's. If it is still open at stage
      close, it is repeated here as awaiting-human rather than left looking resolved

**Rule for the three items above:** a session may mark them done **only** with evidence (a live
link, a `dig`/`curl` result). Otherwise the status stays `awaiting verification`, the item stays
in `help.md`, and the stage summary says so out loud (CLAUDE.md verification protocol). Rewording
an awaiting-human item into a done-sounding one is the failure mode this rule exists to prevent.

## Cross-references (audit findings NOT owned here)
| Finding | Why not launch polish | Owner |
|---|---|---|
| **B1** Site brief not persisted · **B2** no submit | product-defining, not cosmetic | Stage 2 site-settings · Stage 3 submit-gate |
| **M1–M10** | interaction and data defects | Stage 2 (palette, block-editing, multipage-nav, image-upload, app-shell) |
| **M6/M7** layout clipping ≤1280px and inverted zoom | real desktop layout bugs; the desktop guard must not paper over them | Stage 2 app-shell / canvas fit |
| **N2** editor discards text on unload · **N6** blocks not keyboard-focusable · **N8** no snapping/numeric fields | behaviour changes with test surface of their own | Stage 2 block-editing |
| **N1** how-to-add-a-block hint placement · **N3** state-aware toolbar hint · **N5** panel text field explanation | discoverability | feature-onboarding-tour.md |
| **P3** auto-link nav items to same-named pages | **changes exported nav data** — it can move a round-trip nav-map result, so it is not cosmetic | Stage 2 multipage-nav |
| **P4** accepting "dark green" as a colour | changes `siteSettings.colors` shape | Stage 2 site-settings |

## How We'll Verify
1. `npm run lint` → exit 0. `npm test` → exit 0, including new unit tests: absolute OG URLs
   derived from `site.config.ts`; `<title>` length/content; description length; the social image
   exists at 1200×630; the palette-order constant still exports all six types with unchanged
   export discriminators and default geometry (P2 must not touch `src/constants/blockTypes.ts`
   semantics).
2. `npm run build` → exit 0; record the bundle size and compare with the pre-polish figure.
3. E2E (`npx playwright test e2e/launch-polish.spec.ts`, chromium + firefox + webkit):
   - head assertions: title, description, every OG/Twitter tag, absolute `og:url`/`og:image`
   - network log on first load has **zero** 4xx/5xx (catches a missing favicon or card image)
   - footer link: text, `href="https://bossolutions.pro"`, `target="_blank"`,
     `rel` contains `noopener`; reachable by keyboard; present at 1440×900 and 390×844
   - **N7** tab order: press Tab from `body` and assert the focus sequence enters the palette
     before the side panel
   - **N4**: with the add-page form open, exactly one element has the accessible name "Add page";
     the confirm reads "Create page" and exposes a disabled-reason
   - **P1**: open an inline editor on a Heading and assert its computed `font-size`,
     `font-weight`, `font-family`, `color`, `text-align` equal the rendered block's
   - **P5**: the canvas scroller reports a non-zero scrollbar width **or** the fade element is
     present (whichever implementation lands — assert the one that shipped, not both)
   - **P2**: "Section" is not the first palette item and its description text is present
   - **N9**: every Site-tab placeholder starts with "e.g." (or the agreed marker)
4. `npm run e2e` (full suite, 3 engines) → exit 0. Any spec that asserted old palette order or
   old placeholder strings is updated in the same commit, and the update is called out in the log.
5. Lighthouse, preview first then deployed (the deployed run is the recorded evidence):
   ```
   npm run build
   npm run preview           # serves http://127.0.0.1:4173/BOSS-Blueprint/
   npx --yes lighthouse http://127.0.0.1:4173/BOSS-Blueprint/ --preset=desktop --quiet \
     --chrome-flags="--headless" --output=json --output=html --output-path=./lighthouse/preview
   npx --yes lighthouse https://frankyface.github.io/BOSS-Blueprint/ --preset=desktop --quiet \
     --chrome-flags="--headless" --output=json --output=html --output-path=./lighthouse/deployed
   ```
   Record the four category scores and paste the named-audit results; any non-passing audit from
   the floor list blocks this feature.
6. Live checks:
   ```
   gh run list --branch main --limit 1
   curl -sSI https://frankyface.github.io/BOSS-Blueprint/
   ```
   → CI success, HTTP 200. Then confirm the deployed `index-<hash>.js` filename matches the local
   `dist/` build at the same commit.
7. `help.md` — confirm the two launch items are still listed under **Open** with their blocker
   notes, and record here (with today's date) that they are awaiting Cam. Do not edit them to a
   done state.
8. Record all commands, exit codes, scores, sizes and screenshots below.

## Verification Log

### 2026-07-29 — built, local gate green, awaiting the deployed leg

**What landed**

| Area | Files |
|---|---|
| Head + social card | `index.html`, `src/meta/headTags.ts` (+ `.test.ts`), `public/og-card.png`, `public/favicon.ico`, `public/apple-touch-icon.png`, `scripts/brand/make-brand-assets.mjs` |
| Branding | `src/components/BossMark.tsx`, `AppHeader.tsx/.css`, `AppFooter.tsx/.css`, `src/styles/theme.css` (`--boss-footer-height`), `site.config.ts` (`BOSS_SITE_URL`) |
| P1 | `src/components/BlockView.css` — per-type typography tokens on `.canvas-block`, read by both the face and `.block-editor` |
| P2 | `src/constants/blockTypes.ts` (`PALETTE_ORDER`, `PALETTE_BLOCK_TYPES`, Section's hint), `BlockPalette.tsx` |
| P4 (UI half) | `src/components/SiteSettingsPanel.tsx`, `SidePanel.css` — `<input type="color">` leads the row |
| P5 | `src/canvas/geometry.ts` (`hasContentBelow`), `CanvasArea.tsx/.css` |
| N4 | `src/components/PageNameForm.tsx`, `PageStrip.tsx/.css` |
| N9 | `src/components/SiteSettingsPanel.tsx`, `SidePanel.css` (`::placeholder`) |
| Tests | `e2e/launch-polish.spec.ts` (16 × 3 engines), `src/meta/headTags.test.ts` (29), `src/constants/blockTypes.test.ts` (11), `geometry.test.ts` (+7) |

**Commands and exit codes** (Windows, Node v24.15.0)

```
npm run lint            → exit 0
npm run test:coverage   → exit 0 · 92 files / 1579 tests passed · thresholds met
npm run build           → exit 0
npm run e2e             → exit 0 · 672 passed, 3 skipped, 0 failed (5.1m, 3 engines)
npx playwright test e2e/launch-polish.spec.ts  → 47 passed, 1 skipped (WebKit link tab order)
npx playwright test e2e/export-visual.spec.ts  → 7 passed, 2 skipped — BASELINES UNCHANGED
```

The export visual baselines were **not** regenerated and did not move, which is the evidence that
this pass is chrome and not page content (task instruction; stage overview Open Question 1).

**Bundle size — the ≤ 10 KB gzip budget**

| Artifact (gzip) | Pre-polish `fb7eaf6` | Post-polish | Δ |
|---|---|---|---|
| `index.html` | 0.39 kB | 0.94 kB | +0.55 |
| `assets/index-*.css` | 5.74 kB | 6.20 kB | +0.46 |
| `assets/dist-*.js` | 3.06 kB | 3.06 kB | 0 |
| `assets/ajv-*.js` | 33.56 kB | 33.57 kB | +0.01 |
| `assets/index-*.js` | 183.05 kB | 183.88 kB | +0.83 |
| **total** | **225.80 kB** | **227.65 kB** | **+1.85 kB** |

**Lighthouse — preview** (`lighthouse` CLI 13.4.1, `--preset=desktop`, headless Chrome 
against `http://127.0.0.1:4173/BOSS-Blueprint/`)

| Category | Score | Target |
|---|---|---|
| Performance | **99** | ≥ 90 |
| Accessibility | **100** | ≥ 90 |
| Best Practices | **100** | ≥ 95 |
| SEO | **100** | ≥ 90 |

Named-audit floor — zero failures:

```
document-title    PASS    button-name       PASS
meta-description  PASS    link-name         PASS
html-has-lang     PASS    color-contrast    PASS
html-lang-valid   PASS    is-crawlable      PASS
meta-viewport     PASS    errors-in-console PASS
image-alt         n/a  (the first-load page renders no <img>; a photo only exists once uploaded)
```

Two notes on the floor list, recorded rather than quietly adjusted:
- the spec names the audit **`viewport`**; Lighthouse 13 renamed it **`meta-viewport`**. Same audit,
  and it passes. The criteria text is left as written.
- Lighthouse's Accessibility score is **100 with N6 still open** (canvas blocks are not
  keyboard-focusable). Open Question 3 anticipated it dragging the score down; it does not, because
  Lighthouse does not audit for it. N6 is still real and still routed to Stage 2 — the number is
  reported honestly, not treated as evidence that N6 is fixed.

**Awaiting the deployed leg** — CI, live 200, deployed-bundle identity and the deployed Lighthouse
run are recorded in the next entry, after this commit reaches `main`.

### 2026-07-29 — help.md launch items, restated rather than closed

Per the rule above these three are **not** ticked, and `help.md` carries a dated line on each:

- **"Sketch your site" link on bossolutions.pro** — AWAITING CAM. The app now sends traffic the
  other way (every screen carries "Built by BOSS → bossolutions.pro"); the inbound link is his half.
- **DNS `sketch.bossolutions.pro`** — AWAITING CAM, OPTIONAL, still riding the pending GoHighLevel
  repoint. `help.md` now also records the part that is easy to miss: a DNS record alone is not
  enough. `DEPLOYED_BASE_URL` and `BASE_PATH` are baked into the head and the bundle, so the switch
  is a one-line config change, a `CNAME`, **a redeploy**, and a re-run of the head assertions.
- **Email relay account** — Stage 3's blocker, repeated here so stage close cannot make it look
  resolved. Submit ships with the no-op relay stub, which never claims an email was sent.

## Open Questions
1. **Does the footer belong in the exported page PNGs?** It must not — the PNG is "each page
   exactly as the client saw it" and a BOSS footer inside the render would become site content the
   builder faithfully reproduces. **Recommendation:** the footer lives in the app shell, strictly
   outside the 1200px page element the renderer captures; add an assertion to the PNG renderer's
   existing tests that the footer text does not appear in a rendered page.
2. **Custom domain later.** If `sketch.bossolutions.pro` lands after ship, `og:url`, `og:image`,
   the canonical link and `BASE_PATH` all change. **Recommendation:** derive every absolute URL
   from the one `DEPLOYED_BASE_URL` constant now, so the later switch is a one-line change plus a
   re-run of the head assertions — and note in `help.md` that the switch requires a redeploy, not
   just a DNS record.
3. **Lighthouse Accessibility ≥ 90 with N6 unfixed.** Canvas blocks are not keyboard-focusable
   (Stage 2's item) and Lighthouse may or may not flag it. **Recommendation:** keep the numeric
   target at 90 and treat the named-audit floor list as the real gate; if N6 drags the score
   below 90, record the number honestly and route the fix to Stage 2 rather than lowering the
   target here.
4. **P2 palette reorder vs existing tests.** Moving "Section" will break any spec that asserts
   palette order or a first-item selector. **Recommendation:** do it — the reorder is the fix —
   and update the affected specs in the same commit, naming them in the Verification Log so the
   change is not mistaken for test-fudging.
5. **Analytics?** None specified anywhere, and a tracker would be the first third-party request
   in a deliberately dependency-free app. **Recommendation:** ship with none; if Cam wants
   lead-capture measurement, the submission itself already carries name + email.

## Notes & Decisions
- Sources: UX audit report 2026-07-28 (P1–P5, N4, N7, N9 and the three "keep them" behaviours);
  `help.md` Open items (DNS, bossolutions.pro link); `docs/master_plan.md` (BOSS-branded, free,
  no backend, lead-capture hook); existing `index.html`, `public/favicon.svg` and `site.config.ts`
  (`BASE_PATH = '/BOSS-Blueprint/'`, preview host/port) — this feature adds `DEPLOYED_BASE_URL`
  beside them so nothing hard-codes the live origin twice.
- **The audit's three "keep them" wins are protected work, not fair game for a redesign:** the
  "Write it for me" escape hatch, the plain-English destructive confirmations and page-strip
  cluster, and the button-linking + Nav-map pairing. A branding pass that degrades any of them has
  failed regardless of how it scores.
- Polish lands **after** the tour and the guard and **before** the three clean round-trip runs;
  the runs are the last thing that happens at the shipped commit. If a polish fix proves necessary
  after a green sequence, re-run A-preview and say why (stage overview Open Question 1).
- README is documentation of a shipped tool, not a changelog — no stage history, no roadmap
  restatement; `docs/master_plan.md` already owns the vision and `handoff.md` owns the state.

### Decisions taken while building (2026-07-29)

- **`DEPLOYED_BASE_URL` already existed** (`site.config.ts`, added by the round-trip harness), so
  this feature used it rather than adding a second one. `BOSS_SITE_URL` is new, beside it.
- **The head is hand-written and pinned by test, not injected by a build plugin.** `index.html` is
  static and there is no head manager; `src/meta/headTags.test.ts` reads the file off disk and
  asserts it equals the module's constants (the same shape as Appendix A's spec-fixture tests).
  A Vite `transformIndexHtml` plugin would have been machinery in the build for a file a test can
  simply read.
- **P4 reverses an earlier local call against `<input type="color">`.** That call lived in a code
  comment, not in `docs/decisions.md`. Two of its three reasons are stale — WebKit has shipped the
  control since Safari 12.1, and the control's value IS `#rrggbb`, which is exactly what the export
  stores. The third (it cannot express "no colour") is why the hex field stays as the secondary
  input and why an unpicked swatch is drawn dashed rather than pretending white was chosen.
- **P5 shipped as the faded page edge, not the persistent scrollbar.** The criteria allow either.
  The engines disagree about whether a scrollbar takes layout space at all — WebKit's are overlays —
  so "always show the scrollbar" is a cue that simply does not appear on a Mac, and an E2E assertion
  on scrollbar width would have been unassertable on one of the three engines.
- **P2 did not touch the block-type table.** The palette order is a new `PALETTE_ORDER` constant;
  `BLOCK_TYPES` keeps its order, its ids and its rectangles, and `src/constants/blockTypes.test.ts`
  pins all six discriminators and default rectangles as literals so a future reorder cannot move
  them silently.
- **N7's stated order has two items swapped.** The criteria say "palette → canvas → page strip";
  the page strip renders ABOVE the canvas inside the stage column, so reading order down the screen
  is header → palette → page strip → canvas → panel → footer. That is what shipped and what the
  E2E asserts, and it satisfies the binding assertion the verification steps name (the palette comes
  before the right-hand panel). **The DOM was already in this order** — the audit's "it starts in
  the right-hand panel" is what happens after dismissing the start card, because the browser resumes
  sequential focus from where that card used to be, not from the top of the document.
- **Specs updated in the same commit, and why** (Open Question 4's rule):
  - `e2e/shell.spec.ts` — palette label order (P2) and `<title>` (the title changed by design).
  - `e2e/block-editing.spec.ts` "a block cannot be dragged fully off the page" — this one is worth
    naming. It grabbed a Button at its default `y = 760`, which at the suite's 1920×1000 viewport
    put the grab point ~19px above the window's bottom edge; the 28px footer moved it onto the
    footer and the drag stopped happening. The clamp is not about where the block started, so the
    test now parks the block mid-page first (`moveBlockTo`, new in `e2e/support/canvas.ts`) and the
    gesture no longer depends on the app's chrome height.
- **The footer is behind the desktop guard's banner on a phone, not above it.** Lifting it clear
  would have put it exactly where `e2e/desktop-guard.spec.ts` probes for "a point on the canvas
  clear of the banner", breaking a verified feature to satisfy a cosmetic one. The guard is a
  dismissible notice; the footer is underneath it and is there the moment it is dismissed.
