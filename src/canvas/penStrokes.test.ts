import { beforeEach, describe, expect, it } from 'vitest'

import {
  createStroke,
  createStrokeId,
  duplicateStrokes,
  MAX_PEN_WIDTH_PX,
  PEN_COLORS,
  PEN_WIDTHS,
  parsePenStroke,
  parsePenStrokes,
  resetStrokeIdSequence,
  withStrokeAdded,
  withStrokeRemoved,
} from './penStrokes.ts'
import type { PenStroke } from './types.ts'

const RED = '#d92d20'

function stroke(overrides: Partial<PenStroke> = {}): PenStroke {
  return {
    id: 'stroke-a',
    points: [
      { x: 10, y: 10 },
      { x: 40, y: 60 },
    ],
    color: RED,
    width: 4,
    ...overrides,
  }
}

beforeEach(() => {
  resetStrokeIdSequence()
})

describe('the palette', () => {
  it('offers a red that reads as an annotation, and offers it first', () => {
    expect(PEN_COLORS[0]?.hex).toBe(RED)
    expect(PEN_COLORS.length).toBeGreaterThanOrEqual(3)
  })

  it('gives every colour a six-digit hex the export schema accepts', () => {
    for (const option of PEN_COLORS) {
      expect(option.hex).toMatch(/^#[0-9a-f]{6}$/)
    }
  })

  it('offers exactly two widths, both positive and clearly different', () => {
    expect(PEN_WIDTHS).toHaveLength(2)
    const [fine, bold] = PEN_WIDTHS
    expect(fine?.px).toBeGreaterThan(0)
    expect(bold?.px).toBeGreaterThan((fine?.px ?? 0) * 2)
  })
})

describe('createStroke', () => {
  it('thins the raw trail before it ever reaches the document', () => {
    const trail = Array.from({ length: 60 }, (_, index) => ({ x: index, y: 0 }))

    const created = createStroke(trail, RED, 4)

    expect(created?.points).toEqual([
      { x: 0, y: 0 },
      { x: 59, y: 0 },
    ])
  })

  it('keeps the colour and width the client had in hand', () => {
    const created = createStroke(
      [
        { x: 0, y: 0 },
        { x: 5, y: 5 },
      ],
      '#15803d',
      12,
    )

    expect(created).toMatchObject({ color: '#15803d', width: 12 })
  })

  it('mints a unique id per stroke', () => {
    const first = createStrokeId()
    const second = createStrokeId()

    expect(first).not.toBe(second)
  })

  it('records a tap as a dot rather than throwing it away', () => {
    expect(createStroke([{ x: 3, y: 4 }], RED, 4)?.points).toHaveLength(2)
  })

  it('records nothing at all when there were no samples', () => {
    expect(createStroke([], RED, 4)).toBeNull()
  })
})

describe('parsePenStroke', () => {
  it('round-trips a stroke through JSON unchanged', () => {
    const original = stroke()

    expect(parsePenStroke(JSON.parse(JSON.stringify(original)))).toEqual(original)
  })

  it.each([
    ['not an object', 42],
    ['no id', { ...stroke(), id: undefined }],
    ['an empty id', { ...stroke(), id: '' }],
    ['fewer than two points', { ...stroke(), points: [{ x: 1, y: 2 }] }],
    ['points that are not points', { ...stroke(), points: [{ x: 1 }, { x: 2, y: 3 }] }],
    ['a non-finite coordinate', { ...stroke(), points: [{ x: 1, y: 2 }, { x: NaN, y: 3 }] }],
    ['points that are not an array', { ...stroke(), points: 'nope' }],
    ['a colour that is not hex', { ...stroke(), color: 'red' }],
    ['a three-digit hex colour', { ...stroke(), color: '#f00' }],
    ['a zero width', { ...stroke(), width: 0 }],
    ['a negative width', { ...stroke(), width: -4 }],
    ['an absurd width', { ...stroke(), width: MAX_PEN_WIDTH_PX + 1 }],
    ['a width that is not a number', { ...stroke(), width: '4' }],
  ])('refuses a stroke with %s', (_case, value) => {
    expect(parsePenStroke(value)).toBeNull()
  })

  it('accepts uppercase hex, because a hand-edited file may use it', () => {
    expect(parsePenStroke({ ...stroke(), color: '#AABBCC' })?.color).toBe('#AABBCC')
  })

  it('drops fields it does not know about rather than carrying them into the export', () => {
    const parsed = parsePenStroke({ ...stroke(), role: 'annotation', targetBlockId: 'blk_1' })

    expect(parsed).toEqual(stroke())
    expect(parsed && 'role' in parsed).toBe(false)
  })
})

describe('parsePenStrokes', () => {
  it('reads a page saved BEFORE the pen layer existed as having no marks', () => {
    expect(parsePenStrokes(undefined)).toEqual([])
    expect(parsePenStrokes(null)).toEqual([])
  })

  it('accepts an empty list', () => {
    expect(parsePenStrokes([])).toEqual([])
  })

  it('refuses the whole list when one stroke in it is broken', () => {
    expect(parsePenStrokes([stroke(), { ...stroke({ id: 'b' }), color: 'blue' }])).toBeNull()
  })

  it('refuses a list that is not a list', () => {
    expect(parsePenStrokes({ 0: stroke() })).toBeNull()
  })
})

describe('adding and removing', () => {
  it('appends in draw order, which is also paint order', () => {
    const first = stroke({ id: 'a' })
    const second = stroke({ id: 'b' })

    expect(withStrokeAdded([first], second).map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('never mutates the list it was given', () => {
    const strokes = [stroke({ id: 'a' })]

    withStrokeAdded(strokes, stroke({ id: 'b' }))

    expect(strokes).toHaveLength(1)
  })

  it('removes exactly the stroke named', () => {
    const strokes = [stroke({ id: 'a' }), stroke({ id: 'b' })]

    expect(withStrokeRemoved(strokes, 'a').map((entry) => entry.id)).toEqual(['b'])
  })

  it('returns the SAME list when there is nothing to remove (no undo step)', () => {
    const strokes = [stroke({ id: 'a' })]

    expect(withStrokeRemoved(strokes, 'missing')).toBe(strokes)
  })
})

describe('duplicateStrokes', () => {
  it('copies the geometry but mints fresh ids, which are unique site-wide', () => {
    const strokes = [stroke({ id: 'a' }), stroke({ id: 'b' })]

    const copies = duplicateStrokes(strokes)

    expect(copies.map((entry) => entry.points)).toEqual(strokes.map((entry) => entry.points))
    expect(copies.map((entry) => entry.id)).not.toEqual(['a', 'b'])
    expect(new Set(copies.map((entry) => entry.id)).size).toBe(2)
  })
})
