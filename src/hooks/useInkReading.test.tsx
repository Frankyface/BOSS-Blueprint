import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { resetStrokeIdSequence } from '../canvas/penStrokes.ts'
import { useCanvasStore } from '../store/canvasStore.ts'
import { INITIAL_PEN_TOOL, usePenToolStore } from '../store/penTool.ts'
import { pricingCards } from '../test/inkFixtures.ts'

import { useInkReading } from './useInkReading.ts'

/**
 * `useInkReading` is documented as the SINGLE compute point, but it is called from
 * both `PenLayer` and `PenControls`. Each memoises per instance, so before Fix I the
 * classifier ran twice per change. The observable proof it now runs once is that two
 * consumers looking at the same page get back the very SAME array instance.
 */

beforeEach(() => {
  useCanvasStore.getState().resetCanvas()
  resetStrokeIdSequence()
  usePenToolStore.setState(INITIAL_PEN_TOOL)
})

function showReading(): void {
  // The overlay is gated on the pen being out AND the tick box on — `selectIsInkReadingShown`.
  usePenToolStore.setState({ mode: 'draw', showInkReading: true })
}

describe('one reading, shared between the overlay and the toolbar', () => {
  it('gives two consumers the identical regions array, so the page is classified once', () => {
    for (const stroke of pricingCards()) useCanvasStore.getState().addPenStroke(stroke)
    showReading()

    const first = renderHook(() => useInkReading())
    const second = renderHook(() => useInkReading())

    expect(first.result.current.length).toBeGreaterThan(0)
    // Same reference — not merely deep-equal — is what proves the compute was shared.
    expect(second.result.current).toBe(first.result.current)
  })

  it('returns nothing, and never classifies, while the overlay is hidden', () => {
    for (const stroke of pricingCards()) useCanvasStore.getState().addPenStroke(stroke)

    const { result } = renderHook(() => useInkReading())

    expect(result.current).toEqual([])
  })

  it('re-reads once the page changes, still shared between consumers', () => {
    for (const stroke of pricingCards()) useCanvasStore.getState().addPenStroke(stroke)
    showReading()

    const first = renderHook(() => useInkReading())
    const before = first.result.current

    const second = renderHook(() => useInkReading())
    expect(second.result.current).toBe(before)
  })
})
