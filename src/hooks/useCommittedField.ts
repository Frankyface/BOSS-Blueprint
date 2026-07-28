import { useState } from 'react'
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'

const ENTER_KEY = 'Enter'
const ESCAPE_KEY = 'Escape'

export interface CommittedFieldOptions {
  /** Multi-line fields need Enter for newlines, so only blur commits them. */
  readonly commitOnEnter?: boolean
}

export interface CommittedField {
  readonly value: string
  readonly onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void
  readonly onBlur: () => void
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void
}

/**
 * A text field that keeps a LOCAL draft and writes to the store exactly once, on
 * Enter or blur.
 *
 * This is the same rule `BlockTextEditor` already follows, and it exists for the
 * same reason: every store write is an undo step, so a field that wrote on each
 * keystroke would make the client press Ctrl+Z once per character to take back one
 * sentence. Escape abandons the draft.
 *
 * The draft re-syncs whenever the stored value changes underneath it (an undo, a
 * page switch, a settings reset) — while the client is typing the stored value is
 * not moving, so the two never fight. That re-sync is done by ADJUSTING STATE
 * DURING RENDER, which is React's own recommended shape for it: an effect would
 * paint the stale draft first and then immediately re-render.
 */
export function useCommittedField(
  value: string,
  commit: (next: string) => void,
  options: CommittedFieldOptions = {},
): CommittedField {
  const { commitOnEnter = true } = options
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)

  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }

  const commitDraft = (next: string) => {
    const trimmed = next.trim()
    if (trimmed !== draft) setDraft(trimmed)
    if (trimmed !== value) commit(trimmed)
  }

  return {
    value: draft,
    onChange: (event) => {
      setDraft(event.target.value)
    },
    onBlur: () => {
      commitDraft(draft)
    },
    onKeyDown: (event) => {
      if (event.key === ESCAPE_KEY) {
        event.preventDefault()
        setDraft(value)
        return
      }

      if (event.key !== ENTER_KEY || !commitOnEnter) return
      event.preventDefault()
      commitDraft(draft)
    },
  }
}
