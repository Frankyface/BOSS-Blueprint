import { create } from 'zustand'

import { DEFAULT_PEN_COLOR, DEFAULT_PEN_WIDTH } from '../canvas/penStrokes.ts'

/**
 * WHICH PEN IS IN THE CLIENT'S HAND — and nothing else.
 *
 * Deliberately its own store, and deliberately NOT part of the document. The
 * strokes are the client's work and belong in `page.penStrokes` (undoable,
 * autosaved, exported); "the pen is currently red and 4px" is the state of a
 * toolbar. Undo must take back a mark, never quietly swap the colour under their
 * hand, and reopening the editor should not restore a mode they cannot see.
 *
 * It is also NOT in `canvasStore`: every write there is inspected by the session
 * subscriber, and a store whose changes can never be document changes is clearer
 * kept apart than defended against.
 */

export type PenMode = 'off' | 'draw' | 'erase'

export interface PenToolState {
  readonly mode: PenMode
  /** `#rrggbb`. */
  readonly color: string
  readonly width: number
  /**
   * Is the client asking to SEE what we read their ink as?
   *
   * A VIEW, NOT A DOCUMENT, and that is why it belongs in this store rather than
   * beside the strokes: it is a lens the client holds up, like the pen's current
   * colour. Living here it can never enter the undo stack, an autosave, a
   * `.blueprint` or the export — nothing about the deliverable changes when it is
   * ticked, which is exactly the promise "read-only feedback" has to make.
   *
   * DEFAULT OFF. The sketch is what the client came to look at; labelling every
   * region all the time would bury the drawing under our commentary on it.
   */
  readonly showInkReading: boolean
}

export interface PenToolActions {
  setMode: (mode: PenMode) => void
  setColor: (color: string) => void
  setWidth: (width: number) => void
  toggleInkReading: () => void
}

export const INITIAL_PEN_TOOL: PenToolState = {
  mode: 'off',
  color: DEFAULT_PEN_COLOR,
  width: DEFAULT_PEN_WIDTH,
  showInkReading: false,
}

export const usePenToolStore = create<PenToolState & PenToolActions>()((set) => ({
  ...INITIAL_PEN_TOOL,

  setMode: (mode) => {
    set((state) => (state.mode === mode ? state : { mode }))
  },

  setColor: (color) => {
    set((state) => (state.color === color ? state : { color }))
  },

  setWidth: (width) => {
    set((state) => (state.width === width ? state : { width }))
  },

  toggleInkReading: () => {
    set((state) => ({ showInkReading: !state.showInkReading }))
  },
}))

/** Is the pen (or eraser) currently taking the canvas's pointer events? */
export function selectIsPenActive(state: PenToolState): boolean {
  return state.mode !== 'off'
}

/**
 * Is our reading of the ink on screen right now?
 *
 * THE FLAG ALONE IS NOT ENOUGH. The tick box only exists while the pen is out (a
 * toolbar that shows every control at all times is what makes a non-technical
 * client hesitate), so a flag left on with the pen away would leave chrome painted
 * over the page with nothing on screen able to turn it off. Gating the paint on the
 * same condition as the control keeps the two impossible to separate — and keeps
 * the overlay away from the canvas entirely whenever blocks are being edited.
 */
export function selectIsInkReadingShown(state: PenToolState): boolean {
  return state.showInkReading && state.mode !== 'off'
}
