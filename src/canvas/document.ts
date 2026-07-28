import { isPageLinkTo, withPageLinkCleared } from './links.ts'
import { withNavItems } from './navItems.ts'
import {
  createPage,
  duplicateBlocks,
  duplicatePageName,
  HOME_PAGE_NAME,
  normalisePageName,
  pageById,
  pageIndexById,
} from './pages.ts'
import { duplicateStrokes } from './penStrokes.ts'
import { emptySiteSettings, siteSettingsEqual } from './siteSettings.ts'
import type { Block, CanvasDocument, Page, PenStroke, SiteSettings } from './types.ts'

/**
 * DOCUMENT-LEVEL TRANSFORMS — every page operation, as pure functions.
 *
 * The store's actions are three-liners on top of these, which is what keeps the
 * page rules (exactly one page minimum, link cleanup on delete, no-op detection)
 * unit-testable without mounting anything or touching Zustand.
 *
 * House rule throughout: **return the ORIGINAL document when nothing changed.**
 * The session subscriber decides "is this an undo step?" by identity, so a no-op
 * that allocated a new object would put an empty step on the client's undo stack.
 */

/** A site always has at least this many pages — you cannot delete your way to none. */
export const MIN_PAGE_COUNT = 1

/** Shared empty list so "this page has no pen marks" is a stable reference. */
const NO_STROKES: readonly PenStroke[] = []

export function emptyDocument(): CanvasDocument {
  return { siteSettings: emptySiteSettings(), pages: [createPage(HOME_PAGE_NAME)] }
}

export function blocksOfPage(document: CanvasDocument, pageId: string | null): readonly Block[] {
  if (pageId === null) return []
  return pageById(document.pages, pageId)?.blocks ?? []
}

export function strokesOfPage(
  document: CanvasDocument,
  pageId: string | null,
): readonly PenStroke[] {
  if (pageId === null) return NO_STROKES
  return pageById(document.pages, pageId)?.penStrokes ?? NO_STROKES
}

export function pageNames(document: CanvasDocument): readonly string[] {
  return document.pages.map((page) => page.name)
}

export function pageIds(document: CanvasDocument): readonly string[] {
  return document.pages.map((page) => page.id)
}

/** Replace one page's blocks. Identity in, identity out when the updater no-ops. */
export function withPageBlocks(
  document: CanvasDocument,
  pageId: string,
  update: (blocks: readonly Block[]) => readonly Block[],
): CanvasDocument {
  const index = pageIndexById(document.pages, pageId)
  if (index < 0) return document

  const page = document.pages[index]
  if (!page) return document

  const blocks = update(page.blocks)
  if (blocks === page.blocks) return document

  const pages = document.pages.slice()
  pages[index] = { ...page, blocks }
  return { ...document, pages }
}

/** The same contract as `withPageBlocks`, for the page's pen layer. */
export function withPageStrokes(
  document: CanvasDocument,
  pageId: string,
  update: (strokes: readonly PenStroke[]) => readonly PenStroke[],
): CanvasDocument {
  const index = pageIndexById(document.pages, pageId)
  if (index < 0) return document

  const page = document.pages[index]
  if (!page) return document

  const penStrokes = update(page.penStrokes)
  if (penStrokes === page.penStrokes) return document

  const pages = document.pages.slice()
  pages[index] = { ...page, penStrokes }
  return { ...document, pages }
}

export function withSiteSettings(
  document: CanvasDocument,
  settings: SiteSettings,
): CanvasDocument {
  if (siteSettingsEqual(document.siteSettings, settings)) return document
  return { ...document, siteSettings: settings }
}

export function addPage(
  document: CanvasDocument,
  name: string,
): { readonly document: CanvasDocument; readonly pageId: string } {
  const page = createPage(name, pageIds(document))
  return { document: { ...document, pages: [...document.pages, page] }, pageId: page.id }
}

