import { describe, expect, it } from 'vitest'

import type { PenStroke } from '../canvas/types.ts'
import {
  circlePoints,
  inkOnlyPage,
  navHeader,
  penStroke,
  pricingCards,
  squarePoints,
} from '../test/inkFixtures.ts'

import { createIdMinter } from './ids.ts'
import { toExportRegions } from './penRegions.ts'
import type { ExportBlock, ExportPenStroke } from './types.ts'

/**
 * THE BRIDGE — `src/canvas/ink/` infers, this module PUBLISHES.
 *
 * Every assertion here is about the bridge, never about the inference: the ink
 * module's own suite already proves that `navHeader()` is a panel holding a
 * wordmark, a nav row and a divider. What this file proves is that the answer
 * reaches `site.json` with EXPORT ids, EXPORT ordinals and the §2.2 shape — and
 * that the two things the export adds (the `annotation` drop and the site-wide
 * minter) cannot corrupt the reading.
 */

/**
 * Fixture strokes in the §2.9 export shape, numbered as the export would number
 * them. Passing EXPORT strokes is the whole point: the ids the regions cite are
 * then the ids the package carries, so the remap and the inference cannot disagree
 * — the same argument `penRoles.ts` already makes for `targetBlockId`.
 */
function exportStrokes(strokes: readonly PenStroke[], firstOrdinal = 1): ExportPenStroke[] {
  return strokes.map((stroke, index) => ({
    id: `stk_${String(firstOrdinal + index).padStart(4, '0')}`,
    points: stroke.points.map((point) => [point.x, point.y] as const),
    color: stroke.color,
    width: stroke.width,
    role: 'annotation' as const,
    targetBlockId: null,
  }))
}

function button(id: string, x: number, y: number, w: number, h: number): ExportBlock {
  return { id, type: 'button', z: 0, frame: { x, y, w, h }, label: 'Order', link: { kind: 'none' } }
}

/** The §4.4 arrow: two strokes, ~2 rad of turn between them — never artwork. */
function arrow(): PenStroke[] {
  return [
    penStroke('shaft', [
      { x: 100, y: 900 },
      { x: 660, y: 900 },
    ]),
    penStroke('head', [
      { x: 620, y: 870 },
      { x: 660, y: 900 },
      { x: 620, y: 930 },
    ]),
  ]
}

describe('toExportRegions — a drawn header reaches site.json intact', () => {
  const regions = toExportRegions([], exportStrokes(navHeader()), createIdMinter())

  it('publishes the four regions the ink module read, in depth-first order', () => {
    expect(regions.map((region) => region.kind)).toEqual(['panel', 'writing', 'navRow', 'rule'])
  })

  it('numbers them as dense §4.8 ordinals from the shared minter', () => {
    expect(regions.map((region) => region.id)).toEqual(['reg_0001', 'reg_0002', 'reg_0003', 'reg_0004'])
  })

  it('names the panel as every child’s parent, in export ids', () => {
    expect(regions.map((region) => region.parentRegionId)).toEqual([
      null,
      'reg_0001',
      'reg_0001',
      'reg_0001',
    ])
  })

  it('cites the strokes by their export ids', () => {
    expect(regions[0]?.strokeIds).toEqual(['stk_0001'])
    expect(regions.flatMap((region) => region.strokeIds)).toHaveLength(navHeader().length)
  })

  it('carries a sub-kind on the shapes that have one, and none on writing', () => {
    expect(regions.map((region) => region.variant)).toEqual([
      'card',
      undefined,
      undefined,
      'divider',
    ])
  })

  it('moves the writing sub-kind into `text.emphasis`, where a builder can act on it', () => {
    expect(regions[1]?.text?.emphasis).toBe('display')
    expect(regions[2]?.text).toMatchObject({ words: 3, emphasis: 'body' })
  })

  it('leaves `text` null on the shapes that carry no words', () => {
    expect(regions[0]?.text).toBeNull()
    expect(regions[3]?.text).toBeNull()
  })

  it('rounds the bbox to one decimal, exactly as §2.9 rounds points', () => {
    for (const region of regions) {
      for (const value of Object.values(region.bbox)) {
        expect(value).toBe(Math.round(value * 10) / 10)
      }
    }
  })

  it('is deterministic — two passes over the same ink are deep-equal', () => {
    expect(toExportRegions([], exportStrokes(navHeader()), createIdMinter())).toEqual(regions)
  })
})

describe('toExportRegions — repeated components keep their set identity', () => {
  const regions = toExportRegions([], exportStrokes(pricingCards()), createIdMinter())
  const panels = regions.filter((region) => region.kind === 'panel')

  it('mints one `set_` id through the same minter and indexes the members 0..n−1', () => {
    expect(panels.map((panel) => panel.setId)).toEqual(['set_0001', 'set_0001'])
    expect(panels.map((panel) => panel.setIndex)).toEqual([0, 1])
  })

  it('leaves everything that is not a set member at `null`', () => {
    const loose = regions.filter((region) => region.kind !== 'panel')
    expect(loose.every((region) => region.setId === null && region.setIndex === null)).toBe(true)
  })
})

