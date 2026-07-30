import { describe, expect, it } from 'vitest'

import { bluebirdPackage, brokenPackage } from '../../../test/exportFixtures.ts'
import type {
  ButtonBlock,
  ExportAsset,
  ExportBlock,
  ExportPage,
  ExportPenStroke,
  ImageSlotBlock,
  NavBarBlock,
  SiteJson,
} from '../../types.ts'
import type { PackageBundle } from '../types.ts'

import {
  v02References,
  v03Collisions,
  v04MissingAssetFile,
  v06RenderedPages,
  v12ZipLayout,
  v16AssetPaths,
  v21AssetFacts,
  v24IdentityRemap,
} from './bugBlocks.ts'
import { v07BriefCrossCheck } from './briefCrossCheck.ts'
import {
  v05GenerateDescription,
  v08Submission,
  v09EmptySite,
  v11ExternalUrls,
  v14EmptySlotDescription,
  v19BlankRealText,
  v26LabelsAndNavItems,
} from './clientBlocks.ts'
import {
  applyFixes,
  v03SortAndRenumberZ,
  v04StripUnreferencedAssets,
  v11PrependScheme,
  v17RecomputeScreenshots,
  v20NullStrandedDescription,
  v23StripSectionFiller,
} from './fixes.ts'
import {
  v09NearEmptyPage,
  v10ZipSize,
  v13DuplicatePageNames,
  v15Reachability,
  v18OffPageFrames,
  v22IllegibleClusters,
  v23TemplateFiller,
  v25RightOverflow,
  v27KeyOrder,
} from './warnings.ts'

/**
 * §5 V2–V27: every rule green on the §7.1 package and red on a fixture that breaks
 * exactly what the rule is for. V1 lives in `schemaCheck.test.ts` because it is
 * async and needs its own ajv-formats proof.
 *
 * Rules are called DIRECTLY rather than through the pipeline so a red fixture
 * isolates one rule even when the mutation would also upset a neighbour.
 */

const green = bluebirdPackage()

/** One legible annotation stroke — enough ink to count as content on its own. */
const INK_MARK: ExportPenStroke = {
  id: 'stk_0001',
  points: [
    [80, 200],
    [220, 214],
    [360, 268],
  ],
  color: '#D94F30',
  width: 4,
  role: 'annotation',
  targetBlockId: null,
}

const homeBlock = (site: SiteJson, index: number): ExportBlock => {
  const block = site.pages[0]?.blocks[index]
  if (block === undefined) throw new Error(`no home block at ${String(index)}`)
  return block
}

/** Replace one home-page block, keeping everything else intact. */
function replaceHomeBlock(site: SiteJson, index: number, next: ExportBlock): void {
  const blocks = site.pages[0]?.blocks as ExportBlock[] | undefined
  if (blocks === undefined) throw new Error('no home page')
  blocks[index] = next
}

describe('green path — every rule is silent on the §7.1 package', () => {
  const checks = [
    v02References,
    v03Collisions,
    v04MissingAssetFile,
    v05GenerateDescription,
    v06RenderedPages,
    v07BriefCrossCheck,
    v08Submission,
    v09EmptySite,
    v09NearEmptyPage,
    v10ZipSize,
    v11ExternalUrls,
    v12ZipLayout,
    v13DuplicatePageNames,
    v14EmptySlotDescription,
    v15Reachability,
    v16AssetPaths,
    v18OffPageFrames,
    v19BlankRealText,
    v21AssetFacts,
    v23TemplateFiller,
    v24IdentityRemap,
    v25RightOverflow,
    v26LabelsAndNavItems,
    v27KeyOrder,
  ]

  it.each(checks.map((rule) => [rule.name, rule] as const))('%s reports nothing', (_name, rule) => {
    expect(rule(green)).toEqual([])
  })

  it('applies no fixes to an already-correct package', () => {
    expect(applyFixes(green).fixes).toEqual([])
  })

  /**
   * V22 is the one WARN the §7.1 fixture legitimately trips: its stroke arrays are
   * abridged for readability, and §7 says so ("V22 would WARN on marks this sparse").
   */
  it('V22 warns on the fixture’s deliberately abridged pen marks', () => {
    const warnings = v22IllegibleClusters(green)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.rule).toBe('V22')
  })
})

