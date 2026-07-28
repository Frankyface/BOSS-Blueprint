# Feature: Multi-page + Navigation Map
_Stage: stage-2-full-sketching · Status: awaiting verification_

## Goal
Clients sketch whole sites, not single pages: add/rename/duplicate/delete pages, switch
between them, and wire buttons/nav items to target pages so the export carries the site's
link structure.

## Success Criteria
- [ ] Page strip/sidebar: add page (named, e.g. "Menu"), rename, duplicate, delete (with
      confirm), reorder; switching pages swaps the canvas content
- [ ] Buttons and nav-bar items have a "links to" picker listing the site's pages (or External
      URL / None); linked state is visible on the block
- [ ] Deleting a page cleans up links pointing at it (they revert to None, with a toast)
- [ ] A nav map summary (simple list view: each page → its outgoing links) matches reality

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
