import { beforeEach, describe, expect, it } from 'vitest'

import { withLink, withNavItemAdded, withNavItemLink, withTypeDefaults } from './blockEdits.ts'
import { resetBlockIdSequence } from './blockFactory.ts'
import { PAGE_EXTRA_SPACE_MAX_PX, PAGE_EXTRA_SPACE_STEP_PX } from './constants.ts'
import {
  addPage,
  blocksOfPage,
  deletePage,
  documentsEqual,
  duplicatePage,
  emptyDocument,
  MIN_PAGE_COUNT,
  movePage,
  pageNames,
  pageOfBlock,
  renamePage,
  withPageBlocks,
  withPageExtraBottom,
  withPageSpaceAdded,
  withSiteSettings,
} from './document.ts'
import { externalLink, pageLink } from './links.ts'
import { pageById } from './pages.ts'
import { applySettingsPatch, emptySiteSettings } from './siteSettings.ts'
import type { Block, CanvasDocument } from './types.ts'

const button = (id: string, overrides: Partial<Block> = {}): Block =>
  withTypeDefaults({
    id,
    type: 'button',
    x: 0,
    y: 0,
    width: 200,
    height: 56,
    text: 'Go',
    ...overrides,
  })

const navBar = (id: string): Block =>
  withTypeDefaults({ id, type: 'nav-bar', x: 0, y: 0, width: 1200, height: 72, text: '' })

/** Home + Menu, with `count` links from Home pointing at Menu. */
function siteWithLinks(): CanvasDocument {
  const base = addPage(emptyDocument(), 'Menu').document
  const menuId = base.pages[1]?.id ?? ''

  return withPageBlocks(base, base.pages[0]?.id ?? '', () => {
    const wiredButton = withLink(button('b1'), pageLink(menuId))
    const bar = withNavItemAdded(withNavItemAdded(navBar('n1'), 'Home'), 'Menu')
    const menuItemId = bar.items?.[1]?.id ?? ''

    return [wiredButton, withNavItemLink(bar, menuItemId, pageLink(menuId))]
  })
}

beforeEach(() => {
  resetBlockIdSequence()
})

describe('emptyDocument', () => {
  it('starts as one page called Home with nothing on it', () => {
    const document = emptyDocument()

    expect(document.pages).toHaveLength(1)
    expect(document.pages[0]).toMatchObject({ name: 'Home', blocks: [] })
    expect(document.siteSettings).toEqual(emptySiteSettings())
  })
})

describe('withPageBlocks', () => {
  it('replaces one page\'s blocks and leaves the others alone', () => {
    const document = addPage(emptyDocument(), 'Menu').document
    const homeId = document.pages[0]?.id ?? ''

    const next = withPageBlocks(document, homeId, () => [button('b1')])

    expect(blocksOfPage(next, homeId)).toHaveLength(1)
    expect(next.pages[1]).toBe(document.pages[1])
  })

  it('returns the SAME document when the updater changed nothing', () => {
    const document = emptyDocument()
    const homeId = document.pages[0]?.id ?? ''

    expect(withPageBlocks(document, homeId, (blocks) => blocks)).toBe(document)
    expect(withPageBlocks(document, 'nope', () => [button('b1')])).toBe(document)
  })

  it('reports no blocks for a page that is not there', () => {
    expect(blocksOfPage(emptyDocument(), 'nope')).toEqual([])
    expect(blocksOfPage(emptyDocument(), null)).toEqual([])
  })
})

/**
 * WHICH PAGE HOLDS A BLOCK, site-wide. It exists so an image upload that finishes
 * after the client has walked to another page can tell them where their image box
 * actually is, instead of announcing that it is gone (review follow-up).
 */
describe('pageOfBlock', () => {
  const twoPages = (): CanvasDocument => {
    const base = addPage(emptyDocument(), 'Menu').document
    return withPageBlocks(base, base.pages[1]?.id ?? '', () => [button('on-menu')])
  }

  it('finds the page a block lives on, wherever it is', () => {
    const document = twoPages()

    expect(pageOfBlock(document, 'on-menu')?.name).toBe('Menu')
  })

  it('is null for a block that is nowhere in the design', () => {
    expect(pageOfBlock(twoPages(), 'deleted-block')).toBeNull()
  })

  it('is null in an empty design', () => {
    expect(pageOfBlock(emptyDocument(), 'anything')).toBeNull()
  })
})

describe('addPage', () => {
  it('appends a named page and hands back its id', () => {
    const { document, pageId } = addPage(emptyDocument(), 'Menu')

    expect(pageNames(document)).toEqual(['Home', 'Menu'])
    expect(pageId).toBe('page-menu')
  })

  it('keeps ids unique even when two pages share a name', () => {
    const once = addPage(emptyDocument(), 'Menu')
    const twice = addPage(once.document, 'Menu')

    expect(twice.pageId).toBe('page-menu-2')
  })
})

