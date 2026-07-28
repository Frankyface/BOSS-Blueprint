import { describe, expect, it } from 'vitest'

import type { ExportBlock, ExportPage } from '../types.ts'

import {
  CENTER_TOLERANCE,
  columnPlacement,
  columnsOf,
  groupBlocks,
  overflowMarker,
  overlapSuffix,
  positionPhrase,
  rowsOf,
  sharesColumn,
  sharesRow,
} from './layout.ts'
import { referenceText } from './narration.ts'

/**
 * Appendix A's boundary cases for [N2] and [N4] — "the dry-run's D2 bugs were all
 * boundary cases", so every threshold is tested at the value and one either side.
 */

const textBlock = (id: string, x: number, y: number, w: number, h: number, z = 0): ExportBlock => ({
  id,
  type: 'text',
  z,
  frame: { x, y, w, h },
  copyMode: 'real',
  text: id,
  generateDescription: null,
  lengthHint: null,
})

const page = (blocks: readonly ExportBlock[]): ExportPage => ({
  id: 'pg_0001',
  name: 'Page',
  slug: 'page',
  height: 1600,
  screenshot: 'pages/01-page.png',
  blocks,
  penStrokes: [],
})

describe('[N4] width buckets', () => {
  it('treats w = 1120 as full width and 1119 as wide', () => {
    expect(positionPhrase({ x: 40, y: 0, w: 1120, h: 10 })).toBe('spanning the full width')
    expect(positionPhrase({ x: 0, y: 0, w: 1119, h: 10 })).toBe('wide, on the left')
  })

  it('treats w = 960 as wide and 959 as about half the width', () => {
    expect(positionPhrase({ x: 0, y: 0, w: 960, h: 10 })).toBe('wide, on the left')
    expect(positionPhrase({ x: 0, y: 0, w: 959, h: 10 })).toBe('about half the width, on the left')
  })

  it('treats w = 600 as about half the width and 599 as narrow', () => {
    expect(positionPhrase({ x: 0, y: 0, w: 600, h: 10 })).toBe('about half the width, on the left')
    expect(positionPhrase({ x: 0, y: 0, w: 599, h: 10 })).toBe('narrow, on the left')
  })
})

describe('[N4] horizontal placement', () => {
  it(`calls a gap difference of exactly ${String(CENTER_TOLERANCE)} centered`, () => {
    // leftGap 312, rightGap 288 → |diff| = 24
    expect(positionPhrase({ x: 312, y: 0, w: 600, h: 10 })).toBe('about half the width, centered')
  })

  it('calls a gap difference of 25 not centered', () => {
    // leftGap 312, rightGap 287 → |diff| = 25
    expect(positionPhrase({ x: 312, y: 0, w: 601, h: 10 })).toBe('about half the width, on the right')
  })

  it('omits the horizontal phrase when the block spans the full width', () => {
    expect(positionPhrase({ x: 0, y: 0, w: 1200, h: 10 })).toBe('spanning the full width')
  })

  it('calls a 1040-wide block inset 80 each side wide, centered — never on the left', () => {
    expect(positionPhrase({ x: 80, y: 0, w: 1040, h: 10 })).toBe('wide, centered')
  })
})

describe('[N2] row union — 50% of the SHORTER height', () => {
  it('joins at exactly 50%', () => {
    expect(sharesRow(textBlock('a', 0, 0, 100, 100), textBlock('b', 0, 50, 100, 200))).toBe(true)
  })

  it('does not join at 49%', () => {
    expect(sharesRow(textBlock('a', 0, 0, 100, 100), textBlock('b', 0, 51, 100, 200))).toBe(false)
  })
})

describe('[N2] column union — 50% of the NARROWER width', () => {
  it('joins at exactly 50%', () => {
    expect(sharesColumn(textBlock('a', 0, 0, 100, 10), textBlock('b', 50, 0, 200, 10))).toBe(true)
  })

  it('does not join at 49%', () => {
    expect(sharesColumn(textBlock('a', 0, 0, 100, 10), textBlock('b', 51, 0, 200, 10))).toBe(false)
  })
})