describe('V2 — referential integrity', () => {
  it('flags a link to a page that does not exist', () => {
    const red = brokenPackage((site) => {
      const button = homeBlock(site, 5) as ButtonBlock
      replaceHomeBlock(site, 5, { ...button, link: { kind: 'page', pageId: 'pg_9999' } })
    })
    expect(v02References(red).map((f) => f.rule)).toEqual(['V02'])
  })

  it('flags a slot referencing a missing asset and a stroke targeting another page', () => {
    const red = brokenPackage((site) => {
      const slot = homeBlock(site, 6) as ImageSlotBlock
      replaceHomeBlock(site, 6, { ...slot, assetId: 'img_404' })
      const stroke = site.pages[0]?.penStrokes[0]
      if (stroke) (site.pages[0]?.penStrokes as ExportPenStroke[])[0] = { ...stroke, targetBlockId: 'blk_0011' }
    })
    expect(v02References(red)).toHaveLength(2)
  })
})

describe('V3 — collisions (BLOCK) and z order (FIX)', () => {
  it('flags a duplicate block id', () => {
    const red = brokenPackage((site) => {
      replaceHomeBlock(site, 1, { ...homeBlock(site, 1), id: 'blk_0001' })
    })
    expect(v03Collisions(red).map((f) => f.message)).toContain('duplicate block id: blk_0001')
  })

  it('flags a duplicate page slug', () => {
    const red = brokenPackage((site) => {
      const page = site.pages[1]
      if (page) (site.pages as ExportPage[])[1] = { ...page, slug: 'home' }
    })
    expect(v03Collisions(red).some((f) => f.message.includes('duplicate page slug'))).toBe(true)
  })

  it('re-sorts and renumbers z, and the result re-validates clean', () => {
    const red = brokenPackage((site) => {
      const blocks = site.pages[0]?.blocks as ExportBlock[] | undefined
      if (blocks) blocks.reverse()
    })
    const { bundle, fixes } = v03SortAndRenumberZ(red)
    expect(fixes.map((fix) => fix.rule)).toEqual(['V03'])
    expect(bundle.site.pages[0]?.blocks.map((block) => block.z)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(v03SortAndRenumberZ(bundle).fixes).toEqual([])
  })
})

describe('V4 — asset bijection', () => {
  it('flags a manifest entry with no staged file', () => {
    const red: PackageBundle = { ...green, stagedAssets: [] }
    expect(v04MissingAssetFile(red).map((f) => f.rule)).toEqual(['V04'])
  })

  it('strips an unreferenced asset and renumbers the survivors to a dense first-use order', () => {
    const red = brokenPackage((site) => {
      const assets = site.assets as ExportAsset[]
      const first = assets[0]
      // A ghost entry ahead of the real one, so stripping must renumber.
      if (first) assets.unshift({ ...first, id: 'img_000', path: 'assets/img_000.jpg' })
      const slot = homeBlock(site, 6) as ImageSlotBlock
      replaceHomeBlock(site, 6, { ...slot, assetId: 'img_001' })
    })

    const { bundle, fixes } = v04StripUnreferencedAssets(red)
    expect(fixes.map((fix) => fix.rule)).toEqual(['V04'])
    expect(bundle.site.assets.map((asset) => asset.id)).toEqual(['img_001'])
    expect(bundle.site.assets[0]?.path).toBe('assets/img_001.jpg')
    const slot = bundle.site.pages[0]?.blocks[6] as ImageSlotBlock
    expect(slot.assetId).toBe('img_001')
  })
})

describe('V5 / V14 / V19 / V26 — the client-fixable copy and label rules', () => {
  it('V5 flags a generate block with no description, with a jump target', () => {
    const red = brokenPackage((site) => {
      replaceHomeBlock(site, 4, { ...homeBlock(site, 4), generateDescription: null } as ExportBlock)
    })
    const findings = v05GenerateDescription(red)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.audience).toBe('client')
    expect(findings[0]?.jumpTo).toEqual({ pageId: 'pg_0001', blockId: 'blk_0005' })
  })

  it('V14 flags an empty slot with no description', () => {
    const red = brokenPackage((site) => {
      const slot = site.pages[1]?.blocks[4] as ImageSlotBlock
      const blocks = site.pages[1]?.blocks as ExportBlock[] | undefined
      if (blocks) blocks[4] = { ...slot, description: '   ' }
    })
    expect(v14EmptySlotDescription(red)).toHaveLength(1)
  })

  it('V19 flags a real copy block with only whitespace', () => {
    const red = brokenPackage((site) => {
      replaceHomeBlock(site, 3, { ...homeBlock(site, 3), text: '   ' } as ExportBlock)
    })
    const findings = v19BlankRealText(red)
    expect(findings).toHaveLength(1)
    expect(findings[0]?.message).toContain("switch it to 'Write it for me'")
  })

  it('V26 flags a blank button label and an empty nav bar with client wording', () => {
    const red = brokenPackage((site) => {
      const button = homeBlock(site, 5) as ButtonBlock
      replaceHomeBlock(site, 5, { ...button, label: ' ' })
      const nav = homeBlock(site, 2) as NavBarBlock
      replaceHomeBlock(site, 2, { ...nav, items: [] })
    })
    const findings = v26LabelsAndNavItems(red)
    expect(findings).toHaveLength(2)
    expect(findings.every((f) => f.audience === 'client')).toBe(true)
  })
})

