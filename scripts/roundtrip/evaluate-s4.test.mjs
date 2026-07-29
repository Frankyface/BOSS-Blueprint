// @vitest-environment node
/**
 * S4 · vertical placement — thirds with a ±1 tolerance (Option C, docs/decisions.md 2026-07-29).
 *
 * Two bugs were found here by real runs, in this order:
 *
 *   1. The denominator was the bottom edge of the LOWEST IMAGE, not the page. With one image
 *      per page that made the top third unreachable: third = 0 needs
 *      (y + h/2)/(y + h) < 1/3  <=>  2y < -0.5h, impossible for y, h >= 0.
 *   2. Fixing the denominator was not enough. `page.height` is a FIXED 1200x1600 sketch canvas
 *      that a sparse scenario leaves mostly empty, while the built page is content-sized and
 *      carries a nav/footer the brief explicitly permits. Exact-third equality therefore still
 *      failed images that were placed correctly (measured: options A and B both failed them).
 *
 * So the comparison is like-for-like — a centre over the height of the surface it sits on —
 * bucketed into thirds, matching within one third. Two thirds away still fails.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  checkCopyLength,
  estimateFrameChars,
  frameMetricsFor,
  renderedSurfaceHeight,
  scoreImagePlacement,
  verticalThird,
} from './evaluate.mjs'
import { S4_FLOOR, S4_THIRD_TOLERANCE } from './thresholds.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/** The committed capture from the c8c1540 measurement run — the ruling's fixture. */
const FIXTURE = path.join(
  HERE,
  '..',
  '..',
  'staging',
  'stage-4-roundtrip-launch',
  'evidence',
  '2026-07-29-S4-normalization-measurement',
)
const readFixture = (name) => JSON.parse(readFileSync(path.join(FIXTURE, name), 'utf8'))

/** One imageSlot block on a 1600-tall sketch canvas, plus a page digest to match it against. */
const sketch = ({ y, h = 200, x = 624, w = 496, assetId = 'img_001', height = 1600 }) => ({
  pages: [
    {
      slug: 'home',
      height,
      blocks: [{ id: 'blk_1', type: 'imageSlot', assetId, frame: { x, y, w, h } }],
    },
  ],
})
const digestOf = ({ y, h = 200, x = 630, w = 490, documentHeight, alt = 'alt text' }) =>
  new Map([
    [
      'home',
      {
        documentHeight,
        images: [{ src: 'a.jpg', alt, box: { x, y, w, h } }],
        nodes: [{ tag: 'img', box: { x, y, w, h } }],
      },
    ],
  ])

describe('verticalThird — the shared normalisation', () => {
  it('buckets a centre into thirds of its own surface', () => {
    expect(verticalThird(100, 600)).toBe(0)
    expect(verticalThird(300, 600)).toBe(1)
    expect(verticalThird(500, 600)).toBe(2)
  })

  it('clamps to [0,2] and survives a degenerate surface height', () => {
    expect(verticalThird(900, 600)).toBe(2)
    expect(verticalThird(-10, 600)).toBe(0)
    expect(verticalThird(50, 0)).toBe(2) // guarded: never divides by zero
  })

  it('THE OLD IMPOSSIBILITY IS GONE: a top-placed image now reads as the top third', () => {
    // y=0, h=200 in a 600-tall document. Under the old max-of-image-bottoms denominator the
    // surface would have been 200 and the centre 100 -> third 1. Against the real document
    // it is centre 100 / 600 -> third 0.
    expect(verticalThird(0 + 200 / 2, 600)).toBe(0)
  })
})

describe('renderedSurfaceHeight', () => {
  it('uses the recorded documentHeight when present', () => {
    expect(renderedSurfaceHeight({ documentHeight: 990, nodes: [{ box: { y: 0, h: 10 } }] })).toBe(990)
  })

  it('falls back to the tallest element for digests captured before the field existed', () => {
    expect(renderedSurfaceHeight({ nodes: [{ box: { y: 100, h: 200 } }, { box: { y: 0, h: 50 } }] })).toBe(300)
  })

  it('never returns 0 — a zero denominator would make every ratio infinite', () => {
    expect(renderedSurfaceHeight({})).toBe(1)
    expect(renderedSurfaceHeight(null)).toBe(1)
  })
})

