// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { deriveCanonicalOrder, checkKeyOrder } from './lib/key-order.mjs'
import {
  v28PenRegions,
  v29InkTooSmallToRead,
  v30BuildFromInkMarkers,
  v31TruncatedPageSpace,
} from './lib/rules/ink.mjs'
import { v22Legibility } from './lib/rules/links-frames.mjs'

/**
 * THE HARNESS TWINS OF §5 V28-V31 AND THE v2.5 KEY-ORDER CANON.
 *
 * The gate is a separate program with its own lockfile that imports no app code,
 * so every rule exists twice on purpose. These cases are the same cases
 * `src/export/validate/rules/inkRules.test.ts` asserts on the TypeScript side; a
 * rule that has drifted between the two shows up as a green `npm test` followed by
 * a red `roundtrip:smoke` twelve minutes later, which is exactly the failure this
 * file exists to make impossible.
 */

const CTX = {}

const stroke = (id, x, y) => ({
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
})

const region = (id, strokeIds, extra = {}) => ({
  id,
  kind: 'panel',
  confidence: 'clear',
  bbox: { x: 0, y: 0, w: 200, h: 200 },
  strokeIds,
  parentRegionId: null,
  setId: null,
  setIndex: null,
  text: null,
  ...extra,
})

const BUTTON = {
  id: 'blk_0001',
  type: 'button',
  z: 0,
  frame: { x: 80, y: 80, w: 200, h: 80 },
  label: 'Order',
  link: { kind: 'none' },
}

function siteOf(page = {}) {
  return {
    pages: [
      {
        id: 'pg_0001',
        name: 'Home',
        slug: 'home',
        height: 1600,
        screenshot: 'pages/01-home.png',
        blocks: [],
        penStrokes: [stroke('stk_0001', 100, 100), stroke('stk_0002', 100, 600)],
        ...page,
      },
    ],
    assets: [],
  }
}

