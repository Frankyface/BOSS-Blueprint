import { PEN_COLORS, PEN_WIDTHS } from '../canvas/penStrokes.ts'
import { useCanvasStore } from '../store/canvasStore.ts'
import { usePenToolStore } from '../store/penTool.ts'
import type { PenMode } from '../store/penTool.ts'

import './PenControls.css'

const PEN_GROUP_LABEL = 'Pen and eraser'
const DRAW_HINT = 'Draw on the page. Blocks are locked while the pen is out.'
const ERASE_HINT = 'Click a mark to rub it out.'

/**
 * The pen's toolbar: pick it up, put it down, choose a colour and a thickness.
 *
 * Colour and width only appear once the pen is out. There is nothing to set while
 * it is away, and a toolbar that shows every control at all times is exactly the
 * kind of thing that makes a non-technical client hesitate.
 */
export function PenControls() {
  const mode = usePenToolStore((state) => state.mode)
  const color = usePenToolStore((state) => state.color)
  const width = usePenToolStore((state) => state.width)
  const setMode = usePenToolStore((state) => state.setMode)
  const setColor = usePenToolStore((state) => state.setColor)
  const setWidth = usePenToolStore((state) => state.setWidth)
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
    <div className="pen-controls" role="group" aria-label={PEN_GROUP_LABEL} data-pen-mode={mode}>
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

      {mode !== 'off' && (
        <>
          <div className="pen-controls__swatches" role="group" aria-label="Pen colour">
            {PEN_COLORS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="pen-controls__swatch"
                data-testid={`pen-color-${option.id}`}
                style={{ background: option.hex }}
                aria-label={option.label}
                aria-pressed={color === option.hex}
                onClick={() => {
                  setColor(option.hex)
                }}
              />
            ))}
          </div>

          <div className="pen-controls__widths" role="group" aria-label="Pen thickness">
            {PEN_WIDTHS.map((option) => (
              <button
                key={option.id}
                type="button"
                className="canvas-toolbar__button pen-controls__width"
                data-testid={`pen-width-${option.id}`}
                aria-pressed={width === option.px}
                onClick={() => {
                  setWidth(option.px)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          <p className="pen-controls__hint" data-testid="pen-hint">
            {mode === 'erase' ? ERASE_HINT : DRAW_HINT}
          </p>
        </>
      )}
    </div>
  )
}
