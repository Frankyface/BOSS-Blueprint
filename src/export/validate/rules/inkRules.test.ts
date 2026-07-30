import { describe, expect, it } from 'vitest'

import { MAX_PAGE_HEIGHT_PX } from '../../../canvas/constants.ts'
import { bluebirdPackage } from '../../../test/exportFixtures.ts'
import type { ExportBlock, ExportPage, ExportPenRegion, ExportPenStroke } from '../../types.ts'
import type { PackageBundle } from '../types.ts'

import { generateBrief } from '../../brief/generateBrief.ts'

import { MAX_REGION_ANCESTORS, v28PenRegions } from './inkRegions.ts'
import { BUILD_FROM_INK_RE, v07BriefCrossCheck, v30BuildFromInkMarkers } from './briefCrossCheck.ts'
import {
  INK_READABLE_MIN_PX,
  INK_VISION_LONG_EDGE_PX,
  v29InkTooSmallToRead,
  v31TruncatedPageSpace,
} from './warnings.ts'

/**
 * §5 V28–V31 — the four rules that arrived with `penRegions`.
 *
 * V28 and V30 are BUG-class BLOCKs: nothing a client can do produces them, and
 * every one of them means the package would tell a builder something the JSON does
 * not support. V29 and V31 are WARNs about the client's own drawing, surfaced in
 * the notification payload rather than blocking a submission.
 *
 * One red path per clause, as §5's Appendix A checklist requires — a rule with no
 * red path is a rule nobody has proven fires.
 */

const green = bluebirdPackage()

function stroke(id: string, x: number, y: number): ExportPenStroke {
  return {
    id,
    points: [
      [x, y],
      [x + 40, y + 20],
      [x + 80, y],
    ],
    color: '#2B6CB0',
    width: 4,
    role: 'annotation',
    targetBlockId: null,
  }
}

function region(
  id: string,
  strokeIds: readonly string[],
  overrides: Partial<ExportPenRegion> = {},
): ExportPenRegion {
  // No `variant`: none of V28–V31 reads it, and omitting it keeps every fixture a
  // shape the producer could actually emit under `exactOptionalPropertyTypes`.
  return {
    id,
    kind: 'panel',
    confidence: 'clear',
    bbox: { x: 0, y: 0, w: 200, h: 200 },
    strokeIds,
    parentRegionId: null,
    setId: null,
    setIndex: null,
    text: null,
    ...overrides,
  }
}

/** A drawn heading, for the rules that read `text`. */
function writing(id: string, glyphHeight: number): ExportPenRegion {
  return region(id, ['stk_0001'], {
    kind: 'writing',
    text: { lines: 1, words: 2, glyphHeight, align: 'left', emphasis: 'display' },
  })
}

function pageOf(overrides: Partial<ExportPage> = {}): ExportPage {
  return {
    id: 'pg_0001',
    name: 'Home',
    slug: 'home',
    height: 1600,
    screenshot: 'pages/01-home.png',
    blocks: [],
    penStrokes: [stroke('stk_0001', 100, 100), stroke('stk_0002', 100, 600)],
    ...overrides,
  }
}

function bundleOf(page: ExportPage, brief: string | null = null): PackageBundle {
  return { site: { ...green.site, pages: [page] }, brief }
}

/** A block the ink must never overlap: the veto should have kept that stroke out. */
const BUTTON: ExportBlock = {
  id: 'blk_0001',
  type: 'button',
  z: 0,
  frame: { x: 80, y: 80, w: 200, h: 80 },
  label: 'Order',
  link: { kind: 'none' },
}

