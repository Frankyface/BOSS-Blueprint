import { describe, expect, it } from 'vitest'

import { bluebirdPackage, brokenPackage } from '../../test/exportFixtures.ts'
import { generateBrief } from '../brief/generateBrief.ts'
import type { ExportAsset, ExportBlock, ExportPage, ImageSlotBlock } from '../types.ts'

import { validatePackage } from './index.ts'

/** The pipeline order of §5's rules — `feature-site-json-generator.md` Notes. */

describe('validatePackage', () => {
  it('passes the §7.1 package with no blocks and only the abridged-pen-mark warning', async () => {
    const report = await validatePackage(bluebirdPackage())
    expect(report.blocks).toEqual([])
    expect(report.level).toBe('ok')
    expect(report.warns.map((warning) => warning.rule)).toEqual(['V22'])
    expect(report.fixes).toEqual([])
  })

  it('reports the client-facing V19 before the bug-class V1 for a package that trips both', async () => {
    const red = brokenPackage((site) => {
      const blocks = site.pages[0]?.blocks as ExportBlock[] | undefined
      const block = blocks?.[3]
      // Blank real text (V19, client) AND a bad enum value (V1, bug).
      if (blocks && block) blocks[3] = { ...block, text: '  ', fit: 'squish' } as unknown as ExportBlock
      ;(site.submission as { submittedAt: string }).submittedAt = 'yesterday'
    })

    const report = await validatePackage(red)
    const firstClient = report.blocks.find((finding) => finding.audience === 'client')
    expect(firstClient?.rule).toBe('V19')
    expect(report.blocks.indexOf(firstClient as never)).toBeLessThan(
      report.blocks.findIndex((finding) => finding.rule === 'V01'),
    )
    expect(report.level).toBe('block')
  })

  it('applies the FIX pass and returns an ok, corrected package', async () => {
    const red = brokenPackage((site) => {
      const page = site.pages[1]
      if (page) (site.pages as ExportPage[])[1] = { ...page, screenshot: 'pages/99-wrong.png' }
      const blocks = site.pages[0]?.blocks as ExportBlock[] | undefined
      const block = blocks?.[3]
      if (blocks && block) blocks[3] = { ...block, generateDescription: 'stranded' } as ExportBlock
    })

    // `brief: null` is the real submit path — the app hands the validator the site
    // and lets the pipeline generate the brief from the FIXED version.
    const report = await validatePackage({ ...red, brief: null })
    expect(report.fixes.map((fix) => fix.rule).sort()).toEqual(['V17', 'V20'])
    expect(report.level).toBe('ok')
    expect(report.package.site.pages[1]?.screenshot).toBe('pages/02-contact.png')
  })

  it('regenerates the brief AFTER the fix pass so the two can never disagree', async () => {
    const red = brokenPackage((site) => {
      // An unreferenced ghost asset that V4 must strip and renumber away.
      const assets = site.assets as ExportAsset[]
      const first = assets[0]
      if (first) assets.unshift({ ...first, id: 'img_000', path: 'assets/img_000.jpg' })
      const blocks = site.pages[0]?.blocks as ExportBlock[] | undefined
      const slot = blocks?.[6] as ImageSlotBlock | undefined
      if (blocks && slot) blocks[6] = { ...slot, assetId: 'img_001' }
    })

    const report = await validatePackage({ ...red, brief: null })
    expect(report.fixes.map((fix) => fix.rule)).toContain('V04')
    expect(report.package.brief).toBe(generateBrief(report.package.site))
    expect(report.blocks).toEqual([])
    // V7 would have caught a brief generated before the strip.
    expect(report.package.brief).toContain('assets/img_001.jpg')
  })

  it('does not mutate the bundle it was given', async () => {
    const green = bluebirdPackage()
    const before = JSON.stringify(green.site)
    await validatePackage(green)
    expect(JSON.stringify(green.site)).toBe(before)
  })
})
