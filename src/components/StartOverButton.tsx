import { useState } from 'react'

import { startOver } from '../store/canvasSession.ts'
import { selectHasContent, useCanvasStore } from '../store/canvasStore.ts'

const CONFIRM_PROMPT = 'Clear the whole design?'

/**
 * "Start over" behind an in-app confirmation rather than `window.confirm`.
 *
 * A native dialog blocks the page, looks like a browser warning rather than part of
 * the tool, and is the one bit of UI that behaves differently in all three engines.
 * A two-step button is deterministic everywhere and reads as an undoable decision
 * right up to the last click.
 */
export function StartOverButton() {
  const [isConfirming, setIsConfirming] = useState(false)
  // Every page, not just this one: "start over" clears the whole site.
  const hasContent = useCanvasStore(selectHasContent)

  if (!isConfirming) {
    return (
      <button
        type="button"
        className="canvas-toolbar__button"
        data-testid="toolbar-start-over"
        disabled={!hasContent}
        onClick={() => setIsConfirming(true)}
      >
        Start over
      </button>
    )
  }

  return (
    <span className="canvas-toolbar__confirm" data-testid="start-over-confirm">
      <span className="canvas-toolbar__confirm-prompt">{CONFIRM_PROMPT}</span>
      <button
        type="button"
        className="canvas-toolbar__button"
        data-testid="start-over-cancel"
        onClick={() => setIsConfirming(false)}
      >
        Keep it
      </button>
      <button
        type="button"
        className="canvas-toolbar__button canvas-toolbar__button--danger"
        data-testid="start-over-confirmed"
        onClick={() => {
          startOver()
          setIsConfirming(false)
        }}
      >
        Yes, clear it
      </button>
    </span>
  )
}
