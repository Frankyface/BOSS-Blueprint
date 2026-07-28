import { beforeEach, describe, expect, it } from 'vitest'

import { pageLink } from './links.ts'
import {
  createNavItem,
  NAV_ITEMS_SCHEMA_MAX,
  NAV_ITEMS_UI_MAX,
  navItemLabels,
  navItemsFromText,
  parseNavItem,
  resetNavItemIdSequence,
  withNavItems,
} from './navItems.ts'
import type { Block, NavItem } from './types.ts'

const navBar = (overrides: Partial<Block> = {}): Block => ({
  id: 'nav-block',
  type: 'nav-bar',
  x: 0,
  y: 0,
  width: 1200,
  height: 72,
  text: '',
  items: [],
  ...overrides,
})

beforeEach(() => {
  resetNavItemIdSequence()
})

describe('createNavItem', () => {
  it('starts unlinked, with the label trimmed', () => {
    const item = createNavItem('  Menu  ')

    expect(item.label).toBe('Menu')
    expect(item.link).toEqual({ kind: 'none' })
    expect(item.id.length).toBeGreaterThan(0)
  })

  it('never repeats an id', () => {
    const ids = Array.from({ length: 5 }, () => createNavItem('Menu').id)

    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('withNavItems', () => {
  it('keeps the block text as the joined labels', () => {
    const block = withNavItems(navBar(), [createNavItem('Home'), createNavItem('Menu')])

    expect(block.text).toBe('Home, Menu')
    expect(navItemLabels(block.items ?? [])).toBe('Home, Menu')
  })

  it('empties the text when the last item goes', () => {
    const filled = withNavItems(navBar(), [createNavItem('Home')])

    expect(withNavItems(filled, []).text).toBe('')
  })

  it('never stores more than the export schema allows', () => {
    const items = Array.from({ length: NAV_ITEMS_SCHEMA_MAX + 3 }, (_, index) =>
      createNavItem(`Item ${String(index)}`),
    )

    expect(withNavItems(navBar(), items).items).toHaveLength(NAV_ITEMS_SCHEMA_MAX)
  })

  it('leaves the UI cap below the schema cap, as the export format says it should', () => {
    expect(NAV_ITEMS_UI_MAX).toBeLessThan(NAV_ITEMS_SCHEMA_MAX)
  })
})

describe('navItemsFromText', () => {
  it('splits a comma-separated menu', () => {
    expect(navItemsFromText('Home, About, Contact').map((item) => item.label)).toEqual([
      'Home',
      'About',
      'Contact',
    ])
  })

  it('drops empty entries and stray separators', () => {
    expect(navItemsFromText('Home,,  ,Contact,').map((item) => item.label)).toEqual([
      'Home',
      'Contact',
    ])
  })

  it('keeps the wiring of a label that survived the edit, wherever it moved to', () => {
    const existing: NavItem[] = [
      { id: 'nav-home', label: 'Home', link: { kind: 'none' } },
      { id: 'nav-about', label: 'About', link: pageLink('page-about') },
    ]

    const items = navItemsFromText('Home, Menu, About', existing)

    expect(items.map((item) => item.label)).toEqual(['Home', 'Menu', 'About'])
    // About kept its id AND its link even though a new item was inserted above it.
    expect(items[2]).toEqual(existing[1])
    expect(items[1]?.link).toEqual({ kind: 'none' })
  })

  it('matches an existing label regardless of case', () => {
    const existing: NavItem[] = [{ id: 'nav-home', label: 'Home', link: pageLink('page-home') }]

    expect(navItemsFromText('HOME', existing)[0]?.id).toBe('nav-home')
  })

  it('gives an empty menu for empty text', () => {
    expect(navItemsFromText('')).toEqual([])
  })
})

describe('parseNavItem', () => {
  it('reads a well-formed item', () => {
    expect(parseNavItem({ id: 'nav-1', label: 'Home', link: { kind: 'none' } })).toEqual({
      id: 'nav-1',
      label: 'Home',
      link: { kind: 'none' },
    })
  })

  it.each([
    ['not an object', 'Home'],
    ['no id', { label: 'Home', link: { kind: 'none' } }],
    ['an empty id', { id: '', label: 'Home', link: { kind: 'none' } }],
    ['no label', { id: 'nav-1', link: { kind: 'none' } }],
    ['a non-string label', { id: 'nav-1', label: 3, link: { kind: 'none' } }],
    ['no link', { id: 'nav-1', label: 'Home' }],
    ['a bad link', { id: 'nav-1', label: 'Home', link: { kind: 'wat' } }],
  ])('refuses an item with %s', (_label, value) => {
    expect(parseNavItem(value)).toBeNull()
  })
})
