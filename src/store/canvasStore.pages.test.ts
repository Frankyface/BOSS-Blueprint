import { beforeEach, describe, expect, it } from 'vitest'

import { resetBlockIdSequence } from '../canvas/blockFactory.ts'
import { emptyDocument } from '../canvas/document.ts'
import { pageLink } from '../canvas/links.ts'
import { resetNavItemIdSequence } from '../canvas/navItems.ts'

import { selectCurrentBlocks, selectHasContent, useCanvasStore } from './canvasStore.ts'

/**
 * The page and site-settings actions. The rules themselves are proven in
 * `src/canvas/document.test.ts`; these tests are about what the STORE does with
 * them — which page you land on, what happens to selection, and which changes are
 * document changes at all.
 */

const store = () => useCanvasStore.getState()
const blocks = () => selectCurrentBlocks(store())
const names = () => store().pages.map((page) => page.name)

beforeEach(() => {
  store().resetCanvas()
  resetBlockIdSequence()
  resetNavItemIdSequence()
})

describe('the starting document', () => {
  it('is one page called Home, which is the page you are on', () => {
    expect(names()).toEqual(['Home'])
    expect(store().currentPageId).toBe(store().pages[0]?.id)
    expect(store().siteSettings).toEqual(emptyDocument().siteSettings)
  })
})

describe('addPage', () => {
  it('adds a named page and moves you onto it', () => {
    const id = store().addPage('Menu')

    expect(names()).toEqual(['Home', 'Menu'])
    expect(store().currentPageId).toBe(id)
  })

  it('lands the new page empty, leaving the old one untouched', () => {
    store().addBlock('heading')
    const home = blocks()

    store().addPage('Menu')

    expect(blocks()).toEqual([])
    expect(store().pages[0]?.blocks).toBe(home)
  })

  it('clears selection, because the selected block is on another page now', () => {
    store().addBlock('heading')

    store().addPage('Menu')

    expect(store().selectedBlockId).toBeNull()
    expect(store().editingBlockId).toBeNull()
  })
})

describe('setCurrentPage', () => {
  it('swaps the canvas for that page\'s blocks', () => {
    const homeId = store().currentPageId
    store().addBlock('heading')
    const menuId = store().addPage('Menu')
    store().addBlock('button')

    store().setCurrentPage(homeId)
    expect(blocks().map((block) => block.type)).toEqual(['heading'])

    store().setCurrentPage(menuId)
    expect(blocks().map((block) => block.type)).toEqual(['button'])
  })

  it('is UI state, not a document change', () => {
    const homeId = store().currentPageId
    store().addPage('Menu')
    const pages = store().pages

    store().setCurrentPage(homeId)

    expect(store().pages).toBe(pages)
  })

  it('ignores an unknown page and a no-op switch', () => {
    const state = store()
    const before = useCanvasStore.getState()

    state.setCurrentPage('nope')
    state.setCurrentPage(before.currentPageId)

    expect(useCanvasStore.getState().currentPageId).toBe(before.currentPageId)
  })
})

describe('renamePage', () => {
  it('renames the page without moving anything', () => {
    store().renamePage(store().currentPageId, 'Our food')

    expect(names()).toEqual(['Our food'])
  })

  it('keeps links pointing at the renamed page', () => {
    const menuId = store().addPage('Menu')
    store().setCurrentPage(store().pages[0]?.id ?? '')
    const buttonId = store().addBlock('button')
    store().setBlockLink(buttonId, pageLink(menuId))

    store().renamePage(menuId, 'Our food')

    expect(blocks()[0]?.link).toEqual({ kind: 'page', pageId: menuId })
  })
})

describe('duplicatePage', () => {
  it('copies the page and moves you onto the copy', () => {
    store().addBlock('heading')

    const copyId = store().duplicatePage(store().currentPageId)

    expect(names()).toEqual(['Home', 'Home copy'])
    expect(store().currentPageId).toBe(copyId)
    expect(blocks()).toHaveLength(1)
  })

  it('gives the copied blocks their own ids', () => {
    const originalId = store().addBlock('heading')

    store().duplicatePage(store().pages[0]?.id ?? '')

    expect(blocks()[0]?.id).not.toBe(originalId)
  })
})