describe('renamePage', () => {
  it('renames without changing the id, so links keep pointing at it', () => {
    const document = addPage(emptyDocument(), 'Menu').document

    const renamed = renamePage(document, 'page-menu', 'Our food')

    expect(renamed.pages[1]).toMatchObject({ id: 'page-menu', name: 'Our food' })
  })

  it('ignores an empty rename, an unchanged rename and an unknown page', () => {
    const document = addPage(emptyDocument(), 'Menu').document

    expect(renamePage(document, 'page-menu', '   ')).toBe(document)
    expect(renamePage(document, 'page-menu', 'Menu')).toBe(document)
    expect(renamePage(document, 'nope', 'Menu')).toBe(document)
  })
})

describe('duplicatePage', () => {
  it('drops the copy straight after the original, with a readable name', () => {
    const document = addPage(addPage(emptyDocument(), 'Menu').document, 'Contact').document

    const { document: next, pageId } = duplicatePage(document, 'page-menu')

    expect(pageNames(next)).toEqual(['Home', 'Menu', 'Menu copy', 'Contact'])
    expect(pageId).toBe('page-menu-copy')
  })

  it('copies the blocks with fresh ids', () => {
    const withBlocks = withPageBlocks(emptyDocument(), 'page-home', () => [button('b1')])

    const { document, pageId } = duplicatePage(withBlocks, 'page-home')
    const copied = blocksOfPage(document, pageId)

    expect(copied).toHaveLength(1)
    expect(copied[0]?.id).not.toBe('b1')
    expect(copied[0]?.text).toBe('Go')
  })

  it('ignores an unknown page', () => {
    const document = emptyDocument()

    expect(duplicatePage(document, 'nope').document).toBe(document)
  })

  /**
   * REGRESSION: `duplicatePage` spreads a FRESHLY CREATED blank page and re-adds
   * the source's fields by name, so it drops any new `Page` field by construction.
   * The empty room the client added is theirs, and a copy that quietly lost it is a
   * page that changed height the moment it was duplicated.
   */
  it('carries the extra bottom space onto the copy', () => {
    const stretched = withPageExtraBottom(emptyDocument(), 'page-home', 400)

    const { document, pageId } = duplicatePage(stretched, 'page-home')

    expect(pageById(document.pages, pageId)?.extraBottomPx).toBe(400)
  })

  it('leaves a copy of an untouched page without the key at all', () => {
    const { document, pageId } = duplicatePage(emptyDocument(), 'page-home')
    const copy = pageById(document.pages, pageId)

    expect(copy && 'extraBottomPx' in copy).toBe(false)
  })
})

/**
 * The page-length store's one pure function. Same identity-in-identity-out contract
 * as `withPageBlocks`: the session subscriber decides "is this an undo step?" by
 * identity, so a no-op must return the document it was handed.
 */
describe('withPageExtraBottom', () => {
  it('writes the amount asked for', () => {
    const next = withPageExtraBottom(emptyDocument(), 'page-home', 400)

    expect(pageById(next.pages, 'page-home')?.extraBottomPx).toBe(400)
  })

  it('REMOVES the key rather than writing a zero, so a trimmed page has one shape', () => {
    const stretched = withPageExtraBottom(emptyDocument(), 'page-home', 400)

    const trimmed = withPageExtraBottom(stretched, 'page-home', 0)
    const page = pageById(trimmed.pages, 'page-home')

    expect(page && 'extraBottomPx' in page).toBe(false)
    expect(page).toEqual(pageById(emptyDocument().pages, 'page-home'))
  })

  it('clamps and grid-snaps whatever it is handed', () => {
    const capped = withPageExtraBottom(emptyDocument(), 'page-home', 99_999)
    expect(pageById(capped.pages, 'page-home')?.extraBottomPx).toBe(PAGE_EXTRA_SPACE_MAX_PX)

    const snapped = withPageExtraBottom(emptyDocument(), 'page-home', 137)
    expect(pageById(snapped.pages, 'page-home')?.extraBottomPx).toBe(136)
  })

  it('returns the ORIGINAL document when nothing would change', () => {
    const document = emptyDocument()

    expect(withPageExtraBottom(document, 'page-home', 0)).toBe(document)
    expect(withPageExtraBottom(document, 'page-home', -50)).toBe(document)
    expect(withPageExtraBottom(document, 'nope', 400)).toBe(document)

    const stretched = withPageExtraBottom(document, 'page-home', 400)
    expect(withPageExtraBottom(stretched, 'page-home', 400)).toBe(stretched)
  })

  it('adds one band per click, on top of whatever is already there', () => {
    const once = withPageSpaceAdded(emptyDocument(), 'page-home')
    const twice = withPageSpaceAdded(once, 'page-home')

    expect(pageById(once.pages, 'page-home')?.extraBottomPx).toBe(PAGE_EXTRA_SPACE_STEP_PX)
    expect(pageById(twice.pages, 'page-home')?.extraBottomPx).toBe(PAGE_EXTRA_SPACE_STEP_PX * 2)
  })

  it('stops adding at the cap rather than growing without limit', () => {
    let document = withPageExtraBottom(emptyDocument(), 'page-home', PAGE_EXTRA_SPACE_MAX_PX)

    const atCap = document
    document = withPageSpaceAdded(document, 'page-home')

    expect(pageById(document.pages, 'page-home')?.extraBottomPx).toBe(PAGE_EXTRA_SPACE_MAX_PX)
    expect(document).toBe(atCap)
  })

  it('never touches the blocks or the pen marks it is standing on', () => {
    const withBlocks = withPageBlocks(emptyDocument(), 'page-home', () => [button('b1')])

    const stretched = withPageExtraBottom(withBlocks, 'page-home', 400)
    const trimmed = withPageExtraBottom(stretched, 'page-home', 0)

    expect(blocksOfPage(trimmed, 'page-home')).toBe(blocksOfPage(withBlocks, 'page-home'))
  })
})

