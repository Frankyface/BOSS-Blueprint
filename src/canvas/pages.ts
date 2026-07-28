import { createBlockId } from './blockFactory.ts'
import { createNavItemId } from './navItems.ts'
import type { Block, Page } from './types.ts'

/**
 * PAGES — naming, identity and duplication.
 *
 * Page ids are free-form and SEMANTIC (`page-menu`), which the export format
 * explicitly allows and expects: `docs/export-format.md` §4.8 remaps every
 * internal id to its public `pg_NNNN` form at package time, so a readable id here
 * costs the export nothing and buys far better E2E selectors and debugging.
 * Slugs are NOT stored — §4.1 derives them from the name at every export, so a
 * rename can never leave a stale slug behind.
 *
 * Ids are minted from the name once and never change afterwards: links point at
 * ids, so a rename must not re-target every button on the site.
 */

export const HOME_PAGE_NAME = 'Home'
export const NEW_PAGE_NAME = 'New page'

/** Long enough for "Frequently asked questions", short enough to fit a page tab. */
export const PAGE_NAME_MAX_LENGTH = 40

/** What a page id falls back to when the name has no usable characters at all. */
const PAGE_ID_PREFIX = 'page'

const DUPLICATE_SUFFIX = 'copy'

/** Trim, collapse runs of whitespace, cap the length; empty names are refused. */
export function normalisePageName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, PAGE_NAME_MAX_LENGTH)
}

function idStemFor(name: string): string {
  const stem = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return stem.length > 0 ? `${PAGE_ID_PREFIX}-${stem}` : PAGE_ID_PREFIX
}

/** `page-menu`, or `page-menu-2` when that is taken. Suffixes never collide. */
export function createPageId(name: string, takenIds: Iterable<string>): string {
  const taken = new Set(takenIds)
  const stem = idStemFor(name)
  if (!taken.has(stem)) return stem

  let suffix = 2
  while (taken.has(`${stem}-${suffix}`)) suffix += 1
  return `${stem}-${suffix}`
}

export function createPage(
  name: string,
  takenIds: Iterable<string> = [],
  blocks: readonly Block[] = [],
): Page {
  const pageName = normalisePageName(name) || NEW_PAGE_NAME
  return { id: createPageId(pageName, takenIds), name: pageName, blocks }
}

/** "Menu" → "Menu copy" → "Menu copy 2" … so duplicating twice reads sensibly. */
export function duplicatePageName(name: string, takenNames: Iterable<string>): string {
  const taken = new Set(takenNames)
  const base = normalisePageName(`${name} ${DUPLICATE_SUFFIX}`)
  if (!taken.has(base)) return base

  let suffix = 2
  while (taken.has(`${base} ${suffix}`)) suffix += 1
  return `${base} ${suffix}`
}

/**
 * Copy blocks onto a new page with FRESH ids.
 *
 * Block ids are unique site-wide (the validator treats a repeat as corruption, and
 * §4.8 numbers blocks site-wide at export), so a duplicated page cannot re-use
 * them. Nav-item ids are minted fresh for the same reason. Links are copied as-is:
 * a duplicated page pointing at the same targets is what the client expects.
 */
export function duplicateBlocks(blocks: readonly Block[]): readonly Block[] {
  return blocks.map((block) => {
    const copy: Block = { ...block, id: createBlockId() }
    if (!copy.items) return copy

    return {
      ...copy,
      items: copy.items.map((item) => ({ ...item, id: createNavItemId() })),
    }
  })
}

export function pageById(pages: readonly Page[], pageId: string): Page | null {
  return pages.find((page) => page.id === pageId) ?? null
}

export function pageIndexById(pages: readonly Page[], pageId: string): number {
  return pages.findIndex((page) => page.id === pageId)
}
