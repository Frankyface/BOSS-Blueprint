import { describe, expect, it } from 'vitest'

import {
  HISTORY_LIMIT,
  canRedo,
  canUndo,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from './history.ts'
import type { History } from './history.ts'

interface Doc {
  readonly value: string
}

const doc = (value: string): Doc => ({ value })

/** Push a whole sequence, returning every intermediate stack for inspection. */
function pushAll(start: History<Doc>, values: readonly Doc[]): History<Doc> {
  return values.reduce<History<Doc>>((history, value) => pushHistory(history, value), start)
}

describe('createHistory', () => {
  it('starts with nothing to undo or redo', () => {
    const history = createHistory(doc('a'))

    expect(history.past).toEqual([])
    expect(history.future).toEqual([])
    expect(canUndo(history)).toBe(false)
    expect(canRedo(history)).toBe(false)
  })
})

describe('pushHistory', () => {
  it('moves the old present into the past', () => {
    const first = doc('a')
    const second = doc('b')

    const history = pushHistory(createHistory(first), second)

    expect(history.present).toBe(second)
    expect(history.past).toEqual([first])
    expect(canUndo(history)).toBe(true)
  })

  it('records nothing for a no-op action', () => {
    const same = doc('a')
    const history = createHistory(same)

    const afterNoOp = pushHistory(history, same)

    expect(afterNoOp).toBe(history)
    expect(canUndo(afterNoOp)).toBe(false)
  })

  it('uses the supplied equality to decide what counts as a change', () => {
    const history = createHistory(doc('a'))
    const equalByValue = (a: Doc, b: Doc) => a.value === b.value

    // A different object carrying the same content is still not a step.
    const afterNoOp = pushHistory(history, doc('a'), equalByValue)
    const afterChange = pushHistory(history, doc('b'), equalByValue)

    expect(afterNoOp).toBe(history)
    expect(afterChange.past).toHaveLength(1)
  })

  it('clears the redo stack, so a new action after undo abandons the branch', () => {
    const undone = undoHistory(pushAll(createHistory(doc('a')), [doc('b'), doc('c')]))
    expect(canRedo(undone)).toBe(true)

    const branched = pushHistory(undone, doc('d'))

    expect(canRedo(branched)).toBe(false)
    expect(branched.future).toEqual([])
    expect(branched.present).toEqual(doc('d'))
  })

  it('does not mutate the history it was given', () => {
    const history = createHistory(doc('a'))
    const pastBefore = history.past

    pushHistory(history, doc('b'))

    expect(history.past).toBe(pastBefore)
    expect(history.past).toEqual([])
    expect(history.present).toEqual(doc('a'))
  })
})

describe('the history limit', () => {
  it('retains at least the 50 steps the spec asks for', () => {
    expect(HISTORY_LIMIT).toBeGreaterThanOrEqual(50)
  })

  it('keeps exactly the newest HISTORY_LIMIT steps and drops the oldest', () => {
    const overflow = 10
    const values = Array.from({ length: HISTORY_LIMIT + overflow }, (_, index) =>
      doc(`step-${String(index)}`),
    )

    const history = pushAll(createHistory(doc('start')), values)

    expect(history.past).toHaveLength(HISTORY_LIMIT)
    // The oldest surviving entry is the one `overflow` steps in, not `start`.
    expect(history.past[0]).toEqual(doc(`step-${String(overflow - 1)}`))
    expect(history.past).not.toContainEqual(doc('start'))
  })

  it('can be undone exactly HISTORY_LIMIT times after overflowing', () => {
    const values = Array.from({ length: HISTORY_LIMIT * 2 }, (_, index) =>
      doc(`step-${String(index)}`),
    )
    let history = pushAll(createHistory(doc('start')), values)

    let undoCount = 0
    while (canUndo(history)) {
      history = undoHistory(history)
      undoCount += 1
    }

    expect(undoCount).toBe(HISTORY_LIMIT)
  })
})

describe('undoHistory / redoHistory', () => {
  it('steps back and forward through the stack', () => {
    const history = pushAll(createHistory(doc('a')), [doc('b'), doc('c')])

    const once = undoHistory(history)
    const twice = undoHistory(once)

    expect(once.present).toEqual(doc('b'))
    expect(twice.present).toEqual(doc('a'))
    expect(canUndo(twice)).toBe(false)
    expect(canRedo(twice)).toBe(true)

    expect(redoHistory(twice).present).toEqual(doc('b'))
    expect(redoHistory(redoHistory(twice)).present).toEqual(doc('c'))
  })

  it('returns the same object when there is nothing to undo', () => {
    const history = createHistory(doc('a'))

    expect(undoHistory(history)).toBe(history)
  })

  it('returns the same object when there is nothing to redo', () => {
    const history = pushHistory(createHistory(doc('a')), doc('b'))

    expect(redoHistory(history)).toBe(history)
  })

  it('restores every step of a 10-value sequence deep-equal, both directions', () => {
    const sequence = Array.from({ length: 10 }, (_, index) => doc(`state-${String(index)}`))
    const snapshots = [doc('start'), ...sequence].map((value) => structuredClone(value))

    let history = pushAll(createHistory(doc('start')), sequence)
    expect(history.present).toEqual(snapshots[snapshots.length - 1])

    // Walk all the way back, checking the state at every single step.
    for (let index = snapshots.length - 2; index >= 0; index -= 1) {
      history = undoHistory(history)
      expect(history.present).toEqual(snapshots[index])
    }

    // ...and all the way forward again.
    for (let index = 1; index < snapshots.length; index += 1) {
      history = redoHistory(history)
      expect(history.present).toEqual(snapshots[index])
    }

    expect(history.present).toEqual(snapshots[snapshots.length - 1])
    expect(canRedo(history)).toBe(false)
  })
})
