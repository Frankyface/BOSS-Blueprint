import { describe, expect, it } from 'vitest'

import { MAX_SLUG_LENGTH, RESERVED_SLUGS, pageSlugs, slugifyBusinessName, slugifyCore } from './slug.ts'

/** `docs/export-format.md` §4.1, and Appendix A's "slugify table tests". */

describe('§4.1 slugify core', () => {
  it('strips diacritics after NFKD and lowercases', () => {
    expect(slugifyCore('Café Münster')).toBe('cafe-munster')
  })

  it('collapses every run of non-[a-z0-9] into one dash and trims the edges', () => {
    expect(slugifyCore('  Our   Work!! ')).toBe('our-work')
    expect(slugifyCore('---')).toBe('')
  })

  it('returns empty for a name with no usable characters', () => {
    expect(slugifyCore('🙂🙂')).toBe('')
  })

  it(`truncates to ${String(MAX_SLUG_LENGTH)} at a dash boundary where possible`, () => {
    const slug = slugifyCore('Seasonal Pies And Other Very Long Bakery Things')
    expect(slug.length).toBeLessThanOrEqual(MAX_SLUG_LENGTH)
    expect(slug).toBe('seasonal-pies-and-other-very-long')
    // Room is left for a -2 suffix under the schema's 40-char cap.
    expect(`${slug}-2`.length).toBeLessThanOrEqual(40)
  })

  it('cuts hard when a single word has no dash boundary', () => {
    expect(slugifyCore('a'.repeat(50))).toBe('a'.repeat(MAX_SLUG_LENGTH))
  })
})

describe('§4.1 page slugs', () => {
  it('falls back to page-N for an unusable name, using the 1-based position', () => {
    expect(pageSlugs(['Home', 'Menu', '🙂🙂'])).toEqual(['home', 'menu', 'page-3'])
  })

  it('suffixes every reserved name with -page', () => {
    expect(pageSlugs([...RESERVED_SLUGS])).toEqual(RESERVED_SLUGS.map((name) => `${name}-page`))
  })

  it('numbers collisions in page order, first occurrence keeping the bare slug', () => {
    expect(pageSlugs(['Menu', 'Menu', 'Menu'])).toEqual(['menu', 'menu-2', 'menu-3'])
  })

  it('collides on the truncated form, and the suffix still fits the schema cap', () => {
    const names = [
      'Seasonal Pies And Other Very Long Bakery Things',
      'Seasonal Pies And Other Very Long Bakery Stuff',
    ]
    const slugs = pageSlugs(names)
    expect(slugs).toEqual(['seasonal-pies-and-other-very-long', 'seasonal-pies-and-other-very-long-2'])
    for (const slug of slugs) expect(slug.length).toBeLessThanOrEqual(40)
  })
})

describe('§4.1 business slug', () => {
  it('uses the shared core', () => {
    expect(slugifyBusinessName('Bluebird Bakery')).toBe('bluebird-bakery')
  })

  it('falls back to "business", never to page-N (v2.1)', () => {
    expect(slugifyBusinessName('🙂🙂')).toBe('business')
    expect(slugifyBusinessName('')).toBe('business')
  })

  it('does not apply the reserved-name rule', () => {
    expect(slugifyBusinessName('Index')).toBe('index')
  })
})
