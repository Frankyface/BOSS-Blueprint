/**
 * A pure past/present/future undo stack.
 *
 * No React, no Zustand, no storage — it is a value in, value out module so the
 * undo semantics can be unit-tested exhaustively without mounting anything. The
 * store wiring that uses it lives in `canvasSession.ts`.
 *
 * Snapshots, not patches: the document is a flat array of small plain objects and
 * every store action already replaces state immutably, so the "copies" in `past`
 * share structure with the present and cost a pointer each.
 */

/**
 * How many undo steps are retained. The spec asks for at least 50; the oldest
 * entry is dropped past that so a long session can't grow without bound.
 */
export const HISTORY_LIMIT = 50

export interface History<T> {
  /** Oldest first. `past[past.length - 1]` is what one undo restores. */
  readonly past: readonly T[]
  readonly present: T
  /** Nearest first. `future[0]` is what one redo restores. */
  readonly future: readonly T[]
}

/** Entries must never be `undefined` — that is the emptiness sentinel here. */
export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] }
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0
}

/**
 * Record a new present.
 *
 * Returns the SAME history object when `next` is equal to the current present, so
 * an action that changed nothing (dragging a block by zero pixels, sending the
 * backmost block backward) never becomes an undo step the client has to press
 * through. Redo is cleared, per the spec: a new action after undo abandons the
 * branch that was undone.
 */
export function pushHistory<T>(
  history: History<T>,
  next: T,
  isEqual: (a: T, b: T) => boolean = Object.is,
): History<T> {
  if (isEqual(history.present, next)) return history

  const past = [...history.past, history.present]

  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: next,
    future: [],
  }
}

/** Step one entry back. Returns the same object when there is nothing to undo. */
export function undoHistory<T>(history: History<T>): History<T> {
  const previous = history.past[history.past.length - 1]
  if (previous === undefined) return history

  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  }
}

/** Step one entry forward. Returns the same object when there is nothing to redo. */
export function redoHistory<T>(history: History<T>): History<T> {
  const next = history.future[0]
  if (next === undefined) return history

  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  }
}
