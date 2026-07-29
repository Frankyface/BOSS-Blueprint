import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { BLUEBIRD_PHOTO, BLUEBIRD_SUBMISSION, bluebirdDocument } from '../../test/exportFixtures.ts'
import { generateBrief } from '../brief/generateBrief.ts'
import { buildExportPayload } from '../siteJson.ts'
import type { SiteJson } from '../types.ts'
import { expectedZipEntries } from '../validate/rules/bugBlocks.ts'
import { validatePackage } from '../validate/index.ts'

import { buildPackage, type PackageInput } from './buildPackage.ts'
import { APP_LADDER_PORTS } from './ladder.ts'

/**
 * ASSEMBLY, against the §7 worked example — the entry list must equal what §1
 * says and what `site.json` itself implies, character for character.
 */

const png = (fill: number, length = 160): Uint8Array => {
  const bytes = new Uint8Array(length)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  // A minimal IHDR so the header reader can size it: 1200 × 1600.
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  view.setUint32(16, 1200)
  view.setUint32(20, 1600)
  bytes.fill(fill, 33)
  return bytes
}

function fixtureInput(): PackageInput {
  const payload = buildExportPayload(bluebirdDocument(), BLUEBIRD_SUBMISSION)

  return {
    site: payload.site,
    brief: generateBrief(payload.site),
    renders: payload.site.pages.map((page, index) => ({
      bytes: png(0x10 + index),
      width: 1200,
      height: page.height,
      nonBlank: true,
      hasStrokes: page.penStrokes.length > 0,
    })),
    stagedAssets: payload.stagedAssets,
  }
}

const built = (): ReturnType<typeof buildPackage> => buildPackage(fixtureInput(), APP_LADDER_PORTS)

describe('§1 layout, from a real design', () => {
  it('contains exactly site.json, brief.md, one PNG per page and the referenced assets', () => {
    const result = built()

    expect(result.entries).toEqual([
      'site.json',
      'brief.md',
      'pages/01-home.png',
      'pages/02-contact.png',
      'assets/img_001.jpg',
    ])
  })

  it('agrees with the entry list `site.json` itself implies (V12)', () => {
    const input = fixtureInput()
    const result = buildPackage(input, APP_LADDER_PORTS)

    expect([...result.entries].sort()).toEqual(
      expectedZipEntries({ site: input.site, brief: input.brief }).sort(),
    )
  })

  it('writes site.json as UTF-8 with no BOM, LF, and the canonical 2-space print', () => {
    const unpacked = unzipSync(built().bytes)
    const text = new TextDecoder('utf-8').decode(unpacked['site.json'])

    expect(text.startsWith('﻿')).toBe(false)
    expect(text).not.toContain('\r')
    expect(text.endsWith('\n')).toBe(true)
    expect(`${JSON.stringify(JSON.parse(text) as SiteJson, null, 2)}\n`).toBe(text)
  })

  it('stages the uploaded bytes as-is (§4.6)', () => {
    const unpacked = unzipSync(built().bytes)
    const staged = unpacked['assets/img_001.jpg']

    expect(staged?.length).toBe(214_733)
    // The very bytes the ingest stored, byte for byte.
    const ingest = Uint8Array.from(atob(BLUEBIRD_PHOTO.split(',')[1] ?? ''), (c) => c.charCodeAt(0))
    expect(staged).toEqual(ingest)
  })

  it('derives V21 evidence from the staged bytes, not from the manifest', () => {
    const result = built()

    expect(result.stagedAssetFacts).toEqual([
      { path: 'assets/img_001.jpg', byteLength: 214_733, width: 1600, height: 1200, mimeType: 'image/jpeg' },
    ])
  })

  it('carries the renderer facts V6 needs', () => {
    const result = built()

    expect(result.renderedPageFacts.map((fact) => fact.path)).toEqual([
      'pages/01-home.png',
      'pages/02-contact.png',
    ])
    expect(result.renderedPageFacts.every((fact) => fact.width === 1200 && fact.nonBlank)).toBe(true)
  })

  it('refuses to guess when a page has no render', () => {
    const input = fixtureInput()

    expect(() => buildPackage({ ...input, renders: [] }, APP_LADDER_PORTS)).toThrow(/No render for page/)
  })

  it('refuses to guess when the staging map is missing an asset', () => {
    const input = fixtureInput()

    expect(() => buildPackage({ ...input, stagedAssets: new Map() }, APP_LADDER_PORTS)).toThrow(
      /No staged bytes/,
    )
  })
})

describe('the assembled package satisfies the validator', () => {
  it('reports no BLOCK with the zip evidence filled in', async () => {
    const input = fixtureInput()
    const result = buildPackage(input, APP_LADDER_PORTS)

    const report = await validatePackage({
      site: input.site,
      brief: input.brief,
      stagedAssets: result.stagedAssetFacts,
      renderedPages: result.renderedPageFacts,
      zipEntries: result.entries,
      zipBytes: result.bytes.length,
    })

    expect(report.blocks).toEqual([])
    expect(report.level).toBe('ok')
  })
})

describe('determinism, end to end', () => {
  it('produces byte-identical archives for the same design and submission', () => {
    expect([...built().bytes]).toEqual([...built().bytes])
  })
})