describe('V28 twin — penRegions integrity', () => {
  it('PASSes a page with no regions at all', () => {
    expect(v28PenRegions(siteOf(), CTX).status).toBe('PASS')
  })

  it('PASSes a well-formed drawn page', () => {
    const site = siteOf({
      penRegions: [
        region('reg_0001', ['stk_0001']),
        region('reg_0002', ['stk_0002'], { kind: 'writing', parentRegionId: 'reg_0001' }),
      ],
    })
    expect(v28PenRegions(site, CTX).problems).toEqual([])
  })

  it('FAILs a dangling strokeId', () => {
    const result = v28PenRegions(siteOf({ penRegions: [region('reg_0001', ['stk_9999'])] }), CTX)
    expect(result.status).toBe('FAIL')
    expect(result.problems[0]).toContain('stk_9999')
  })

  it('FAILs a stroke claimed twice', () => {
    const site = siteOf({
      penRegions: [region('reg_0001', ['stk_0001']), region('reg_0002', ['stk_0001'])],
    })
    expect(v28PenRegions(site, CTX).problems[0]).toContain('claimed by both')
  })

  it('FAILs a region built from an imageSketch stroke', () => {
    const sketch = { ...stroke('stk_0001', 100, 100), role: 'imageSketch', targetBlockId: 'blk_0002' }
    const site = siteOf({ penStrokes: [sketch], penRegions: [region('reg_0001', ['stk_0001'])] })
    expect(v28PenRegions(site, CTX).problems[0]).toContain('imageSketch')
  })

  it('FAILs ink that overlaps a real block, and exempts a section', () => {
    const overlapping = siteOf({ blocks: [BUTTON], penRegions: [region('reg_0001', ['stk_0001'])] })
    expect(v28PenRegions(overlapping, CTX).problems[0]).toContain('blk_0001')

    const band = { id: 'blk_0001', type: 'section', z: 0, frame: { x: 0, y: 0, w: 1200, h: 600 } }
    const banded = siteOf({ blocks: [band], penRegions: [region('reg_0001', ['stk_0001'])] })
    expect(v28PenRegions(banded, CTX).problems).toEqual([])
  })

  it('reads a dead-straight stroke crossing a block as an overlap — the veto is zero-extent-robust', () => {
    // bbox height is exactly 0, so an area-only re-proof would miss it; the predicate now
    // reads the overlap per axis inclusively when the box is degenerate.
    const flat = { ...stroke('stk_0001', 80, 120), points: [[80, 120], [280, 120]] }
    const site = siteOf({ blocks: [BUTTON], penStrokes: [flat], penRegions: [region('reg_0001', ['stk_0001'])] })
    const result = v28PenRegions(site, CTX)
    expect(result.status).toBe('FAIL')
    expect(result.problems[0]).toContain('blk_0001')
  })

  it('FAILs a self-parent, an off-page parent and a cycle', () => {
    const self = siteOf({ penRegions: [region('reg_0001', [], { parentRegionId: 'reg_0001' })] })
    expect(v28PenRegions(self, CTX).problems[0]).toContain('own parent')

    const stranger = siteOf({ penRegions: [region('reg_0001', [], { parentRegionId: 'reg_0500' })] })
    expect(v28PenRegions(stranger, CTX).problems[0]).toContain('reg_0500')

    const cycle = siteOf({
      penRegions: [
        region('reg_0001', [], { parentRegionId: 'reg_0002' }),
        region('reg_0002', [], { parentRegionId: 'reg_0001' }),
      ],
    })
    expect(v28PenRegions(cycle, CTX).problems.some((p) => p.includes('cycle'))).toBe(true)
  })

  it('FAILs nesting past the containment cap', () => {
    const chain = Array.from({ length: 5 }, (_, i) =>
      region(`reg_000${i + 1}`, [], { parentRegionId: i === 0 ? null : `reg_000${i}` }),
    )
    expect(v28PenRegions(siteOf({ penRegions: chain }), CTX).problems.some((p) => p.includes('nests'))).toBe(true)
  })

  it('FAILs a one-member set and a gapped set', () => {
    const lone = siteOf({ penRegions: [region('reg_0001', [], { setId: 'set_0001', setIndex: 0 })] })
    expect(v28PenRegions(lone, CTX).problems[0]).toContain('set_0001')

    const gapped = siteOf({
      penRegions: [
        region('reg_0001', [], { setId: 'set_0001', setIndex: 0 }),
        region('reg_0002', [], { setId: 'set_0001', setIndex: 2 }),
      ],
    })
    expect(v28PenRegions(gapped, CTX).problems[0]).toContain('0, 2')
  })

  it('FAILs regions emitted out of depth-first order', () => {
    const site = siteOf({
      penRegions: [
        region('reg_0002', [], { parentRegionId: 'reg_0001' }),
        region('reg_0001', []),
      ],
    })
    expect(v28PenRegions(site, CTX).problems[0]).toContain('depth-first')
  })
})

/**
 * The twin of the variant half (§4.9.10). `card` and `mediaBox` are the same kind
 * and the same shape — what separates a drawn pricing card from an empty drawn box
 * is whether anything is drawn inside it, and the brief builds the two as different
 * elements on the strength of that one word.
 */
describe('V28 twin — a panel’s variant against what is drawn inside it', () => {
  it('PASSes a card with contents and a media box without', () => {
    const card = siteOf({
      penRegions: [
        region('reg_0001', ['stk_0001'], { variant: 'card' }),
        region('reg_0002', ['stk_0002'], { kind: 'writing', parentRegionId: 'reg_0001' }),
      ],
    });
    const media = siteOf({ penRegions: [region('reg_0001', ['stk_0001'], { variant: 'mediaBox' })] });
    expect(v28PenRegions(card, CTX).problems).toEqual([]);
    expect(v28PenRegions(media, CTX).problems).toEqual([]);
  });

  it('FAILs a card with nothing inside it', () => {
    const site = siteOf({ penRegions: [region('reg_0001', ['stk_0001'], { variant: 'card' })] });
    const result = v28PenRegions(site, CTX);
    expect(result.status).toBe('FAIL');
    expect(result.problems[0]).toContain('mediaBox');
  });

  it('FAILs a media box that has contents', () => {
    const site = siteOf({
      penRegions: [
        region('reg_0001', ['stk_0001'], { variant: 'mediaBox' }),
        region('reg_0002', ['stk_0002'], { kind: 'writing', parentRegionId: 'reg_0001' }),
      ],
    });
    expect(v28PenRegions(site, CTX).problems[0]).toContain('card');
  });

  it('PASSes a variant it does not know, a panel with none, and a non-panel — §6.2', () => {
    const unknown = siteOf({ penRegions: [region('reg_0001', ['stk_0001'], { variant: 'ticketStub' })] });
    const none = siteOf({ penRegions: [region('reg_0001', ['stk_0001'])] });
    const artwork = siteOf({
      penRegions: [region('reg_0001', ['stk_0001'], { kind: 'artwork', variant: 'card' })],
    });
    expect(v28PenRegions(unknown, CTX).problems).toEqual([]);
    expect(v28PenRegions(none, CTX).problems).toEqual([]);
    expect(v28PenRegions(artwork, CTX).problems).toEqual([]);
  });
});

