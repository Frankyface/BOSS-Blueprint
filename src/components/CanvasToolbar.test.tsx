import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { App } from '../App.tsx'
import { resetBlockIdSequence } from '../canvas/blockFactory.ts'
import {
  MAX_PAGE_HEIGHT_PX,
  MIN_PAGE_HEIGHT_PX,
  PAGE_EXTRA_SPACE_MAX_PX,
  PAGE_EXTRA_SPACE_STEP_PX,
} from '../canvas/constants.ts'
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

/**
 * PAGE LENGTH — "you cannot add empty space to the bottom of a page and then crop
 * it back" (F2). The assertions read the PAGE's own height attribute rather than the
 * store, because the thing the client is asking for is a taller sheet to draw on.
 */
describe('the page length controls', () => {
  const pageHeight = () => Number(screen.getByTestId('canvas-page').getAttribute('data-page-height'))
  const addSpace = () => screen.getByTestId('page-space-add')
  const trim = () => screen.getByTestId('page-space-trim')

  it('says why Trim is greyed out while there is nothing to give back', () => {
    render(<App />)

    expect(trim()).toBeDisabled()
    expect(screen.getByTestId('page-space-hint')).toHaveTextContent(/nothing to trim/i)
    expect(trim().getAttribute('title')).toMatch(/nothing to trim/i)
  })

  it('adds a band of empty page below the content, one click at a time', () => {
    render(<App />)
    const before = pageHeight()

    fireEvent.click(addSpace())
    expect(pageHeight()).toBe(before + PAGE_EXTRA_SPACE_STEP_PX)

    fireEvent.click(addSpace())
    expect(pageHeight()).toBe(before + PAGE_EXTRA_SPACE_STEP_PX * 2)
    expect(trim()).toBeEnabled()
    expect(screen.getByTestId('page-space-hint')).toHaveTextContent('800')
  })

  it('stops at the cap, and says why rather than going quiet', () => {
    render(<App />)

    // More clicks than the cap allows; the button greys out partway through and the
    // rest land on a disabled control, which is the behaviour under test.
    for (let click = 0; click < 12; click += 1) fireEvent.click(addSpace())

    expect(pageHeight()).toBe(MIN_PAGE_HEIGHT_PX + PAGE_EXTRA_SPACE_MAX_PX)
    expect(addSpace()).toBeDisabled()
    // The disabled reason lives on the button's own title (the N4 precedent, like
    // Trim); the hint reports the space that actually landed.
    expect(addSpace().getAttribute('title')).toMatch(/as much empty space/i)
    expect(screen.getByTestId('page-space-hint')).toHaveTextContent(String(PAGE_EXTRA_SPACE_MAX_PX))
    expect(trim()).toBeEnabled()
  })

  /**
   * D-UI. `pageHeightForContent` clamps to MAX_PAGE_HEIGHT_PX AFTER the request is
   * added, so on a page whose content already fills the sheet only PART of an "Add
   * space" click lands. The button used to stay enabled past that point and the hint
   * used to report the requested pixels the page never actually grew by.
   */
  const seedNearCap = (): void => {
    // A mark near the bottom of the tallest page we allow: content is ~7960px.
    act(() => {
      canvas().addPenStroke({
        id: 'near-cap',
        points: [
          { x: 200, y: 7800 },
          { x: 260, y: 7800 },
        ],
        color: '#0b1220',
        width: 4,
      })
    })
  }

  it('greys Add out at the height cap, not just the request cap, and reports only what landed', () => {
    render(<App />)
    seedNearCap()

    const contentOnly = pageHeight()
    expect(contentOnly).toBe(7960)
    expect(addSpace()).toBeEnabled()

    fireEvent.click(addSpace())

    // Only the ~40px that fit before the 8000px cap was applied — not the 400 asked for.
    const landed = pageHeight() - contentOnly
    expect(pageHeight()).toBe(MAX_PAGE_HEIGHT_PX)
    expect(landed).toBe(40)
    expect(addSpace()).toBeDisabled()
    expect(addSpace().getAttribute('title')).toMatch(/as much empty space/i)

    const theHint = screen.getByTestId('page-space-hint')
    expect(theHint).toHaveTextContent('40')
    // The old bug: the hint claiming the full 400 the page never grew by.
    expect(theHint).not.toHaveTextContent('400')

    // The request itself is still stored; the editor now agrees with the export that
    // only 40 of it became real height.
    const current = canvas().pages.find((entry) => entry.id === canvas().currentPageId)
    expect(current?.extraBottomPx).toBe(PAGE_EXTRA_SPACE_STEP_PX)
  })

  it('reports page length in a status live region, so a change is announced not silent', () => {
    render(<App />)

    expect(screen.getByTestId('page-space-hint')).toHaveAttribute('role', 'status')
  })

  it('keeps keyboard focus in the group when Add space greys itself out', () => {
    render(<App />)
    seedNearCap()
    act(() => {
      addSpace().focus()
    })
    expect(document.activeElement).toBe(addSpace())

    fireEvent.click(addSpace())

    expect(addSpace()).toBeDisabled()
    // Focus did not fall to <body>; it moved to the still-live sibling.
    expect(document.activeElement).toBe(trim())
  })

  it('hands focus to Add space when Trim greys itself out on the click that fires it', () => {
    render(<App />)
    fireEvent.click(addSpace())
    act(() => {
      trim().focus()
    })
    expect(document.activeElement).toBe(trim())

    fireEvent.click(trim())

    expect(trim()).toBeDisabled()
    expect(document.activeElement).toBe(addSpace())
  })

  it('trims back to the exact height the page started at', () => {
    render(<App />)
    const before = pageHeight()

    fireEvent.click(addSpace())
    fireEvent.click(addSpace())
    fireEvent.click(trim())

    expect(pageHeight()).toBe(before)
    expect(trim()).toBeDisabled()
  })

  /**
   * TRIM CAN NEVER CROP THE CLIENT'S WORK. The stored amount is ADDITIVE to the
   * derived content height, so a block placed down in the new room holds the page
   * open on its own and trimming gives back only the slack that is still empty.
   */
  it('cannot pull the page up above a block sitting in the new space', () => {
    render(<App />)
    fireEvent.click(addSpace())
    fireEvent.click(addSpace())

    act(() => {
      const blockId = canvas().addBlock('heading')
      // Park it low down, inside the room that only exists because of "Add space".
      canvas().moveBlockBy(blockId, 0, 2000)
    })
    const withBlockLow = pageHeight()

    fireEvent.click(trim())

    // The block still holds the page open well past its empty minimum…
    expect(pageHeight()).toBeGreaterThan(MIN_PAGE_HEIGHT_PX)
    // …and only the empty slack came back.
    expect(pageHeight()).toBe(withBlockLow - PAGE_EXTRA_SPACE_STEP_PX * 2)
    expect(screen.getAllByTestId('canvas-block')).toHaveLength(1)
  })

  it('is one undo step per click, and undo puts the height back', () => {
    render(<App />)
    const before = pageHeight()

    fireEvent.click(addSpace())
    fireEvent.click(addSpace())
    expect(pageHeight()).toBe(before + PAGE_EXTRA_SPACE_STEP_PX * 2)

    fireEvent.click(undoButton())
    expect(pageHeight()).toBe(before + PAGE_EXTRA_SPACE_STEP_PX)

    fireEvent.click(undoButton())
    expect(pageHeight()).toBe(before)
    expect(undoButton()).toBeDisabled()

    fireEvent.click(redoButton())
    expect(pageHeight()).toBe(before + PAGE_EXTRA_SPACE_STEP_PX)
  })

  it('does not put an empty step on the undo stack when there is nothing to trim', () => {
    render(<App />)

    fireEvent.click(addSpace())
    fireEvent.click(trim())
    // Trim again through the store — the button is disabled, but the action must
    // no-op rather than allocate a document nobody asked for.
    act(() => {
      canvas().trimPageSpace(canvas().currentPageId)
    })

    fireEvent.click(undoButton())
    expect(Number(screen.getByTestId('canvas-page').getAttribute('data-page-height'))).toBe(
      MIN_PAGE_HEIGHT_PX + PAGE_EXTRA_SPACE_STEP_PX,
    )
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
