import { useCanvasStore } from '../store/canvasStore.ts'
import { usePenToolStore } from '../store/penTool.ts'
import type { PenMode } from '../store/penTool.ts'

import './PenControls.css'

const PEN_GROUP_LABEL = 'Pen and eraser'

/**
 * PICK THE PEN UP, OR PUT IT DOWN — and nothing else.
 *
 * The two toggles are the only part of the pen whose width does not depend on
 * whether the pen is out, so they are the only part that may sit on the toolbar's
 * wrapping control line. Everything you can SET about the pen lives in `PenSettings`
 * on the toolbar's fixed line below, directly under these two buttons; the reason is
 * written out in full at the top of `CanvasToolbar.css` and it is the difference
 * between a drawing area that keeps its size and one that loses a row to a font.
 */
export function PenControls() {
  const mode = usePenToolStore((state) => state.mode)
  const setMode = usePenToolStore((state) => state.setMode)
  const selectBlock = useCanvasStore((state) => state.selectBlock)

  /**
   * Picking up the pen DESELECTS. The overlay already swallows pointer events, but
   * a block left selected underneath keeps its resize grips on screen and stays
   * the target of the Delete key — so it would look locked and behave otherwise.
   */
  const chooseMode = (next: PenMode) => {
    const resolved = mode === next ? 'off' : next
    setMode(resolved)
    if (resolved !== 'off') selectBlock(null)
  }

  return (
    <div
      className="pen-controls"
      role="group"
      aria-label={PEN_GROUP_LABEL}
      data-pen-mode={mode}
      data-tour="pen-tool"
    >
      <button
        type="button"
        className="canvas-toolbar__button pen-controls__toggle"
        data-testid="pen-toggle"
        aria-pressed={mode === 'draw'}
        onClick={() => {
          chooseMode('draw')
        }}
      >
        Pen
      </button>
      <button
        type="button"
        className="canvas-toolbar__button pen-controls__toggle"
        data-testid="pen-eraser"
        aria-pressed={mode === 'erase'}
        onClick={() => {
          chooseMode('erase')
        }}
      >
        Eraser
      </button>
    </div>
  )
}