describe('V29 twin — drawn writing downscaled below legibility', () => {
  const writing = (glyphHeight) =>
    region('reg_0001', ['stk_0001'], {
      kind: 'writing',
      text: { lines: 1, words: 2, glyphHeight, align: 'left', emphasis: 'display' },
    })

  it('WARNs on a maximum-height page whose 40px letters land at 12.9px', () => {
    const result = v29InkTooSmallToRead(siteOf({ height: 8000, penRegions: [writing(40)] }), CTX)
    expect(result.status).toBe('WARN')
    expect(result.problems[0]).toContain('12.9px')
  })

  it('PASSes the same handwriting on a 1600px page', () => {
    expect(v29InkTooSmallToRead(siteOf({ height: 1600, penRegions: [writing(40)] }), CTX).problems).toEqual([])
  })

  it('PASSes a panel, which carries no words to read', () => {
    const site = siteOf({ height: 8000, penRegions: [region('reg_0001', ['stk_0001'])] })
    expect(v29InkTooSmallToRead(site, CTX).problems).toEqual([])
  })
})

describe('V31 twin — page space the height cap swallowed', () => {
  it('WARNs when the added space is truncated — content already fills the page to the cap', () => {
    // A stroke reaching y≈7840 pins the content-only height at 8000; a 400px request lands 0.
    const site = siteOf({ height: 8000, extraBottomPx: 400, penStrokes: [stroke('stk_0001', 100, 7820)] })
    expect(v31TruncatedPageSpace(site, CTX).status).toBe('WARN')
  })

  it('PASSes at the cap with no space, at the all-applied boundary, and below the cap', () => {
    // nothing asked for → nothing truncated
    expect(v31TruncatedPageSpace(siteOf({ height: 8000 }), CTX).problems).toEqual([])
    // content 7600 + extra 400 = 8000: lands on the cap but every pixel applied — the
    // false positive the old rule emitted
    expect(
      v31TruncatedPageSpace(
        siteOf({ height: 8000, extraBottomPx: 400, penStrokes: [stroke('stk_0001', 100, 7420)] }),
        CTX,
      ).problems,
    ).toEqual([])
    // plenty of room below the cap
    expect(v31TruncatedPageSpace(siteOf({ height: 2400, extraBottomPx: 400 }), CTX).problems).toEqual([])
  })
})

describe('V30 twin — one BUILD THIS FROM INK marker per top-level region', () => {
  const marked = (count) =>
    Array.from(
      { length: count },
      (_, i) => `- **Drawn card** — a box at (0, 0, 1, 1). **BUILD THIS FROM INK**: build ${i}.`,
    ).join('\n')

  const pkgOf = (site, brief) => ({ site, briefText: brief === null ? null : { text: brief } })

  it('PASSes when the counts agree, counting only top-level regions', () => {
    const site = siteOf({
      penRegions: [
        region('reg_0001', ['stk_0001']),
        region('reg_0002', ['stk_0002'], { kind: 'writing', parentRegionId: 'reg_0001' }),
      ],
    })
    expect(v30BuildFromInkMarkers(pkgOf(site, marked(1)), CTX).problems).toEqual([])
  })

  it('FAILs a brief that skipped a region', () => {
    const site = siteOf({
      penRegions: [region('reg_0001', ['stk_0001']), region('reg_0002', ['stk_0002'])],
    })
    const result = v30BuildFromInkMarkers(pkgOf(site, marked(1)), CTX)
    expect(result.status).toBe('FAIL')
    expect(result.problems[0]).toContain('brief has 1')
  })

  it('SKIPs rather than failing a region-free package with no brief', () => {
    expect(v30BuildFromInkMarkers(pkgOf(siteOf(), null), CTX).status).toBe('SKIP')
  })
})

