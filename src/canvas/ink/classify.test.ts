import { describe, expect, it } from 'vitest'

import {
  INK_BLUE,
  INK_RED,
  catStrokes,
  cursivePoints,
  inkBlock,
  linePoints,
  penStroke,
  printWordStrokes,
  roundedBoxPoints,
  squarePoints,
  wavePoints,
} from '../../test/inkFixtures.ts'
import { PAGE_WIDTH_PX } from '../constants.ts'
import type { PenStroke } from '../types.ts'

import {
  ARTWORK_MIN_ABS_TURN_RAD,
  PLACEHOLDER_ASPECT_MIN,
  PLACEHOLDER_CHORD_DEV_MAX,
  PLACEHOLDER_MAX_H_PX,
  PLACEHOLDER_LEFT_TOL_PX,
  RULE_ASPECT_MIN,
  RULE_CHORD_DEV_MAX,
  RULE_FULL_WIDTH_RATIO,
  RULE_MAX_THICKNESS_PX,
  RULE_MIN_LENGTH_PX,
} from './constants.ts'
import { inkRegions } from './classify.ts'
import type { InkRegion } from './types.ts'

/**
 * STAGE 3 — one row per classifier, tested AT and either side of every binding
 * threshold, plus the negative cases by name. A classifier that only ever sees the
 * shapes it was designed for is untested; these are the shapes that sit on its edges.
 */

const only = (strokes: readonly PenStroke[]): InkRegion => {
  const regions = inkRegions([], strokes)
  expect(regions).toHaveLength(1)
  const region = regions[0]
  if (!region) throw new Error('no region')
  return region
}

const shapeOf = (region: InkRegion) => ({ kind: region.kind, variant: region.variant })

describe('rule — long, thin, dead straight and level', () => {
  it('is a divider at or past the full-width ratio', () => {
    const full = RULE_FULL_WIDTH_RATIO * PAGE_WIDTH_PX
    expect(shapeOf(only([penStroke('r', linePoints(100, 400, full, 0))]))).toEqual({
      kind: 'rule',
      variant: 'divider',
    })
  })

  it('is an underline below the full-width ratio', () => {
    expect(shapeOf(only([penStroke('r', linePoints(100, 400, 200, 0))]))).toEqual({
      kind: 'rule',
      variant: 'underline',
    })
  })

  it(`is still a rule at exactly ${String(RULE_MIN_LENGTH_PX)}px long`, () => {
    expect(only([penStroke('r', linePoints(100, 400, RULE_MIN_LENGTH_PX, 0))]).kind).toBe('rule')
  })

  it('is NOT a rule one pixel shorter — it falls through to placeholder text', () => {
    expect(only([penStroke('r', linePoints(100, 400, RULE_MIN_LENGTH_PX - 1, 0))]).kind).toBe(
      'textPlaceholder',
    )
  })

  it(`is still a rule at exactly ${String(RULE_MAX_THICKNESS_PX)}px thick`, () => {
    const points = [
      { x: 100, y: 400 },
      { x: 400, y: 400 + RULE_MAX_THICKNESS_PX },
    ]
    expect(only([penStroke('r', points)]).kind).toBe('rule')
  })

  it(`is NOT a rule at an aspect under ${String(RULE_ASPECT_MIN)}`, () => {
    const width = 120
    const height = width / (RULE_ASPECT_MIN - 1)
    expect(only([penStroke('r', linePoints(100, 400, width, height))]).kind).not.toBe('rule')
  })

  /**
   * A one-sided bow, so the bow IS the box height and the two can be varied together.
   * At 20/400 the stroke sits exactly on the bow ceiling and stays a rule; at 24/400 it
   * is the ONLY gate that fails — 24px is still inside the thickness limit — so this
   * isolates bow as the designed rule-versus-body-text discriminator.
   */
  it('separates a rule from placeholder text by BOW, the designed discriminator', () => {
    expect(20 / 400).toBe(RULE_CHORD_DEV_MAX)
    const bow = (amplitude: number) =>
      wavePoints({ x: 0, y: 400, width: 400, amplitude, cycles: 0.5 })
    expect(only([penStroke('r', bow(20))]).kind).toBe('rule')
    expect(only([penStroke('r', bow(24))]).kind).toBe('textPlaceholder')
  })

  it('reads a vertical rule with the axes swapped', () => {
    expect(shapeOf(only([penStroke('r', linePoints(400, 100, 0, 600))]))).toEqual({
      kind: 'rule',
      variant: 'vertical',
    })
  })

  /**
   * The tilt gate can never bind on its own: an aspect of 6 already caps the chord at
   * atan(1/6) ≈ 9.5°, inside the 12° allowance. It is kept because it is what the
   * axis-swapped vertical test leans on, and because loosening the aspect floor later
   * must not silently admit diagonals.
   */
  it('rejects a diagonal on aspect before tilt ever gets a say', () => {
    expect(only([penStroke('r', linePoints(100, 400, 300, 120))]).kind).not.toBe('rule')
  })
})

