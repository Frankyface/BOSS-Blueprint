# Feature: Multi-page + Navigation Map
_Stage: stage-2-full-sketching · Status: verified done_

## Goal
Clients sketch whole sites, not single pages: add/rename/duplicate/delete pages, switch
between them, and wire buttons/nav items to target pages so the export carries the site's
link structure.

## Success Criteria
- [x] Page strip/sidebar: add page (named, e.g. "Menu"), rename, duplicate, delete (with
      confirm), reorder; switching pages swaps the canvas content
- [x] Buttons and nav-bar items have a "links to" picker listing the site's pages (or External
      URL / None); linked state is visible on the block
- [x] Deleting a page cleans up links pointing at it (they revert to None, with a toast)
- [x] A nav map summary (simple list view: each page → its outgoing links) matches reality

## How We'll Verify
Unit tests on page CRUD + link-integrity rules (especially delete cleanup). E2E: build a
3-page site, wire nav on every page, assert the nav map, delete a linked-to page, assert links
reverted. Record evidence below.

## Verification Log

**Implementer run (2026-07-28):**

Built as document schema v2 — `{ schemaVersion: 2, siteSettings, pages: [{ id, name, blocks }] }`.

_Files added:_ `src/canvas/document.ts` (page CRUD + link cleanup, pure), `src/canvas/pages.ts`
(page naming/identity/duplication), `src/canvas/links.ts` (the link union + validation),
`src/canvas/navItems.ts` (structured menu items), `src/canvas/navMap.ts` (derived nav map),
`src/canvas/blueprintBlock.ts` (per-block parse + per-type defaults),
`src/components/PageStrip.tsx` + `.css`, `PageNameForm.tsx`, `SidePanel.tsx` + `.css`,
`BlockInspector.tsx`, `LinkPicker.tsx`, `NavItemsEditor.tsx`, `NavMapPanel.tsx`,
`DesignToast.tsx`, `src/hooks/useCommittedField.ts`.
_Files reworked:_ `src/canvas/types.ts`, `src/canvas/blueprintFile.ts` (v2 + migration),
`src/canvas/blockFactory.ts`, `src/store/canvasStore.ts`, `canvasSession.ts`, `editorStore.ts`,
`devFreeze.ts`, `src/components/BlockContent.tsx`, `BlockView.tsx`, `CanvasArea.tsx`,
`CanvasToolbar.tsx`, `StartOverButton.tsx`, `src/App.tsx`, `playwright.config.ts`.

_Commands (all run on this machine, 2026-07-28):_

| Command | Result |
|---|---|
| `npm run lint` | clean, exit 0 |
| `npm test` | **463 passed** / 26 files |
| `npm run test:coverage` | exit 0 — `src/canvas` 100% lines, 100% funcs; `src/store` 97.14% lines, 97.33% funcs (gate: 80/80) |
| `npm run build` | ✓ built, `dist/assets/index-*.js` 243.60 kB (gzip 75.09 kB); `grep -c __blueprintStore dist/assets/*.js` → **0** |
| `npm run e2e` (run 1) | **237 passed (2.6m)** — chromium + firefox + webkit |
| `npm run e2e` (run 2) | **237 passed (2.5m)** — repeated for flake detection |

_Unit coverage of this feature:_ `src/canvas/document.test.ts` (add / rename / duplicate /
delete / move / link revert / no-op identity), `src/canvas/pages.test.ts`,
`src/canvas/links.test.ts`, `src/canvas/navItems.test.ts`, `src/canvas/navMap.test.ts`,
`src/store/canvasStore.pages.test.ts`, `src/store/canvasStore.copy.test.ts`,
`src/canvas/blueprintFile.test.ts` (v2 validation + the v1→v2 migration path).