describe('V28 — penRegions integrity', () => {
  it('is silent on the §7.1 package, which publishes no regions at all', () => {
    expect(v28PenRegions(green)).toEqual([])
  })

  it('is silent on a well-formed drawn page', () => {
    const page = pageOf({
      penRegions: [
        region('reg_0001', ['stk_0001']),
        region('reg_0002', ['stk_0002'], { parentRegionId: 'reg_0001', kind: 'writing' }),
      ],
    })
    expect(v28PenRegions(bundleOf(page))).toEqual([])
  })

  it('BLOCKs a strokeId that names no stroke on the page', () => {
    const page = pageOf({ penRegions: [region('reg_0001', ['stk_9999'])] })
    const findings = v28PenRegions(bundleOf(page))
    expect(findings).toHaveLength(1)
    expect(findings[0]?.class).toBe('BLOCK')
    expect(findings[0]?.audience).toBe('bug')
    expect(findings[0]?.message).toContain('stk_9999')
  })

  it('BLOCKs the same stroke claimed by two regions', () => {
    const page = pageOf({
      penRegions: [region('reg_0001', ['stk_0001']), region('reg_0002', ['stk_0001'])],
    })
    expect(v28PenRegions(bundleOf(page))[0]?.message).toContain('stk_0001')
  })

  it('BLOCKs a region built from an imageSketch stroke — that ink is a sketch OF a photo', () => {
    const sketch: ExportPenStroke = { ...stroke('stk_0001', 100, 100), role: 'imageSketch', targetBlockId: 'blk_0002' }
    const page = pageOf({ penStrokes: [sketch], penRegions: [region('reg_0001', ['stk_0001'])] })
    expect(v28PenRegions(bundleOf(page))[0]?.message).toContain('imageSketch')
  })

  it('BLOCKs a region whose ink overlaps a real block — the veto should have caught it', () => {
    const page = pageOf({ blocks: [BUTTON], penRegions: [region('reg_0001', ['stk_0001'])] })
    expect(v28PenRegions(bundleOf(page))[0]?.message).toContain('blk_0001')
  })

  it('BLOCKs a region built from a dead-straight stroke crossing a block — the veto is zero-extent-robust', () => {
    // bbox height is EXACTLY 0, so the old area-only re-proof (`intersectionArea > 0`)
    // missed the single most common thing a client draws; the predicate now reads the
    // overlap per axis when the box is degenerate.
    const flat: ExportPenStroke = { ...stroke('stk_0001', 80, 120), points: [[80, 120], [280, 120]] }
    const page = pageOf({ blocks: [BUTTON], penStrokes: [flat], penRegions: [region('reg_0001', ['stk_0001'])] })
    const findings = v28PenRegions(bundleOf(page))
    expect(findings).not.toEqual([])
    expect(findings[0]?.message).toContain('blk_0001')
  })

  it('does NOT fire on an overlap with a section — sections are exempt from the veto', () => {
    const band: ExportBlock = {
      id: 'blk_0001',
      type: 'section',
      z: 0,
      frame: { x: 0, y: 0, w: 1200, h: 600 },
      background: null,
    }
    const page = pageOf({ blocks: [band], penRegions: [region('reg_0001', ['stk_0001'])] })
    expect(v28PenRegions(bundleOf(page))).toEqual([])
  })

  it('BLOCKs a region that is its own parent', () => {
    const page = pageOf({ penRegions: [region('reg_0001', ['stk_0001'], { parentRegionId: 'reg_0001' })] })
    expect(v28PenRegions(bundleOf(page))[0]?.message).toContain('own parent')
  })

  it('BLOCKs a parent that lives on another page', () => {
    const page = pageOf({ penRegions: [region('reg_0001', ['stk_0001'], { parentRegionId: 'reg_0500' })] })
    expect(v28PenRegions(bundleOf(page))[0]?.message).toContain('reg_0500')
  })

  it('BLOCKs nesting past the containment cap', () => {
    const chain = Array.from({ length: MAX_REGION_ANCESTORS + 2 }, (_, index) =>
      region(`reg_000${String(index + 1)}`, [], {
        parentRegionId: index === 0 ? null : `reg_000${String(index)}`,
      }),
    )
    const page = pageOf({ penRegions: chain })
    const findings = v28PenRegions(bundleOf(page))
    expect(findings.some((f) => f.message.includes('nests'))).toBe(true)
  })

  it('BLOCKs a setId with only one member — a set of one is not a repeated component', () => {
    const page = pageOf({
      penRegions: [region('reg_0001', ['stk_0001'], { setId: 'set_0001', setIndex: 0 })],
    })
    expect(v28PenRegions(bundleOf(page))[0]?.message).toContain('set_0001')
  })

  it('BLOCKs a gap in a set’s indexes', () => {
    const page = pageOf({
      penRegions: [
        region('reg_0001', ['stk_0001'], { setId: 'set_0001', setIndex: 0 }),
        region('reg_0002', ['stk_0002'], { setId: 'set_0001', setIndex: 2 }),
      ],
    })
    expect(v28PenRegions(bundleOf(page))[0]?.message).toContain('0, 2')
  })

  it('BLOCKs a repeated setIndex', () => {
    const page = pageOf({
      penRegions: [
        region('reg_0001', ['stk_0001'], { setId: 'set_0001', setIndex: 0 }),
        region('reg_0002', ['stk_0002'], { setId: 'set_0001', setIndex: 0 }),
      ],
    })
    expect(v28PenRegions(bundleOf(page))).not.toEqual([])
  })

  it('BLOCKs a setId with no setIndex', () => {
    const page = pageOf({
      penRegions: [
        region('reg_0001', ['stk_0001'], { setId: 'set_0001', setIndex: null }),
        region('reg_0002', ['stk_0002'], { setId: 'set_0001', setIndex: 1 }),
      ],
    })
    expect(v28PenRegions(bundleOf(page))).not.toEqual([])
  })

  it('BLOCKs regions emitted out of depth-first order', () => {
    const page = pageOf({
      penRegions: [
        region('reg_0002', ['stk_0002'], { parentRegionId: 'reg_0001' }),
        region('reg_0001', ['stk_0001']),
      ],
    })
    expect(v28PenRegions(bundleOf(page))[0]?.message).toContain('depth-first')
  })

  it('BLOCKs a subtree broken apart, even when every parent precedes its child', () => {
    const page = pageOf({
      penStrokes: [stroke('stk_0001', 100, 100), stroke('stk_0002', 100, 600), stroke('stk_0003', 100, 1100)],
      penRegions: [
        region('reg_0001', ['stk_0001']),
        region('reg_0002', ['stk_0002']),
        region('reg_0003', ['stk_0003'], { parentRegionId: 'reg_0001' }),
      ],
    })
    expect(v28PenRegions(bundleOf(page))[0]?.message).toContain('depth-first')
  })
})

