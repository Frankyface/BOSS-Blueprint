import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import type { BlockTypeId } from '../canvas/types.ts'
import { selectCurrentBlocks, useCanvasStore } from '../store/canvasStore.ts'
import { clearTextEditSeed, pendingTextEditSeed } from '../store/textEditing.ts'

import { useCanvasKeyboard } from './useCanvasKeyboard.ts'

/**
 * THE CANVAS KEYBOARD, with a block selected and no editor open — the state the UX
 * audit found a client stranded in (MAJOR-3): her keystrokes fell through to the
 * browser, the space bar scrolled the canvas 434px behind an invisible scrollbar,
 * and the page she had been working on looked empty.
 */

const store = () => useCanvasStore.getState()

/** Nothing to render: the hook listens on the window. */
function Harness() {
  useCanvasKeyboard()
  return null
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  window.dispatchEvent(event)
  return event
}

function selectNew(type: BlockTypeId): string {
  const id = store().addBlock(type)
  store().selectBlock(id)
  return id
}

const textOf = (id: string): string =>
  selectCurrentBlocks(store()).find((block) => block.id === id)?.text ?? ''

beforeEach(() => {
  store().resetCanvas()
  // In the app the editor consumes the seed as it mounts; nothing renders one here.
  clearTextEditSeed()
  render(<Harness />)
})

describe('type-to-edit', () => {
  it.each(['heading', 'text', 'button', 'nav-bar'] as const)(
    'opens the editor on a %s with the typed character as the edit',
    (type) => {
      const id = selectNew(type)

      const event = press('T')

      expect(store().editingBlockId).toBe(id)
      expect(pendingTextEditSeed()).toBe('T')
      expect(event.defaultPrevented).toBe(true)
      // The character is the EDIT so far, not a store write: one undo step, and
      // the block's own text does not move until the editor commits.
      expect(textOf(id)).toBe('')
    },
  )

  it.each([' ', '1', ',', 'é', '?'])('treats %j as the start of an edit too', (key) => {
    const id = selectNew('heading')

    press(key)

    expect(store().editingBlockId).toBe(id)
    expect(pendingTextEditSeed()).toBe(key)
  })

  it('does nothing on a block with no words in it', () => {
    for (const type of ['image', 'section'] as const) {
      store().resetCanvas()
      clearTextEditSeed()
      const id = selectNew(type)

      press('T')

      expect(store().editingBlockId).toBeNull()
      expect(pendingTextEditSeed()).toBeNull()
      expect(textOf(id)).toBe('')
    }
  })

  it('SWALLOWS THE SPACE BAR even on a block it cannot edit', () => {
    // Otherwise the canvas scrolls and the client's work goes above the fold —
    // the exact moment the audit called the most damaging in the flow.
    selectNew('image')

    expect(press(' ').defaultPrevented).toBe(true)
  })

  it('leaves the keyboard alone when nothing is selected', () => {
    store().addBlock('heading')
    store().selectBlock(null)

    const event = press('T')

    expect(store().editingBlockId).toBeNull()
    expect(event.defaultPrevented).toBe(false)
  })

  it('stands down once an editor is open, so the letters reach the input', () => {
    const id = selectNew('heading')
    press('T')

    const event = press('a')

    expect(event.defaultPrevented).toBe(false)
    expect(store().editingBlockId).toBe(id)
  })

  it.each([
    ['a named key', 'ArrowLeft'],
    ['a function key', 'F5'],
    ['Tab', 'Tab'],
    ['Enter', 'Enter'],
  ])('never opens an editor on %s', (_case, key) => {
    selectNew('heading')

    const event = press(key)

    expect(store().editingBlockId).toBeNull()
    expect(event.defaultPrevented).toBe(false)
  })

  it.each([
    ['Ctrl', { ctrlKey: true }],
    ['Cmd', { metaKey: true }],
    ['Alt', { altKey: true }],
  ])('never opens an editor on a %s shortcut', (_case, modifiers) => {
    selectNew('heading')

    press('s', modifiers)

    expect(store().editingBlockId).toBeNull()
  })
})

describe('delete and escape, with type-to-edit in place', () => {
  it.each(['Backspace', 'Delete'])('%s still deletes the selected block', (key) => {
    const id = selectNew('heading')

    const event = press(key)

    expect(selectCurrentBlocks(store()).some((block) => block.id === id)).toBe(false)
    expect(event.defaultPrevented).toBe(true)
  })

  /**
   * THE MID-THOUGHT BACKSPACE. Type a letter, think better of it, hit Backspace:
   * the letter opened the editor, so the Backspace belongs to the text — it must
   * never fall through to "delete the whole block".
   */
  it('does not delete the block when Backspace follows a typed character', () => {
    const id = selectNew('heading')

    press('T')
    const event = press('Backspace')

    expect(selectCurrentBlocks(store()).some((block) => block.id === id)).toBe(true)
    expect(store().editingBlockId).toBe(id)
    expect(event.defaultPrevented).toBe(false)
  })

  it('Escape deselects rather than typing an escape character', () => {
    selectNew('heading')

    press('Escape')

    expect(store().selectedBlockId).toBeNull()
    expect(store().editingBlockId).toBeNull()
  })

  it('ignores keys aimed at a text field somewhere else in the app', () => {
    const id = selectNew('heading')
    const input = document.createElement('input')
    document.body.append(input)

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'T', bubbles: true }))

    expect(selectCurrentBlocks(store()).some((block) => block.id === id)).toBe(true)
    expect(store().editingBlockId).toBeNull()
    input.remove()
  })
})
