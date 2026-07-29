// @vitest-environment node
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { diffManifest, loadTemplateBlock } from './manifest-diff.mjs'
import { crossCheck, loadScenario, ScenarioError, scenarioPathFor } from './scenario-load.mjs'
import { POSITION_TOLERANCE_PX } from './thresholds.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')

const scenarioA = await loadScenario(scenarioPathFor('A'))
const scenarioB = await loadScenario(scenarioPathFor('B'))

describe('R1.4 — scenarios validate at load', () => {
  it('both committed scenarios are schema-valid and internally consistent', () => {
    expect(scenarioA.id).toBe('A')
    expect(scenarioB.id).toBe('B')
  })

  it('rejects a scenario that violates the schema', async () => {
    await expect(loadScenario(path.join(HERE, 'scenarios', 'scenario.schema.json'))).rejects.toThrow(ScenarioError)
  })

  it('rejects duplicate refs, dangling links and off-page pen targets', () => {
    const broken = structuredClone(scenarioB)
    broken.pages[0].blocks[1].ref = broken.pages[0].blocks[0].ref
    broken.pages[0].blocks[4].link = { kind: 'page', page: 'Nowhere' }
    broken.pages[2].pen[0].target = 'b-home-heading'
    const problems = crossCheck(broken)
    expect(problems.some((p) => p.includes('duplicate block ref'))).toBe(true)
    expect(problems.some((p) => p.includes('does not declare'))).toBe(true)
    expect(problems.some((p) => p.includes('not a block on'))).toBe(true)
  })

  it('every ref is unique across the whole scenario and none appears in the product', () => {
    for (const scenario of [scenarioA, scenarioB]) {
      const refs = scenario.pages.flatMap((p) => [...p.blocks.map((b) => b.ref), ...(p.pen ?? []).map((c) => c.ref)])
      expect(new Set(refs).size).toBe(refs.length)
    }
  })
})

