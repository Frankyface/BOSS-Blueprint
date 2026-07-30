import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { inkRegions } from '../canvas/ink/classify.ts'
import { inkReadingTag } from '../canvas/inkReading.ts'
import { resetStrokeIdSequence } from '../canvas/penStrokes.ts'
import type { Page, PenStroke } from '../canvas/types.ts'
import { PageExportRoot } from '../export/png/exportRoot.tsx'
import { useCanvasStore } from '../store/canvasStore.ts'
import { INITIAL_PEN_TOOL, usePenToolStore } from '../store/penTool.ts'
import { navHeader, pricingCards } from '../test/inkFixtures.ts'

import { PenLayer } from './PenLayer.tsx'

/**
 * WHAT THE CLIENT IS SHOWN OF OUR READING.
 *
 * The overlay is editor chrome that must be invisible three ways: absent until it
 * is asked for, absent whenever the pen is away, and absent from the deliverable.
 */

const PAGE_HEIGHT_PX = 2000

const frames = () => screen.queryAllByTestId('ink-reading-frame')
const tags = () => screen.queryAllByTestId('ink-reading-tag')

function seed(strokes: readonly PenStroke[]): void {
  for (const stroke of strokes) useCanvasStore.getState().addPenStroke(stroke)
}

function showReading(): void {
  usePenToolStore.getState().setMode('draw')
  usePenToolStore.getState().toggleInkReading()
}

beforeEach(() => {
  useCanvasStore.getState().resetCanvas()
  resetStrokeIdSequence()
  usePenToolStore.setState(INITIAL_PEN_TOOL)
})

describe('the pen layer with the reading hidden', () => {
  it('paints the marks and nothing else', () => {
    seed(pricingCards())

    render(<PenLayer pageHeight={PAGE_HEIGHT_PX} />)

    expect(screen.getAllByTestId('pen-stroke').length).toBeGreaterThan(0)
    expect(frames()).toHaveLength(0)
    expect(tags()).toHaveLength(0)
  })

  it('stays hidden while the pen is away, even once it has been asked for', () => {
    seed(pricingCards())
    usePenToolStore.getState().toggleInkReading()

    render(<PenLayer pageHeight={PAGE_HEIGHT_PX} />)

    expect(tags()).toHaveLength(0)
    expect(screen.getByTestId('pen-layer')).toHaveAttribute('data-pen-mode', 'off')
  })
})

describe('the pen layer with the reading shown', () => {
  it('outlines every region it read and names each one', () => {
    seed(pricingCards())
    showReading()

    render(<PenLayer pageHeight={PAGE_HEIGHT_PX} />)

    const expected = inkRegions([], pricingCards())
    expect(frames()).toHaveLength(expected.length)
    expect(tags()).toHaveLength(expected.length)
  })

  it('shows the client the SAME reading the builder is given', () => {
    seed(navHeader())
    showReading()

    render(<PenLayer pageHeight={PAGE_HEIGHT_PX} />)

    expect(tags().map((tag) => tag.textContent)).toEqual(
      inkRegions([], navHeader()).map(inkReadingTag),
    )
  })

  it('puts each outline exactly where the ink is', () => {
    seed(pricingCards())
    showReading()

    render(<PenLayer pageHeight={PAGE_HEIGHT_PX} />)

    const first = inkRegions([], pricingCards())[0]
    expect(first).toBeDefined()
    expect(frames()[0]).toHaveAttribute('x', String(first?.frame.x))
    expect(frames()[0]).toHaveAttribute('y', String(first?.frame.y))
    expect(frames()[0]).toHaveAttribute('width', String(first?.frame.w))
  })

  it('is decoration, not content: hidden from assistive tech and deaf to pointers', () => {
    seed(pricingCards())
    showReading()

    render(<PenLayer pageHeight={PAGE_HEIGHT_PX} />)

    const overlay = screen.getByTestId('ink-reading')
    expect(overlay).toHaveAttribute('aria-hidden', 'true')
    expect(overlay).toHaveClass('ink-reading')
  })

  it('leaves the layer’s own pointer behaviour exactly as it found it', () => {
    seed(pricingCards())
    showReading()

    render(<PenLayer pageHeight={PAGE_HEIGHT_PX} />)

    // `PenLayer.css` keys every pointer rule off this attribute, and "block
    // editing still works when the pen is off" is keyed off that CSS.
    expect(screen.getByTestId('pen-layer')).toHaveAttribute('data-pen-mode', 'draw')
  })

  it('has nothing to show for a page with no marks on it', () => {
    showReading()

    render(<PenLayer pageHeight={PAGE_HEIGHT_PX} />)

    expect(frames()).toHaveLength(0)
  })
})

describe('the deliverable', () => {
  /**
   * The PNG is captured off `mountExportRoot`'s own root, which renders
   * `page.penStrokes` itself and never mounts `PenLayer` — the same reason
   * `canvas-area__more` lives outside `.canvas-page`. This is that promise, tested.
   */
  it('carries the client’s ink and none of our reading of it', () => {
    const page: Page = { id: 'page-home', name: 'Home', blocks: [], penStrokes: pricingCards() }
    usePenToolStore.setState({ ...INITIAL_PEN_TOOL, mode: 'draw', showInkReading: true })

    render(<PageExportRoot page={page} height={PAGE_HEIGHT_PX} />)

    expect(screen.queryByTestId('ink-reading')).toBeNull()
    expect(tags()).toHaveLength(0)
    expect(frames()).toHaveLength(0)
  })
})
