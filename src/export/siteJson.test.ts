import { describe, expect, it } from 'vitest'

import { extractExampleSiteJsonText, readSpec } from '../test/specFixtures.ts'
import {
  BLUEBIRD_SUBMISSION,
  SEMANTIC_BLOCK_ID,
  bluebirdDocument,
  syntheticJpegDataUrl,
  syntheticPngDataUrl,
  syntheticWebpDataUrl,
} from '../test/exportFixtures.ts'

import { serializeSiteJson } from './serialize.ts'
import { buildExportPayload, buildSiteJson, screenshotPath, type ExportDocument } from './siteJson.ts'
import type { ImageSlotBlock, NavBarBlock, SiteJson } from './types.ts'

/**
 * The whole §4 transform, checked against the worked example.
 *
 * NOTE ON THE §7.1 COMPARISON (a spec/feature-file correction): §7.1 is
 * HAND-FORMATTED — multiple JSON values per line, `810.0` where a re-serialization
 * writes `810` — so `serialize(build(fixture)) === §7.1 text` is unsatisfiable, the
 * same way §7.2's hand wrapping made test B unsatisfiable before v2.1 unwrapped it.
 * The satisfiable, equally strong assertion is against §7.1 RE-SERIALIZED with
 * `JSON.stringify(…, null, 2)`: `JSON.parse` preserves the fixture's key order, so
 * this still proves key order, indentation, `'' → null` and every derived value,
 * byte-for-byte, from the doc itself.
 */

const specSiteJsonText = extractExampleSiteJsonText(readSpec())
const expectedText = `${JSON.stringify(JSON.parse(specSiteJsonText), null, 2)}\n`
const expectedSite = JSON.parse(specSiteJsonText) as SiteJson

const built = buildSiteJson(bluebirdDocument(), BLUEBIRD_SUBMISSION)

describe('buildSiteJson against the §7.1 worked example', () => {
  it('serializes byte-identically to the re-serialized §7.1 fixture', () => {
    expect(serializeSiteJson(built)).toBe(expectedText)
  })

  it('is deep-equal to the parsed §7.1 fixture', () => {
    expect(JSON.parse(serializeSiteJson(built))).toEqual(expectedSite)
  })

  it('is deterministic — two builds produce the same bytes', () => {
    expect(serializeSiteJson(buildSiteJson(bluebirdDocument(), BLUEBIRD_SUBMISSION))).toBe(
      serializeSiteJson(built),
    )
  })

  it('does not mutate the input document', () => {
    const document = bluebirdDocument()
    const before = JSON.stringify(document)
    buildSiteJson(document, BLUEBIRD_SUBMISSION)
    expect(JSON.stringify(document)).toBe(before)
  })
})

describe('§4.8 identity remap', () => {
  it('numbers pages, blocks, nav items and strokes as ordinals in document order', () => {
    expect(built.pages.map((page) => page.id)).toEqual(['pg_0001', 'pg_0002'])
    expect(built.pages[0]?.blocks.map((block) => block.id)).toEqual([
      'blk_0001',
      'blk_0002',
      'blk_0003',
      'blk_0004',
      'blk_0005',
      'blk_0006',
      'blk_0007',
      'blk_0008',
      'blk_0009',
      'blk_0010',
    ])
    // Site-wide, not per page.
    expect(built.pages[1]?.blocks[0]?.id).toBe('blk_0011')
    const homeNav = built.pages[0]?.blocks[2] as NavBarBlock
    const contactNav = built.pages[1]?.blocks[1] as NavBarBlock
    expect(homeNav.items.map((item) => item.id)).toEqual(['nav_0001', 'nav_0002'])
    expect(contactNav.items.map((item) => item.id)).toEqual(['nav_0003', 'nav_0004'])
    expect(built.pages[0]?.penStrokes.map((stroke) => stroke.id)).toEqual(['stk_0001', 'stk_0002'])
  })

  it('rewrites link.pageId and penStroke.targetBlockId in the same pass', () => {
    const cta = built.pages[0]?.blocks[5]
    expect(cta?.type === 'button' && cta.link).toEqual({ kind: 'page', pageId: 'pg_0002' })
    expect(built.pages[0]?.penStrokes[0]?.targetBlockId).toBe('blk_0007')
  })

  it('lets no internal app id survive into site.json (the V24 red path)', () => {
    expect(JSON.stringify(built)).not.toContain(SEMANTIC_BLOCK_ID)
    expect(JSON.stringify(built)).not.toContain('page-home')
  })

  it('returns the remap table for logging but never puts it in site.json', () => {
    const { site, remap } = buildExportPayload(bluebirdDocument(), BLUEBIRD_SUBMISSION)
    expect(remap.get(SEMANTIC_BLOCK_ID)).toBe('blk_0004')
    expect(JSON.stringify(site)).not.toContain('remap')
  })
})

