import { inkReadingSummary } from '../canvas/inkReading.ts'
import { PEN_COLORS, PEN_WIDTHS } from '../canvas/penStrokes.ts'
import { useInkReading } from '../hooks/useInkReading.ts'
import { useCanvasStore } from '../store/canvasStore.ts'
import { usePenToolStore } from '../store/penTool.ts'
import type { PenMode } from '../store/penTool.ts'

import './PenControls.css'

const PEN_GROUP_LABEL = 'Pen and eraser'

/**
 * The pen draws the PAGE, not just notes about it (F6). The old wording — "Draw on
 * the page. Blocks are locked while the pen is out." — led with the restriction and
 * left the client to guess that a drawn box is a card, which is the single most
 * valuable thing this tool can do and the one thing nothing on screen said.
 *
 * It is kept SHORT for a layout reason worth stating: the canvas toolbar wraps, and
 * a hint two lines long adds a whole row to it — which pushes the page down and
 * takes 33px off the drawing area the moment the pen comes out. Picking up the pen
 * must not shrink the thing you picked it up to draw on.
 */
const DRAW_HINT = 'Draw a box, a heading, a picture — or a note. Blocks are locked while the pen is out.'
const ERASE_HINT = 'Click a mark to rub it out.'

const READING_LABEL = 'Show what we read'

/**
 * What to do about a wrong reading — and the reason there is no "no, it's a heading"
 * control to click. A stored correction would have to be keyed on the SET of strokes
 * it applies to, and that set changes the instant one stroke is rubbed out; the fix
 * named here survives redrawing because it IS redrawing.
 */
const READING_FIX_HINT = 'Not right? Rub it out and draw it again.'

/**
 * The pen's toolbar: pick it up, put it down, choose a colour and a thickness — and
 * ask what we made of what you drew.
 *
 * Everything past the two mode buttons only appears once the pen is out. There is
 * nothing to set while it is away, and a toolbar that shows every control at all
 * times is exactly the kind of thing that makes a non-technical client hesitate.
 */
export function PenControls() {
  const mode = usePenToolStore((state) => state.mode)
  const color = usePenToolStore((state) => state.color)
  const width = usePenToolStore((state) => state.width)
  const showInkReading = usePenToolStore((state) => state.showInkReading)
  const setMode = usePenToolStore((state) => state.setMode)
  const setColor = usePenToolStore((state) => state.setColor)
  const setWidth = usePenToolStore((state) => state.setWidth)
  const toggleInkReading = usePenToolStore((state) => state.toggleInkReading)
  const selectBlock = useCanvasStore((state) => state.selectBlock)

  /**
   * The SAME regions the overlay paints, said in a sentence.
   *
   * The overlay is decorative SVG inside an `aria-hidden` layer, so on its own the
   * reading would exist only for people who can see it. This is the reading as text
   * in the toolbar: reachable by keyboard, announced by a screen reader, and worded
   * from the same table the tags are worded from.
   */
  const regions = useInkReading()

  /**
   * The reading REPLACES the hint rather than joining it — one line of guidance at a
   * time, and the toolbar keeps the height it had, so ticking the box does not shove
   * the client's page down the screen mid-sketch. The fix clause is omitted when
   * there is nothing read yet: there is no misreading to correct.
   */
  const readingLine =
    regions.length === 0
      ? inkReadingSummary(regions)
      : `${inkReadingSummary(regions)} ${READING_FIX_HINT}`

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

          <label className="pen-controls__reading">
            <input
              type="checkbox"
              data-testid="pen-reading-toggle"
              checked={showInkReading}
              onChange={toggleInkReading}
            />
            {READING_LABEL}
          </label>

          {showInkReading ? (
            <p
              className="pen-controls__reading-summary"
              data-testid="pen-reading-summary"
              role="status"
            >
              {readingLine}
            </p>
          ) : (
            <p className="pen-controls__hint" data-testid="pen-hint">
              {mode === 'erase' ? ERASE_HINT : DRAW_HINT}
            </p>
          )}
        </>
      )}
    </div>
  )
}
