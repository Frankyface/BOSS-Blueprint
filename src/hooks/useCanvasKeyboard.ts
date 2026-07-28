import { useEffect } from 'react'

import { useCanvasStore } from '../store/canvasStore.ts'

const DELETE_KEYS = new Set(['Delete', 'Backspace'])
const ESCAPE_KEY = 'Escape'
const TEXT_ENTRY_TAGS = new Set(['INPUT', 'TEXTAREA'])

/** Typing in the inline editor must never delete the block underneath it. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return TEXT_ENTRY_TAGS.has(target.tagName) || target.isContentEditable
}

/**
 * Canvas-level keyboard: Delete/Backspace removes the selected block, Escape
 * deselects. Bound to the window (not to the block) so the client never has to
 * hunt for focus after clicking a block.
 */
export function useCanvasKeyboard(): void {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const { selectedBlockId, editingBlockId, deleteBlock, selectBlock } =
        useCanvasStore.getState()

      if (editingBlockId !== null || isTypingTarget(event.target)) return

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
