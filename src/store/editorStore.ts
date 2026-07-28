import { create } from 'zustand'

import { emptyDocument } from '../canvas/blueprintFile.ts'
import type { CanvasDocument } from '../canvas/types.ts'

import { canRedo, canUndo } from './history.ts'
import type { History } from './history.ts'
import { createHistory } from './history.ts'

/**
 * Editor CHROME state — everything the client sees around the document but which is
 * not part of the document: the undo stack and the storage notice.
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

export interface EditorState {
  readonly history: History<CanvasDocument>
  /** Non-blocking banner. `null` means nothing to say. */
  readonly notice: StorageNotice | null
}

export interface EditorActions {
  setHistory: (history: History<CanvasDocument>) => void
  setNotice: (notice: StorageNotice | null) => void
}

export const useEditorStore = create<EditorState & EditorActions>()((set) => ({
  history: createHistory(emptyDocument()),
  notice: null,

  setHistory: (history) => {
    set((state) => (state.history === history ? state : { history }))
  },

  setNotice: (notice) => {
    set((state) => (state.notice === notice ? state : { notice }))
  },
}))

export function selectCanUndo(state: EditorState): boolean {
  return canUndo(state.history)
}

export function selectCanRedo(state: EditorState): boolean {
  return canRedo(state.history)
}