describe('the key-order canon covers penRegions', () => {
  // A §7.1-shaped example: enough to DERIVE the page order the way the gate does,
  // and — like §7.1 itself — carrying no regions, which is the whole point. The
  // canon for the v2.5 shapes must come from the static table, because without it
  // `nodeKind` returns null and the gate skips the entire new structure silently.
  const { table } = deriveCanonicalOrder({
    pages: [
      {
        id: 'pg_0001',
        name: 'Home',
        slug: 'home',
        height: 1600,
        screenshot: 'pages/01-home.png',
        blocks: [],
        penStrokes: [],
      },
    ],
    assets: [],
  })

  it('knows the penRegion, bbox and regionText orders', () => {
    expect(table.get('penRegion')?.[0]).toBe('id')
    expect(table.get('penRegion')?.at(-1)).toBe('text')
    expect(table.get('bbox')).toEqual(['x', 'y', 'w', 'h'])
    expect(table.get('regionText')).toEqual(['lines', 'words', 'glyphHeight', 'align', 'emphasis'])
  })

  it('is silent on a canonically ordered region and its nested shapes', () => {
    const site = {
      pages: [
        {
          id: 'pg_0001',
          name: 'Home',
          slug: 'home',
          height: 1600,
          screenshot: 'pages/01-home.png',
          blocks: [],
          penStrokes: [],
          penRegions: [
            {
              id: 'reg_0001',
              kind: 'writing',
              confidence: 'clear',
              bbox: { x: 1, y: 2, w: 3, h: 4 },
              strokeIds: ['stk_0001'],
              parentRegionId: null,
              setId: null,
              setIndex: null,
              text: { lines: 1, words: 2, glyphHeight: 40, align: 'left', emphasis: 'display' },
            },
          ],
        },
      ],
      assets: [],
    }
    expect(checkKeyOrder(site, table)).toEqual([])
  })

  it('catches a shuffled region, bbox and text — the whole structure is covered', () => {
    const region1 = {
      kind: 'writing',
      id: 'reg_0001',
      confidence: 'clear',
      bbox: { y: 2, x: 1, w: 3, h: 4 },
      strokeIds: ['stk_0001'],
      parentRegionId: null,
      setId: null,
      setIndex: null,
      text: { words: 2, lines: 1, glyphHeight: 40, align: 'left', emphasis: 'display' },
    }
    const site = {
      pages: [
        {
          id: 'pg_0001',
          name: 'Home',
          slug: 'home',
          height: 1600,
          screenshot: 'pages/01-home.png',
          blocks: [],
          penStrokes: [],
          penRegions: [region1],
        },
      ],
      assets: [],
    }
    const problems = checkKeyOrder(site, table)
    expect(problems).toHaveLength(3)
    expect(problems.join(' ')).toContain('penRegions[0]')
  })
})

describe('V22 twin — clusters form over UNCLAIMED strokes (v2.5)', () => {
  /** Too small and too sparse to read: the exact shape V22 exists to catch. */
  const tiny = (id) => ({
    id,
    points: [
      [10, 10],
      [20, 14],
    ],
    color: '#2B6CB0',
    width: 4,
    role: 'annotation',
    targetBlockId: null,
  })

  it('still WARNs on an unclaimed illegible mark', () => {
    expect(v22Legibility(siteOf({ penStrokes: [tiny('stk_0001')] }), CTX).status).toBe('WARN')
  })

  it('stops WARNing once that ink is published as a region to BUILD', () => {
    const site = siteOf({
      penStrokes: [tiny('stk_0001')],
      penRegions: [region('reg_0001', ['stk_0001'])],
    })
    expect(v22Legibility(site, CTX).problems).toEqual([])
  })
})