describe('V6 / V10 / V12 / V16 / V21 — evidence-driven rules', () => {
  it('V6 flags a PNG whose height does not match page.height', () => {
    const red: PackageBundle = {
      ...green,
      renderedPages: [
        { path: 'pages/01-home.png', width: 1200, height: 1234, nonBlank: true },
        { path: 'pages/02-contact.png', width: 1200, height: 1600, nonBlank: true },
      ],
    }
    expect(v06RenderedPages(red).map((f) => f.rule)).toEqual(['V06'])
  })

  it('V6 flags a blank render and a missing one', () => {
    expect(v06RenderedPages({ ...green, renderedPages: [] }).length).toBeGreaterThan(0)
    const blank = green.renderedPages?.map((page) => ({ ...page, nonBlank: false })) ?? []
    expect(v06RenderedPages({ ...green, renderedPages: blank })).toHaveLength(2)
  })

  it('V10 warns past the 15 MB budget and never blocks', () => {
    const findings = v10ZipSize({ ...green, zipBytes: 20 * 1024 * 1024 })
    expect(findings).toHaveLength(1)
    expect(findings[0]?.class).toBe('WARN')
  })

  it('V12 flags a wrapper folder and a missing entry', () => {
    const red: PackageBundle = { ...green, zipEntries: ['pkg/site.json', 'brief.md'] }
    const messages = v12ZipLayout(red).map((f) => f.message)
    expect(messages).toContain('zip has unexpected entry pkg/site.json')
    expect(messages).toContain('zip is missing site.json')
  })

  it('V16 flags an extension that disagrees with the MIME type', () => {
    const red = brokenPackage((site) => {
      const asset = site.assets[0]
      if (asset) (site.assets as ExportAsset[])[0] = { ...asset, path: 'assets/img_001.png' }
    })
    expect(v16AssetPaths(red).map((f) => f.rule)).toEqual(['V16'])
  })

  it('V21 flags a manifest that disagrees with the staged bytes', () => {
    const red: PackageBundle = {
      ...green,
      stagedAssets: [
        { path: 'assets/img_001.jpg', byteLength: 99, width: 10, height: 10, mimeType: 'image/png' },
      ],
    }
    expect(v21AssetFacts(red)).toHaveLength(1)
  })
})

