import { useEffect } from 'react'

import { getBlockTypeDefinition } from '../constants/blockTypes.ts'
import { redo, undo } from '../store/canvasSession.ts'
import { selectSelectedBlock, useCanvasStore } from '../store/canvasStore.ts'
import { beginTextEdit } from '../store/textEditing.ts'

const DELETE_KEYS = new Set(['Delete', 'Backspace'])
const ESCAPE_KEY = 'Escape'
const SPACE_KEY = ' '
const UNDO_KEY = 'z'
const REDO_KEY = 'y'
const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA'])

/** Typing in the inline editor must never delete the block underneath it. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return TEXT_ENTRY_TAGS.has(target.tagName) || target.isContentEditable
}

/**
 * A single character the client meant to type — a letter, a digit, a space, a
 * comma. `key.length === 1` is the whole test: every named key (`Enter`, `Tab`,
 * `ArrowLeft`, `F5`, `Dead`) is longer than one character. Modified keystrokes
 * never reach this function; the caller has already stood down for them.
 */
function isPrintableKey(key: string): boolean {
  return key.length === 1
}

/**
 * Undo/redo, on both the Windows and the Mac muscle memory: Ctrl/Cmd+Z undoes,
 * Ctrl+Y and Ctrl/Cmd+Shift+Z both redo. Returns false when the event was something
 * else, so the caller can carry on to the canvas keys.
 */
function handleHistoryShortcut(event: KeyboardEvent): boolean {
  if (!event.ctrlKey && !event.metaKey) return false
  if (event.altKey) return false

  const key = event.key.toLowerCase()

  if (key === UNDO_KEY) {
    event.preventDefault()
    if (event.shiftKey) redo()
    else undo()
    return true
  }

  if (key === REDO_KEY) {
    event.preventDefault()
    redo()
    return true
  }

  return false
}

/**
 * Canvas-level keyboard: undo/redo, type-to-edit, Delete/Backspace removes the
 * selected block, Escape deselects. Bound to the window (not to the block) so the
 * client never has to hunt for focus after clicking a block.
 *
 * EVERY shortcut here stands down while an inline editor or any other text field has
 * focus. Inside a textarea Ctrl+Z must undo the client's last few characters — the
 * browser's own per-field undo — not throw away the whole block they are typing
 * into. The store only ever sees the finished text (the editor commits once on
 * Enter/blur), so a completed text edit is still exactly one step out here.
 *
 * TYPE-TO-EDIT, AND WHY IT IS NOT OPTIONAL (UX audit MAJOR-3). With a block selected
 * and no editor open, keystrokes used to fall through to the browser. The client in
 * the audit clicked her heading and typed her restaurant's name; the space bar in
 * it scrolled the canvas 434px behind a scrollbar that renders 0px wide, her
 * heading went above the fold, and the page she had been working on looked empty
 * and deleted. Nothing was lost, and she had no way on earth to know that.
 *
 * So a printable character now opens the inline editor on any block that has words,
 * carrying that character in as the start of the edit — which is what PowerPoint,
 * Keynote and Figma all do, and what she was expecting. It is ONE undo step: the
 * seeding keystroke goes into the editor's local draft, and the draft reaches the
 * store once, on Enter or blur, exactly as a double-click edit does.
 *
 * Backspace keeps deleting the block — but only while no editor is open, which is
 * the same rule as before and now covers the dangerous case it did not: type a
 * letter, think better of it, hit Backspace. The letter opened the editor, so the
 * Backspace erases the letter instead of destroying the block.
 *
 * WHAT WE DELIBERATELY DID NOT DO: make the canvas viewport unscrollable from the
 * keyboard while something is selected. Space and the arrow keys are how a keyboard
 * client scrolls a 1600px page, and taking that away to fix a mis-aimed keystroke
 * trades one trap for a worse one. We swallow only the keys we actually consume,
 * only while a block is selected, and only when no editor is open.
 */
export function useCanvasKeyboard(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const state = useCanvasStore.getState()
      const { selectedBlockId, editingBlockId, deleteBlock, selectBlock } = state

      if (editingBlockId !== null || isTypingTarget(event.target)) return

      if (handleHistoryShortcut(event)) return
      if (event.ctrlKey || event.metaKey || event.altKey) return

      if (event.key === ESCAPE_KEY) {
        selectBlock(null)
        return
      }

      if (selectedBlockId === null) return

      if (DELETE_KEYS.has(event.key)) {
        event.preventDefault()
        deleteBlock(selectedBlockId)
        return
      }

      if (!isPrintableKey(event.key)) return

      const block = selectSelectedBlock(state)
      if (!block) return

      if (getBlockTypeDefinition(block.type).textMode === 'none') {
        // Nothing to type into — but the space bar would still scroll the client's
        // work off the top of the canvas, so it stops here either way.
        if (event.key === SPACE_KEY) event.preventDefault()
        return
      }

      event.preventDefault()
      beginTextEdit(block.id, event.key)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
