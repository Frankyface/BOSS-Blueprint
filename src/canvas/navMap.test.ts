import { describe, expect, it } from 'vitest'

import { withLink, withNavItemAdded, withNavItemLink, withTypeDefaults } from './blockEdits.ts'
import { addPage, deletePage, emptyDocument, withPageBlocks } from './document.ts'
import { externalLink, pageLink } from './links.ts'
import { buildNavMap, countNavMapEntries, describeLink, NO_LINK_DESCRIPTION } from './navMap.ts'
import { createPage } from './pages.ts'
import type { Block, CanvasDocument } from './types.ts'

const button = (id: string, text: string): Block =>
  withTypeDefaults({ id, type: 'button', x: 0, y: 0, width: 200, height: 56, text })

const navBar = (id: string): Block =>
  withTypeDefaults({ id, type: 'nav-bar', x: 0, y: 0, width: 1200, height: 72, text: '' })

/** Home carries a wired button, a wired menu item and an unwired menu item. */
function site(): CanvasDocument {
  const base = addPage(emptyDocument(), 'Menu').document

  return withPageBlocks(base, 'page-home', () => {
    const bar = withNavItemAdded(withNavItemAdded(navBar('n1'), 'Home'), 'Menu')
    const homeItemId = bar.items?.[0]?.id ?? ''

    return [
      withLink(button('b1', 'See the menu'), pageLink('page-menu')),
      withLink(button('b2', 'Follow us'), externalLink('https://instagram.test/boss')),
      withNavItemLink(bar, homeItemId, pageLink('page-home')),
    ]
  })
}

describe('describeLink', () => {
  const pages = [createPage('Home'), createPage('Menu', ['page-home'])]

  it('names the page, prints the address, and says so when nothing is wired', () => {
    expect(describeLink(pageLink('page-menu'), pages)).toBe('Menu')
    expect(describeLink(externalLink('https://a.test'), pages)).toBe('https://a.test')
    expect(describeLink({ kind: 'none' }, pages)).toBe(NO_LINK_DESCRIPTION)
  })

  it('does not pretend a missing page is still there', () => {
    expect(describeLink(pageLink('page-gone'), pages)).not.toBe('Menu')
    expect(describeLink(pageLink('page-gone'), pages).length).toBeGreaterThan(0)
  })
})

describe('buildNavMap', () => {
  it('lists every page, in page order', () => {
    const map = buildNavMap(site().pages)

    expect(map.map((entry) => entry.pageName)).toEqual(['Home', 'Menu'])
  })

  it('reports each button and each menu item as its own outgoing link', () => {
    const map = buildNavMap(site().pages)
    const home = map[0]

    expect(home?.entries.map((entry) => entry.source)).toEqual([
      'button',
      'button',
      'nav-item',
      'nav-item',
    ])
    expect(countNavMapEntries(map)).toBe(4)
  })

  it('resolves a page link to the page\'s current name', () => {
    const map = buildNavMap(site().pages)

    expect(map[0]?.entries[0]).toMatchObject({
      label: 'See the menu',
      targetName: 'Menu',
      description: 'Menu',
    })
  })

  it('prints an external link as its address, with no target page', () => {
    const map = buildNavMap(site().pages)

    expect(map[0]?.entries[1]).toMatchObject({
      targetName: null,
      description: 'https://instagram.test/boss',
    })
  })

  it('flags the links the client has not wired yet', () => {
    const map = buildNavMap(site().pages)

    expect(map[0]?.entries[3]).toMatchObject({
      label: 'Menu',
      description: NO_LINK_DESCRIPTION,
    })
  })

  it('uses the button\'s placeholder when the client has not labelled it', () => {
    const document = withPageBlocks(emptyDocument(), 'page-home', () => [button('b1', '')])

    expect(buildNavMap(document.pages)[0]?.entries[0]?.label.length).toBeGreaterThan(0)
  })

  it('is a pure derivation — deleting a page changes the map with no extra bookkeeping', () => {
    const { document } = deletePage(site(), 'page-menu')

    const map = buildNavMap(document.pages)

    expect(map).toHaveLength(1)
    expect(map[0]?.entries.map((entry) => entry.description)).toEqual([
      NO_LINK_DESCRIPTION,
      'https://instagram.test/boss',
      'Home',
      NO_LINK_DESCRIPTION,
    ])
  })

  it('gives an empty list for a page with nothing that links', () => {
    expect(buildNavMap(emptyDocument().pages)[0]?.entries).toEqual([])
  })
})