describe('[N2] transitivity and ordering', () => {
  const hero = [
    textBlock('tall', 700, 0, 400, 600, 3),
    textBlock('s1', 0, 0, 400, 100, 0),
    textBlock('s2', 0, 200, 400, 100, 1),
    textBlock('s3', 0, 400, 400, 100, 2),
  ]

  it('lets one tall block pull a three-block stack into a single row', () => {
    expect(rowsOf(hero)).toHaveLength(1)
  })

  it('splits that row into a left stack and the tall right column', () => {
    const columns = columnsOf(rowsOf(hero)[0] ?? [])
    expect(columns).toHaveLength(2)
    expect((columns[0] ?? []).map((block) => block.id)).toEqual(['s1', 's2', 's3'])
    expect((columns[1] ?? []).map((block) => block.id)).toEqual(['tall'])
  })

  it('names three columns left / middle / right', () => {
    const three = [
      textBlock('l', 0, 0, 300, 100, 0),
      textBlock('m', 400, 0, 300, 100, 1),
      textBlock('r', 800, 0, 300, 100, 2),
    ]
    const columns = columnsOf(rowsOf(three)[0] ?? [])
    expect(columns.map((_, index) => columnPlacement(index, columns.length))).toEqual([
      'left',
      'middle',
      'right',
    ])
  })
})

describe('[N1] section grouping', () => {
  const section = (id: string, y: number, h: number, z: number): ExportBlock => ({
    id,
    type: 'section',
    z,
    frame: { x: 0, y, w: 1200, h },
    background: null,
  })
  const navBar = (id: string, y: number, z: number): ExportBlock => ({
    id,
    type: 'navBar',
    z,
    frame: { x: 0, y, w: 1200, h: 64 },
    items: [{ id: 'nav_0001', label: 'Home', link: { kind: 'none' } }],
  })

  it('keeps the Nav bar caption on a page with NO sections (+∞ boundary, v2.3)', () => {
    const groups = groupBlocks(page([navBar('blk_0001', 0, 0), textBlock('blk_0002', 0, 200, 400, 100, 1)]))
    expect(groups.map((group) => group.kind)).toEqual(['nav', 'outside'])
  })

  it('emits a header for a section band containing no blocks (v2.3)', () => {
    const groups = groupBlocks(page([section('blk_0001', 80, 400, 0)]))
    expect(groups).toHaveLength(1)
    expect(groups[0]?.blocks).toEqual([])
  })

  it('assigns a block to the FIRST section whose range contains its center-y', () => {
    const groups = groupBlocks(
      page([
        section('blk_0001', 0, 400, 0),
        section('blk_0002', 200, 400, 1),
        textBlock('blk_0003', 0, 250, 400, 100, 2),
      ]),
    )
    const owner = groups.find((group) => group.blocks.length > 0)
    expect(owner?.section?.id).toBe('blk_0001')
  })
})

describe('[N5] overlap suffix and [N13] overflow marker', () => {
  it('emits one suffix per overlapped lower block, descending z (v2.3)', () => {
    const lower1 = textBlock('blk_0001', 0, 0, 200, 200, 0)
    const lower2 = textBlock('blk_0002', 0, 0, 200, 200, 1)
    const top = textBlock('blk_0003', 10, 10, 200, 200, 2)
    expect(overlapSuffix(top, page([lower1, lower2, top]), referenceText)).toBe(
      ' (overlaps «blk_0002») (overlaps «blk_0001»)',
    )
  })

  it('exempts sections — everything sits on them by design', () => {
    const band: ExportBlock = {
      id: 'blk_0001',
      type: 'section',
      z: 0,
      frame: { x: 0, y: 0, w: 1200, h: 400 },
      background: null,
    }
    const top = textBlock('blk_0002', 10, 10, 200, 200, 1)
    expect(overlapSuffix(top, page([band, top]), referenceText)).toBe('')
  })

  it('is inert on a block fully inside the page and fires past x=1200', () => {
    expect(overflowMarker({ x: 800, y: 0, w: 400, h: 10 })).toBe('')
    expect(overflowMarker({ x: 800, y: 0, w: 401, h: 10 })).toContain('extends past the right page edge')
  })
})