describe('textPlaceholder — the horizontal squiggle', () => {
  const squiggle = (id: string, x: number, y: number, width = 240) =>
    penStroke(id, wavePoints({ x, y, width, amplitude: 14, cycles: 1 }))

  it('is one region for a lone squiggle, carrying one line', () => {
    const region = only([squiggle('a', 100, 300)])
    expect(region.kind).toBe('textPlaceholder')
    expect(region.lines).toBe(1)
  })

  it('folds three stacked squiggles into ONE region of three lines', () => {
    const region = only([squiggle('a', 100, 300), squiggle('b', 100, 350), squiggle('c', 100, 400)])
    expect(region.kind).toBe('textPlaceholder')
    expect(region.lines).toBe(3)
    expect(region.strokeIds).toEqual(['a', 'b', 'c'])
  })

  it('does NOT stack squiggles whose left edges disagree — those are two columns', () => {
    const regions = inkRegions(
      [],
      [squiggle('a', 100, 300), squiggle('b', 100 + PLACEHOLDER_LEFT_TOL_PX + 1, 350)],
    )
    expect(regions.map((region) => region.kind)).toEqual(['textPlaceholder', 'textPlaceholder'])
  })

  it('does NOT stack squiggles a paragraph apart', () => {
    const regions = inkRegions([], [squiggle('a', 100, 300), squiggle('b', 100, 480)])
    expect(regions).toHaveLength(2)
  })

  it('holds at three limits at once: aspect 5, height 40, and a heavy bow', () => {
    const bowed = wavePoints({ x: 0, y: 300, width: 200, amplitude: 40, cycles: 0.5 })
    expect(200 / 40).toBe(PLACEHOLDER_ASPECT_MIN)
    expect(40).toBe(PLACEHOLDER_MAX_H_PX)
    expect(only([penStroke('s', bowed)]).kind).toBe('textPlaceholder')
  })

  /**
   * The bow ceiling only ever binds on a stroke that DOUBLES BACK: with an aspect floor
   * of 5 a one-way bow can never deviate by more than a fifth of its own chord. This one
   * runs out 200px and returns to 60, so its chord is 60 and its bow is half of it.
   */
  it('refuses a stroke that doubles back — its bow is half its chord', () => {
    const doubled = [
      { x: 0, y: 300 },
      { x: 200, y: 330 },
      { x: 60, y: 300 },
    ]
    expect(only([penStroke('s', doubled)]).kind).not.toBe('textPlaceholder')
    expect(PLACEHOLDER_CHORD_DEV_MAX).toBeLessThan(0.5)
  })
})