describe('V7 — brief cross-check', () => {
  it('flags a stale brief whose marker count no longer matches', () => {
    const red = brokenPackage(
      (site) => {
        replaceHomeBlock(site, 4, { ...homeBlock(site, 4), copyMode: 'real', text: 'Now real copy' } as ExportBlock)
      },
      { regenerateBrief: false },
    )
    const messages = v07BriefCrossCheck(red).map((f) => f.message)
    expect(messages.some((message) => message.includes('WRITE THIS COPY markers'))).toBe(true)
  })

  it('flags an inventory row that disagrees with site.json', () => {
    const red: PackageBundle = {
      ...green,
      brief: (green.brief ?? '').replace('| `pages/01-home.png` (1200×1600) | 10 |', '| `pages/01-home.png` (1200×1600) | 9 |'),
    }
    expect(v07BriefCrossCheck(red).some((f) => f.message.includes('inventory row 1'))).toBe(true)
  })

  it('flags a printed block id that does not exist', () => {
    const red: PackageBundle = { ...green, brief: `${green.brief ?? ''}\nblock \`blk_9999\`\n` }
    expect(v07BriefCrossCheck(red).some((f) => f.message.includes('blk_9999'))).toBe(true)
  })

  it('does NOT read an innocent client filename as a printed id (set_menu.jpg, reg_flow.png)', () => {
    // §4.8 mints every public id as its prefix + zero-padded DIGITS, so a restaurant's
    // `set_menu.jpg` or `reg_flow.png` upload — whose stem lands in the brief — is not
    // an id. Before the regex was tightened, `set_menu`/`reg_flow` matched and V7 BLOCKed
    // a valid package. The whole cross-check must stay green with those tokens present.
    const red: PackageBundle = { ...green, brief: `${green.brief ?? ''}\nclient files: set_menu.jpg, reg_flow.png\n` }
    const messages = v07BriefCrossCheck(red).map((f) => f.message)
    expect(messages.some((m) => m.includes('set_menu') || m.includes('reg_flow'))).toBe(false)
    expect(v07BriefCrossCheck(red)).toEqual([])
  })

  it('flags a quoted string that matches no site.json field', () => {
    const red: PackageBundle = { ...green, brief: `${green.brief ?? ''}\nreads: «invented copy»\n` }
    expect(v07BriefCrossCheck(red).some((f) => f.message.includes('invented copy'))).toBe(true)
  })

  it('accepts a truncated reference and a ↵-glyphed multi-line quote as derived forms', () => {
    // Both already appear in the §7.1 brief; this asserts they are not false positives.
    expect(v07BriefCrossCheck(green)).toEqual([])
    expect(green.brief).toContain('123 Agricola St, Halifax↵')
  })

  it('flags a missing provenance header', () => {
    const red: PackageBundle = {
      ...green,
      brief: (green.brief ?? '').replace(/<!--[\s\S]*?-->/, ''),
    }
    expect(v07BriefCrossCheck(red).some((f) => f.message.includes('provenance'))).toBe(true)
  })
})

describe('V8 / V9 — the submit gate and an empty site', () => {
  /**
   * A page whose only content is ink. Built from the §7.1 home page by taking every
   * block away and (optionally) leaving the two pen strokes behind, which is exactly
   * the shape of the site Cam's headline requirement asks for: "you should be able to
   * build a site just from the pen alone even if no blocks were implemented".
   */
  function homeWithoutBlocks(options: { readonly keepInk: boolean }): PackageBundle {
    return brokenPackage((site) => {
      const page = site.pages[0]
      if (page) {
        ;(site.pages as ExportPage[])[0] = {
          ...page,
          blocks: [],
          penStrokes: options.keepInk ? page.penStrokes : [],
        }
      }
    })
  }

  it('V8 flags a bad email and a non-v4 UUID', () => {
    const red = brokenPackage((site) => {
      const submission = site.submission as { client: { name: string; email: string }; id: string }
      submission.client = { name: '', email: 'nope' }
      submission.id = 'not-a-uuid'
    })
    expect(v08Submission(red)).toHaveLength(3)
  })

  it('V9 blocks a site with no pages and a homepage of only sections', () => {
    const noPages = brokenPackage((site) => ({ ...site, pages: [] }))
    expect(v09EmptySite(noPages)).toHaveLength(1)

    // The ink goes too: sections are scenery, but a stroke IS content, so a
    // sections-only home page that still carries pen marks is no longer empty.
    const sectionsOnly = brokenPackage((site) => {
      const page = site.pages[0]
      if (page) {
        ;(site.pages as ExportPage[])[0] = {
          ...page,
          blocks: page.blocks.filter((block) => block.type === 'section'),
          penStrokes: [],
        }
      }
    })
    expect(v09EmptySite(sectionsOnly)).toHaveLength(1)
  })

  it('V9 lets a home page whose only content is pen ink through', () => {
    expect(v09EmptySite(homeWithoutBlocks({ keepInk: true }))).toEqual([])
  })

  it('V9 still blocks a home page with neither blocks nor ink — the rule is not vacuous', () => {
    const findings = v09EmptySite(homeWithoutBlocks({ keepInk: false }))

    expect(findings).toHaveLength(1)
    // The wording has to name both ways out, or it sends a pen-only client hunting
    // for a block they never wanted.
    expect(findings[0]?.message).toContain('draw something')
  })

  it('V9 warns on an individual empty page without blocking', () => {
    const red = brokenPackage((site) => {
      const page = site.pages[1]
      if (page) (site.pages as ExportPage[])[1] = { ...page, blocks: [] }
    })
    const warnings = v09NearEmptyPage(red)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.class).toBe('WARN')
  })

  it('V9 does not warn on a page drawn entirely with the pen', () => {
    // A deliberate ink-only page is the product's headline use, not a mistake. A
    // WARN on every one of them is how a client learns to ignore V9 altogether.
    const inkOnly = brokenPackage((site) => {
      const page = site.pages[1]
      if (page) (site.pages as ExportPage[])[1] = { ...page, blocks: [], penStrokes: [INK_MARK] }
    })

    expect(v09NearEmptyPage(inkOnly)).toEqual([])
    expect(v09NearEmptyPage(homeWithoutBlocks({ keepInk: true }))).toEqual([])
  })
})