describe('S4 placement — thirds within ±1', () => {
  const only = (result) => result.items[0]

  it('an EXACT third match still matches', () => {
    // sketch centre 900/1600 = 0.56 -> third 1 ; render centre 500/990 = 0.51 -> third 1
    const r = scoreImagePlacement(sketch({ y: 800 }), digestOf({ y: 400, documentHeight: 990 }))
    expect(only(r).thirdDelta).toBe(0)
    expect(only(r).ok).toBe(true)
  })

  it('ONE third away matches — the surfaces differ structurally', () => {
    // sketch centre 288/1600 = 0.18 -> third 0 ; render centre 365/990 = 0.37 -> third 1
    const r = scoreImagePlacement(sketch({ y: 128, h: 320 }), digestOf({ y: 200, h: 331, documentHeight: 990 }))
    expect(only(r).wantThird).toBe(0)
    expect(only(r).thirdDelta).toBe(1)
    expect(only(r).ok).toBe(true)
  })

  it('TWO thirds away still FAILS — a top-sketched image built at the bottom', () => {
    // sketch centre 228/1600 -> third 0 ; render centre 890/990 = 0.90 -> third 2
    const r = scoreImagePlacement(sketch({ y: 128, h: 200 }), digestOf({ y: 790, h: 200, documentHeight: 990 }))
    expect(only(r).wantThird).toBe(0)
    expect(only(r).thirdDelta).toBe(2)
    expect(only(r).ok).toBe(false)
    expect(r.floorMet).toBe(false)
  })

  it('a hairline across the 0.333 boundary does NOT flip the verdict', () => {
    // Two renders either side of exactly one third of a 900-tall document (centre 300).
    const justUnder = scoreImagePlacement(sketch({ y: 400, h: 200 }), digestOf({ y: 199, h: 200, documentHeight: 900 }))
    const justOver = scoreImagePlacement(sketch({ y: 400, h: 200 }), digestOf({ y: 201, h: 200, documentHeight: 900 }))
    expect(verticalThird(299, 900)).toBe(0)
    expect(verticalThird(301, 900)).toBe(1)
    // Different buckets, same verdict — that is the point of the tolerance.
    expect(only(justUnder).ok).toBe(true)
    expect(only(justOver).ok).toBe(true)
  })

  it('the WRONG HALF still fails however close the third is — horizontal stays exact', () => {
    const r = scoreImagePlacement(
      sketch({ y: 800, x: 624, w: 496 }), // sketch centre x = 872 -> right half
      digestOf({ y: 400, x: 40, w: 400, documentHeight: 990 }), // render centre x = 240 -> left half
    )
    expect(only(r).wantHalf).toBe(1)
    expect(only(r).ok).toBe(false)
  })

  it('an empty SOURCE-AN-IMAGE slot needs a placeholder carrying alt text', () => {
    const withAlt = scoreImagePlacement(
      sketch({ y: 800, assetId: null }),
      digestOf({ y: 400, documentHeight: 990, alt: 'a shopfront' }),
    )
    expect(only(withAlt).ok).toBe(true)

    const withoutAlt = scoreImagePlacement(
      sketch({ y: 800, assetId: null }),
      digestOf({ y: 400, documentHeight: 990, alt: '' }),
    )
    expect(only(withoutAlt).ok).toBe(false)
  })

  it('a page with NO image at all fails, rather than passing vacuously', () => {
    const digests = new Map([['home', { documentHeight: 990, images: [], nodes: [] }]])
    const r = scoreImagePlacement(sketch({ y: 800 }), digests)
    expect(only(r).ok).toBe(false)
    expect(r.fraction).toBe(0)
  })

  it('a multi-image page matches on ANY image in the right place', () => {
    const digests = new Map([
      [
        'home',
        {
          documentHeight: 990,
          images: [
            { src: 'wrong.jpg', alt: 'x', box: { x: 40, y: 20, w: 300, h: 100 } }, // left half
            { src: 'right.jpg', alt: 'y', box: { x: 630, y: 400, w: 490, h: 200 } }, // right half, third 1
          ],
          nodes: [],
        },
      ],
    ])
    expect(only(scoreImagePlacement(sketch({ y: 800 }), digests)).ok).toBe(true)
  })

  it('respects the tolerance CONSTANT rather than a hard-coded 1', () => {
    expect(S4_THIRD_TOLERANCE).toBe(1)
  })
})

/**
 * The regression the ruling asked for: the real capture that failed, replayed through the
 * fixed scorer. This is the recorded evidence from the c8c1540 run, committed as a fixture —
 * if S4 ever regresses to a denominator or an equality that fails a correct build, this test
 * is what catches it.
 */
describe('REGRESSION REPLAY — the c8c1540 capture that scored S4 = 0', () => {
  const site = readFixture('site.json')
  const digests = new Map(
    ['home', 'pricing', 'contact'].map((slug) => [slug, readFixture(`${slug}.dom.json`)]),
  )

  it('the fixture is the real thing: recorded documentHeight, two imageSlot blocks', () => {
    expect(digests.get('home').documentHeight).toBe(990)
    expect(digests.get('contact').documentHeight).toBe(948)
    const slots = site.pages.flatMap((p) => (p.blocks ?? []).filter((b) => b.type === 'imageSlot'))
    expect(slots).toHaveLength(2)
  })

  it('BOTH images now score as placed, and the S4 floor is met', () => {
    const result = scoreImagePlacement(site, digests)
    expect(result.items).toHaveLength(2)
    for (const item of result.items) {
      expect(item.ok).toBe(true)
      // Each is exactly one third out — the case exact equality wrongly rejected.
      expect(item.thirdDelta).toBe(1)
    }
    expect(result.fraction).toBe(1)
    expect(result.floorMet).toBe(true)
    expect(result.fraction).toBeGreaterThanOrEqual(S4_FLOOR)
  })

  it('and it would STILL fail if the same images were built at the bottom of the page', () => {
    // Same fixture, images pushed to the foot of the document: the signal survives.
    const sunk = new Map(
      [...digests.entries()].map(([slug, d]) => [
        slug,
        { ...d, images: (d.images ?? []).map((i) => ({ ...i, box: { ...i.box, y: d.documentHeight - i.box.h } })) },
      ]),
    )
    const result = scoreImagePlacement(site, sunk)
    expect(result.items.every((i) => i.ok)).toBe(false)
    expect(result.floorMet).toBe(false)
  })
})

