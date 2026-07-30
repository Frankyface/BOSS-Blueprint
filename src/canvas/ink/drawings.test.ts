import { describe, expect, it } from 'vitest'

import {
  circlePoints,
  headingAndColumns,
  inkBlock,
  navHeader,
  penStroke,
  pricingCards,
  specPageBlocks,
  squarePoints,
  waveAndCat,
} from '../../test/inkFixtures.ts'
import type { PenStroke } from '../types.ts'

import { INK_MAX_STROKES } from './constants.ts'
import { inkRegions } from './classify.ts'
import type { InkRegion } from './types.ts'

/**
 * THE FIVE REAL DRAWINGS, traced into fixtures.
 *
 * These are the product owner's actual sketches, and the thresholds in `constants.ts`
 * were chosen against them. Each assertion below is a promise about what a client
 * gets built when they draw that thing — not a snapshot of what the code happens to do.
 */

const summarise = (regions: readonly InkRegion[]) =>
  regions.map((region) => `${region.kind}${region.variant ? `/${region.variant}` : ''}`)

describe('A — two hand-drawn pricing cards whose outlines do not close', () => {
  const regions = inkRegions([], pricingCards())

  it('builds two panels, each holding its title and its bullet lines', () => {
    expect(summarise(regions)).toEqual([
      'panel/card',
      'writing/body',
      'textPlaceholder',
      'panel/card',
      'writing/body',
      'textPlaceholder',
    ])
  })

  it('scopes each card’s contents to its own card', () => {
    const [firstPanel, firstWriting, firstLines, secondPanel, secondWriting, secondLines] = regions
    expect(firstWriting?.parentId).toBe(firstPanel?.id)
    expect(firstLines?.parentId).toBe(firstPanel?.id)
    expect(secondWriting?.parentId).toBe(secondPanel?.id)
    expect(secondLines?.parentId).toBe(secondPanel?.id)
  })

  it('folds each card’s three bullet squiggles into one three-line placeholder', () => {
    expect(regions.filter((region) => region.kind === 'textPlaceholder').map((r) => r.lines)).toEqual([
      3, 3,
    ])
  })

  it('THE POINT OF THE WHOLE FEATURE: one component, instantiated twice', () => {
    const panels = regions.filter((region) => region.kind === 'panel')
    expect(panels.map((panel) => panel.setId)).toEqual(['set_0001', 'set_0001'])
    expect(panels.map((panel) => panel.setIndex)).toEqual([0, 1])
  })

  it('reads both cards confidently despite the unclosed corners', () => {
    expect(regions.filter((r) => r.kind === 'panel').map((r) => r.confidence)).toEqual([
      'clear',
      'clear',
    ])
  })
})

describe('B — "Heading" over four squiggles in two rows of two', () => {
  const regions = inkRegions([], headingAndColumns())

  it('is a heading plus TWO columns of body text, not one giant heading', () => {
    expect(summarise(regions)).toEqual(['writing/display', 'textPlaceholder', 'textPlaceholder'])
  })

  it('reads each column as two lines', () => {
    expect(regions.filter((region) => region.kind === 'textPlaceholder').map((r) => r.lines)).toEqual([
      2, 2,
    ])
  })

  it('keeps the columns side by side rather than stacking all four lines', () => {
    const columns = regions.filter((region) => region.kind === 'textPlaceholder')
    expect(columns[0]?.frame.x).toBeLessThan(columns[1]?.frame.x ?? 0)
  })

  it('measures the heading at the app’s own heading size', () => {
    expect(regions[0]?.glyphHeight).toBe(56)
  })
})