/**
 * The fifth half of V28 (§4.9.10): a `panel`'s sub-kind may not contradict the
 * region tree it sits in. `card` and `mediaBox` are the same `kind` and the same
 * shape — the ONLY thing that separates a drawn pricing card from an empty drawn
 * media box is whether anything is drawn inside it, and [N14] builds them as two
 * different elements on the strength of that. A producer that got the variant
 * wrong would hand a builder an `<img>` placeholder where the client wrote a price.
 */
describe('V28 — a panel’s variant must match what is drawn inside it', () => {
  it('is silent on a card that really does hold something', () => {
    const page = pageOf({
      penRegions: [
        region('reg_0001', ['stk_0001'], { variant: 'card' }),
        region('reg_0002', ['stk_0002'], { parentRegionId: 'reg_0001', kind: 'writing' }),
      ],
    })
    expect(v28PenRegions(bundleOf(page))).toEqual([])
  })

  it('is silent on a media box that really is empty', () => {
    const page = pageOf({ penRegions: [region('reg_0001', ['stk_0001'], { variant: 'mediaBox' })] })
    expect(v28PenRegions(bundleOf(page))).toEqual([])
  })

  it('BLOCKs a `card` with nothing drawn inside it — that box is a media placeholder', () => {
    const page = pageOf({ penRegions: [region('reg_0001', ['stk_0001'], { variant: 'card' })] })
    const findings = v28PenRegions(bundleOf(page))
    expect(findings).toHaveLength(1)
    expect(findings[0]?.class).toBe('BLOCK')
    expect(findings[0]?.audience).toBe('bug')
    expect(findings[0]?.message).toContain('mediaBox')
  })

  it('BLOCKs a `mediaBox` that has contents — the builder would paper over the client’s words', () => {
    const page = pageOf({
      penRegions: [
        region('reg_0001', ['stk_0001'], { variant: 'mediaBox' }),
        region('reg_0002', ['stk_0002'], { parentRegionId: 'reg_0001', kind: 'writing' }),
      ],
    })
    expect(v28PenRegions(bundleOf(page))[0]?.message).toContain('card')
  })

  it('says nothing about a variant it does not know, or a panel with none — §6.2', () => {
    const unknown = pageOf({
      penRegions: [region('reg_0001', ['stk_0001'], { variant: 'ticketStub' })],
    })
    const none = pageOf({ penRegions: [region('reg_0001', ['stk_0001'])] })
    expect(v28PenRegions(bundleOf(unknown))).toEqual([])
    expect(v28PenRegions(bundleOf(none))).toEqual([])
  })

  it('says nothing about a `card` variant on a kind that is not a panel', () => {
    const page = pageOf({
      penRegions: [region('reg_0001', ['stk_0001'], { kind: 'artwork', variant: 'card' })],
    })
    expect(v28PenRegions(bundleOf(page))).toEqual([])
  })
})