describe('R1.2 — what Scenario A must cover', () => {
  const home = scenarioA.pages[0]

  it('starts from the trades template and targets four pages in order', () => {
    expect(scenarioA.start).toEqual({ mode: 'template', template: 'trades' })
    expect(scenarioA.pages.map((p) => p.name)).toEqual(['Home', 'Services', 'Our Work', 'Contact'])
  })

  it('R1.2a — Home alone covers all six block types, including declared section bands', () => {
    const types = new Set(home.blocks.map((b) => b.type))
    expect([...types].sort()).toEqual(['button', 'heading', 'imageSlot', 'navBar', 'section', 'text'])
    const bands = home.blocks.filter((b) => b.type === 'section')
    expect(bands).toHaveLength(2)
    for (const band of bands) {
      expect(band.frame[0]).toBe(0)
      expect(band.frame[2]).toBe(1200)
      expect(band.origin.kind).toBe('template')
    }
  })

  it('R1.2b — exactly one untouched copy-bearing fromTemplate filler block, on Services', () => {
    const filler = scenarioA.pages.flatMap((p) =>
      p.blocks.filter((b) => b.expect === 'untouched-filler').map((b) => ({ page: p.name, block: b })),
    )
    expect(filler).toHaveLength(1)
    expect(filler[0].page).toBe('Services')
    expect(filler[0].block.type).toBe('text')
    expect(filler[0].block.fromTemplate).toBe(true)
    // R1.6 — the expected text is READ from the fixture, never re-typed here.
    expect(filler[0].block.text).toBeUndefined()
    expect(filler[0].block.textFromFixture).toEqual({ template: 'trades', blockId: 'trade-svc-b-body' })
  })

  it('R1.2b — every other block declares fromTemplate: false', () => {
    const flagged = scenarioA.pages.flatMap((p) => p.blocks.filter((b) => b.fromTemplate === true))
    expect(flagged).toHaveLength(1)
  })

  it('R1.2c — Contact carries exactly one button, Instagram, link none', () => {
    const buttons = scenarioA.pages[3].blocks.filter((b) => b.type === 'button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].label).toBe('Instagram')
    expect(buttons[0].link).toEqual({ kind: 'none' })
  })

  it('R1.2d — the page-level actions the template start implies are declared', () => {
    expect(scenarioA.pageActions).toEqual([
      expect.objectContaining({ action: 'rename', target: 'Get a Quote', to: 'Contact' }),
      expect.objectContaining({ action: 'add', name: 'Our Work' }),
      expect.objectContaining({ action: 'moveLeft', target: 'Our Work' }),
    ])
  })

  it('R1.6 — the deliberate typo lives here once and nowhere else', () => {
    const typos = scenarioA.pages.flatMap((p) => p.blocks.filter((b) => (b.text ?? '').includes('beleive')))
    expect(typos).toHaveLength(1)
  })

  it('covers both copy modes, both fits, all three link kinds and both pen roles', () => {
    const blocks = scenarioA.pages.flatMap((p) => p.blocks)
    expect(new Set(blocks.filter((b) => b.copyMode).map((b) => b.copyMode))).toEqual(new Set(['real', 'generate']))
    expect(new Set(blocks.filter((b) => b.fit).map((b) => b.fit))).toEqual(new Set(['cover', 'contain']))
    const links = blocks.flatMap((b) => [...(b.link ? [b.link] : []), ...(b.items ?? []).map((i) => i.link)])
    expect(new Set(links.map((l) => l.kind))).toEqual(new Set(['page', 'external', 'none']))
    const roles = scenarioA.pages.flatMap((p) => (p.pen ?? []).map((c) => c.role))
    expect(new Set(roles)).toEqual(new Set(['annotation', 'imageSketch']))
    // lengthHint present AND absent — the frame-estimate fallback needs the absent case.
    const generates = blocks.filter((b) => b.copyMode === 'generate')
    expect(generates.some((b) => b.lengthHint)).toBe(true)
    expect(generates.some((b) => !b.lengthHint)).toBe(true)
    expect(blocks.some((b) => b.type === 'imageSlot' && !b.upload)).toBe(true)
  })

  it('every declared coordinate is on the 8px grid (R2.4)', () => {
    for (const scenario of [scenarioA, scenarioB]) {
      for (const page of scenario.pages) {
        for (const block of page.blocks) {
          for (const value of block.frame) expect(value % 8, `${block.ref} frame`).toBe(0)
        }
      }
    }
  })
})

describe('R1.3 — Scenario B is the minimal-path control', () => {
  it('starts blank, has no section band, no typo, no external link and no template filler', () => {
    expect(scenarioB.start).toEqual({ mode: 'blank' })
    const blocks = scenarioB.pages.flatMap((p) => p.blocks)
    expect(blocks.some((b) => b.type === 'section')).toBe(false)
    expect(blocks.some((b) => b.fromTemplate === true)).toBe(false)
    expect(blocks.some((b) => b.expect === 'untouched-filler')).toBe(false)
    const links = blocks.flatMap((b) => [...(b.link ? [b.link] : []), ...(b.items ?? []).map((i) => i.link)])
    expect(links.some((l) => l.kind === 'external')).toBe(false)
    expect(scenarioB.settings.tagline).toBeNull()
  })

  it('builds an identical nav on every page, by hand', () => {
    const navs = scenarioB.pages.map((p) => p.blocks.find((b) => b.type === 'navBar'))
    expect(navs.every((n) => n && n.origin.kind === 'insert')).toBe(true)
    const labels = navs.map((n) => n.items.map((i) => i.label).join('|'))
    expect(new Set(labels).size).toBe(1)
  })
})

describe('R1.2b — the template fixture is the source of the filler text', () => {
  it('reads the block straight out of the app\'s own src/templates', async () => {
    const block = await loadTemplateBlock(REPO_ROOT, 'trades', 'trade-svc-b-body')
    expect(block.copyMode).toBe('real')
    expect(block.fromTemplate).toBe(true)
    expect(block.text.length).toBeGreaterThan(40)
  })
})

/* ─────────────────────── the manifest diff itself ─────────────────────── */

/** A minimal site.json shaped exactly like the export, built from Scenario B. */
function siteFromScenarioB(mutate = (site) => site) {
  let assetIndex = 0
  const pageIds = new Map(scenarioB.pages.map((p, i) => [p.name, `pg_${String(i + 1).padStart(4, '0')}`]))
  let blockIndex = 0
  const assets = []
  const site = {
    schemaVersion: 1,
    submission: { client: { name: scenarioB.submit.name, email: scenarioB.submit.email } },
    siteSettings: { ...scenarioB.settings },
    assets,
    pages: scenarioB.pages.map((page) => ({
      id: pageIds.get(page.name),
      name: page.name,
      slug: page.slug,
      blocks: page.blocks.map((block) => {
        blockIndex += 1
        const base = {
          id: `blk_${String(blockIndex).padStart(4, '0')}`,
          type: block.type,
          frame: { x: block.frame[0], y: block.frame[1], w: block.frame[2], h: block.frame[3] },
          z: blockIndex,
        }
        if (block.type === 'heading' || block.type === 'text') {
          return {
            ...base,
            copyMode: block.copyMode,
            text: block.copyMode === 'real' ? block.text : '',
            generateDescription: block.generateDescription ?? null,
            lengthHint: block.lengthHint ?? null,
          }
        }
        if (block.type === 'imageSlot') {
          let assetId = null
          if (block.upload) {
            assetIndex += 1
            assetId = `img_${String(assetIndex).padStart(3, '0')}`
            assets.push({ id: assetId, mimeType: 'image/jpeg', width: 1600, height: 1200 })
          }
          return { ...base, assetId, fit: block.fit, description: block.description }
        }
        if (block.type === 'button') {
          return { ...base, label: block.label, link: resolveLink(block.link, pageIds) }
        }
        return {
          ...base,
          items: block.items.map((item, i) => ({
            id: `nav_${String(i + 1).padStart(4, '0')}`,
            label: item.label,
            link: resolveLink(item.link, pageIds),
          })),
        }
      }),
      penStrokes: (page.pen ?? []).flatMap((cluster) =>
        cluster.strokes.map((_, i) => ({
          id: `stk_${String(i + 1).padStart(4, '0')}`,
          role: cluster.role,
          targetBlockId: null,
        })),
      ),
    })),
  }
  // Point every stroke at its cluster's target, as the export's §4.5 geometry would.
  for (const [pageIndex, page] of scenarioB.pages.entries()) {
    for (const cluster of page.pen ?? []) {
      const targetIndex = page.blocks.findIndex((b) => b.ref === cluster.target)
      const targetId = site.pages[pageIndex].blocks[targetIndex].id
      for (const stroke of site.pages[pageIndex].penStrokes) stroke.targetBlockId = targetId
    }
  }
  return mutate(site)
}

function resolveLink(link, pageIds) {
  if (link.kind === 'page') return { kind: 'page', pageId: pageIds.get(link.page) }
  if (link.kind === 'external') return { kind: 'external', url: link.url }
  return { kind: 'none' }
}

describe('protocol §2 step 4 — the expected-manifest diff', () => {
  const run = (mutate) => diffManifest({ site: siteFromScenarioB(mutate), scenario: scenarioB, repoRoot: REPO_ROOT })

  it('passes on a faithful export', async () => {
    const result = await run()
    expect(result.problems).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.matched).toHaveLength(11)
  })

  it('tolerates placement drift up to the tolerance and fails past it', async () => {
    const nudge = (by) => (site) => {
      site.pages[0].blocks[1].frame.x += by
      return site
    }
    expect((await run(nudge(POSITION_TOLERANCE_PX))).ok).toBe(true)
    expect((await run(nudge(POSITION_TOLERANCE_PX + 8))).ok).toBe(false)
  })

  it.each([
    ['a renamed page', (s) => { s.pages[1].name = 'Prices'; return s }, 'name'],
    ['a wrong slug', (s) => { s.pages[1].slug = 'prices'; return s }, 'slug'],
    ['altered real copy', (s) => { s.pages[1].blocks[1].text = 'Bath and brush from $50.'; return s }, 'text'],
    ['a lost generateDescription', (s) => { s.pages[0].blocks[2].generateDescription = null; return s }, 'generateDescription'],
    ['a wrong fit', (s) => { s.pages[0].blocks[3].fit = 'contain'; return s }, 'fit'],
    ['a missing asset', (s) => { s.pages[0].blocks[3].assetId = null; s.assets = []; return s }, 'assetId'],
    ['a re-pointed link', (s) => { s.pages[0].blocks[4].link = { kind: 'page', pageId: 'pg_0003' }; return s }, 'link target'],
    ['a changed nav label', (s) => { s.pages[0].blocks[0].items[1].label = 'Prices'; return s }, 'label'],
    ['a lost pen stroke', (s) => { s.pages[2].penStrokes.pop(); return s }, 'pen stroke count'],
    ['a changed setting', (s) => { s.siteSettings.vibe = 'bold'; return s }, 'siteSettings.vibe'],
    ['a changed lead', (s) => { s.submission.client.email = 'someone@else.ca'; return s }, 'client.email'],
    ['a leaked template flag', (s) => { s.pages[0].blocks[1].fromTemplate = true; return s }, 'fromTemplate'],
  ])('catches %s', async (_name, mutate, needle) => {
    const result = await run(mutate)
    expect(result.ok).toBe(false)
    expect(result.problems.join('\n')).toContain(needle)
  })
})
