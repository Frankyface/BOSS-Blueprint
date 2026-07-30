import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import { INK_READING_NOTHING_YET, inkReadingRegions, inkReadingSummary } from '../canvas/inkReading.ts'
import { PEN_COLORS } from '../canvas/penStrokes.ts'
import { resetStrokeIdSequence } from '../canvas/penStrokes.ts'
import type { PenStroke } from '../canvas/types.ts'
import { useCanvasStore } from '../store/canvasStore.ts'
import { INITIAL_PEN_TOOL, usePenToolStore } from '../store/penTool.ts'
import { pricingCards } from '../test/inkFixtures.ts'

import { PenControls } from './PenControls.tsx'
import { PenSettings } from './PenSettings.tsx'

const readingToggle = () => screen.queryByTestId('pen-reading-toggle')
const summary = () => screen.queryByTestId('pen-reading-summary')
const hint = () => screen.getByTestId('pen-hint')

/**
 * The pen is two components because it sits on two toolbar lines — the toggles on
 * the wrapping control line, everything you can SET on the fixed line below it
 * (`CanvasToolbar.css` says why). They are one thing to the client, so they are
 * rendered and driven together here.
 */
function renderPenToolbar(): void {
  render(
    <>
      <PenControls />
      <PenSettings />
    </>,
  )
}

function seed(strokes: readonly PenStroke[]): void {
  for (const stroke of strokes) useCanvasStore.getState().addPenStroke(stroke)
}

beforeEach(() => {
  useCanvasStore.getState().resetCanvas()
  resetStrokeIdSequence()
  usePenToolStore.setState(INITIAL_PEN_TOOL)
})

describe('the pen’s own framing', () => {
  it('offers the colours by name, with none of them marked as second-class', () => {
    renderPenToolbar()
    fireEvent.click(screen.getByTestId('pen-toggle'))

    for (const option of PEN_COLORS) {
      expect(screen.getByTestId(`pen-color-${option.id}`)).toHaveAccessibleName(option.label)
      expect(option.label).not.toMatch(/note/i)
    }
  })

  it('tells the client the pen draws the page, not just notes about it', () => {
    renderPenToolbar()
    fireEvent.click(screen.getByTestId('pen-toggle'))

    expect(hint().textContent).toMatch(/box/i)
    expect(hint().textContent).toMatch(/heading/i)
    expect(hint().textContent).toMatch(/picture/i)
  })
})

describe('the “show what we read” control', () => {
  it('is not on screen while the pen is away', () => {
    renderPenToolbar()

    expect(readingToggle()).toBeNull()
    expect(summary()).toBeNull()
  })

  it('is a keyboard-reachable checkbox once the pen is out, off to start with', () => {
    renderPenToolbar()
    fireEvent.click(screen.getByTestId('pen-toggle'))

    const toggle = readingToggle()
    expect(toggle).toBeInstanceOf(HTMLInputElement)
    expect(toggle).toHaveAttribute('type', 'checkbox')
    expect(toggle).not.toBeChecked()
    expect(screen.getByLabelText(/show what we read/i)).toBe(toggle)
  })

  it('reads the page back in plain English the moment it is ticked', () => {
    seed(pricingCards())
    renderPenToolbar()
    fireEvent.click(screen.getByTestId('pen-toggle'))

    expect(summary()).toBeNull()

    fireEvent.click(screen.getByTestId('pen-reading-toggle'))

    expect(usePenToolStore.getState().showInkReading).toBe(true)
    expect(summary()).toHaveTextContent(
      inkReadingSummary(inkReadingRegions([], pricingCards())),
    )
  })

  it('replaces the hint instead of adding a line — one piece of guidance at a time', () => {
    seed(pricingCards())
    renderPenToolbar()
    fireEvent.click(screen.getByTestId('pen-toggle'))
    expect(screen.getByTestId('pen-hint')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('pen-reading-toggle'))

    expect(screen.queryByTestId('pen-hint')).toBeNull()
  })

  it('says how to correct a misreading, but only once there is one to correct', () => {
    renderPenToolbar()
    fireEvent.click(screen.getByTestId('pen-toggle'))
    fireEvent.click(screen.getByTestId('pen-reading-toggle'))
    expect(summary()?.textContent).not.toMatch(/rub it out/i)

    seed(pricingCards())
    fireEvent.click(screen.getByTestId('pen-eraser'))

    expect(summary()?.textContent).toMatch(/rub it out and draw it again/i)
  })

  it('announces itself rather than changing silently under a screen reader', () => {
    seed(pricingCards())
    renderPenToolbar()
    fireEvent.click(screen.getByTestId('pen-toggle'))
    fireEvent.click(screen.getByTestId('pen-reading-toggle'))

    expect(summary()).toHaveAttribute('role', 'status')
  })

  it('says what to draw when the page has no ink it can build from', () => {
    renderPenToolbar()
    fireEvent.click(screen.getByTestId('pen-toggle'))
    fireEvent.click(screen.getByTestId('pen-reading-toggle'))

    expect(summary()).toHaveTextContent(INK_READING_NOTHING_YET)
  })

  it('goes away with the pen, taking the reading with it', () => {
    seed(pricingCards())
    renderPenToolbar()
    fireEvent.click(screen.getByTestId('pen-toggle'))
    fireEvent.click(screen.getByTestId('pen-reading-toggle'))
    expect(summary()).not.toBeNull()

    fireEvent.click(screen.getByTestId('pen-toggle'))

    expect(readingToggle()).toBeNull()
    expect(summary()).toBeNull()
  })
})
