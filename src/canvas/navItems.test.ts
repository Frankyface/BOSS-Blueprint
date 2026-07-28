import { beforeEach, describe, expect, it } from 'vitest'

import { pageLink } from './links.ts'
import {
  createNavItem,
  linkForLabel,
  NAV_ITEMS_SCHEMA_MAX,
  NAV_ITEMS_UI_MAX,
  navItemLabels,
  navItemsFromText,
  normaliseNavLabel,
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

/**
 * AUTO-LINKING BY NAME (UX audit POLISH-3). A client who types "Home, Menu" into
 * the nav bar has told us where those items go in the only words they have; the
 * app used to answer with two items reading "Not linked yet" beside two pages of
 * exactly those names.
 */
describe('linkForLabel', () => {
  const pages = [
    { id: 'page-home', name: 'Home' },
    { id: 'page-menu', name: 'Menu' },
    { id: 'page-find', name: 'Find us' },
  ]

  it.each([
    ['Home', 'page-home'],
    ['home', 'page-home'],
    ['MENU', 'page-menu'],
    ['  menu  ', 'page-menu'],
    ['Find us', 'page-find'],
    ['find US', 'page-find'],
  ])('wires %j to the page of that name', (label, pageId) => {
    expect(linkForLabel(label, pages)).toEqual(pageLink(pageId))
  })

  it.each(['Our menu', 'Home page', 'Contact', 'Find', '', '   '])(
    'leaves %j unlinked rather than guessing',
    (label) => {
      expect(linkForLabel(label, pages)).toEqual({ kind: 'none' })
    },
  )

  it('matches through an invisible character in either the label or the page name', () => {
    const withZeroWidth = 'Ho' + '\u200B' + 'me'

    expect(linkForLabel(withZeroWidth, pages)).toEqual(pageLink('page-home'))
    expect(linkForLabel('Home', [{ id: 'page-x', name: withZeroWidth }])).toEqual(
      pageLink('page-x'),
    )
  })

  it('is unlinked when there are no pages to match against', () => {
    expect(linkForLabel('Home')).toEqual({ kind: 'none' })
  })
})

describe('createNavItem with pages', () => {
  it('comes out of the box pointing at the page of the same name', () => {
    const item = createNavItem('Menu', [{ id: 'page-menu', name: 'Menu' }])

    expect(item.link).toEqual(pageLink('page-menu'))
  })

  it('stays unlinked when nothing matches', () => {
    expect(createNavItem('Specials', [{ id: 'page-menu', name: 'Menu' }]).link).toEqual({
      kind: 'none',
    })
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

  /** The audit's own path: typing the menu straight into the block. */
  it('wires up the labels that name a page, and only those', () => {
    const pages = [
      { id: 'page-home', name: 'Home' },
      { id: 'page-menu', name: 'Menu' },
    ]

    const items = navItemsFromText('Home, Menu, Specials', [], pages)

    expect(items.map((item) => item.link)).toEqual([
      pageLink('page-home'),
      pageLink('page-menu'),
      { kind: 'none' },
    ])
  })

  it('never re-points an item that already existed, however it was wired', () => {
    const existing: NavItem[] = [
      { id: 'nav-home', label: 'Home', link: { kind: 'external', url: 'https://boss.test' } },
    ]
    const pages = [{ id: 'page-home', name: 'Home' }]

    const items = navItemsFromText('Home, Menu', existing, pages)

    expect(items[0]).toEqual(existing[0])
    expect(items[1]?.link).toEqual({ kind: 'none' })
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

  /**
   * The other half of the label rule, at the FILE boundary (review bounce #1).
   * The export schema requires `minLength: 1`, so a blank entry would fail
   * validation at package time — far away from the file that caused it.
   */
  it.each([
    ['an empty label', ''],
    ['a whitespace-only label', '   '],
    ['a label that is only the separator', ','],
  ])('refuses an item with %s', (_case, label) => {
    expect(parseNavItem({ id: 'nav-1', label, link: { kind: 'none' } })).toBeNull()
  })

  it('normalises a smuggled-in comma rather than letting it re-split the menu', () => {
    const parsed = parseNavItem({ id: 'nav-1', label: 'Bread, Cakes', link: { kind: 'none' } })

    expect(parsed?.label).toBe('Bread Cakes')
  })

  it('trims and collapses whitespace, exactly as the writers do', () => {
    const parsed = parseNavItem({ id: 'nav-1', label: '  Our   Menu ', link: { kind: 'none' } })

    expect(parsed?.label).toBe('Our Menu')
  })
})

describe('normaliseNavLabel', () => {
  it.each([
    ['Home', 'Home'],
    // ZERO-WIDTH CHARACTERS, which a label pasted from a website or a Word document
    // carries invisibly: they survive trim, take up no room, and quietly stop the
    // label matching either a page name or its own earlier self (review follow-up).
    ['Ho\u200Bme', 'Home'],
    ['\uFEFFHome\u200D', 'Home'],
    ['Our\u2060 Menu', 'Our Menu'],
    ['\u200B\u200C\u200D', ''],
    ['  Home  ', 'Home'],
    ['Our   Menu', 'Our Menu'],
    ['Bread, Cakes', 'Bread Cakes'],
    ['Home,Shop', 'Home Shop'],
    [',,,', ''],
    ['', ''],
  ])('normalises %j to %j', (input, expected) => {
    expect(normaliseNavLabel(input)).toBe(expected)
  })
})

/**
 * THE ROUND TRIP IS LOSSLESS (review bounce #3).
 *
 * `withNavItems` writes `text` from the labels and the inline editor turns that
 * text back into items, so this pair runs on every keystroke-commit in the block.
 * If it were ever lossy, a client editing their menu inline would silently lose
 * the wiring on the items they did not touch.
 */
describe('text <-> items round trip', () => {
  const menus: readonly (readonly string[])[] = [
    ['Home'],
    ['Home', 'About', 'Contact'],
    ['Home', 'Our Menu', 'Book a table'],
    ['Home', 'About', 'Services', 'Gallery', 'Blog', 'Contact', 'Book'],
    // Labels a client could produce that are NOT plain words.
    ['Home', 'FAQ & help', 'Prices (2026)', 'Café'],
    // Two labels differing only by case: matching must not cross them over.
    ['Shop', 'shop'],
  ]

  it.each(menus.map((labels) => [labels.join(' | '), labels]))(
    'rebuilds %s from its own text with ids and links intact',
    (_name, labels) => {
      const items: NavItem[] = labels.map((label, index) => ({
        ...createNavItem(label),
        link: index % 2 === 0 ? pageLink(`page-${String(index)}`) : { kind: 'none' },
      }))

      const rebuilt = navItemsFromText(navItemLabels(items), items)

      expect(rebuilt).toEqual(items)
    },
  )

  it('survives the round trip a second time — it is stable, not merely reversible', () => {
    const items = ['Home', 'Our Menu', 'Contact'].map((label) => createNavItem(label))

    const once = navItemsFromText(navItemLabels(items), items)
    const twice = navItemsFromText(navItemLabels(once), once)

    expect(twice).toEqual(items)
  })

  it('cannot be broken by a comma, because a label can never hold one', () => {
    const items = [createNavItem('Bread, Cakes'), createNavItem('Contact')]

    // The comma is gone at creation, so the menu is still two items…
    expect(items.map((item) => item.label)).toEqual(['Bread Cakes', 'Contact'])
    // …and stays two items through the text form.
    expect(navItemsFromText(navItemLabels(items), items)).toEqual(items)
  })
})