/**
 * S3 · the frame estimate is BLOCK-TYPE-AWARE (docs/decisions.md 2026-07-29).
 *
 * The 96.93 near miss failed on `blk_0026`: a HEADING whose brief said "a one-line
 * invitation", built as 41 characters, judged against a band derived from BODY-TEXT metrics
 * (640×72 -> ~240 chars, band 72-720). The builder was penalised for obeying its instruction.
 * These pin the real geometry from src/components/BlockView.css.
 */
describe('S3 frame estimate — per block type', () => {
  const HEADING_FRAME = { x: 80, y: 640, w: 640, h: 72 } // blk_0026, verbatim

  it('a heading frame estimates roughly ONE heading line, not a paragraph', () => {
    // 640/18 = 35 chars per line; 72/46 = 1 line.
    expect(estimateFrameChars(HEADING_FRAME, 'heading')).toBe(35)
    // The same rectangle costed as body copy is 4.6x bigger — the wrong answer, and the
    // shape of the bug. (The run that actually failed used a flat 24px line height and got
    // 240; the historical numbers are in docs/decisions.md, the live behaviour is here.)
    expect(estimateFrameChars(HEADING_FRAME, 'text')).toBe(160)
  })

  it('THE REGRESSION: blk_0026 — a 41-char one-line heading now PASSES', () => {
    const result = checkCopyLength({
      written: "Have a look around the yards we've built.", // 41 chars, the real copy
      lengthHint: null,
      frame: HEADING_FRAME,
      blockType: 'heading',
    })
    expect(result.rule).toBe('frame estimate')
    expect(result.measured).toBe(41)
    expect(result.ok).toBe(true)
    expect(result.min).toBeLessThanOrEqual(41)
  })

  it('and it would have FAILED under the old body-text metrics — the bug, pinned', () => {
    const asText = checkCopyLength({
      written: "Have a look around the yards we've built.",
      lengthHint: null,
      frame: HEADING_FRAME,
      blockType: 'text',
    })
    expect(asText.ok).toBe(false)
    // 41 characters sits below the body-text floor for this rectangle — which is precisely
    // why a correct one-line heading was scored unsane.
    expect(asText.min).toBe(48)
    expect(asText.measured).toBeLessThan(asText.min)
  })

  it('a 500-character heading in the same frame still FAILS', () => {
    const result = checkCopyLength({
      written: 'x'.repeat(500),
      lengthHint: null,
      frame: HEADING_FRAME,
      blockType: 'heading',
    })
    expect(result.ok).toBe(false)
    expect(result.max).toBeLessThan(500)
  })

  it('replays BOTH attempt-7 text blocks unchanged — they still pass', () => {
    // blk_0021: no hint, 297 chars in a 496x128 text frame.
    const blk0021 = checkCopyLength({
      written: 'x'.repeat(297),
      lengthHint: null,
      frame: { x: 624, y: 128, w: 496, h: 128 },
      blockType: 'text',
    })
    expect(blk0021.rule).toBe('frame estimate')
    expect(blk0021.ok).toBe(true)

    // blk_0006: carries "~2 sentences", so the sentence rule applies and type is irrelevant.
    const blk0006 = checkCopyLength({
      written:
        "We're a two-crew landscaping company in Guelph, designing and building patios, walkways and full backyards since 2016. Tell us how you want to use your yard and we'll draw up the plan, price it, and build it properly.",
      lengthHint: '~2 sentences',
      frame: { x: 80, y: 264, w: 560, h: 72 },
      blockType: 'text',
    })
    expect(blk0006.rule).toBe('lengthHint')
    expect(blk0006.ok).toBe(true)
  })

  it('an unknown block type falls back to body text rather than throwing', () => {
    expect(frameMetricsFor('button')).toEqual(frameMetricsFor('text'))
    expect(frameMetricsFor(undefined)).toEqual(frameMetricsFor('text'))
    // Buttons and nav bars cannot actually reach this path — the export contract gives
    // copyMode only to heading and text — but the fallback keeps it total.
    expect(estimateFrameChars({ w: 264, h: 56 }, 'button')).toBe(estimateFrameChars({ w: 264, h: 56 }, 'text'))
  })

  it('the 0.3–3x band multipliers are untouched', () => {
    const r = checkCopyLength({ written: 'x'.repeat(35), lengthHint: null, frame: HEADING_FRAME, blockType: 'heading' })
    expect(r.estimate).toBe(35)
    expect(r.min).toBe(Math.max(1, Math.round(35 * 0.3)))
    expect(r.max).toBe(Math.round(35 * 3))
  })
})
