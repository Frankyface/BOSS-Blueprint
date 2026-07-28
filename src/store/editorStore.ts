import { create } from 'zustand'

import { emptyDocument } from '../canvas/document.ts'
import type { CanvasDocument } from '../canvas/types.ts'

import { canRedo, canUndo } from './history.ts'
import type { History } from './history.ts'
import { createHistory } from './history.ts'

/**
 * Editor CHROME state — everything the client sees around the document but which is
 * not part of the document: the undo stack, the storage notice and the transient
 * toast.
 *
 * Kept out of `canvasStore` on purpose. That store is the document, and the document
 * is what gets snapshotted into history and serialised to disk; putting the history
 * inside it would make history part of history.
 */

export type StorageNoticeKind = 'near-quota' | 'save-failed' | 'recovered' | 'unavailable'

export interface StorageNotice {
  readonly kind: StorageNoticeKind
  readonly message: string
}

/**
 * HOW THIS SESSION BEGAN — and therefore which of the three start surfaces is up.
 *
 * One value rather than two booleans, because exactly one of them can be true:
 * you are choosing a starting point, being coached through a blank page, or
 * getting on with the design. Mutually exclusive by construction beats two flags
 * that could both be set.
 *
 * `editing` is the default so every unit test and every component test renders
 * the plain editor; the picker only appears when `startCanvasSession` finds
 * nothing saved.
 */
export type StartState =
  /** No saved design: choose a starter template, or start blank. */
  | 'picker'
  /** Chose blank: the dismissible coach card is over the empty page. */
  | 'coaching'
  | 'editing'

/** A design read off disk, waiting for the client to confirm the overwrite. */
export interface PendingImport {
  readonly document: CanvasDocument
  readonly fileName: string
  /** The schema it was written as, when older than this build's. */
  readonly migratedFrom: number | null
}

export interface EditorState {
  readonly history: History<CanvasDocument>
  /** Non-blocking banner about SAVING. `null` means nothing to say. */
  readonly notice: StorageNotice | null
  /**
   * Non-blocking message about the DESIGN — "three links now point nowhere".
   * Separate from `notice` so a design message can never be cleared by a
   * successful autosave, and an autosave problem can never be hidden by one.
   */
  readonly toast: string | null
  readonly startState: StartState
  /**
   * A valid `.blueprint` that would overwrite work already on screen. Held here
   * rather than inside the button that read it, because the same confirmation has
   * to serve BOTH ways in — the toolbar's file picker and a file dropped onto the
   * editor — and two copies of "are you sure" would eventually disagree.
   */
  readonly pendingImport: PendingImport | null
}

export interface EditorActions {
  setHistory: (history: History<CanvasDocument>) => void
  setNotice: (notice: StorageNotice | null) => void
  setToast: (toast: string | null) => void
  setStartState: (startState: StartState) => void
  setPendingImport: (pendingImport: PendingImport | null) => void
}

export const useEditorStore = create<EditorState & EditorActions>()((set) => ({
  history: createHistory(emptyDocument()),
  notice: null,
  toast: null,
  startState: 'editing',
  pendingImport: null,

  setHistory: (history) => {
    set((state) => (state.history === history ? state : { history }))
  },

  setNotice: (notice) => {
    set((state) => (state.notice === notice ? state : { notice }))
  },

  setToast: (toast) => {
    set((state) => (state.toast === toast ? state : { toast }))
  },

  setStartState: (startState) => {
    set((state) => (state.startState === startState ? state : { startState }))
  },

  setPendingImport: (pendingImport) => {
    set((state) => (state.pendingImport === pendingImport ? state : { pendingImport }))
  },
}))

export function selectCanUndo(state: EditorState): boolean {
  return canUndo(state.history)
}

export function selectCanRedo(state: EditorState): boolean {
  return canRedo(state.history)
}
