import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { DEPLOYED_BASE_URL } from '../../site.config.ts'
import { imageSize } from '../export/imageHeader.ts'
import { readRepoText } from '../test/specFixtures.ts'

import {
  CANONICAL_URL,
  CARD_ALT,
  CARD_FILE_NAME,
  CARD_HEIGHT,
  CARD_URL,
  CARD_WIDTH,
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  ICON_FILE_NAMES,
  META_NAME_TAGS,
  META_PROPERTY_TAGS,
  PAGE_DESCRIPTION,
  PAGE_TITLE,
  TITLE_MAX_LENGTH,
} from './headTags.ts'

/**
 * THE HEAD IS A SHIPPED ARTIFACT and `index.html` is hand-written, so the only
 * thing that can keep the two in step is a test that reads the file.
 *
 * The expensive failure this exists for is silent: a relative `og:image`, or an
 * `og:url` still naming the old origin after the custom domain lands, produces a
 * blank card in every chat client and zero console output. Nothing else in the
 * suite would notice.
 */

const REPO_ROOT = process.cwd()
const INDEX_HTML = readRepoText(resolve(REPO_ROOT, 'index.html'))

/** Attribute values are plain text in `index.html`; no entities to decode yet. */
function metaContent(html: string, attribute: 'name' | 'property', key: string): string | null {
  const pattern = new RegExp(
    `<meta\\s+${attribute}="${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\s+content="([^"]*)"`,
    's',
  )
  // Vite's HTML is prettier-wrapped, so a tag may span lines with the attributes
  // on their own — normalise runs of whitespace before matching.
  return pattern.exec(html.replace(/\s+/g, ' '))?.[1] ?? null
}

describe('the title and description', () => {
  it('names the product, states the value, and fits in a tab', () => {
    expect(PAGE_TITLE).toContain('BOSS Blueprint')
    expect(PAGE_TITLE.length).toBeLessThanOrEqual(TITLE_MAX_LENGTH)
  })

  it('describes the tool inside the window a search result shows', () => {
    expect(PAGE_DESCRIPTION.length).toBeGreaterThanOrEqual(DESCRIPTION_MIN_LENGTH)
    expect(PAGE_DESCRIPTION.length).toBeLessThanOrEqual(DESCRIPTION_MAX_LENGTH)
  })

  it('is what index.html actually ships', () => {
    expect(/<title>([^<]*)<\/title>/.exec(INDEX_HTML)?.[1]).toBe(PAGE_TITLE)
    expect(metaContent(INDEX_HTML, 'name', 'description')).toBe(PAGE_DESCRIPTION)
  })
})

describe('the social card URLs are absolute', () => {
  /**
   * The whole point of `DEPLOYED_BASE_URL`: when the app moved to
   * `sketch.bossolutions.pro` (2026-07-31) the origin changed in ONE place, and
   * this test is what proved the head followed it.
   */
  it('derives every absolute URL from the one deployment constant', () => {
    expect(CANONICAL_URL).toBe(DEPLOYED_BASE_URL)
    expect(CARD_URL).toBe(`${DEPLOYED_BASE_URL}${CARD_FILE_NAME}`)
  })

  it('never leaves a scheme-less or relative URL in the head', () => {
    for (const key of ['og:url', 'og:image'] as const) {
      expect(META_PROPERTY_TAGS[key]).toMatch(/^https:\/\//)
    }
    expect(META_NAME_TAGS['twitter:image']).toMatch(/^https:\/\//)
  })

  it('ships those exact URLs in index.html', () => {
    expect(metaContent(INDEX_HTML, 'property', 'og:url')).toBe(CANONICAL_URL)
    expect(metaContent(INDEX_HTML, 'property', 'og:image')).toBe(CARD_URL)
    expect(INDEX_HTML.replace(/\s+/g, ' ')).toContain(
      `<link rel="canonical" href="${CANONICAL_URL}" />`,
    )
  })
})

describe('every Open Graph and Twitter tag is present', () => {
  it.each(Object.entries(META_PROPERTY_TAGS))('property %s', (key, value) => {
    expect(metaContent(INDEX_HTML, 'property', key)).toBe(value)
  })

  it.each(Object.entries(META_NAME_TAGS))('name %s', (key, value) => {
    expect(metaContent(INDEX_HTML, 'name', key)).toBe(value)
  })

  it('declares the card as a large summary image', () => {
    expect(META_NAME_TAGS['twitter:card']).toBe('summary_large_image')
    expect(META_PROPERTY_TAGS['og:type']).toBe('website')
  })
})

describe('the committed social card', () => {
  /**
   * Asserted from the PNG's own IHDR rather than from a filename convention: an
   * unfurler crops to 1.91:1 and a card at the wrong size is a card with its
   * words cut off.
   */
  it('is a 1200x630 PNG in public/', () => {
    const bytes = readFileSync(resolve(REPO_ROOT, 'public', CARD_FILE_NAME))
    const size = imageSize('image/png', new Uint8Array(bytes))

    expect(size).toEqual({ width: CARD_WIDTH, height: CARD_HEIGHT })
    expect(META_PROPERTY_TAGS['og:image:width']).toBe(String(CARD_WIDTH))
    expect(META_PROPERTY_TAGS['og:image:height']).toBe(String(CARD_HEIGHT))
  })

  it('is described for anyone who cannot see it', () => {
    expect(META_PROPERTY_TAGS['og:image:alt']).toBe(CARD_ALT)
    expect(META_NAME_TAGS['twitter:image:alt']).toBe(CARD_ALT)
  })
})

describe('the icon set is self-hosted', () => {
  it.each(ICON_FILE_NAMES)('%s exists in public/ and is referenced by the head', (name) => {
    expect(readFileSync(resolve(REPO_ROOT, 'public', name)).length).toBeGreaterThan(0)
    expect(INDEX_HTML).toContain(`href="/${name}"`)
  })

  it('asks for no external origin at all', () => {
    const external = INDEX_HTML.match(/(?:href|src)="https?:\/\/[^"]+"/g) ?? []
    // The canonical link is the one absolute URL in the head, and it points at
    // this very page. Anything else would be the app's first third-party request.
    expect(external).toEqual([`href="${CANONICAL_URL}"`])
  })
})
