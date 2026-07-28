import { beforeEach, describe, expect, it } from 'vitest'

import { navItemsOf } from '../canvas/blockEdits.ts'
import { resetBlockIdSequence } from '../canvas/blockFactory.ts'
import { externalLink, NO_LINK, pageLink } from '../canvas/links.ts'
import { NAV_ITEMS_SCHEMA_MAX, resetNavItemIdSequence } from '../canvas/navItems.ts'
import type { Block } from '../canvas/types.ts'

import { selectCurrentBlocks, useCanvasStore } from './canvasStore.ts'

/** Copy mode, button links and nav items, as the store exposes them. */

const store = () => useCanvasStore.getState()
const blocks = () => selectCurrentBlocks(store())
const blockById = (id: string): Block => {
  const found = blocks().find((block) => block.id === id)
  if (!found) throw new Error(`No block ${id} in the store`)
  return found
}

beforeEach(() => {
  store().resetCanvas()
  resetBlockIdSequence()
  resetNavItemIdSequence()
})

describe('copy mode', () => {
  it('starts every copy block on the client\'s own words', () => {
    expect(blockById(store().addBlock('heading')).copyMode).toBe('real')
    expect(blockById(store().addBlock('text')).copyMode).toBe('real')
  })

  it('switches mode and keeps the text already typed', () => {
    const id = store().addBlock('text')
    store().setBlockText(id, 'Half an intro')

    store().setBlockCopyMode(id, 'generate')

    expect(blockById(id)).toMatchObject({ copyMode: 'generate', text: 'Half an intro' })
  })

  it('keeps the description when the client switches back', () => {
    const id = store().addBlock('heading')
    store().setBlockCopyMode(id, 'generate')
    store().setBlockGenerateDescription(id, 'Warm welcome for a bakery')

    store().setBlockCopyMode(id, 'real')

    expect(blockById(id)).toMatchObject({
      copyMode: 'real',
      generateDescription: 'Warm welcome for a bakery',
    })
  })

  it('records the length hint', () => {
    const id = store().addBlock('text')

    store().setBlockLengthHint(id, '  ~2 sentences  ')

    expect(blockById(id).lengthHint).toBe('~2 sentences')
  })

  it('treats re-selecting the same mode as no change', () => {
    const id = store().addBlock('heading')
    const before = blocks()

    store().setBlockCopyMode(id, 'real')

    expect(blocks()).toBe(before)
  })

  it('will not put copy fields on a block that has no copy', () => {
    const id = store().addBlock('image')
    const before = blocks()

    store().setBlockCopyMode(id, 'generate')
    store().setBlockGenerateDescription(id, 'nope')

    expect(blocks()).toBe(before)
  })

  it('never mutates the block it replaces', () => {
    const id = store().addBlock('text')
    const before = blockById(id)
    const snapshot = structuredClone(before)

    store().setBlockCopyMode(id, 'generate')

    expect(before).toEqual(snapshot)
  })
})

describe('button links', () => {
  it('wires a button to a page and back to nothing', () => {
    const menuId = store().addPage('Menu')
    store().setCurrentPage('page-home')
    const id = store().addBlock('button')

    store().setBlockLink(id, pageLink(menuId))
    expect(blockById(id).link).toEqual({ kind: 'page', pageId: menuId })

    store().setBlockLink(id, NO_LINK)
    expect(blockById(id).link).toEqual({ kind: 'none' })
  })

  it('wires a button to an external address', () => {
    const id = store().addBlock('button')

    store().setBlockLink(id, externalLink('https://instagram.test/boss'))

    expect(blockById(id).link).toEqual({
      kind: 'external',
      url: 'https://instagram.test/boss',
    })
  })

  it('treats the same destination twice as no change', () => {
    const id = store().addBlock('button')
    store().setBlockLink(id, pageLink('page-home'))
    const before = blocks()

    store().setBlockLink(id, pageLink('page-home'))

    expect(blocks()).toBe(before)
  })

  it('ignores a link on a block that cannot carry one', () => {
    const id = store().addBlock('heading')
    const before = blocks()

    store().setBlockLink(id, pageLink('page-home'))

    expect(blocks()).toBe(before)
  })
})

describe('nav items', () => {
  it('adds items and keeps the block text as their labels', () => {
    const id = store().addBlock('nav-bar')

    store().addNavItem(id, 'Home')
    store().addNavItem(id, 'Menu')

    expect(navItemsOf(blockById(id)).map((item) => item.label)).toEqual(['Home', 'Menu'])
    expect(blockById(id).text).toBe('Home, Menu')
  })

  it('renames, wires and removes one item', () => {
    const id = store().addBlock('nav-bar')
    store().addNavItem(id, 'Home')
    const itemId = navItemsOf(blockById(id))[0]?.id ?? ''

    store().setNavItemLabel(id, itemId, 'Start here')
    expect(blockById(id).text).toBe('Start here')

    store().setNavItemLink(id, itemId, pageLink('page-home'))
    expect(navItemsOf(blockById(id))[0]?.link).toEqual({ kind: 'page', pageId: 'page-home' })

    store().removeNavItem(id, itemId)
    expect(navItemsOf(blockById(id))).toEqual([])
    expect(blockById(id).text).toBe('')
  })

  it('rebuilds the items when the client types into the block instead', () => {
    const id = store().addBlock('nav-bar')
    store().addNavItem(id, 'Home')
    const homeItemId = navItemsOf(blockById(id))[0]?.id ?? ''
    store().setNavItemLink(id, homeItemId, pageLink('page-home'))

    store().setBlockText(id, 'Home, Menu, Contact')

    const items = navItemsOf(blockById(id))
    expect(items.map((item) => item.label)).toEqual(['Home', 'Menu', 'Contact'])
    // Home kept its wiring; the two new labels start unlinked.
    expect(items[0]).toMatchObject({ id: homeItemId, link: { kind: 'page', pageId: 'page-home' } })
    expect(items[1]?.link).toEqual({ kind: 'none' })
  })

  it('normalises the typed text to the joined labels, so the two never drift', () => {
    const id = store().addBlock('nav-bar')

    store().setBlockText(id, 'Home,Menu ,  Contact')

    expect(blockById(id).text).toBe('Home, Menu, Contact')
  })

  it('never stores more items than the export schema allows', () => {
    const id = store().addBlock('nav-bar')
    const labels = Array.from({ length: NAV_ITEMS_SCHEMA_MAX + 4 }, (_, i) => `Item ${String(i)}`)

    store().setBlockText(id, labels.join(', '))

    expect(navItemsOf(blockById(id))).toHaveLength(NAV_ITEMS_SCHEMA_MAX)
  })

  it('ignores an unknown item id', () => {
    const id = store().addBlock('nav-bar')
    store().addNavItem(id, 'Home')
    const before = blocks()

    store().setNavItemLabel(id, 'nope', 'X')
    store().setNavItemLink(id, 'nope', pageLink('page-home'))
    store().removeNavItem(id, 'nope')

    expect(blocks()).toBe(before)
  })
})
