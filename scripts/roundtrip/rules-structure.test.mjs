// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { v9NearEmpty, v9Population } from './lib/rules/structure.mjs'

/**
 * THE HARNESS TWIN OF §5 V9 — `scripts/roundtrip/lib/rules/structure.mjs`.
 *
 * The gate and `src/export/validate/rules/` are two implementations of one spec,
 * and V9 is the pair most worth pinning: the app decides whether a client may
 * submit, the gate decides whether the shipped zip is buildable, and a rule that
 * has drifted between them shows up as a green unit suite followed by a red gate
 * twelve minutes later. These cases are the same cases `rules.test.ts` asserts on
 * the TypeScript side — ink is content, and a page drawn entirely with the pen is
 * a finished page.
 */

const CTX = {}

/** One legible annotation stroke, in the §2.9 export shape. */
const INK = {
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

const HEADING = { id: 'blk_0001', type: 'heading', text: 'Bread worth crossing town for' }
const BAND = { id: 'blk_0002', type: 'section' }

/** A site of one home page carrying exactly what it is handed. */
function siteOf({ blocks = [], penStrokes = [], extraPages = [] } = {}) {
  return { pages: [{ id: 'pg_0001', name: 'Home', blocks, penStrokes }, ...extraPages] }
}

describe('V9 BLOCK half — the homepage has content on it', () => {
  it('fails a site with zero pages', () => {
    const result = v9Population({ pages: [] }, CTX)

    expect(result.status).toBe('FAIL')
    expect(result.problems).toContain('site has zero pages')
  })

  it('passes an ordinary homepage', () => {
    expect(v9Population(siteOf({ blocks: [HEADING] }), CTX).status).toBe('PASS')
  })

  it('passes a homepage whose only content is pen ink', () => {
    expect(v9Population(siteOf({ penStrokes: [INK] }), CTX).status).toBe('PASS')
  })

  it('passes a homepage of sections plus ink — the sections are still scenery', () => {
    expect(v9Population(siteOf({ blocks: [BAND], penStrokes: [INK] }), CTX).status).toBe('PASS')
  })

  it('fails a homepage with neither a real block nor ink', () => {
    const result = v9Population(siteOf({ blocks: [BAND] }), CTX)

    expect(result.status).toBe('FAIL')
    expect(result.problems.join(' ')).toMatch(/pg_0001/)
  })
})

describe('V9 WARN half — an individual empty page', () => {
  const emptyPage = { id: 'pg_0002', name: 'Contact', blocks: [], penStrokes: [] }
  const drawnPage = { id: 'pg_0002', name: 'Contact', blocks: [], penStrokes: [INK] }

  it('warns about a page with neither blocks nor ink', () => {
    const result = v9NearEmpty(siteOf({ blocks: [HEADING], extraPages: [emptyPage] }), CTX)

    expect(result.status).toBe('WARN')
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0]).toMatch(/pg_0002/)
  })

  it('says nothing about a page drawn entirely with the pen', () => {
    const result = v9NearEmpty(siteOf({ blocks: [HEADING], extraPages: [drawnPage] }), CTX)

    expect(result.status).toBe('PASS')
    expect(result.problems).toEqual([])
  })
})