describe('V29 — drawn words the builder would read downscaled below legibility', () => {
  const at = (height: number, glyphHeight: number): PackageBundle =>
    bundleOf(pageOf({ height, penRegions: [writing('reg_0001', glyphHeight)] }))

  it('is silent on the §7.1 package', () => {
    expect(v29InkTooSmallToRead(green)).toEqual([])
  })

  it('fires on a maximum-height page whose 40px letters land at 12.9px', () => {
    const findings = v29InkTooSmallToRead(at(MAX_PAGE_HEIGHT_PX, 40))
    expect(findings).toHaveLength(1)
    expect(findings[0]?.class).toBe('WARN')
    expect(40 * (INK_VISION_LONG_EDGE_PX / MAX_PAGE_HEIGHT_PX)).toBeLessThan(INK_READABLE_MIN_PX)
  })

  it('is silent on a 1600px page with the same handwriting — nothing is downscaled', () => {
    expect(v29InkTooSmallToRead(at(1600, 40))).toEqual([])
  })

  it('is silent on a tall page whose letters are big enough to survive the downscale', () => {
    expect(v29InkTooSmallToRead(at(MAX_PAGE_HEIGHT_PX, 100))).toEqual([])
  })

  it('says nothing about a panel or a rule — they carry no words to read', () => {
    const page = pageOf({ height: MAX_PAGE_HEIGHT_PX, penRegions: [region('reg_0001', ['stk_0001'])] })
    expect(v29InkTooSmallToRead(bundleOf(page))).toEqual([])
  })
})

