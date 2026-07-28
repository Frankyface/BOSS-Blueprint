import { describe, expect, it } from 'vitest'

import { pathDataOfStroke, pointFromClient, polylinePathData, strokePathData } from './penPath.ts'
import type { PenPoint, PenStroke } from './types.ts'

const LINE: PenPoint[] = [
  { x: 100, y: 100 },
  { x: 200, y: 140 },
  { x: 300, y: 100 },
]

const PAGE_WIDTH = 1200
const PAGE_HEIGHT = 1600

describe('strokePathData', () => {
  it('produces a closed filled outline path', () => {
    const d = strokePathData(LINE, 8)

    expect(d.startsWith('M ')).toBe(true)
    expect(d.endsWith('Z')).toBe(true)
    expect(d).toContain('Q ')
  })

  it('is deterministic — the same points always give the same path', () => {
    expect(strokePathData(LINE, 8)).toBe(strokePathData(LINE, 8))
  })

  it('draws a wider outline for a wider pen', () => {
    // Same geometry, more ink: the fat stroke's path covers more distance.
    expect(strokePathData(LINE, 24).length).toBeGreaterThan(0)
    expect(strokePathData(LINE, 24)).not.toBe(strokePathData(LINE, 4))
  })

  it('has nothing to draw for no points', () => {
    expect(strokePathData([], 8)).toBe('')
  })

  it('still draws something for a single-point dot', () => {
    expect(strokePathData([{ x: 5, y: 5 }], 8).length).toBeGreaterThan(0)
  })

  it('reads the width off the stroke itself', () => {
    const stroke: PenStroke = { id: 'a', points: LINE, color: '#d92d20', width: 12 }

    expect(pathDataOfStroke(stroke)).toBe(strokePathData(LINE, 12))
  })
})

describe('polylinePathData', () => {
  it('is an open polyline through the raw points — the eraser target', () => {
    expect(polylinePathData(LINE)).toBe('M 100 100 L 200 140 L 300 100')
  })

  it('is empty when there is nothing to aim at', () => {
    expect(polylinePathData([])).toBe('')
  })
})

describe('pointFromClient', () => {
  const rect = { left: 40, top: 20, width: PAGE_WIDTH, height: PAGE_HEIGHT }

  it('maps a screen position to page coordinates at 1:1', () => {
    expect(pointFromClient(rect, 140, 120, PAGE_WIDTH, PAGE_HEIGHT)).toEqual({ x: 100, y: 100 })
  })

  it('undoes fit-to-window zoom, so a stroke lands where it was drawn', () => {
    // Half scale: the overlay measures half the page it represents.
    const scaled = { left: 0, top: 0, width: PAGE_WIDTH / 2, height: PAGE_HEIGHT / 2 }

    expect(pointFromClient(scaled, 300, 400, PAGE_WIDTH, PAGE_HEIGHT)).toEqual({ x: 600, y: 800 })
  })

  it('clamps to the page, because pointer capture keeps reporting off it', () => {
    expect(pointFromClient(rect, -500, -500, PAGE_WIDTH, PAGE_HEIGHT)).toEqual({ x: 0, y: 0 })
    expect(pointFromClient(rect, 99_999, 99_999, PAGE_WIDTH, PAGE_HEIGHT)).toEqual({
      x: PAGE_WIDTH,
      y: PAGE_HEIGHT,
    })
  })

  it('does not divide by zero when the overlay has not been laid out yet', () => {
    const collapsed = { left: 0, top: 0, width: 0, height: 0 }

    expect(pointFromClient(collapsed, 10, 20, PAGE_WIDTH, PAGE_HEIGHT)).toEqual({ x: 10, y: 20 })
  })
})