describe('C — a red wave over a blue cat, with OVERLAPPING boxes', () => {
  const regions = inkRegions([], waveAndCat())

  it('separates them into two artworks on colour alone', () => {
    expect(summarise(regions)).toEqual(['artwork', 'artwork/band'])
    expect(regions.map((region) => region.color)).toEqual(['#2B6CB0', '#D94F30'])
  })

  it('keeps the cat whole — outline, eyes, whiskers and mouth in one region', () => {
    expect(regions[0]?.strokeIds).toEqual([
      'cat-outline',
      'cat-eye-l',
      'cat-eye-r',
      'cat-whisker-l',
      'cat-whisker-r',
      'cat-mouth',
    ])
  })

  it('keeps the wave and its tick marks together as the background band', () => {
    expect(regions[1]?.strokeIds).toEqual(['wave', 'tick-0', 'tick-1', 'tick-2', 'tick-3'])
  })

  it('never mistakes the cat for a drawn panel', () => {
    expect(regions.some((region) => region.kind === 'panel')).toBe(false)
  })
})

describe('D — a header box, a wordmark, three nav words and a rule', () => {
  const regions = inkRegions([], navHeader())

  it('builds a header panel holding a wordmark, a nav row and a divider', () => {
    expect(summarise(regions)).toEqual([
      'panel/card',
      'writing/display',
      'navRow',
      'rule/divider',
    ])
  })

  it('reads three nav items — the schema’s navBar takes at most ten', () => {
    expect(regions[2]?.words).toBe(3)
  })

  it('calls the one big word the brand and the three regular ones the nav', () => {
    expect(regions[1]?.glyphHeight).toBeGreaterThan(regions[2]?.glyphHeight ?? 0)
  })

  it('is corroborated by the full-width rule beneath it, so the row reads `clear`', () => {
    expect(regions[2]?.confidence).toBe('clear')
  })

  it('puts everything inside the header panel', () => {
    const panel = regions[0]
    expect(regions.slice(1).map((region) => region.parentId)).toEqual([
      panel?.id,
      panel?.id,
      panel?.id,
    ])
  })
})

describe('E — a mark drawn on the photo in an image slot', () => {
  const mark = penStroke('doodle', circlePoints(940, 344, 60))

  it('is NOT a region: it is an annotation about that photo', () => {
    expect(inkRegions(specPageBlocks(), [mark])).toEqual([])
  })

  it('would have been a panel if the slot were not there — the veto is what did it', () => {
    expect(inkRegions([], [mark]).map((region) => region.kind)).toEqual(['panel'])
  })

  it('is vetoed by a plain block too, not only by an image slot', () => {
    const button = inkBlock('blk_0006', 'block', 900, 300, 200, 56)
    expect(inkRegions([button], [mark])).toEqual([])
  })
})

describe('determinism', () => {
  const strokes = [...pricingCards(), ...navHeader()]

  it('is byte-identical across a hundred runs', () => {
    const first = JSON.stringify(inkRegions([], strokes))
    for (let run = 0; run < 100; run += 1) {
      expect(JSON.stringify(inkRegions([], strokes))).toBe(first)
    }
  })

  it('does not depend on the order the blocks arrive in', () => {
    const blocks = specPageBlocks()
    const forwards = inkRegions(blocks, strokes)
    const backwards = inkRegions([...blocks].reverse(), strokes)
    expect(JSON.stringify(backwards)).toBe(JSON.stringify(forwards))
  })

  it('numbers ids densely from one, with no gaps', () => {
    const ids = inkRegions([], strokes).map((region) => region.id)
    expect(ids).toEqual(ids.map((_, index) => `reg_${String(index + 1).padStart(4, '0')}`))
  })
})

describe('the perf bound', () => {
  const scatter = (count: number): PenStroke[] =>
    Array.from({ length: count }, (_, index) =>
      penStroke(
        `s${String(index)}`,
        squarePoints((index % 20) * 60, Math.floor(index / 20) * 60, 10, 10),
      ),
    )

  it(`returns nothing past ${String(INK_MAX_STROKES)} candidates, without throwing`, () => {
    expect(inkRegions([], scatter(INK_MAX_STROKES + 1))).toEqual([])
  })

  it('still returns regions one stroke under the bound', () => {
    expect(inkRegions([], scatter(INK_MAX_STROKES - 1))).toHaveLength(INK_MAX_STROKES - 1)
  })
})