describe('V31 — page space the height cap swallowed', () => {
  it('is silent on the §7.1 package, which asked for no extra space', () => {
    expect(v31TruncatedPageSpace(green)).toEqual([])
  })

  it('fires when the added space is truncated — content already fills the page to the cap', () => {
    // A stroke reaching y≈7840 pins the content-only height at 8000, so a 400px request
    // clamps to 0 applied: requested > applied, real truncation.
    const page = pageOf({ height: MAX_PAGE_HEIGHT_PX, extraBottomPx: 400, penStrokes: [stroke('stk_0001', 100, 7820)] })
    const findings = v31TruncatedPageSpace(bundleOf(page))
    expect(findings).toHaveLength(1)
    expect(findings[0]?.class).toBe('WARN')
    expect(findings[0]?.jumpTo?.pageId).toBe('pg_0001')
  })

  it('fires on partial truncation — only some of the requested space fit', () => {
    // content 7800 + extra 400 clamps to 8000: 200px landed, 200px lost.
    const page = pageOf({ height: MAX_PAGE_HEIGHT_PX, extraBottomPx: 400, penStrokes: [stroke('stk_0001', 100, 7620)] })
    expect(v31TruncatedPageSpace(bundleOf(page))).toHaveLength(1)
  })

  it('is SILENT at the boundary where the page lands on the cap but every pixel applied', () => {
    // content 7600 + extra 400 = height 8000. The old rule fired here and falsely told
    // the client the space "was not applied"; requested (400) === applied (400), so no.
    const page = pageOf({ height: MAX_PAGE_HEIGHT_PX, extraBottomPx: 400, penStrokes: [stroke('stk_0001', 100, 7420)] })
    expect(v31TruncatedPageSpace(bundleOf(page))).toEqual([])
  })

  it('is silent at the cap when no space was added — nothing was truncated', () => {
    expect(v31TruncatedPageSpace(bundleOf(pageOf({ height: MAX_PAGE_HEIGHT_PX })))).toEqual([])
  })

  it('is silent when space was added and the page had room for it', () => {
    expect(v31TruncatedPageSpace(bundleOf(pageOf({ height: 2400, extraBottomPx: 400 })))).toEqual([])
  })
})

describe('V30 — one BUILD THIS FROM INK marker per top-level region', () => {
  const marked = (count: number): string =>
    Array.from(
      { length: count },
      (_, index) => `- **Drawn card** — a box at (0, 0, 1, 1). **BUILD THIS FROM INK**: build ${String(index)}.`,
    ).join('\n')

  it('is silent on the §7.1 package: no regions, no markers', () => {
    expect(v30BuildFromInkMarkers(green)).toEqual([])
  })

  it('counts one marker per bullet', () => {
    expect(marked(3).match(BUILD_FROM_INK_RE)).toHaveLength(3)
  })

  it('is silent when the counts agree', () => {
    const page = pageOf({
      penRegions: [
        region('reg_0001', ['stk_0001']),
        region('reg_0002', ['stk_0002'], { parentRegionId: 'reg_0001' }),
      ],
    })
    expect(v30BuildFromInkMarkers(bundleOf(page, marked(1)))).toEqual([])
  })

  it('BLOCKs a brief that skipped a region', () => {
    const page = pageOf({
      penRegions: [region('reg_0001', ['stk_0001']), region('reg_0002', ['stk_0002'])],
    })
    const findings = v30BuildFromInkMarkers(bundleOf(page, marked(1)))
    expect(findings).toHaveLength(1)
    expect(findings[0]?.class).toBe('BLOCK')
    expect(findings[0]?.message).toContain('1')
  })

  it('BLOCKs a brief with a marker for a region that is not top-level', () => {
    const page = pageOf({
      penRegions: [
        region('reg_0001', ['stk_0001']),
        region('reg_0002', ['stk_0002'], { parentRegionId: 'reg_0001' }),
      ],
    })
    expect(v30BuildFromInkMarkers(bundleOf(page, marked(2)))).toHaveLength(1)
  })

  it('BLOCKs a missing brief rather than passing vacuously', () => {
    const page = pageOf({ penRegions: [region('reg_0001', ['stk_0001'])] })
    expect(v30BuildFromInkMarkers(bundleOf(page, null))).toHaveLength(1)
  })
})

/**
 * V7's inventory cross-check, on the one cell v2.5 changed.
 *
 * The Blocks cell now counts a page's top-level drawn regions alongside its blocks,
 * so an ink-only page no longer advertises itself as having nothing on it. The cell
 * is cross-checked, which means the generator and the validator have to agree — and
 * the SAME agreement has to hold in the harness twin (`scripts/roundtrip/lib/rules/
 * brief.mjs`, covered by `scripts/roundtrip/rules-brief.test.mjs`).
 */
