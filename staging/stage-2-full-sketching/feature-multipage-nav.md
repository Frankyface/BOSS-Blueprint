# Feature: Multi-page + Navigation Map
_Stage: stage-2-full-sketching · Status: not started_

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
_Empty — nothing verified yet._

## Open Questions
- Nav bar items: fixed set the client renames, or free add/remove? Lean free add/remove capped
  at ~7. Decide at build, record here.

## Notes & Decisions
- none yet — revisit when starting.
