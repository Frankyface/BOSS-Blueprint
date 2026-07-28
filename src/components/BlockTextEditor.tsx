import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'

import type { Block } from '../canvas/types.ts'
import { getBlockTypeDefinition } from '../constants/blockTypes.ts'
import { useCanvasStore } from '../store/canvasStore.ts'
import { clearTextEditSeed, pendingTextEditSeed } from '../store/textEditing.ts'

const ENTER_KEY = 'Enter'
const ESCAPE_KEY = 'Escape'

interface BlockTextEditorProps {
  block: Block
}

/**
 * Inline text editing via a real <input>/<textarea> swapped over the block.
 *
 * Deliberately NOT contentEditable: the canvas-engine decision makes this binding,
 * because contentEditable ships its own native undo stack which would fight the
 * store-level undo/redo landing in the next feature batch.
 *
 * Enter, Escape and click-away all commit (Escape discards); Shift+Enter inserts a
 * newline in multi-line blocks.
 */
export function BlockTextEditor({ block }: BlockTextEditorProps) {
  const definition = getBlockTypeDefinition(block.type)
  const isMultiLine = definition.textMode === 'multi-line'

  /**
   * TYPE-TO-EDIT: when a keystroke opened this editor, that character IS the edit
   * so far, and it replaces what was there — the same thing double-clicking and
   * typing does, since opening by double-click selects the old text first.
   */
  const [seed] = useState(pendingTextEditSeed)
  const [draft, setDraft] = useState(seed ?? block.text)
  const elementRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)
  const isCommittedRef = useRef(false)

  const setBlockText = useCanvasStore((state) => state.setBlockText)
  const stopEditingBlock = useCanvasStore((state) => state.stopEditingBlock)

  useEffect(() => {
    clearTextEditSeed()

    const element = elementRef.current
    if (!element) return
    element.focus()

    // Seeded: the client is mid-word, so the caret goes after their character.
    // Otherwise the whole placeholder is selected, ready to be typed over.
    if (seed === null) element.select()
    else element.setSelectionRange(element.value.length, element.value.length)
    // `seed` is mount-constant state, so this runs exactly once per editor.
  }, [seed])

  const commit = () => {
    if (isCommittedRef.current) return
    isCommittedRef.current = true
    setBlockText(block.id, draft)
    stopEditingBlock()
  }

  const cancel = () => {
    isCommittedRef.current = true
    stopEditingBlock()
  }

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === ESCAPE_KEY) {
      event.preventDefault()
      event.stopPropagation()
      cancel()
      return
    }

    if (event.key !== ENTER_KEY) return
    if (isMultiLine && event.shiftKey) return

    event.preventDefault()
    commit()
  }

  const shared = {
    className: 'block-editor',
    'data-testid': 'block-text-editor',
    'data-block-id': block.id,
    'aria-label': `${definition.label} text`,
    value: draft,
    placeholder: definition.placeholderText,
    onKeyDown: handleKeyDown,
    onBlur: commit,
  }

  if (isMultiLine) {
    return (
      <textarea
        {...shared}
        ref={(node) => {
          elementRef.current = node
        }}
        onChange={(event) => setDraft(event.target.value)}
      />
    )
  }

  return (
    <input
      {...shared}
      type="text"
      ref={(node) => {
        elementRef.current = node
      }}
      onChange={(event) => setDraft(event.target.value)}
    />
  )
}