describe('V07 — the inventory Blocks cell counts drawn regions (v2.5)', () => {
  const inventoryProblems = (page: ExportPage, mutate: (brief: string) => string = (b) => b) => {
    const site = { ...green.site, pages: [page] }
    return v07BriefCrossCheck({ site, brief: mutate(generateBrief(site)) })
      .map((finding) => finding.message)
      .filter((message) => message.startsWith('inventory row'))
  }

  const drawn = pageOf({
    penRegions: [region('reg_0001', ['stk_0001']), region('reg_0002', ['stk_0002'])],
  })

  it('accepts the cell the generator emits for a page with drawn regions', () => {
    expect(inventoryProblems(drawn)).toEqual([])
  })

  /**
   * The other half of the coupling: an ink bullet PRINTS `reg_` and `stk_` ids, so
   * rule 5's printed-id check is now live on prose it never saw before. A whole-brief
   * green here is what proves those ids resolve — and that no ink bullet emits a
   * guillemet span V7 would then fail to trace back to a `site.json` string.
   */
  it('passes every V7 cross-check on a brief full of drawn-region bullets', () => {
    const site = { ...green.site, pages: [drawn] }
    expect(v07BriefCrossCheck({ site, brief: generateBrief(site) })).toEqual([])
  })

  it('BLOCKs a brief that still prints the bare block count on that page', () => {
    expect(inventoryProblems(drawn, (brief) => brief.replace('| 0 (+2 drawn) |', '| 0 |'))).toEqual([
      'inventory row 1 column 5: "0" != "0 (+2 drawn)"',
    ])
  })

  it('is byte-neutral for a page with no regions', () => {
    expect(inventoryProblems(pageOf())).toEqual([])
    expect(generateBrief({ ...green.site, pages: [pageOf()] })).toContain(
      '| `pages/01-home.png` (1200×1600) | 0 |',
    )
  })
})

/**
 * V7's copy-list cross-check, on the number v2.5 settled.
 *
 * The heading counts the NUMBERED LIST under it — `generate` blocks — and nothing
 * else, so the section's one number describes one thing. Copy that comes from ink is
 * stated after the list with its own verbs and its own counts, never as an addition
 * to or a correction of the heading. That collapses V7's two copy-list numbers into
 * one, and the harness twin (`scripts/roundtrip/lib/rules/brief.mjs`) has to agree.
 */
describe('V07 — the copy-list heading counts the list under it (v2.5)', () => {
  const copyProblems = (page: ExportPage, mutate: (brief: string) => string = (b) => b) => {
    const site = { ...green.site, pages: [page] }
    return v07BriefCrossCheck({ site, brief: mutate(generateBrief(site)) })
      .map((finding) => finding.message)
      .filter((message) => message.startsWith('copy-list'))
  }

  const drawnCopy = pageOf({
    penRegions: [
      writing('reg_0001', 60),
      region('reg_0002', ['stk_0002'], { kind: 'textPlaceholder' }),
    ],
  })

  it('accepts a heading that counts blocks alone, whatever the ink carries', () => {
    expect(copyProblems(drawnCopy)).toEqual([])
    expect(generateBrief({ ...green.site, pages: [drawnCopy] })).toContain(
      '## Copy you must write (0 items)',
    )
  })

  it('BLOCKs a heading that folds drawn regions back into the number', () => {
    expect(
      copyProblems(drawnCopy, (brief) =>
        brief.replace('## Copy you must write (0 items)', '## Copy you must write (2 items)'),
      ),
    ).toEqual(['copy-list header says 2, site.json has 0 generate block(s)'])
  })

  it('does not count a drawn nav as copy — its bullet is a label lookup', () => {
    const nav = pageOf({ penRegions: [region('reg_0001', ['stk_0001'], { kind: 'navRow' })] })
    expect(copyProblems(nav)).toEqual([])
    expect(generateBrief({ ...green.site, pages: [nav] })).toContain('## Copy you must write (0 items)')
  })

  it('is byte-neutral for a page with no drawn copy at all', () => {
    expect(copyProblems(pageOf())).toEqual([])
    expect(generateBrief({ ...green.site, pages: [pageOf()] })).toContain(
      '## Copy you must write (0 items)',
    )
  })
})