export function renamePage(
  document: CanvasDocument,
  pageId: string,
  name: string,
): CanvasDocument {
  const index = pageIndexById(document.pages, pageId)
  const page = document.pages[index]
  if (!page) return document

  // An empty rename is a slip, not an instruction: keep the name they had.
  const next = normalisePageName(name)
  if (next.length === 0 || next === page.name) return document

  const pages = document.pages.slice()
  pages[index] = { ...page, name: next }
  return { ...document, pages }
}

/**
 * Copy a page, its blocks and its wiring, and drop the copy directly after it —
 * next to the original is where the client is looking.
 */
export function duplicatePage(
  document: CanvasDocument,
  pageId: string,
): { readonly document: CanvasDocument; readonly pageId: string } {
  const index = pageIndexById(document.pages, pageId)
  const source = document.pages[index]
  if (!source) return { document, pageId }

  const name = duplicatePageName(source.name, pageNames(document))
  const copy: Page = {
    ...createPage(name, pageIds(document)),
    blocks: duplicateBlocks(source.blocks),
    // The client's marks are part of the page they copied — with fresh ids, since
    // stroke ids are unique site-wide exactly like block ids.
    penStrokes: duplicateStrokes(source.penStrokes),
  }

  const pages = document.pages.slice()
  pages.splice(index + 1, 0, copy)
  return { document: { ...document, pages }, pageId: copy.id }
}

function withLinksToPageCleared(
  blocks: readonly Block[],
  pageId: string,
): { readonly blocks: readonly Block[]; readonly reverted: number } {
  let reverted = 0

  const next = blocks.map((block) => {
    if (block.link && isPageLinkTo(block.link, pageId)) {
      reverted += 1
      return { ...block, link: withPageLinkCleared(block.link, pageId) }
    }

    if (!block.items?.some((item) => isPageLinkTo(item.link, pageId))) return block

    const items = block.items.map((item) => {
      if (!isPageLinkTo(item.link, pageId)) return item
      reverted += 1
      return { ...item, link: withPageLinkCleared(item.link, pageId) }
    })
    return withNavItems(block, items)
  })

  return reverted === 0 ? { blocks, reverted } : { blocks: next, reverted }
}

export interface DeletePageResult {
  readonly document: CanvasDocument
  /** Links that pointed at the deleted page and are now `none` — drives the notice. */
  readonly revertedLinks: number
}

/**
 * Delete a page and clean up after it.
 *
 * Every link that pointed at the page reverts to `none` in the same immutable
 * pass, so a dangling `pageId` can never reach the export (§2.8). The last page
 * cannot be deleted: a site with no pages is not a site.
 */
export function deletePage(document: CanvasDocument, pageId: string): DeletePageResult {
  if (document.pages.length <= MIN_PAGE_COUNT) return { document, revertedLinks: 0 }
  if (pageIndexById(document.pages, pageId) < 0) return { document, revertedLinks: 0 }

  let revertedLinks = 0
  const pages = document.pages
    .filter((page) => page.id !== pageId)
    .map((page) => {
      const cleaned = withLinksToPageCleared(page.blocks, pageId)
      revertedLinks += cleaned.reverted
      return cleaned.blocks === page.blocks ? page : { ...page, blocks: cleaned.blocks }
    })

  return { document: { ...document, pages }, revertedLinks }
}

/** Move a page one slot left (-1) or right (+1). Out-of-range moves are no-ops. */
export function movePage(document: CanvasDocument, pageId: string, delta: number): CanvasDocument {
  const from = pageIndexById(document.pages, pageId)
  if (from < 0) return document

  const to = from + delta
  if (to < 0 || to >= document.pages.length || delta === 0) return document

  const pages = document.pages.slice()
  const [moved] = pages.splice(from, 1)
  if (!moved) return document
  pages.splice(to, 0, moved)
  return { ...document, pages }
}

/**
 * The document slice is only ever replaced wholesale, so identity is equality for
 * `pages`; site settings get a value comparison because the settings panel rebuilds
 * the object on every commit even when the client retyped the same words.
 */
export function documentsEqual(a: CanvasDocument, b: CanvasDocument): boolean {
  return a.pages === b.pages && siteSettingsEqual(a.siteSettings, b.siteSettings)
}
