import { describe, expect, it } from 'vitest'

import {
  MIN_PAGE_HEIGHT_PX,
  PAGE_EXTRA_SPACE_MAX_PX,
} from '../canvas/constants.ts'
import { pageHeightForContent } from '../canvas/geometry.ts'
import { navHeader } from '../test/inkFixtures.ts'
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
 * The whole §4 transform, checked against the worked example — and Appendix A's
 * equality test D, which is the contract-enforcement assertion for this file.
 *
 * §7.1 IS the canonical serializer's own output as of v2.4 (`docs/export-format.md`
 * §1: "written by the canonical serializer — exactly `JSON.stringify(data, null, 2)`
 * plus a trailing LF"), so the strong form of the test is available and is what
 * runs below: the spec text goes through `serializeSiteJson` and must come back
 * byte-identical, and the built fixture must equal the spec text directly. An
 * earlier note here claimed §7.1 was hand-formatted and that only a
 * re-serialized comparison was satisfiable — measurably false since v2.4
 * regenerated the block, and it was the exact weakening `docs/decisions.md`
 * rejected. Both sides are read from disk at test time.
 */

const specSiteJsonText = extractExampleSiteJsonText(readSpec())
const expectedSite = JSON.parse(specSiteJsonText) as SiteJson

const built = buildSiteJson(bluebirdDocument(), BLUEBIRD_SUBMISSION)

/**
 * A one-page design whose content sits well inside the 1600 floor, so the exported
 * height is exactly `1600 + the room the client asked for` and the arithmetic under
 * test is not hidden behind a content-driven number.
 */
function documentWithSpace(extraBottomPx: number): ExportDocument {
  return {
    siteSettings: {
      businessName: 'Bluebird Bakery',
      tagline: '',
      about: '',
      vibe: null,
      styleNotes: '',
      colors: [],
    },
    pages: [
      {
        id: 'page-home',
        name: 'Home',
        blocks: [
          { id: 'b', type: 'text', x: 0, y: 0, width: 400, height: 120, text: 'x', copyMode: 'real' },
        ],
        penStrokes: [],
        extraBottomPx,
      },
    ],
  }
}

describe('Appendix A equality test D — the canonical serializer owns §7.1', () => {
  it('re-serializes the spec text to itself, byte for byte', () => {
    expect(serializeSiteJson(JSON.parse(specSiteJsonText) as SiteJson)).toBe(specSiteJsonText)
  })
})