describe('V11 / V17 / V20 / V23 — the remaining FIX rules', () => {
  it('V11 prepends https:// to a bare domain and blocks what it cannot repair', () => {
    const bare = brokenPackage((site) => {
      const button = site.pages[1]?.blocks[5] as ButtonBlock
      const blocks = site.pages[1]?.blocks as ExportBlock[] | undefined
      if (blocks) blocks[5] = { ...button, link: { kind: 'external', url: 'instagram.com/bluebird' } }
    })
    const { bundle, fixes } = v11PrependScheme(bare)
    expect(fixes.map((fix) => fix.rule)).toEqual(['V11'])
    const fixedButton = bundle.site.pages[1]?.blocks[5] as ButtonBlock
    expect(fixedButton.link).toEqual({ kind: 'external', url: 'https://instagram.com/bluebird' })
    expect(v11ExternalUrls(bundle)).toEqual([])

    const unfixable = brokenPackage((site) => {
      const button = site.pages[1]?.blocks[5] as ButtonBlock
      const blocks = site.pages[1]?.blocks as ExportBlock[] | undefined
      if (blocks) blocks[5] = { ...button, link: { kind: 'external', url: 'javascript:alert(1)' } }
    })
    expect(v11PrependScheme(unfixable).fixes).toEqual([])
    expect(v11ExternalUrls(unfixable)).toHaveLength(1)
  })

  it('V17 recomputes a screenshot path that does not match its position', () => {
    const red = brokenPackage((site) => {
      const page = site.pages[1]
      if (page) (site.pages as ExportPage[])[1] = { ...page, screenshot: 'pages/99-wrong.png' }
    })
    const { bundle, fixes } = v17RecomputeScreenshots(red)
    expect(fixes.map((fix) => fix.rule)).toEqual(['V17'])
    expect(bundle.site.pages[1]?.screenshot).toBe('pages/02-contact.png')
  })

  it('V20 nulls a description stranded by a switch back to real', () => {
    const red = brokenPackage((site) => {
      replaceHomeBlock(site, 3, { ...homeBlock(site, 3), generateDescription: 'stranded' } as ExportBlock)
    })
    const { bundle, fixes } = v20NullStrandedDescription(red)
    expect(fixes.map((fix) => fix.rule)).toEqual(['V20'])
    const block = bundle.site.pages[0]?.blocks[3]
    expect(block?.type === 'heading' && block.generateDescription).toBeNull()
  })

  it('V23 warns on non-section filler and strips the flag from a section', () => {
    const red = brokenPackage((site) => {
      replaceHomeBlock(site, 0, { ...homeBlock(site, 0), fromTemplate: true })
      replaceHomeBlock(site, 3, { ...homeBlock(site, 3), fromTemplate: true })
    })
    expect(v23TemplateFiller(red)).toHaveLength(1)

    const { bundle, fixes } = v23StripSectionFiller(red)
    expect(fixes.map((fix) => fix.rule)).toEqual(['V23'])
    expect(bundle.site.pages[0]?.blocks[0]).not.toHaveProperty('fromTemplate')
    expect(bundle.site.pages[0]?.blocks[3]).toHaveProperty('fromTemplate', true)
  })
})