describe('deletePage', () => {
  it('removes the page and lands you on the one that took its place', () => {
    store().addPage('Menu')
    const contactId = store().addPage('Contact')
    store().setCurrentPage('page-menu')

    store().deletePage('page-menu')

    expect(names()).toEqual(['Home', 'Contact'])
    expect(store().currentPageId).toBe(contactId)
  })

  it('lands you on the new last page when the deleted one was last', () => {
    store().addPage('Menu')

    store().deletePage('page-menu')

    expect(store().currentPageId).toBe('page-home')
  })

  it('leaves you where you are when another page was deleted', () => {
    store().addPage('Menu')
    store().setCurrentPage('page-home')

    store().deletePage('page-menu')

    expect(store().currentPageId).toBe('page-home')
  })

  it('refuses to delete the last page, and reports nothing reverted', () => {
    const pages = store().pages

    expect(store().deletePage('page-home')).toBe(0)
    expect(store().pages).toBe(pages)
  })

  it('reverts links to the deleted page and reports how many', () => {
    const menuId = store().addPage('Menu')
    store().setCurrentPage('page-home')
    const buttonId = store().addBlock('button')
    store().setBlockLink(buttonId, pageLink(menuId))
    const navId = store().addBlock('nav-bar')
    store().addNavItem(navId, 'Menu')
    const itemId = blocks().find((block) => block.id === navId)?.items?.[0]?.id ?? ''
    store().setNavItemLink(navId, itemId, pageLink(menuId))

    const reverted = store().deletePage(menuId)

    expect(reverted).toBe(2)
    const home = store().pages[0]
    expect(home?.blocks.find((block) => block.id === buttonId)?.link).toEqual({ kind: 'none' })
    expect(home?.blocks.find((block) => block.id === navId)?.items?.[0]?.link).toEqual({
      kind: 'none',
    })
  })
})

describe('movePage', () => {
  it('reorders the strip without changing which page you are on', () => {
    store().addPage('Menu')
    store().addPage('Contact')

    store().movePage('page-contact', -1)

    expect(names()).toEqual(['Home', 'Contact', 'Menu'])
    expect(store().currentPageId).toBe('page-contact')
  })

  it('does nothing at the ends of the strip', () => {
    store().addPage('Menu')
    const pages = store().pages

    store().movePage('page-home', -1)
    store().movePage('page-menu', 1)

    expect(store().pages).toBe(pages)
  })
})

describe('site settings', () => {
  it('patches one field at a time', () => {
    store().updateSiteSettings({ businessName: "Martina's" })
    store().updateSiteSettings({ vibe: 'warm' })

    expect(store().siteSettings).toMatchObject({ businessName: "Martina's", vibe: 'warm' })
  })

  it('treats an unchanged value as no change at all', () => {
    store().updateSiteSettings({ businessName: 'BOSS' })
    const settings = store().siteSettings

    store().updateSiteSettings({ businessName: 'BOSS' })

    expect(store().siteSettings).toBe(settings)
  })

  it('adds, replaces and removes preferred colours', () => {
    store().setSiteColor(0, '#2F6F4F')
    store().setSiteColor(1, '#f7f1e3')

    expect(store().siteSettings.colors).toEqual(['#2f6f4f', '#f7f1e3'])

    store().setSiteColor(0, '#111111')
    expect(store().siteSettings.colors).toEqual(['#111111', '#f7f1e3'])

    store().removeSiteColor(0)
    expect(store().siteSettings.colors).toEqual(['#f7f1e3'])
  })

  it('ignores a colour that is not a hex value', () => {
    const settings = store().siteSettings

    store().setSiteColor(0, 'sage green')

    expect(store().siteSettings).toBe(settings)
  })

  it('never mutates the settings it replaces', () => {
    store().updateSiteSettings({ tagline: 'Slow food' })
    const before = store().siteSettings
    const snapshot = structuredClone(before)

    store().updateSiteSettings({ tagline: 'Fast smiles' })

    expect(before).toEqual(snapshot)
  })
})

describe('selectHasContent', () => {
  it('is false on a fresh design and true once anything exists', () => {
    expect(selectHasContent(store())).toBe(false)

    store().addBlock('heading')
    expect(selectHasContent(store())).toBe(true)

    store().resetCanvas()
    store().addPage('Menu')
    expect(selectHasContent(store())).toBe(true)

    store().resetCanvas()
    store().updateSiteSettings({ businessName: 'BOSS' })
    expect(selectHasContent(store())).toBe(true)
  })
})

describe('resetCanvas', () => {
  it('goes back to one empty Home page with empty settings', () => {
    store().addBlock('heading')
    store().addPage('Menu')
    store().updateSiteSettings({ businessName: 'BOSS' })

    store().resetCanvas()

    expect(names()).toEqual(['Home'])
    expect(blocks()).toEqual([])
    expect(selectHasContent(store())).toBe(false)
  })
})
