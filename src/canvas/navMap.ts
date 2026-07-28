import { linkOf, navItemsOf } from './blockEdits.ts'
import { displayText } from './blockText.ts'
import { pageById } from './pages.ts'
import type { BlockLink, Page } from './types.ts'

/**
 * THE NAV MAP — each page and everything it links out to.
 *
 * DERIVED, never stored. `docs/export-format.md` §2.1 is explicit that the nav
 * graph has no field of its own ("link data lives on `button` and `navBar` blocks;
 * the graph is derivable by walking them"), and a stored copy is exactly the kind
 * of thing that drifts from the blocks it claims to describe. Rebuilding it on
 * every render is a walk over a handful of blocks.
 */

export type NavLinkSource = 'button' | 'nav-item'

export interface NavMapEntry {
  /** Block id for a button, nav-item id for a menu entry — unique within the map. */
  readonly id: string
  readonly source: NavLinkSource
  readonly label: string
  readonly link: BlockLink
  /** Resolved target page name, when the link points at a page that still exists. */
  readonly targetName: string | null
  /** Ready-to-render "where does this go" text. */
  readonly description: string
}

export interface NavMapPage {
  readonly pageId: string
  readonly pageName: string
  readonly entries: readonly NavMapEntry[]
}

export const NO_LINK_DESCRIPTION = 'Not linked yet'
const MISSING_PAGE_DESCRIPTION = 'A page that is no longer here'

/** Human-readable destination for one link, resolved against the current pages. */
export function describeLink(link: BlockLink, pages: readonly Page[]): string {
  if (link.kind === 'none') return NO_LINK_DESCRIPTION
  if (link.kind === 'external') return link.url
  return pageById(pages, link.pageId)?.name ?? MISSING_PAGE_DESCRIPTION
}

function entriesForPage(page: Page, pages: readonly Page[]): readonly NavMapEntry[] {
  const entries: NavMapEntry[] = []

  for (const block of page.blocks) {
    if (block.type === 'button') {
      const link = linkOf(block)
      entries.push({
        id: block.id,
        source: 'button',
        label: displayText(block),
        link,
        targetName: link.kind === 'page' ? (pageById(pages, link.pageId)?.name ?? null) : null,
        description: describeLink(link, pages),
      })
      continue
    }

    if (block.type !== 'nav-bar') continue

    for (const item of navItemsOf(block)) {
      entries.push({
        id: item.id,
        source: 'nav-item',
        label: item.label,
        link: item.link,
        targetName:
          item.link.kind === 'page' ? (pageById(pages, item.link.pageId)?.name ?? null) : null,
        description: describeLink(item.link, pages),
      })
    }
  }

  return entries
}

export function buildNavMap(pages: readonly Page[]): readonly NavMapPage[] {
  return pages.map((page) => ({
    pageId: page.id,
    pageName: page.name,
    entries: entriesForPage(page, pages),
  }))
}

/** Total wired-or-not link slots on the site — the map's one-line summary. */
export function countNavMapEntries(map: readonly NavMapPage[]): number {
  return map.reduce((total, page) => total + page.entries.length, 0)
}