describe('V13 / V15 / V18 / V22 / V25 / V27 — the WARN rules', () => {
  it('V13 warns on duplicate page names', () => {
    const red = brokenPackage((site) => {
      const page = site.pages[1]
      if (page) (site.pages as ExportPage[])[1] = { ...page, name: 'Home' }
    })
    expect(v13DuplicatePageNames(red)).toHaveLength(1)
  })

  it('V15 warns on a page nothing links to', () => {
    const red = brokenPackage((site) => {
      const nav = homeBlock(site, 2) as NavBarBlock
      replaceHomeBlock(site, 2, { ...nav, items: [nav.items[0] ?? { id: 'nav_0001', label: 'Home', link: { kind: 'none' } }] })
      const button = homeBlock(site, 5) as ButtonBlock
      replaceHomeBlock(site, 5, { ...button, link: { kind: 'none' } })
    })
    expect(v15Reachability(red).map((f) => f.targetIds)).toEqual([['pg_0002']])
  })

  it('V18 warns on a frame the PNG would clip away above the page', () => {
    const red = brokenPackage((site) => {
      const block = homeBlock(site, 3)
      replaceHomeBlock(site, 3, { ...block, frame: { ...block.frame, y: -200 } })
    })
    expect(v18OffPageFrames(red)).toHaveLength(1)
  })

  it('V22 warns on a cluster too small to read', () => {
    const red = brokenPackage((site) => {
      const page = site.pages[0]
      if (page) {
        const tiny: ExportPenStroke = {
          id: 'stk_0001',
          points: [
            [10, 10],
            [12, 12],
          ],
          color: '#000000',
          width: 4,
          role: 'annotation',
          targetBlockId: null,
        }
        ;(site.pages as ExportPage[])[0] = { ...page, penStrokes: [tiny] }
      }
    })
    expect(v22IllegibleClusters(red)).toHaveLength(1)
  })

  it('V25 warns on a block whose frame crosses x=1200', () => {
    const red = brokenPackage((site) => {
      const block = homeBlock(site, 3)
      replaceHomeBlock(site, 3, { ...block, frame: { ...block.frame, x: 1000, w: 400 } })
    })
    expect(v25RightOverflow(red)).toHaveLength(1)
  })

  it('V27 warns when a block serializes z after frame', () => {
    const red = brokenPackage((site) => {
      const blocks = site.pages[0]?.blocks as Record<string, unknown>[] | undefined
      const block = blocks?.[0]
      if (blocks && block) {
        const { id, type, z, frame, ...rest } = block
        blocks[0] = { id, type, frame, z, ...rest }
      }
    })
    const warnings = v27KeyOrder(red)
    expect(warnings).toHaveLength(1)
    expect(warnings[0]?.class).toBe('WARN')
  })
})

describe('V24 — identity remap', () => {
  it('flags an id that is not the §4.8 ordinal for its position', () => {
    const red = brokenPackage((site) => {
      replaceHomeBlock(site, 0, { ...homeBlock(site, 0), id: 'blk_zzzz' })
    })
    expect(v24IdentityRemap(red).some((f) => f.message.includes('blk_zzzz'))).toBe(true)
  })

  it('flags an internal app id that leaked into site.json or brief.md', () => {
    const red: PackageBundle = {
      ...green,
      brief: `${green.brief ?? ''}\n<!-- rest-home-hero-title -->\n`,
    }
    expect(v24IdentityRemap(red).some((f) => f.message.includes('rest-home-hero-title'))).toBe(true)
  })
})