describe('§4.2 page height — the shared editor/export function', () => {
  it('clamps both example pages up to the 1600 floor', () => {
    // Home's content bottom is 1060 → 1224 after padding and grid rounding;
    // Contact's is 640 → 800. Both are below the floor.
    expect(built.pages.map((page) => page.height)).toEqual([1600, 1600])
  })

  it('grows with content and stays on the 8px grid', () => {
    const document = bluebirdDocument()
    const tall: ExportDocument = {
      ...document,
      pages: [
        {
          ...(document.pages[0] ?? { id: 'p', name: 'P', blocks: [], penStrokes: [] }),
          blocks: [
            {
              id: 'tall-block',
              type: 'text',
              x: 0,
              y: 0,
              width: 100,
              height: 3001,
              text: 'x',
              copyMode: 'real',
            },
          ],
          penStrokes: [],
        },
      ],
    }
    // 3001 + 160 = 3161 → ceil to the grid → 3168.
    expect(buildSiteJson(tall, BLUEBIRD_SUBMISSION).pages[0]?.height).toBe(3168)
  })

  it('counts a pen point below every block as content', () => {
    const document = bluebirdDocument()
    const withLowStroke: ExportDocument = {
      ...document,
      pages: [
        {
          id: 'p',
          name: 'P',
          blocks: [
            { id: 'b', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'x', copyMode: 'real' },
          ],
          penStrokes: [
            {
              id: 's',
              points: [
                { x: 10, y: 10 },
                { x: 20, y: 2000 },
              ],
              color: '#000000',
              width: 4,
            },
          ],
        },
      ],
    }
    // 2000 + 160 = 2160, already on the grid.
    expect(buildSiteJson(withLowStroke, BLUEBIRD_SUBMISSION).pages[0]?.height).toBe(2160)
  })
})

describe('§4.6 assets derived from imageData', () => {
  it('parses width, height and bytes out of the staged bytes', () => {
    expect(built.assets).toEqual([
      {
        id: 'img_001',
        path: 'assets/img_001.jpg',
        originalFilename: 'IMG_4382.jpeg',
        mimeType: 'image/jpeg',
        width: 1600,
        height: 1200,
        bytes: 214_733,
      },
    ])
  })

  it('exports assetId: null for an empty slot', () => {
    const slot = built.pages[1]?.blocks[4] as ImageSlotBlock
    expect(slot.assetId).toBeNull()
  })

  it('stages one file per manifest entry, keyed by asset.path', () => {
    const { stagedAssets } = buildExportPayload(bluebirdDocument(), BLUEBIRD_SUBMISSION)
    expect([...stagedAssets.keys()]).toEqual(['assets/img_001.jpg'])
  })

  it('numbers distinct photos in first-use order and shares one entry for a reused photo', () => {
    const photoA = syntheticPngDataUrl(10, 20)
    const photoB = syntheticWebpDataUrl(30, 40)
    const document: ExportDocument = {
      siteSettings: {
        businessName: 'Two Pages',
        tagline: '',
        about: '',
        vibe: null,
        styleNotes: '',
        colors: [],
      },
      pages: [
        {
          id: 'p1',
          name: 'One',
          blocks: [
            { id: 'a', type: 'image', x: 0, y: 0, width: 10, height: 10, text: '', imageData: photoA, fit: 'cover' },
            { id: 'b', type: 'image', x: 0, y: 20, width: 10, height: 10, text: '', imageData: photoB, fit: 'contain' },
          ],
          penStrokes: [],
        },
        {
          id: 'p2',
          name: 'Two',
          blocks: [
            { id: 'c', type: 'image', x: 0, y: 0, width: 10, height: 10, text: '', imageData: photoA, fit: 'cover' },
          ],
          penStrokes: [],
        },
      ],
    }

    const site = buildSiteJson(document, BLUEBIRD_SUBMISSION)
    expect(site.assets.map((asset) => asset.path)).toEqual([
      'assets/img_001.png',
      'assets/img_002.webp',
    ])
    expect(site.assets[0]).toMatchObject({ width: 10, height: 20 })
    expect(site.assets[1]).toMatchObject({ width: 30, height: 40 })
    // The reuse on page 2 points at the same asset, not a third one.
    const reused = site.pages[1]?.blocks[0] as ImageSlotBlock
    expect(reused.assetId).toBe('img_001')
  })

  it('falls back to the staged filename when the client filename never reached the block', () => {
    const document: ExportDocument = {
      siteSettings: { businessName: 'X', tagline: '', about: '', vibe: null, styleNotes: '', colors: [] },
      pages: [
        {
          id: 'p1',
          name: 'One',
          blocks: [
            {
              id: 'a',
              type: 'image',
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              text: '',
              imageData: syntheticJpegDataUrl(4, 4, 64),
              fit: 'cover',
            },
          ],
          penStrokes: [],
        },
      ],
    }
    expect(buildSiteJson(document, BLUEBIRD_SUBMISSION).assets[0]?.originalFilename).toBe('img_001.jpg')
  })
})