_E2E covering this feature_ (`e2e/multipage-nav.spec.ts`, `e2e/migration.spec.ts`, ×3 engines):
- `pages › adds, renames, duplicates, reorders and deletes pages`
- `pages › refuses to delete the last page, and asks before deleting any page`
- `pages › each page keeps its own blocks, and switching swaps the canvas`
- `pages › switching pages is not an undo step, but adding one is`
- `pages › page operations are undoable and redoable` / `a deleted page comes back with undo`
- `linking › a button links to a page, an address, or nothing — and shows it`
- `linking › a half-typed web address is refused rather than stored`
- `linking › nav-bar items are structured, wired one by one, and capped in the UI`
- `deleting a linked-to page › reverts every link to it, says so, and the nav map agrees`
- `deleting a linked-to page › leaves links to other pages and external addresses alone`
- `a three-page site end to end › builds, wires, survives a reload, and reads back as one nav map`
- `opening a design saved by the previous schema › migrates it into a single Home page…` (+3 more)

_Real-browser spot check:_ production preview at 1600×900 — palette 240 | stage 1056 | details
panel 304 = 1600, `document.scrollWidth === clientWidth` (no horizontal scroll), page scaled to
0.814, page tabs and the three panel tabs render.

**Independent review (2026-07-28):**

Re-run from a clean checkout of b5d0885 in a detached worktree (`npm ci` from scratch):
`lint` clean · `test` **463 passed / 26 files** · `test:coverage` exit 0 (`src/canvas` 100% lines
+ funcs, `src/store` 97.14/97.33 — gate 80/80) · `build` 243.60 kB (gzip 75.07) ·
`e2e` run 1 **236 passed, 1 failed**, run 2 **237 passed**. The run-1 failure was
`[firefox] autosave › does not persist the selection` (click timeout); it did not reproduce
and passes in isolation — a parallel-load flake, not a defect. CI is green on b5d0885, the live
URL returns 200, and the deployed `index-CRnG0TYs.js` / `index-C-UCmsEd.css` are sha256-identical
to a local `npm run build` (0 occurrences of `__blueprintStore`).

_Independent probes (own Playwright specs, since deleted):_ v1→v2 migration driven by a payload
built from the real pre-Stage-2 serialiser (`git show d2c3e82~1:src/canvas/blueprintFile.ts`) with
all six block types, an embedded newline and comma-separated nav labels → one "Home" page, ids,
geometry and text verbatim, per-type defaults added, no quarantine, no recovery key; edit + reload
re-saves as v2 and does not migrate twice (×3 engines). Corrupt, `schemaVersion: 3` and an unknown
`vibe` all quarantine with the file kept; a v2 payload round-trips deep-equal (×3 engines).
Link integrity across a 3-page site: three links to the deleted page reverted, toast named the
count and the page, **zero dangling `pageId` site-wide**, links to other pages and external
addresses untouched, nav map agreed — and **undo restored the page together with every reverted
link** (redo re-reverts), which is coherent because the revert rides the same document transition.
Nine malformed addresses refused and four valid ones stored verbatim. Four page switches left the
stored payload byte-identical and added no undo step, while add/rename/duplicate/move were one step
each. `e2e/app-layout.spec.ts` was confirmed to pin its own explicit 1366×768 viewport, and the
Stage 1 layout HIGH was re-proved at **both** 1366×768 and 1920×1000 with the new SidePanel inside
the viewport, on all three engines.

_Deviations judged:_ viewport 1600→1920 **accepted** (the 1:1 fit-to-window arithmetic is correct
and the Stage 1 regression spec does not inherit it); per-type defaults on `createBlock` **accepted**
(factory and parser share `withTypeDefaults`, so screen and disk cannot diverge); Move-left/right
instead of drag **accepted** (more accessible, deterministic, and the criterion says "reorder");
store split **accepted** (a genuine response to the 400-line ceiling, 482→327 + 197, no test changes).

_Not accepted — see the bounce:_ the "text as comma-joined labels" invariant. `withNavItems` really
is the only writer, but `items → text` and `text → items` are not inverses, and two ordinary client
actions silently destroy wiring (empty label; label containing a comma). The singular form of the
delete notice is also ungrammatical and untested.

