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
