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
}

export interface PenToolActions {
  setMode: (mode: PenMode) => void
  setColor: (color: string) => void
  setWidth: (width: number) => void
}

export const INITIAL_PEN_TOOL: PenToolState = {
  mode: 'off',
  color: DEFAULT_PEN_COLOR,
  width: DEFAULT_PEN_WIDTH,
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
}))

/** Is the pen (or eraser) currently taking the canvas's pointer events? */
export function selectIsPenActive(state: PenToolState): boolean {
  return state.mode !== 'off'
}