describe('toExportRegions — the minter is site-wide, not per page', () => {
  const mint = createIdMinter()
  const first = toExportRegions([], exportStrokes(navHeader()), mint)
  const second = toExportRegions([], exportStrokes(pricingCards(), 100), mint)

  it('continues the region ordinals onto the next page rather than restarting', () => {
    expect(first.at(-1)?.id).toBe('reg_0004')
    expect(second[0]?.id).toBe('reg_0005')
  })

  it('continues the set ordinals too', () => {
    expect(second.find((region) => region.setId !== null)?.setId).toBe('set_0001')
  })
})

/**
 * THE DEFECT THIS FIXES, IN ITS OWN NUMBERS.
 *
 * `inkOnlyPage()` is the whole-page drawing the owner reported, and it exports as
 * `reg_0004`, `reg_0007` (two filled pricing cards) and `reg_0010` (a box he left
 * empty for a photo). Before this change all three shipped as `kind: "panel",
 * variant: "card"` — byte-identical — while `brief.md` told the builder to build
 * two cards and one media placeholder. A reviewer applying `site.json` strictly
 * built a third empty card. The ids below are the real package's ids, so this
 * describe fails the moment the distinction stops reaching `site.json`.
 */
describe('toExportRegions — an empty drawn box is not a card', () => {
  const regions = toExportRegions([], exportStrokes(inkOnlyPage()), createIdMinter())
  const variantOf = (id: string): string | undefined =>
    regions.find((region) => region.id === id)?.variant

  it('publishes the two boxes the client filled as `card`', () => {
    expect([variantOf('reg_0004'), variantOf('reg_0007')]).toEqual(['card', 'card'])
  })

  it('publishes the box the client left empty as `mediaBox`, not as a third card', () => {
    expect(variantOf('reg_0010')).toBe('mediaBox')
  })

  it('leaves `kind` unable to tell them apart — `variant` is the whole distinction', () => {
    const kinds = ['reg_0004', 'reg_0007', 'reg_0010'].map(
      (id) => regions.find((region) => region.id === id)?.kind,
    )
    expect(kinds).toEqual(['panel', 'panel', 'panel'])
  })

  it('reads emptiness from the PUBLISHED regions, so a box holding only dropped annotation ink is still a media box', () => {
    // The arrow inside the box classifies as `annotation` and never reaches the
    // contract, so the ink module's own tree says "this panel has a child" while
    // the package says "nothing is drawn inside it". The brief's empty-box branch
    // walks the published tree, so the variant must be computed there too.
    const boxAroundAnArrow = [penStroke('box', squarePoints(200, 200, 400, 300)), ...arrow()]
    const published = toExportRegions([], exportStrokes(boxAroundAnArrow), createIdMinter())
    expect(published.map((region) => `${region.kind}/${String(region.variant)}`)).toEqual([
      'panel/mediaBox',
    ])
  })

  it('calls a lone traced box a media box wherever it is drawn', () => {
    const circled = exportStrokes([penStroke('doodle', circlePoints(180, 460, 60))])
    expect(toExportRegions([], circled, createIdMinter())[0]?.variant).toBe('mediaBox')
  })
})

describe('toExportRegions — what never becomes a region', () => {
  it('drops `annotation` ink: it belongs to the [N7] cluster narration, not to a build instruction', () => {
    expect(toExportRegions([], exportStrokes(arrow()), createIdMinter())).toEqual([])
  })

  it('keeps the ordinals dense across a dropped annotation', () => {
    const strokes = exportStrokes([...navHeader(), ...arrow()])
    const regions = toExportRegions([], strokes, createIdMinter())
    expect(regions.map((region) => region.id)).toEqual([
      'reg_0001',
      'reg_0002',
      'reg_0003',
      'reg_0004',
    ])
  })

  it('honours the block-overlap veto: ink that clips a real block stays an annotation', () => {
    // A traced circle alone is a panel — "circle this button to emphasise it" is
    // the classic mark a wrong build would ruin, and the veto is what stops it.
    const circled = exportStrokes([penStroke('doodle', circlePoints(180, 460, 60))])
    expect(toExportRegions([], circled, createIdMinter())).toHaveLength(1)
    expect(toExportRegions([button('blk_0001', 80, 432, 200, 56)], circled, createIdMinter())).toEqual(
      [],
    )
  })

  it('exempts sections from the veto, or a full-width band would veto the page', () => {
    const band: ExportBlock = {
      id: 'blk_0001',
      type: 'section',
      z: 0,
      frame: { x: 0, y: 0, w: 1200, h: 400 },
      background: null,
    }
    expect(toExportRegions([band], exportStrokes(navHeader()), createIdMinter())).toHaveLength(4)
  })

  it('returns nothing at all for a page with no ink', () => {
    expect(toExportRegions([], [], createIdMinter())).toEqual([])
  })
})
