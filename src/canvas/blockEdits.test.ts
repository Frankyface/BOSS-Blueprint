import { describe, expect, it } from 'vitest'

import {
  blocksEqual,
  copyModeOf,
  isCopyBlock,
  isGenerateBlock,
  isLinked,
  linkOf,
  navItemsOf,
  withCopyMode,
  withGenerateDescription,
  withLengthHint,
  withLink,
  withNavItemAdded,
  withNavItemLabel,
  withNavItemLink,
  withNavItemRemoved,
  withTypeDefaults,
} from './blockEdits.ts'
import { externalLink, NO_LINK, pageLink } from './links.ts'
import type { Block, BlockTypeId } from './types.ts'

const block = (type: BlockTypeId, overrides: Partial<Block> = {}): Block =>
  withTypeDefaults({
    id: `${type}-1`,
    type,
    x: 0,
    y: 0,
    width: 200,
    height: 80,
    text: '',
    ...overrides,
  })

describe('withTypeDefaults', () => {
  it('gives copy blocks a mode and empty guidance', () => {
    expect(block('heading')).toMatchObject({
      copyMode: 'real',
      generateDescription: '',
      lengthHint: '',
    })
    expect(block('text').copyMode).toBe('real')
  })

  it('gives a button an explicit "not linked" rather than nothing', () => {
    expect(block('button').link).toEqual(NO_LINK)
  })

  it('derives a nav bar menu from any labels already in its text', () => {
    const bar = block('nav-bar', { text: 'Home, Menu' })

    expect(navItemsOf(bar).map((item) => item.label)).toEqual(['Home', 'Menu'])
  })

  it('leaves types with no extra fields untouched', () => {
    const section = block('section')

    expect(Object.keys(section).sort()).toEqual([
      'height',
      'id',
      'text',
      'type',
      'width',
      'x',
      'y',
    ])
  })

  it('never overwrites a value the block already carries', () => {
    const carried = withTypeDefaults({ ...block('heading'), copyMode: 'generate' })

    expect(carried.copyMode).toBe('generate')
  })
})

describe('copy mode', () => {
  it('knows which types are copy blocks', () => {
    expect(isCopyBlock(block('heading'))).toBe(true)
    expect(isCopyBlock(block('text'))).toBe(true)
    expect(isCopyBlock(block('button'))).toBe(false)
    expect(isCopyBlock(block('section'))).toBe(false)
  })

  it('defaults to the client\'s own words', () => {
    // A block from before copy modes existed carries no `copyMode` at all.
    const legacy: Block = {
      id: 'h',
      type: 'heading',
      x: 0,
      y: 0,
      width: 200,
      height: 80,
      text: '',
    }

    expect(copyModeOf(legacy)).toBe('real')
  })

  it('switching to generate keeps the words already typed', () => {
    const typed = { ...block('text'), text: 'Half-written intro' }

    const generating = withCopyMode(typed, 'generate')

    expect(generating.copyMode).toBe('generate')
    expect(generating.text).toBe('Half-written intro')
    expect(isGenerateBlock(generating)).toBe(true)
  })

  it('switching back to real keeps the description', () => {
    const described = withGenerateDescription(withCopyMode(block('text'), 'generate'), 'Warm intro')

    const back = withCopyMode(described, 'real')

    expect(back.copyMode).toBe('real')
    expect(back.generateDescription).toBe('Warm intro')
    expect(isGenerateBlock(back)).toBe(false)
  })

  it('trims the description and the length hint', () => {
    const described = withLengthHint(withGenerateDescription(block('text'), '  Warm  '), '  ~2  ')

    expect(described.generateDescription).toBe('Warm')
    expect(described.lengthHint).toBe('~2')
  })

  it('refuses to put copy fields on a block that is not copy', () => {
    const button = block('button')

    expect(withCopyMode(button, 'generate')).toBe(button)
    expect(withGenerateDescription(button, 'nope')).toBe(button)
    expect(withLengthHint(button, 'nope')).toBe(button)
  })
})

describe('links', () => {
  it('sets a button link and reports it as linked', () => {
    const wired = withLink(block('button'), pageLink('page-menu'))

    expect(linkOf(wired)).toEqual({ kind: 'page', pageId: 'page-menu' })
    expect(isLinked(wired)).toBe(true)
    expect(isLinked(block('button'))).toBe(false)
  })

  it('only buttons carry a link', () => {
    const heading = block('heading')

    expect(withLink(heading, pageLink('page-menu'))).toBe(heading)
    expect(isLinked(heading)).toBe(false)
  })
})

describe('nav items', () => {
  it('adds, renames, wires and removes', () => {
    const withOne = withNavItemAdded(block('nav-bar'), 'Home')
    const itemId = navItemsOf(withOne)[0]?.id ?? ''

    const renamed = withNavItemLabel(withOne, itemId, '  Start  ')
    expect(navItemsOf(renamed)[0]?.label).toBe('Start')
    expect(renamed.text).toBe('Start')

    const wired = withNavItemLink(renamed, itemId, externalLink('https://a.test'))
    expect(navItemsOf(wired)[0]?.link).toEqual({ kind: 'external', url: 'https://a.test' })
    expect(isLinked(wired)).toBe(true)

    const removed = withNavItemRemoved(wired, itemId)
    expect(navItemsOf(removed)).toEqual([])
    expect(removed.text).toBe('')
  })

  it('ignores an unknown item id', () => {
    const bar = withNavItemAdded(block('nav-bar'), 'Home')

    expect(withNavItemLabel(bar, 'nope', 'X')).toEqual(bar)
    expect(withNavItemRemoved(bar, 'nope')).toEqual(bar)
  })

  it('refuses to put menu items on anything but a nav bar', () => {
    const heading = block('heading')

    expect(withNavItemAdded(heading, 'Home')).toBe(heading)
    expect(withNavItemRemoved(heading, 'x')).toBe(heading)
    expect(navItemsOf(heading)).toEqual([])
  })
})

describe('blocksEqual', () => {
  it('sees identical blocks as equal', () => {
    expect(blocksEqual(block('heading'), block('heading'))).toBe(true)
  })

  it.each([
    ['geometry', { x: 8 }],
    ['text', { text: 'Hello' }],
    ['copy mode', { copyMode: 'generate' as const }],
    ['description', { generateDescription: 'Warm intro' }],
    ['length hint', { lengthHint: '~2 sentences' }],
  ])('sees a difference in %s', (_label, overrides) => {
    expect(blocksEqual(block('heading'), { ...block('heading'), ...overrides })).toBe(false)
  })

  it('sees a difference in a button link', () => {
    expect(blocksEqual(block('button'), withLink(block('button'), pageLink('page-menu')))).toBe(
      false,
    )
  })

  it('sees a difference in a menu, including one item\'s link', () => {
    const one = withNavItemAdded(block('nav-bar'), 'Home')
    const itemId = navItemsOf(one)[0]?.id ?? ''

    expect(blocksEqual(one, block('nav-bar'))).toBe(false)
    expect(blocksEqual(one, withNavItemLink(one, itemId, pageLink('page-home')))).toBe(false)
    expect(blocksEqual(one, { ...one })).toBe(true)
  })
})