**Status: BOUNCE** — HIGH-1 (an emptied nav-item label produces an export-invalid document, then
a subsequent inline text commit silently deletes the item and its wiring) and HIGH-2 (a label
containing a comma re-splits into unlinked items). Seven required changes recorded; fix assigned.

**Bounce fixes (2026-07-28):**

All seven required changes made. Status stays `awaiting verification` — the reviewer re-verifies.

| # | Required change | Where |
|---|---|---|
| 1 | Empty label refused at BOTH boundaries | `withNavItemLabel` returns the block unchanged (same object, so not even an undo step); `parseNavItem` returns `null` for an empty, whitespace-only or separator-only label |
| 2 | A comma can no longer re-split the menu | one `normaliseNavLabel` in `navItems.ts`, used by `createNavItem`, `withNavItemLabel` AND `parseNavItem` (mechanism + rationale in Notes) |
| 3 | Round-trip regression pinned | `navItemsFromText(navItemLabels(items), items)` deep-equals `items` across six UI-producible menus, plus a stability pass and a comma case |
| 4 | Delete-notice grammar + extraction | `describeReverted` moved to `src/canvas/pageNotices.ts`; "1 link … **is** no longer linked" / "3 links … **are**"; both branches unit-tested |
| 5 | Notes corrected | the "one writer" bullet now states the constraint it depends on and where it is enforced |
| 6 | E2E support file split | `e2e/support/canvas.ts` 519 → **412**, new `e2e/support/site.ts` (117) — the split the file already drew for itself with a section banner; imports updated in six specs |
| 7 | Stale comment | `e2e/app-layout.spec.ts:18` 1600×1000 → 1920×1000 |

_One change beyond the seven, needed to make #1 coherent on screen:_ a REFUSED commit now snaps
the field back to the stored value (`useCommittedField`). Clearing a label correctly left the menu
untouched, but the input sat empty next to a menu item that still said "Home" — the store said no
and the UI did not say so. The hook now marks what it TRIED to store, so an accepted commit is
unchanged and a refused one puts the field back. E2E-asserted (`toHaveValue('Home')`).

_Also in this pass (reviewer LOWs):_ dead `countLinksToPage` deleted from `document.ts` (LOW-1);
the delete-toast guard moved next to the store's own refusal in `handleDelete`, so a refused
delete can never announce itself as done (LOW-5); `withTypeDefaults` now falls back field by field
with `??` instead of spreading `block` over a defaults object, which silently depended on absent
keys being absent (LOW-6).

_Commands (all run on this machine, 2026-07-28):_

| Command | Result |
|---|---|
| `npm run lint` | clean, exit 0 |
| `npm test` | **662 passed** / 36 files (619 before this batch) |
| `npm run test:coverage` | exit 0 — `src/canvas` 99.71% lines, 99.52% funcs; `src/store` 97.02% lines, 97.15% funcs |
| `npm run build` | ✓ built, 264.09 kB (gzip 82.10 kB) |
| `npm run e2e` (×2) | **324 passed (3.4m)**, then **324 passed (3.5m)** — chromium + firefox + webkit |

_New unit coverage:_ `src/canvas/navItems.test.ts` — empty/whitespace/separator-only labels refused
by `parseNavItem`, a smuggled-in comma normalised, `normaliseNavLabel` table, and the `text ↔ items`
round-trip suite (six menus incl. punctuation, a 7-item menu, and two labels differing only by case,
which must not cross over when matching); `src/canvas/blockEdits.test.ts` — the label rule at the UI
boundary, including that a refused rename returns the SAME block object and that normalising a label
keeps the item's id and link; `src/canvas/pageNotices.test.ts` — both grammar branches, zero, and a
negative count.

_E2E:_ `e2e/multipage-nav.spec.ts` gains `a comma in a label cannot split the menu or lose its
wiring` — types a comma label in the panel, commits the menu through the INLINE block editor (the
exact path that used to destroy it), and asserts the item count, the label and the link target all
survive; and `an emptied label is refused, leaving the menu as it was`.