describe('writing — two evidence routes, because print and cursive look nothing alike', () => {
  it('reads print handwriting off its many small glyphs', () => {
    const word = printWordStrokes({
      idPrefix: 'w',
      x: 100,
      y: 300,
      glyphHeight: 30,
      glyphWidth: 14,
      pitch: 22,
      count: 6,
    })
    const region = only(word)
    expect(region.kind).toBe('writing')
    expect(region.glyphHeight).toBe(30)
    expect(region.words).toBe(1)
  })

  it('reads a SINGLE-STROKE cursive wordmark, which print evidence would lose', () => {
    const region = only([
      penStroke('w', cursivePoints({ x: 100, y: 300, w: 260, h: 56, loops: 4 })),
    ])
    expect(region.kind).toBe('writing')
    expect(region.strokeIds).toEqual(['w'])
  })

  it('does NOT read a lazily-looped mark as cursive below the turning floor', () => {
    const region = only([
      penStroke('w', cursivePoints({ x: 100, y: 300, w: 260, h: 56, loops: 1 })),
    ])
    expect(region.kind).not.toBe('writing')
  })

  it('splits words at a gap of 1.2 glyph heights', () => {
    const glyphHeight = 24
    const first = printWordStrokes({
      idPrefix: 'a',
      x: 100,
      y: 300,
      glyphHeight,
      glyphWidth: 14,
      pitch: 20,
      count: 4,
    })
    const second = printWordStrokes({
      idPrefix: 'b',
      x: 100 + 3 * 20 + 14 + 34,
      y: 300,
      glyphHeight,
      glyphWidth: 14,
      pitch: 20,
      count: 4,
    })
    expect(only([...first, ...second]).words).toBe(2)
  })

  it('calls the tallest writing on the page `display` and the rest `body`', () => {
    const big = printWordStrokes({
      idPrefix: 'big',
      x: 100,
      y: 100,
      glyphHeight: 56,
      glyphWidth: 26,
      pitch: 40,
      count: 5,
    })
    const small = printWordStrokes({
      idPrefix: 'small',
      x: 100,
      y: 500,
      glyphHeight: 24,
      glyphWidth: 12,
      pitch: 20,
      count: 5,
    })
    const regions = inkRegions([], [...big, ...small])
    expect(regions.map((region) => region.variant)).toEqual(['display', 'body'])
  })
})

describe('the block-overlap veto reaches zero-area strokes end-to-end (Fix B)', () => {
  const button = inkBlock('blk', 'block', 100, 400, 200, 56)

  it('builds NO region from a dead-flat stroke drawn across a block', () => {
    expect(inkRegions([button], [penStroke('across', linePoints(80, 428, 240, 0))])).toEqual([])
    expect(inkRegions([button], [penStroke('down', linePoints(200, 380, 0, 100))])).toEqual([])
  })

  it('still builds a divider from a full-width rule clear of every block', () => {
    const regions = inkRegions([button], [penStroke('rule', linePoints(100, 900, 800, 0))])
    expect(regions.map((region) => `${region.kind}/${String(region.variant)}`)).toEqual([
      'rule/divider',
    ])
  })
})

describe('a flat dashed divider is never the page’s heading or <h1> (Fix C)', () => {
  /**
   * Five dead-flat dashes on one baseline — a hand-drawn dashed divider. Each is a
   * zero-height horizontal segment; spaced to cluster into one writing run whose
   * median glyph height is EXACTLY 0. Before the fix that 0 satisfied `0 ≥ 1.5·0` and
   * the run was promoted to a heading, then declared the page's lone `<h1>`.
   */
  const dashes = [0, 1, 2, 3, 4].map((index) =>
    penStroke(`dash-${String(index)}`, linePoints(100 + index * 60, 400, 40, 0)),
  )

  it('does not promote a run with no glyph height to heading or display', () => {
    const regions = inkRegions([], dashes)
    expect(regions).toHaveLength(1)
    const region = regions[0]
    expect(region?.kind).toBe('writing')
    expect(region?.glyphHeight).toBe(0)
    expect(region?.variant).not.toBe('heading')
    expect(region?.variant).not.toBe('display')
    expect(region?.variant).toBe('body')
  })

  it('still promotes a genuine large word to display — the page’s real heading', () => {
    const word = printWordStrokes({
      idPrefix: 'big',
      x: 200,
      y: 300,
      glyphHeight: 56,
      glyphWidth: 26,
      pitch: 40,
      count: 7,
      descenders: [4],
    })
    const regions = inkRegions([], word)
    expect(regions).toHaveLength(1)
    expect(regions[0]?.variant).toBe('display')
  })
})

describe('artwork — the residual, but still positively tested', () => {
  it('promotes a cat outline with ears, legs and a curled tail', () => {
    const regions = inkRegions([], catStrokes())
    expect(regions).toHaveLength(1)
    expect(regions[0]?.kind).toBe('artwork')
  })

  it('calls a page-wide wavy line a BAND', () => {
    const wave = penStroke(
      'wave',
      wavePoints({ x: 60, y: 400, width: 1080, amplitude: 45, cycles: 3 }),
      INK_RED,
    )
    expect(shapeOf(only([wave]))).toEqual({ kind: 'artwork', variant: 'band' })
  })

  /**
   * THE NAMED NEGATIVE CASE. A long arrow clears the path-length floor, so the only
   * thing standing between marginalia and "artwork" is the turning floor. Measured:
   * a shaft plus a chevron head accumulates ≈1.9 rad against a floor of 6.0.
   */
  it('never promotes an arrow — the turning floor is the whole defence', () => {
    const arrow = [
      penStroke('shaft', linePoints(100, 300, 560, 0)),
      penStroke('head', [
        { x: 620, y: 270 },
        { x: 660, y: 300 },
        { x: 620, y: 330 },
      ]),
    ]
    const region = only(arrow)
    expect(region.kind).toBe('annotation')
    expect(ARTWORK_MIN_ABS_TURN_RAD).toBeGreaterThan(2)
  })
})