describe('deletePage', () => {
  it('removes the page', () => {
    const document = addPage(emptyDocument(), 'Menu').document

    const { document: next } = deletePage(document, 'page-menu')

    expect(pageNames(next)).toEqual(['Home'])
  })

  it('refuses to delete the last page', () => {
    const document = emptyDocument()

    expect(deletePage(document, 'page-home')).toEqual({ document, revertedLinks: 0 })
    expect(document.pages.length).toBe(MIN_PAGE_COUNT)
  })

  it('ignores an unknown page', () => {
    const document = addPage(emptyDocument(), 'Menu').document

    expect(deletePage(document, 'nope').document).toBe(document)
  })

  it('reverts every link that pointed at it, and counts them', () => {
    const site = siteWithLinks()

    const { document, revertedLinks } = deletePage(site, 'page-menu')
    const home = document.pages[0]

    expect(revertedLinks).toBe(2)
    expect(home?.blocks[0]?.link).toEqual({ kind: 'none' })
    expect(home?.blocks[1]?.items?.map((item) => item.link.kind)).toEqual(['none', 'none'])
  })

  it('leaves links to OTHER pages and external links alone', () => {
    const site = addPage(siteWithLinks(), 'Contact').document
    const wired = withPageBlocks(site, 'page-contact', () => [
      withLink(button('b2'), externalLink('https://boss.test')),
      withLink(button('b3'), pageLink('page-home')),
    ])

    const { document } = deletePage(wired, 'page-menu')
    const contact = document.pages[1]

    expect(contact?.blocks[0]?.link).toEqual({ kind: 'external', url: 'https://boss.test' })
    expect(contact?.blocks[1]?.link).toEqual({ kind: 'page', pageId: 'page-home' })
  })

  it('keeps a nav bar\'s labels when only its links revert', () => {
    const { document } = deletePage(siteWithLinks(), 'page-menu')

    expect(document.pages[0]?.blocks[1]?.text).toBe('Home, Menu')
  })

  it('does not mutate the document it was given', () => {
    const site = siteWithLinks()
    const before = structuredClone(site)

    deletePage(site, 'page-menu')

    expect(site).toEqual(before)
  })
})

describe('movePage', () => {
  it('moves one slot in either direction', () => {
    const document = addPage(addPage(emptyDocument(), 'Menu').document, 'Contact').document

    expect(pageNames(movePage(document, 'page-contact', -1))).toEqual(['Home', 'Contact', 'Menu'])
    expect(pageNames(movePage(document, 'page-home', 1))).toEqual(['Menu', 'Home', 'Contact'])
  })

  it('does nothing at the ends, for a zero move, or for an unknown page', () => {
    const document = addPage(emptyDocument(), 'Menu').document

    expect(movePage(document, 'page-home', -1)).toBe(document)
    expect(movePage(document, 'page-menu', 1)).toBe(document)
    expect(movePage(document, 'page-menu', 0)).toBe(document)
    expect(movePage(document, 'nope', 1)).toBe(document)
  })
})

describe('withSiteSettings and documentsEqual', () => {
  it('replaces the settings, and no-ops when they did not change', () => {
    const document = emptyDocument()
    const changed = withSiteSettings(document, applySettingsPatch(document.siteSettings, {
      businessName: 'BOSS',
    }))

    expect(changed.siteSettings.businessName).toBe('BOSS')
    expect(withSiteSettings(document, emptySiteSettings())).toBe(document)
  })

  it('compares pages by identity and settings by value', () => {
    const document = emptyDocument()

    expect(documentsEqual(document, { ...document, siteSettings: emptySiteSettings() })).toBe(true)
    expect(documentsEqual(document, emptyDocument())).toBe(false)
    expect(
      documentsEqual(document, withSiteSettings(document, applySettingsPatch(document.siteSettings, { vibe: 'warm' }))),
    ).toBe(false)
  })
})
