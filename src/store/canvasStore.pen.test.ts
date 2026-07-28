import { beforeEach, describe, expect, it } from 'vitest'

import { resetBlockIdSequence } from '../canvas/blockFactory.ts'
import { createStroke, resetStrokeIdSequence } from '../canvas/penStrokes.ts'
import type { PenStroke } from '../canvas/types.ts'

import { selectCurrentStrokes, useCanvasStore } from './canvasStore.ts'
import { INITIAL_PEN_TOOL, usePenToolStore } from './penTool.ts'

const store = () => useCanvasStore.getState()
const strokes = () => selectCurrentStrokes(store())
const pen = () => usePenToolStore.getState()

function stroke(id: string, x = 100): PenStroke {
  return {
    id,
    points: [
      { x, y: 100 },
      { x: x + 40, y: 160 },
    ],
    color: '#d92d20',
    width: 4,
  }
}

beforeEach(() => {
  store().resetCanvas()
  resetBlockIdSequence()
  resetStrokeIdSequence()
  usePenToolStore.setState(INITIAL_PEN_TOOL)
})

describe('addPenStroke', () => {
  it('puts the stroke on the page the client is looking at', () => {
    store().addPenStroke(stroke('a'))

    expect(strokes().map((entry) => entry.id)).toEqual(['a'])
  })

  it('keeps draw order, which is paint order', () => {
    store().addPenStroke(stroke('a'))
    store().addPenStroke(stroke('b'))

    expect(strokes().map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('replaces the pages array immutably rather than pushing into it', () => {
    const before = store().pages

    store().addPenStroke(stroke('a'))

    expect(store().pages).not.toBe(before)
    expect(before[0]?.penStrokes).toHaveLength(0)
  })

  it('leaves the blocks of the page completely alone', () => {
    store().addBlock('heading')
    const blocksBefore = store().pages[0]?.blocks

    store().addPenStroke(stroke('a'))

    expect(store().pages[0]?.blocks).toBe(blocksBefore)
  })

  it("keeps each page's marks on its own page", () => {
    store().addPenStroke(stroke('home-1'))
    const secondId = store().addPage('Menu')
    store().addPenStroke(stroke('menu-1'))

    expect(strokes().map((entry) => entry.id)).toEqual(['menu-1'])

    store().setCurrentPage(store().pages[0]?.id ?? '')
    expect(strokes().map((entry) => entry.id)).toEqual(['home-1'])
    expect(store().pages.find((page) => page.id === secondId)?.penStrokes).toHaveLength(1)
  })
})

describe('removePenStroke', () => {
  it('rubs out exactly the stroke named', () => {
    store().addPenStroke(stroke('a'))
    store().addPenStroke(stroke('b'))

    store().removePenStroke('a')

    expect(strokes().map((entry) => entry.id)).toEqual(['b'])
  })

  it('is a no-op — same state object — for a stroke that is not there', () => {
    store().addPenStroke(stroke('a'))
    const before = store().pages

    store().removePenStroke('never-drawn')

    expect(store().pages).toBe(before)
  })

  it('cannot reach a stroke on another page', () => {
    store().addPenStroke(stroke('home-1'))
    store().addPage('Menu')

    store().removePenStroke('home-1')

    expect(store().pages[0]?.penStrokes).toHaveLength(1)
  })
})

describe('strokes and the rest of the document', () => {
  it("copies a duplicated page's marks, with fresh ids", () => {
    store().addPenStroke(stroke('a'))
    const copyId = store().duplicatePage(store().pages[0]?.id ?? '')

    const copied = store().pages.find((page) => page.id === copyId)?.penStrokes ?? []

    expect(copied).toHaveLength(1)
    expect(copied[0]?.id).not.toBe('a')
    expect(copied[0]?.points).toEqual(stroke('a').points)
  })

  it('makes "start over" meaningful even when only pen marks exist', () => {
    store().addPenStroke(stroke('a'))

    // selectHasContent is what enables the Start over button.
    expect(store().pages.some((page) => page.penStrokes.length > 0)).toBe(true)

    store().resetCanvas()
    expect(strokes()).toHaveLength(0)
  })

  it('a fresh page starts with no marks at all', () => {
    store().addPage('Menu')

    expect(strokes()).toEqual([])
  })
})

describe('the pen tool itself', () => {
  it('starts put away, with the annotation red in hand', () => {
    expect(pen().mode).toBe('off')
    expect(pen().color).toBe('#d92d20')
  })

  it('is transient UI — the document never sees it', () => {
    const before = store().pages

    pen().setMode('draw')
    pen().setColor('#15803d')
    pen().setWidth(12)

    expect(store().pages).toBe(before)
  })

  it('ignores a set that changes nothing, so nothing re-renders', () => {
    const before = usePenToolStore.getState()

    pen().setMode('off')

    expect(usePenToolStore.getState()).toBe(before)
  })
})

describe('a whole drawn stroke, end to end', () => {
  it('thins the trail once and commits it as one document change', () => {
    const trail = Array.from({ length: 120 }, (_, index) => ({ x: index, y: 0 }))
    const drawn = createStroke(trail, pen().color, pen().width)
    if (!drawn) throw new Error('the probe stroke should not be empty')

    const before = store().pages
    store().addPenStroke(drawn)

    expect(store().pages).not.toBe(before)
    expect(strokes()).toHaveLength(1)
    expect(strokes()[0]?.points).toHaveLength(2)
  })
})