describe('§4.7 discriminators, §2 shape and the "" → null mapping', () => {
  it('maps image → imageSlot and nav-bar → navBar', () => {
    expect(built.pages[0]?.blocks.map((block) => block.type)).toEqual([
      'section',
      'section',
      'navBar',
      'heading',
      'text',
      'button',
      'imageSlot',
      'heading',
      'text',
      'button',
    ])
  })

  it('materializes z from the array index so blocks[] and z always agree', () => {
    expect(built.pages[0]?.blocks.map((block) => block.z)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('maps skipped optional text to null but keeps text as ""', () => {
    const generate = built.pages[0]?.blocks[4]
    expect(generate?.type === 'text' && generate.text).toBe('')
    const real = built.pages[0]?.blocks[3]
    expect(real?.type === 'heading' && real.generateDescription).toBeNull()
    expect(real?.type === 'heading' && real.lengthHint).toBeNull()
    expect(built.pages[0]?.blocks[1]).toMatchObject({ background: null })
  })

  it('names screenshots pages/<NN>-<slug>.png', () => {
    expect(screenshotPath(0, 'home')).toBe('pages/01-home.png')
    expect(screenshotPath(11, 'our-work')).toBe('pages/12-our-work.png')
    expect(built.pages.map((page) => page.screenshot)).toEqual([
      'pages/01-home.png',
      'pages/02-contact.png',
    ])
  })

  it('carries fromTemplate on content-bearing blocks and strips it from sections', () => {
    const document = bluebirdDocument()
    const flagged: ExportDocument = {
      ...document,
      pages: [
        {
          id: 'p1',
          name: 'One',
          blocks: [
            { id: 'band', type: 'section', x: 0, y: 0, width: 1200, height: 400, text: '', fromTemplate: true },
            {
              id: 'title',
              type: 'heading',
              x: 0,
              y: 0,
              width: 400,
              height: 60,
              text: 'Filler',
              copyMode: 'real',
              fromTemplate: true,
            },
          ],
          penStrokes: [],
        },
      ],
    }
    const site = buildSiteJson(flagged, BLUEBIRD_SUBMISSION)
    expect(site.pages[0]?.blocks[0]).not.toHaveProperty('fromTemplate')
    expect(site.pages[0]?.blocks[1]).toHaveProperty('fromTemplate', true)
  })

  it('degrades a link whose target page no longer exists to kind: none', () => {
    const document: ExportDocument = {
      siteSettings: { businessName: 'X', tagline: '', about: '', vibe: null, styleNotes: '', colors: [] },
      pages: [
        {
          id: 'p1',
          name: 'One',
          blocks: [
            {
              id: 'b',
              type: 'button',
              x: 0,
              y: 0,
              width: 100,
              height: 40,
              text: 'Gone',
              link: { kind: 'page', pageId: 'deleted-page' },
            },
          ],
          penStrokes: [],
        },
      ],
    }
    const site = buildSiteJson(document, BLUEBIRD_SUBMISSION)
    const button = site.pages[0]?.blocks[0]
    expect(button?.type === 'button' && button.link).toEqual({ kind: 'none' })
    expect(JSON.stringify(site)).not.toContain('deleted-page')
  })
})
