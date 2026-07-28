import { useEffect } from 'react'

import { redo, undo } from '../store/canvasSession.ts'
import { useCanvasStore } from '../store/canvasStore.ts'

const DELETE_KEYS = new Set(['Delete', 'Backspace'])
const ESCAPE_KEY = 'Escape'
const UNDO_KEY = 'z'
const REDO_KEY = 'y'
const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA'])

/** Typing in the inline editor must never delete the block underneath it. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return TEXT_ENTRY_TAGS.has(target.tagName) || target.isContentEditable
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
 * Canvas-level keyboard: undo/redo, Delete/Backspace removes the selected block,
 * Escape deselects. Bound to the window (not to the block) so the client never has
 * to hunt for focus after clicking a block.
 *
 * EVERY shortcut here stands down while an inline editor or any other text field has
 * focus. Inside a textarea Ctrl+Z must undo the client's last few characters — the
 * browser's own per-field undo — not throw away the whole block they are typing
 * into. The store only ever sees the finished text (the editor commits once on
 * Enter/blur), so a completed text edit is still exactly one step out here.
 */
export function useCanvasKeyboard(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const { selectedBlockId, editingBlockId, deleteBlock, selectBlock } =
        useCanvasStore.getState()

      if (editingBlockId !== null || isTypingTarget(event.target)) return

      if (handleHistoryShortcut(event)) return
      if (event.ctrlKey || event.metaKey) return

      if (event.key === ESCAPE_KEY) {
        selectBlock(null)
        return
      }

      if (!DELETE_KEYS.has(event.key) || selectedBlockId === null) return

      event.preventDefault()
      deleteBlock(selectedBlockId)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])
}