describe('buildSiteJson against the §7.1 worked example', () => {
  it('serializes byte-identically to §7.1 itself', () => {
    expect(serializeSiteJson(built)).toBe(specSiteJsonText)
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

/**
 * §2.5 `penRegions` — the inference reaches the package.
 *
 * The FIRST test here is the byte-neutrality gate in its most direct form: the
 * §7.1 worked example's ink is one image sketch and one annotation over a button,
 * so the field must not appear at all. Equality test D above proves the same thing
 * on the bytes; this proves it on the field, so a failure names the cause.
 */
describe('§2.5 penRegions — inferred ink published into site.json', () => {
  it('is absent entirely on the worked example, whose ink is all annotation', () => {
    for (const page of built.pages) {
      expect(page.penRegions).toBeUndefined()
      expect(Object.keys(page)).not.toContain('penRegions')
    }
  })

  const drawn = buildSiteJson(
    {
      ...bluebirdDocument(),
      pages: [{ id: 'page-drawn', name: 'Home', blocks: [], penStrokes: navHeader() }],
    },
    BLUEBIRD_SUBMISSION,
  )
  const regions = drawn.pages[0]?.penRegions ?? []

  it('publishes a drawn header as a panel holding a wordmark, a nav row and a rule', () => {
    expect(regions.map((region) => region.kind)).toEqual(['panel', 'writing', 'navRow', 'rule'])
  })

  it('numbers regions and sets from the SAME minter as pages, blocks and strokes', () => {
    expect(regions.map((region) => region.id)).toEqual([
      'reg_0001',
      'reg_0002',
      'reg_0003',
      'reg_0004',
    ])
  })

  it('cites only stroke ids that exist on the page (the V28 invariant, by construction)', () => {
    const onPage = new Set(drawn.pages[0]?.penStrokes.map((stroke) => stroke.id))
    for (const region of regions) {
      for (const strokeId of region.strokeIds) expect(onPage.has(strokeId)).toBe(true)
    }
  })

  it('claims each stroke at most once', () => {
    const claimed = regions.flatMap((region) => region.strokeIds)
    expect(new Set(claimed).size).toBe(claimed.length)
  })

  it('resolves every parentRegionId to a region emitted earlier on the same page', () => {
    const seen = new Set<string>()
    for (const region of regions) {
      if (region.parentRegionId !== null) expect(seen.has(region.parentRegionId)).toBe(true)
      seen.add(region.id)
    }
  })

  it('is deterministic — a second export of the same document is byte-identical', () => {
    const again = buildSiteJson(
      {
        ...bluebirdDocument(),
        pages: [{ id: 'page-drawn', name: 'Home', blocks: [], penStrokes: navHeader() }],
      },
      BLUEBIRD_SUBMISSION,
    )
    expect(serializeSiteJson(again)).toBe(serializeSiteJson(drawn))
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

  /**
   * §4.2's client-added room. `page.height` MUST come out of the one shared function
   * with the page's own amount fed in — the PNG renderer computes its dimensions the
   * same way, and V6 hard-fails the submission if the two disagree by a single pixel.
   */
  it('adds the room the client asked for to the exported height', () => {
    const stretched = documentWithSpace(400)

    const site = buildSiteJson(stretched, BLUEBIRD_SUBMISSION)

    expect(site.pages[0]?.height).toBe(2000)
    expect(site.pages[0]?.height).toBe(
      pageHeightForContent(
        (stretched.pages[0]?.blocks ?? []).map((block) => ({
          x: block.x,
          y: block.y,
          width: block.width,
          height: block.height,
        })),
        stretched.pages[0]?.penStrokes ?? [],
        stretched.pages[0]?.extraBottomPx,
      ),
    )
  })

  it('tells the builder the whitespace was deliberate', () => {
    expect(buildSiteJson(documentWithSpace(400), BLUEBIRD_SUBMISSION).pages[0]?.extraBottomPx).toBe(
      400,
    )
  })

  /**
   * BYTE-NEUTRALITY GUARD for §7.1: a design that never touched the control must
   * serialize to exactly the bytes it did before this field existed.
   */
  it('omits the field entirely when no space was added', () => {
    const text = serializeSiteJson(built)

    expect(text).not.toContain('extraBottomPx')
    for (const page of built.pages) expect('extraBottomPx' in page).toBe(false)
  })

  it('clamps a hand-edited amount rather than exporting it past the schema cap', () => {
    const site = buildSiteJson(documentWithSpace(99_999), BLUEBIRD_SUBMISSION)

    expect(site.pages[0]?.extraBottomPx).toBe(PAGE_EXTRA_SPACE_MAX_PX)
    expect(site.pages[0]?.height).toBe(MIN_PAGE_HEIGHT_PX + PAGE_EXTRA_SPACE_MAX_PX)
  })

  it('writes the field between height and screenshot, per §7.1 key order', () => {
    const text = serializeSiteJson(buildSiteJson(documentWithSpace(400), BLUEBIRD_SUBMISSION))
    const parsed = JSON.parse(text) as { pages: Record<string, unknown>[] }

    expect(Object.keys(parsed.pages[0] ?? {})).toEqual([
      'id',
      'name',
      'slug',
      'height',
      'extraBottomPx',
      'screenshot',
      'blocks',
      'penStrokes',
    ])
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
