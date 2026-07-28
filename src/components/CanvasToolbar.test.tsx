import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { App } from '../App.tsx'
import { resetBlockIdSequence } from '../canvas/blockFactory.ts'
import { startCanvasSession, stopCanvasSession } from '../store/canvasSession.ts'
import { useCanvasStore } from '../store/canvasStore.ts'
import { STORAGE_KEY } from '../store/canvasStorage.ts'
import { useEditorStore } from '../store/editorStore.ts'
import { createFakeStorage } from '../test/fakeStorage.ts'
import type { FakeStorage } from '../test/fakeStorage.ts'

const canvas = () => useCanvasStore.getState()
const undoButton = () => screen.getByTestId('toolbar-undo')
const redoButton = () => screen.getByTestId('toolbar-redo')
const placedBlocks = () => screen.queryAllByTestId('canvas-block')

let storage: FakeStorage

beforeEach(() => {
  stopCanvasSession()
  canvas().resetCanvas()
  resetBlockIdSequence()
  storage = createFakeStorage()
  startCanvasSession({ storage })
})

afterEach(() => {
  stopCanvasSession()
})

describe('the undo/redo buttons', () => {
  it('are both disabled on a fresh canvas', () => {
    render(<App />)

    expect(undoButton()).toBeDisabled()
    expect(redoButton()).toBeDisabled()
  })

  it('enable and disable in step with their stacks', () => {
    render(<App />)

    fireEvent.click(screen.getByTestId('palette-heading'))
    expect(undoButton()).toBeEnabled()
    expect(redoButton()).toBeDisabled()

    fireEvent.click(undoButton())
    expect(undoButton()).toBeDisabled()
    expect(redoButton()).toBeEnabled()
  })

  it('take a block off the page and put it back', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('palette-heading'))
    expect(placedBlocks()).toHaveLength(1)

    fireEvent.click(undoButton())
    expect(placedBlocks()).toHaveLength(0)

    fireEvent.click(redoButton())
    expect(placedBlocks()).toHaveLength(1)
    expect(placedBlocks()[0]).toHaveAttribute('data-block-type', 'heading')
  })

  it('lose the redo once a new block is added after undoing', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('palette-heading'))
    fireEvent.click(undoButton())

    fireEvent.click(screen.getByTestId('palette-button'))

    expect(redoButton()).toBeDisabled()
  })
})

describe('the keyboard shortcuts', () => {
  it('undoes on Ctrl+Z and redoes on Ctrl+Y', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('palette-heading'))

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
    expect(placedBlocks()).toHaveLength(0)

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true })
    expect(placedBlocks()).toHaveLength(1)
  })

  it('also redoes on Ctrl+Shift+Z', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('palette-heading'))
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true })

    fireEvent.keyDown(window, { key: 'Z', ctrlKey: true, shiftKey: true })

    expect(placedBlocks()).toHaveLength(1)
  })

  it('accepts the Mac Cmd key too', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('palette-heading'))

    fireEvent.keyDown(window, { key: 'z', metaKey: true })

    expect(placedBlocks()).toHaveLength(0)
  })

  it('stands down while an inline editor has focus, so typing keeps its own undo', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('palette-heading'))
    fireEvent.doubleClick(screen.getByTestId('canvas-block'))

    const editor = screen.getByTestId('block-text-editor')
    fireEvent.keyDown(editor, { key: 'z', ctrlKey: true })

    // The block is still there: the shortcut was left to the text field.
    expect(placedBlocks()).toHaveLength(1)
    expect(useEditorStore.getState().history.past).toHaveLength(1)
  })

  it('leaves other Ctrl combinations alone', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('palette-heading'))

    fireEvent.keyDown(window, { key: 'a', ctrlKey: true })
    fireEvent.keyDown(window, { key: 'Delete', ctrlKey: true })

    expect(placedBlocks()).toHaveLength(1)
  })
})

describe('start over', () => {
  it('is disabled while there is nothing to clear', () => {
    render(<App />)

    expect(screen.getByTestId('toolbar-start-over')).toBeDisabled()
  })

  it('asks for confirmation before clearing anything', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('palette-heading'))

    fireEvent.click(screen.getByTestId('toolbar-start-over'))

    expect(screen.getByTestId('start-over-confirm')).toBeInTheDocument()
    expect(placedBlocks()).toHaveLength(1)
  })

  it('backs out cleanly when the client changes their mind', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('palette-heading'))
    fireEvent.click(screen.getByTestId('toolbar-start-over'))

    fireEvent.click(screen.getByTestId('start-over-cancel'))

    expect(screen.queryByTestId('start-over-confirm')).not.toBeInTheDocument()
    expect(placedBlocks()).toHaveLength(1)
  })

  it('clears the page, the history and the stored design once confirmed', () => {
    render(<App />)
    fireEvent.click(screen.getByTestId('palette-heading'))
    storage.entries.set(STORAGE_KEY, 'anything at all')

    fireEvent.click(screen.getByTestId('toolbar-start-over'))
    fireEvent.click(screen.getByTestId('start-over-confirmed'))

    expect(placedBlocks()).toHaveLength(0)
    expect(undoButton()).toBeDisabled()
    expect(redoButton()).toBeDisabled()
    expect(storage.entries.has(STORAGE_KEY)).toBe(false)
    expect(screen.getByTestId('toolbar-start-over')).toBeDisabled()
  })
})
