import { describe, expect, it } from 'vitest'

import { BLUEBIRD_SUBMISSION, bluebirdDocument } from '../test/exportFixtures.ts'

import { KEY_ORDER, canonicalSiteJson, keyOrderProblems, serializeSiteJson } from './serialize.ts'
import { buildSiteJson } from './siteJson.ts'
import type { SiteJson } from './types.ts'

/** `docs/export-format.md` §1 file conventions, §2.1 normative key order, §5 V27. */

const site = buildSiteJson(bluebirdDocument(), BLUEBIRD_SUBMISSION)

describe('serializeSiteJson', () => {
  it('is 2-space pretty-printed with a final newline and no CR — the C02 shape', () => {
    const text = serializeSiteJson(site)
    expect(text.endsWith('\n')).toBe(true)
    expect(text.includes('\r')).toBe(false)
    expect(text).toBe(`${JSON.stringify(JSON.parse(text), null, 2)}\n`)
  })

  it('emits keys in the §7.1 order regardless of how the object was built', () => {
    const shuffled = {
      assets: site.assets,
      pages: site.pages,
      siteSettings: site.siteSettings,
      submission: site.submission,
      schemaVersion: site.schemaVersion,
    } as unknown as SiteJson
    expect(Object.keys(canonicalSiteJson(shuffled))).toEqual([...KEY_ORDER.root])
    expect(serializeSiteJson(shuffled)).toBe(serializeSiteJson(site))
  })

  it('drops undefined values instead of letting them reach JSON.stringify', () => {
    const withUndefined = { ...site, extra: undefined } as unknown as SiteJson
    expect(serializeSiteJson(withUndefined)).toBe(serializeSiteJson(site))
  })

  it('keeps an unknown field rather than eating it (§6.2 forward compatibility)', () => {
    const future = { ...site, revisionOf: 'abc' } as unknown as SiteJson
    expect(serializeSiteJson(future)).toContain('"revisionOf": "abc"')
  })
})

describe('V27 key-order check', () => {
  it('is silent on a canonically serialized package', () => {
    expect(keyOrderProblems(JSON.parse(serializeSiteJson(site)))).toEqual([])
  })

  it('flags a block whose z sits after its frame — the historical drift', () => {
    const parsed = JSON.parse(serializeSiteJson(site)) as {
      pages: { blocks: Record<string, unknown>[] }[]
    }
    const block = parsed.pages[0]?.blocks[0] ?? {}
    const { id, type, z, frame, ...rest } = block
    parsed.pages[0]?.blocks.splice(0, 1, { id, type, frame, z, ...rest })

    const problems = keyOrderProblems(parsed)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('pages[0].blocks[0]')
  })

  it('flags a reordered root and a reordered frame', () => {
    expect(keyOrderProblems({ submission: {}, schemaVersion: 1 })).toHaveLength(1)
    expect(
      keyOrderProblems({
        pages: [{ blocks: [{ type: 'text', id: 'blk_0001', frame: { y: 0, x: 0, w: 1, h: 1 } }] }],
      }),
    ).toHaveLength(2)
  })

  it('ignores unknown keys wherever they sit — §6.2 tolerance', () => {
    expect(keyOrderProblems({ schemaVersion: 1, futureField: true, submission: {} })).toEqual([])
  })
})

/**
 * `penRegions` MUST be registered in the tables rather than left to `ordered`'s
 * unknown-key fallback. An unregistered key is appended last, which passes V27
 * (unknown keys have no normative position) and is still wrong: §7.1 is the canon,
 * and a package whose bytes depend on object-construction order is not diffable.
 */
describe('penRegions serialize in their normative position', () => {
  const region = {
    text: null,
    setIndex: 0,
    setId: 'set_0001',
    parentRegionId: null,
    strokeIds: ['stk_0001'],
    bbox: { h: 320, w: 300, y: 980, x: 96 },
    confidence: 'clear',
    variant: 'card',
    kind: 'panel',
    id: 'reg_0001',
  }
  const withRegions = {
    ...site,
    pages: [{ ...site.pages[0], penRegions: [region] }, ...site.pages.slice(1)],
  } as unknown as SiteJson
  const parsed = JSON.parse(serializeSiteJson(withRegions)) as {
    pages: { penRegions?: Record<string, unknown>[] }[]
  }

  it('places the array directly after penStrokes on the page', () => {
    expect(Object.keys(parsed.pages[0] ?? {})).toEqual([
      'id',
      'name',
      'slug',
      'height',
      'screenshot',
      'blocks',
      'penStrokes',
      'penRegions',
    ])
  })

  it('orders the region’s own keys, and its nested bbox, to §2.2', () => {
    const emitted = parsed.pages[0]?.penRegions?.[0] ?? {}
    expect(Object.keys(emitted)).toEqual([...KEY_ORDER.penRegion])
    expect(Object.keys(emitted.bbox as Record<string, unknown>)).toEqual([...KEY_ORDER.bbox])
  })

  it('orders a nested text block too, and drops the absent optional `variant`', () => {
    const writing = {
      id: 'reg_0002',
      kind: 'writing',
      confidence: 'clear',
      bbox: { x: 0, y: 0, w: 10, h: 10 },
      strokeIds: ['stk_0002'],
      parentRegionId: null,
      setId: null,
      setIndex: null,
      text: { emphasis: 'display', align: 'left', glyphHeight: 64, words: 1, lines: 1 },
    }
    const one = {
      ...site,
      pages: [{ ...site.pages[0], penRegions: [writing] }, ...site.pages.slice(1)],
    } as unknown as SiteJson
    const out = JSON.parse(serializeSiteJson(one)) as {
      pages: { penRegions?: Record<string, unknown>[] }[]
    }
    const emitted = out.pages[0]?.penRegions?.[0] ?? {}
    expect(Object.keys(emitted)).toEqual(KEY_ORDER.penRegion.filter((key) => key !== 'variant'))
    expect(Object.keys(emitted.text as Record<string, unknown>)).toEqual([...KEY_ORDER.regionText])
  })

  it('is silent under V27 once canonical, and flags a shuffled region', () => {
    expect(keyOrderProblems(parsed)).toEqual([])

    const shuffled = JSON.parse(serializeSiteJson(withRegions)) as {
      pages: { penRegions: Record<string, unknown>[] }[]
    }
    const emitted = shuffled.pages[0]?.penRegions[0] ?? {}
    const { id, kind, ...rest } = emitted
    shuffled.pages[0]?.penRegions.splice(0, 1, { kind, id, ...rest })

    const problems = keyOrderProblems(shuffled)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('pages[0].penRegions[0]')
  })

  it('flags a region whose bbox keys are shuffled', () => {
    const shuffled = JSON.parse(serializeSiteJson(withRegions)) as {
      pages: { penRegions: { bbox: Record<string, unknown> }[] }[]
    }
    const bbox = shuffled.pages[0]?.penRegions[0]?.bbox
    if (bbox) shuffled.pages[0]?.penRegions.splice(0, 1, { ...shuffled.pages[0].penRegions[0], bbox: { y: bbox.y, x: bbox.x, w: bbox.w, h: bbox.h } })

    const problems = keyOrderProblems(shuffled)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('pages[0].penRegions[0].bbox')
  })
})
