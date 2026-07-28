import { beforeEach, describe, expect, it } from 'vitest'

import { resetBlockIdSequence } from './blockFactory.ts'
import { pageLink } from './links.ts'
import { createNavItem, resetNavItemIdSequence, withNavItems } from './navItems.ts'
import {
  createPage,
  createPageId,
  duplicateBlocks,
  duplicatePageName,
  normalisePageName,
  PAGE_NAME_MAX_LENGTH,
  pageById,
  pageIndexById,
} from './pages.ts'
import type { Block } from './types.ts'

beforeEach(() => {
  resetBlockIdSequence()
  resetNavItemIdSequence()
})

describe('normalisePageName', () => {
  it('trims and collapses whitespace', () => {
    expect(normalisePageName('  Our   Work  ')).toBe('Our Work')
  })

  it('caps the length so a tab always fits', () => {
    expect(normalisePageName('x'.repeat(200))).toHaveLength(PAGE_NAME_MAX_LENGTH)
  })

  it('gives an empty string for a name with nothing in it', () => {
    expect(normalisePageName('   ')).toBe('')
  })
})

describe('createPageId', () => {
  it('derives a readable, semantic id from the name', () => {
    expect(createPageId('Menu', [])).toBe('page-menu')
    expect(createPageId('Our Work', [])).toBe('page-our-work')
    // NFKD + the a–z filter strips diacritics, exactly as export slugs do (§4.1).
    expect(createPageId('Café & Bar', [])).toBe('page-cafe-bar')
  })

  it('never collides', () => {
    const taken = ['page-menu']

    expect(createPageId('Menu', taken)).toBe('page-menu-2')
    expect(createPageId('Menu', [...taken, 'page-menu-2'])).toBe('page-menu-3')
  })

  it('falls back when the name has no usable characters', () => {
    expect(createPageId('🎉', [])).toBe('page')
    expect(createPageId('🎉', ['page'])).toBe('page-2')
  })
})

describe('createPage', () => {
  it('normalises the name and mints a matching id', () => {
    expect(createPage('  Menu  ')).toMatchObject({ id: 'page-menu', name: 'Menu', blocks: [] })
  })

  it('falls back to a usable name rather than an empty tab', () => {
    expect(createPage('   ').name).toBe('New page')
  })
})

describe('duplicatePageName', () => {
  it('reads sensibly the second and third time', () => {
    expect(duplicatePageName('Menu', ['Menu'])).toBe('Menu copy')
    expect(duplicatePageName('Menu', ['Menu', 'Menu copy'])).toBe('Menu copy 2')
    expect(duplicatePageName('Menu', ['Menu', 'Menu copy', 'Menu copy 2'])).toBe('Menu copy 3')
  })
})

describe('duplicateBlocks', () => {
  const heading: Block = {
    id: 'block-1',
    type: 'heading',
    x: 0,
    y: 0,
    width: 100,
    height: 40,
    text: 'Hi',
    copyMode: 'real',
    generateDescription: '',
    lengthHint: '',
  }

  it('mints fresh block ids, because ids are unique site-wide', () => {
    const copies = duplicateBlocks([heading])

    expect(copies[0]?.id).not.toBe(heading.id)
    expect(copies[0]).toMatchObject({ type: 'heading', text: 'Hi' })
  })

  it('mints fresh nav-item ids too, and keeps their wiring', () => {
    const navBar = withNavItems(
      { id: 'block-2', type: 'nav-bar', x: 0, y: 0, width: 1200, height: 72, text: '' },
      [{ ...createNavItem('Home'), link: pageLink('page-home') }],
    )

    const copy = duplicateBlocks([navBar])[0]

    expect(copy?.items?.[0]?.id).not.toBe(navBar.items?.[0]?.id)
    expect(copy?.items?.[0]).toMatchObject({ label: 'Home', link: { kind: 'page' } })
  })

  it('does not touch the originals', () => {
    const before = structuredClone([heading])

    duplicateBlocks([heading])

    expect([heading]).toEqual(before)
  })
})

describe('page lookup', () => {
  const pages = [createPage('Home'), createPage('Menu', ['page-home'])]

  it('finds by id, and says so when there is nothing to find', () => {
    expect(pageById(pages, 'page-menu')?.name).toBe('Menu')
    expect(pageById(pages, 'nope')).toBeNull()
    expect(pageIndexById(pages, 'page-menu')).toBe(1)
    expect(pageIndexById(pages, 'nope')).toBe(-1)
  })
})