**Re-verification (2026-07-28):**

Re-run from the pinned worktree at c180b1c (`npm ci` from scratch, 254 packages, 0
vulnerabilities): `lint` clean · `test` **662 passed / 36 files** · `test:coverage` exit 0
(`src/canvas` 99.71% lines / 99.52% funcs, `src/store` 97.02 / 97.15 — gate 80/80) · `build`
**264.09 kB (gzip 82.10)**, 0 `__blueprintStore` · `e2e` ×2 = **324 passed (4.0m)** then
**324 passed (3.5m)**, chromium + firefox + webkit, zero flakes. Every number in the bounce-fix
table reproduces exactly. CI green on 21ecd72 and c180b1c, live URL 200, and the deployed
`index-QtqvL50Q.js` / `index-f1-PsJS5.css` are sha256-identical to a local `npm run build`.

_Independent probes (own Playwright + Vitest specs, since deleted; ×3 engines):_ **HIGH-1** —
an emptied label, cleared by Enter AND by blur, with `''` and `'   '`: the items array is
deep-equal to before and the field snaps back to "Home". Traced to the mechanism, not just
observed: `withNavItemLabel` hands back the identical block, `blocksEqual` makes
`updateCurrentBlocks` return the SAME state object, and zustand's `Object.is` check then never
notifies — so no history push and no autosave either. **HIGH-2** — "Fish, chips" commits as
"Fish chips" with the item's id and its `page` link intact; `block.text` becomes
"Fish chips, Contact"; re-committing that text through the INLINE editor (the path that used to
destroy it) leaves two items, same id, same link, and a SECOND inline re-commit is stable too.
**Export-validity, pushed hard** — thirteen hostile labels pasted and typed (empty, spaces, tabs,
`,`, `,,,`, `, , ,`, NBSP, U+3000, figure/thin space, U+FEFF, VT+FF, newlines) are all refused
with the menu unchanged; real keyboard insertion is refused; `' , ,, '` through the inline editor
produces no zero-length label; and `parseNavItem` refuses all thirteen at the file boundary, so a
hand-edited payload QUARANTINES rather than silently losing items. **No UI path can produce a
label of length 0.** The round-trip regression test is real but table-driven, so it was
strengthened independently: 2000 randomly generated menus (1–7 items, labels drawn from an
alphabet including commas, unicode spaces, accents and punctuation) round-trip deep-equal on ids
and links; 5000 random strings through `normaliseNavLabel` never yield a comma, are always
trimmed and never carry double whitespace; and exact-duplicate labels (["Home","Home","HOME"],
both orders) — a case the shipped suite does not cover — round-trip correctly.

_The other five changes confirmed:_ `describeReverted` lives in `pageNotices.ts` with the is/are
grammar and five tests; the Notes bullet now names the constraint and where it is enforced;
`e2e/support/canvas.ts` is 412 lines with a new 117-line `site.ts`, imported by seven specs;
`app-layout.spec.ts:18` reads 1920×1000. The `useCommittedField` commit-feedback call is judged
CORRECT — marking `lastValue` with what was ATTEMPTED makes the render-time re-sync fire on a
refusal, stay silent on an acceptance, and also handle the case nobody named: a commit the store
TRANSFORMS ("Fish, chips" → "Fish chips") snaps the field to the normalised value.

_Findings raised, none blocking (routed to the UX-hardening batch):_ MEDIUM — `commitOpenDrafts()`
is not wrapped in try/catch, so a throwing blur handler would skip the pagehide flush entirely
(fix: try/finally); MEDIUM — `useCommittedField` has no unit test (29.62% statements, outside
the gate globs) despite carrying the refused-commit protocol; LOW — U+200B is not JS `\s`, so a
zero-width-space label stores as a length-1, visually blank entry.

**Status: VERIFIED DONE.**

