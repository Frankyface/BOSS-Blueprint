import { describe, expect, it } from 'vitest'

import {
  externalLink,
  isPageLinkTo,
  isValidExternalUrl,
  linksEqual,
  NO_LINK,
  pageLink,
  parseLink,
  withPageLinkCleared,
} from './links.ts'

describe('isValidExternalUrl', () => {
  it.each([
    'https://bossolutions.pro',
    'http://example.com/menu',
    'https://example.com:8080/a?b=c#d',
    'HTTPS://EXAMPLE.COM',
  ])('accepts %s', (url) => {
    expect(isValidExternalUrl(url)).toBe(true)
  })

  it.each([
    ['a bare domain', 'bossolutions.pro'],
    ['a scheme with no host', 'https://'],
    ['a non-web scheme', 'javascript:alert(1)'],
    ['a mail link', 'mailto:cam@example.com'],
    ['a file path', 'file:///etc/passwd'],
    ['empty text', ''],
    ['whitespace', '   '],
  ])('rejects %s', (_label, url) => {
    expect(isValidExternalUrl(url)).toBe(false)
  })

  it('ignores surrounding whitespace', () => {
    expect(isValidExternalUrl('  https://example.com  ')).toBe(true)
    expect(externalLink('  https://example.com  ')).toEqual({
      kind: 'external',
      url: 'https://example.com',
    })
  })
})

describe('link identity', () => {
  it('matches only the page it points at', () => {
    expect(isPageLinkTo(pageLink('page-menu'), 'page-menu')).toBe(true)
    expect(isPageLinkTo(pageLink('page-menu'), 'page-home')).toBe(false)
    expect(isPageLinkTo(NO_LINK, 'page-home')).toBe(false)
    expect(isPageLinkTo(externalLink('https://a.test'), 'page-home')).toBe(false)
    expect(isPageLinkTo(undefined, 'page-home')).toBe(false)
  })

  it('compares by destination', () => {
    expect(linksEqual(NO_LINK, { kind: 'none' })).toBe(true)
    expect(linksEqual(pageLink('a'), pageLink('a'))).toBe(true)
    expect(linksEqual(pageLink('a'), pageLink('b'))).toBe(false)
    expect(linksEqual(externalLink('https://a.test'), externalLink('https://a.test'))).toBe(true)
    expect(linksEqual(externalLink('https://a.test'), externalLink('https://b.test'))).toBe(false)
    expect(linksEqual(pageLink('a'), NO_LINK)).toBe(false)
  })
})

describe('withPageLinkCleared', () => {
  it('reverts a link to the deleted page and leaves everything else alone', () => {
    const external = externalLink('https://a.test')
    const other = pageLink('page-home')

    expect(withPageLinkCleared(pageLink('page-menu'), 'page-menu')).toEqual(NO_LINK)
    expect(withPageLinkCleared(other, 'page-menu')).toBe(other)
    expect(withPageLinkCleared(external, 'page-menu')).toBe(external)
    expect(withPageLinkCleared(NO_LINK, 'page-menu')).toBe(NO_LINK)
  })
})

describe('parseLink', () => {
  it('reads each of the three kinds', () => {
    expect(parseLink({ kind: 'none' })).toEqual({ kind: 'none' })
    expect(parseLink({ kind: 'page', pageId: 'page-menu' })).toEqual({
      kind: 'page',
      pageId: 'page-menu',
    })
    expect(parseLink({ kind: 'external', url: 'https://a.test' })).toEqual({
      kind: 'external',
      url: 'https://a.test',
    })
  })

  it('drops the fields that do not belong to the kind', () => {
    expect(parseLink({ kind: 'page', pageId: 'page-menu', url: 'https://a.test' })).toEqual({
      kind: 'page',
      pageId: 'page-menu',
    })
  })

  it.each([
    ['not an object', 'page-menu'],
    ['an unknown kind', { kind: 'modal' }],
    ['a page link with no target', { kind: 'page' }],
    ['a page link with an empty target', { kind: 'page', pageId: '' }],
    ['an external link with no url', { kind: 'external' }],
    ['an external link with an unusable url', { kind: 'external', url: 'nope' }],
    ['null', null],
    ['an array', []],
  ])('refuses %s', (_label, value) => {
    expect(parseLink(value)).toBeNull()
  })
})

describe('NO_LINK', () => {
  it('is frozen, because everything unlinked shares it', () => {
    expect(Object.isFrozen(NO_LINK)).toBe(true)
  })
})
