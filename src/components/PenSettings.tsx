import { inkReadingSummary } from '../canvas/inkReading.ts'
import { PEN_COLORS, PEN_WIDTHS } from '../canvas/penStrokes.ts'
import { useInkReading } from '../hooks/useInkReading.ts'
import { usePenToolStore } from '../store/penTool.ts'

import './PenSettings.css'

const SETTINGS_GROUP_LABEL = 'Pen settings'

/**
 * The pen draws the PAGE, not just notes about it (F6). The old wording — "Draw on
 * the page. Blocks are locked while the pen is out." — led with the restriction and
 * left the client to guess that a drawn box is a card, which is the single most
 * valuable thing this tool can do and the one thing nothing on screen said.
 *
 * IT NO LONGER HAS TO BE SHORT. It used to be trimmed to keep the toolbar from
 * wrapping, which is a fix that lasts exactly as long as the font it was measured
 * against; the toolbar's fixed line now holds the length constant instead, and a
 * sentence too long for the window is ellipsed rather than allowed to cost a row.
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
 * WHAT YOU CAN SET ABOUT THE PEN — colour, thickness, and "show what we read" — plus
 * the one line of words that goes with it.
 *
 * None of it exists while the pen is away: there is nothing to set then, and a
 * toolbar that shows every control at all times is exactly the kind of thing that
 * makes a non-technical client hesitate.
 *
 * TWO SIBLINGS, NOT ONE BOX. The controls and the sentence are returned as a
 * fragment so both are direct children of the toolbar's fixed line, which is what
 * lets the sentence claim the leftover room (and give it all back) independently of
 * the controls. See `CanvasToolbar.css`.
 */
export function PenSettings() {
  const mode = usePenToolStore((state) => state.mode)
  const color = usePenToolStore((state) => state.color)
  const width = usePenToolStore((state) => state.width)
  const showInkReading = usePenToolStore((state) => state.showInkReading)
  const setColor = usePenToolStore((state) => state.setColor)
  const setWidth = usePenToolStore((state) => state.setWidth)
  const toggleInkReading = usePenToolStore((state) => state.toggleInkReading)

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
   * time. The fix clause is omitted when there is nothing read yet: there is no
   * misreading to correct.
   */
  const readingLine =
    regions.length === 0
      ? inkReadingSummary(regions)
      : `${inkReadingSummary(regions)} ${READING_FIX_HINT}`

  if (mode === 'off') return null

  return (
    <>
      <div className="pen-settings" role="group" aria-label={SETTINGS_GROUP_LABEL}>
        <div className="pen-settings__swatches" role="group" aria-label="Pen colour">
          {PEN_COLORS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="pen-settings__swatch"
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

        <div className="pen-settings__widths" role="group" aria-label="Pen thickness">
          {PEN_WIDTHS.map((option) => (
            <button
              key={option.id}
              type="button"
              className="canvas-toolbar__button pen-settings__width"
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

        <label className="pen-settings__reading">
          <input
            type="checkbox"
            data-testid="pen-reading-toggle"
            checked={showInkReading}
            onChange={toggleInkReading}
          />
          {READING_LABEL}
        </label>
      </div>

      {showInkReading ? (
        <p
          className="canvas-toolbar__message pen-settings__reading-summary"
          data-testid="pen-reading-summary"
          role="status"
        >
          {readingLine}
        </p>
      ) : (
        <p
          className="canvas-toolbar__message pen-settings__hint"
          data-testid="pen-hint"
        >
          {mode === 'erase' ? ERASE_HINT : DRAW_HINT}
        </p>
      )}
    </>
  )
}