**UX hardening (2026-07-28):**
Status unchanged. Two changes here, one of them a new recorded behaviour (written into Notes
& Decisions below).
- **POLISH-3, auto-link on an exact name match.** The audit's client typed "Home" and "Menu"
  into her menu, beside pages called Home and Menu, and both items still read "Not linked yet";
  the nav map then correctly reported a site where nothing led anywhere. A label that IS a page
  name (case-insensitive, otherwise exact) now wires itself to that page — at item creation and
  at label commit, through one pure function, `linkForLabel(label, pages)` in `navItems.ts`. It
  fires only when the item is UNLINKED: a link the client chose (or an earlier match) is never
  repointed by a rename. No match still means `none`, which the nav map says out loud.
- **LOW, zero-width characters.** `normaliseNavLabel` strips U+200B–U+200D, U+2060 and U+FEFF
  before trimming. A label pasted from a website or a Word document carries these
  invisibly: they survive `trim`, take up no room on screen, and made "Home" ≠ "Home" — which
  broke both the new auto-link and the existing label-matching that preserves wiring across an
  inline edit. A label that is nothing but zero-width characters is now empty, and refused.
- Evidence — unit: `navItems.test.ts` (+18: the `linkForLabel` match/no-match tables, matching
  through an invisible character, `createNavItem` with pages, `navItemsFromText` wiring only the
  NEW labels, and 4 zero-width rows in the `normaliseNavLabel` table); `blockEdits.test.ts`
  (+6: add/rename wiring, and a table proving three kinds of existing link are never repointed);
  `canvasStore.copy.test.ts` (+4: all three routes a label can reach the document by — the
  panel's Add, the inline text commit, and a rename — plus "never takes back a link the client
  chose").
- Evidence — E2E: `multipage-nav.spec.ts` "menu items wired up by their own name" (3 tests × 3
  engines), asserting the store AND the nav map the client actually reads
  (`Home: menu -> Menu`, `Home: Specials -> Not linked yet`).

## Open Questions
- ~~Nav bar items: fixed set the client renames, or free add/remove?~~ **Decided at build:** free
  add/remove, capped at 7 in the UI (see Notes).

## Notes & Decisions
- **Document schema v2 = `{ schemaVersion: 2, siteSettings, pages: [{ id, name, blocks }] }`.**
  No slugs stored (export derives them per `docs/export-format.md` §4.1, so a rename can never
  leave a stale one) and no `navLinks` graph (§2.1 — links live on blocks, the graph is derived).
- **Page ids are free-form and semantic** — `page-menu`, `page-menu-2` on collision, `page` when
  the name has no usable characters. §4.8 remaps every id to `pg_NNNN` at package time, so a
  readable id costs the export nothing and buys much better selectors and debugging. Ids are
  minted once from the name and NEVER change on rename, because links point at them.
- **Page SWITCHING is not undoable; every other page operation is.** `currentPageId` lives in the
  store but not in `CanvasDocument`, so it is neither snapshotted into history nor autosaved —
  the same reasoning that keeps selection out (undo should put the client's content back, not
  teleport them). Add / rename / duplicate / delete / reorder all change `pages` and are therefore
  ordinary history steps. `replaceDocument` prunes `currentPageId` to `pages[0]` when an undo
  takes back the page being looked at.
- **Exactly-one-page minimum** is enforced in `document.ts` (`MIN_PAGE_COUNT`), and the Delete
  button is disabled at one page — a site with no pages is not a site.
- **Deleting is a two-step in-app confirm**, matching "Start over" and for the same reasons
  recorded in `feature-autosave.md` (never `window.confirm`).
- **Reordering is "Move left" / "Move right" buttons, not drag-and-drop.** A drag between tabs is
  the one gesture that behaves differently in all three engines, is awkward on a trackpad and is
  impossible from a keyboard.
- **Deleting a page reverts links to it in the same immutable pass** and returns the count, which
  the strip turns into a non-blocking notice ("…2 links that pointed at it are no longer linked").
  The notice is `DesignToast` — a separate `toast` slot in `editorStore`, deliberately NOT the
  storage notice, so a successful autosave can never wipe a design message off the screen and vice
  versa. It stays until dismissed rather than expiring on a timer (a timed toast is both missable
  and the classic source of a flaky cross-engine test).
- **The nav map is derived on every render** from the blocks (`src/canvas/navMap.ts`), never
  stored — §2.1 is explicit that the graph has no field of its own, and a stored copy is exactly
  what drifts.
- **Nav bar items are structured `{ id, label, link }`, and `block.text` is kept as their
  comma-joined labels** by one function (`withNavItems`). That keeps the Stage 1 inline editor,
  the "empty text = untouched" placeholder rule and the block's rendered face all working, while
  the links live where the export needs them. Typing into the block rebuilds the items and matches
  surviving labels **by label, not by position**, so inserting "Menu" between "Home" and "About"
  keeps About's wiring on About.
- **That one-writer invariant only holds because labels are CONSTRAINED, and the constraint is now
  enforced** (review bounce, HIGH-1/HIGH-2). `items → text → items` is only lossless if every label
  is non-empty and contains no comma — otherwise the text form cannot describe the menu it came
  from, and the next inline commit silently drops an item and its wiring. Both halves are enforced
  at both boundaries, through one function (`normaliseNavLabel`): **empty is refused** —
  `withNavItemLabel` hands back the identical block (so it is not even an undo step) and
  `parseNavItem` treats a blank label as a corrupt payload, matching the schema's `minLength: 1`
  (§2.7); **a comma is replaced with a space** and runs of whitespace collapsed, so "Bread, Cakes"
  becomes "Bread Cakes" rather than two items. A comma is dropped rather than escaped because the
  text form has exactly one delimiter and the alternative — an escaping scheme in a field a client
  types menus into — buys nothing for a character no menu label needs. The round trip is pinned by
  a regression test rather than left as a claim.
- **A MENU LABEL THAT IS A PAGE NAME WIRES ITSELF UP** (added 2026-07-28, UX audit POLISH-3).
  `linkForLabel(label, pages)` matches case-insensitively but otherwise exactly — "Menu" finds
  the page called Menu, "Our menu" finds nothing and stays `none` rather than guessing. It runs
  where a label is BORN or COMMITTED (`createNavItem`, `navItemsFromText` for labels that are new
  to the block, `withNavItemAdded`, `withNavItemLabel`) and only while the item's link is `none`:
  an explicit choice, or a page link set by an earlier match, is never repointed by a later
  rename. There is deliberately no provenance flag distinguishing "auto" from "chosen" — one
  more field to persist, migrate and keep honest, to protect a case ("I renamed the item and
  expected the link to follow") the client can fix in the dropdown in one click.
- **Nav item caps: UI 7, stored/schema 10** — exactly the split `docs/export-format.md` §2.7
  describes ("the schema is the outer bound, the UI the inner"). The Add button disables at 7;
  labels typed straight into the block past 10 are dropped, because a menu that cannot be exported
  is not a menu we can promise to build. A payload carrying >10 items is corrupt.
- **External links are only written to the store once valid** (http(s) with a host — the schema's
  own rule); until then the picker holds the draft and shows a hint, so a half-typed URL can never
  reach the package.
- **The details panel is a docked right-hand sidebar with three tabs (Block / Site / Nav map), not
  a modal.** A modal would hide the design being described, needs a focus trap and scroll lock to
  be correct, and behaves differently in each engine. The tab deliberately does NOT follow the
  selection — auto-switching would yank a client out of a half-typed paragraph.
- **`playwright.config.ts` viewport widened 1600 → 1920.** The 1:1 fit-to-window promise the whole
  suite's coordinate maths depends on needs `1200 + 240 (palette) + 304 (panel) + 64 (margins) =
  1808`; at 1600 every scripted drag silently became a 0.83-scale drag. Caught by eight
  pre-existing geometry tests failing on the first cross-engine run.
- **`data-linked` on the block plus a `↪`/`↗` glyph in the pill / menu item** are how a wired link
  shows on the page itself; the nav map is the summary view.
