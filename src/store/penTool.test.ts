import { beforeEach, describe, expect, it } from 'vitest'

import { serialiseDocument } from '../canvas/blueprintFile.ts'
import { DEFAULT_PEN_COLOR } from '../canvas/penStrokes.ts'

import { useCanvasStore } from './canvasStore.ts'
import {
  INITIAL_PEN_TOOL,
  selectIsInkReadingShown,
  selectIsPenActive,
  usePenToolStore,
} from './penTool.ts'

const pen = () => usePenToolStore.getState()

beforeEach(() => {
  useCanvasStore.getState().resetCanvas()
  usePenToolStore.setState(INITIAL_PEN_TOOL)
})

describe('which pen is in the client’s hand', () => {
  it('starts with the pen away, in the palette’s first colour', () => {
    expect(pen().mode).toBe('off')
    expect(pen().color).toBe(DEFAULT_PEN_COLOR)
  })

  it('reports the pen as active only while it is actually out', () => {
    expect(selectIsPenActive(pen())).toBe(false)

    pen().setMode('draw')
    expect(selectIsPenActive(pen())).toBe(true)
  })
})

describe('“show what we read”', () => {
  it('is off until the client asks for it — the sketch is what they came to look at', () => {
    expect(pen().showInkReading).toBe(false)
  })

  it('toggles on and back off again', () => {
    pen().toggleInkReading()
    expect(pen().showInkReading).toBe(true)

    pen().toggleInkReading()
    expect(pen().showInkReading).toBe(false)
  })

  it('shows nothing while the pen is away, however the flag is set', () => {
    pen().toggleInkReading()

    expect(selectIsInkReadingShown(pen())).toBe(false)

    pen().setMode('draw')
    expect(selectIsInkReadingShown(pen())).toBe(true)

    pen().setMode('off')
    expect(selectIsInkReadingShown(pen())).toBe(false)
  })

  it('remembers the client’s answer across picking the pen up again', () => {
    pen().setMode('draw')
    pen().toggleInkReading()
    pen().setMode('off')
    pen().setMode('erase')

    expect(selectIsInkReadingShown(pen())).toBe(true)
  })

  it('is a VIEW, not a document: it never reaches the saved design', () => {
    pen().toggleInkReading()
    useCanvasStore.getState().addBlock('heading')

    const saved = serialiseDocument(useCanvasStore.getState())

    expect(saved).not.toContain('showInkReading')
    expect(saved).not.toContain('inkReading')
  })

  it('leaves the colour and width the client chose completely alone', () => {
    pen().setColor('#15803d')
    pen().setWidth(12)

    pen().toggleInkReading()

    expect(pen().color).toBe('#15803d')
    expect(pen().width).toBe(12)
  })
})