describe('nothing is ever dropped', () => {
  it('returns unmatched ink as an `annotation` region rather than losing it', () => {
    const region = only([penStroke('blob', squarePoints(100, 100, 20, 20))])
    expect(region.kind).toBe('annotation')
    expect(region.variant).toBeNull()
    expect(region.confidence).toBe('unsure')
    expect(region.strokeIds).toEqual(['blob'])
  })

  it('accounts for every candidate stroke exactly once, across a mixed page', () => {
    const strokes = [
      penStroke('box', roundedBoxPoints({ x: 100, y: 100, w: 320, h: 260, gap: 20 })),
      ...printWordStrokes({ idPrefix: 'w', x: 130, y: 140, glyphHeight: 30, glyphWidth: 14, pitch: 22, count: 5 }),
      penStroke('squiggle', wavePoints({ x: 130, y: 260, width: 200, amplitude: 14, cycles: 1 })),
      penStroke('blob', squarePoints(700, 700, 20, 20)),
      penStroke('rule', linePoints(100, 900, 800, 0)),
      ...catStrokes().map((stroke) => penStroke(`c-${stroke.id}`, stroke.points, INK_RED)),
    ]
    const placed = inkRegions([], strokes).flatMap((region) => region.strokeIds)
    expect([...placed].sort()).toEqual(strokes.map((stroke) => stroke.id).sort())
    expect(new Set(placed).size).toBe(placed.length)
  })
})

describe('confidence has exactly two levels', () => {
  it('is `unsure` for artwork of fewer than three strokes, however strong', () => {
    const wave = penStroke('wave', wavePoints({ x: 60, y: 400, width: 1080, amplitude: 45, cycles: 3 }))
    expect(only([wave]).confidence).toBe('unsure')
  })

  it('is `clear` for a comfortably drawn card', () => {
    const box = penStroke('box', roundedBoxPoints({ x: 100, y: 100, w: 320, h: 260, gap: 20 }))
    expect(only([box]).confidence).toBe('clear')
  })

  it('is `unsure` for a card that only just closed', () => {
    const box = penStroke('box', roundedBoxPoints({ x: 100, y: 100, w: 320, h: 260, gap: 20 }))
    const barely = penStroke('box', [
      ...box.points,
      { x: 100 + 24 - 118, y: 100 },
    ])
    expect(only([barely]).confidence).toBe('unsure')
  })
})

describe('ids and ordering', () => {
  it('numbers regions as ordinals in emission order', () => {
    const regions = inkRegions(
      [],
      [
        penStroke('a', linePoints(100, 800, 800, 0)),
        penStroke('b', linePoints(100, 200, 800, 0)),
      ],
    )
    expect(regions.map((region) => region.id)).toEqual(['reg_0001', 'reg_0002'])
    expect(regions.map((region) => region.strokeIds[0])).toEqual(['b', 'a'])
  })

  it('continues a site-wide numbering when the caller seeds it', () => {
    const regions = inkRegions([], [penStroke('a', linePoints(100, 200, 800, 0))], {
      firstRegionOrdinal: 7,
    })
    expect(regions[0]?.id).toBe('reg_0007')
  })

  it('emits a panel immediately before the children it contains', () => {
    const strokes = [
      penStroke('squiggle', wavePoints({ x: 130, y: 260, width: 200, amplitude: 14, cycles: 1 })),
      penStroke('box', roundedBoxPoints({ x: 100, y: 100, w: 320, h: 260, gap: 20 }), INK_BLUE),
    ]
    const regions = inkRegions([], strokes)
    expect(regions.map((region) => region.kind)).toEqual(['panel', 'textPlaceholder'])
    expect(regions[1]?.parentId).toBe(regions[0]?.id)
  })
})
