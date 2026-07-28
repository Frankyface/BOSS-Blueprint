import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetBlockIdSequence } from '../canvas/blockFactory.ts'
import { serialiseDocument } from '../canvas/blueprintFile.ts'
import type { Block } from '../canvas/types.ts'
import { createFakeStorage, quotaExceededError } from '../test/fakeStorage.ts'
import type { FakeStorage } from '../test/fakeStorage.ts'

import { AUTOSAVE_DEBOUNCE_MS } from './autosave.ts'
import {
  flushAutosave,
  redo,
  startCanvasSession,
  startOver,
  stopCanvasSession,
  undo,
} from './canvasSession.ts'
import { getCanvasDocument, useCanvasStore } from './canvasStore.ts'
import { RECOVERY_KEY, STORAGE_KEY } from './canvasStorage.ts'
import { useEditorStore } from './editorStore.ts'
import { canRedo, canUndo } from './history.ts'

/**
 * These exercise the real store through the real wiring — the pure modules have
 * their own tests, this one is about what happens when they are plugged together.
 */

const canvas = () => useCanvasStore.getState()
const editor = () => useEditorStore.getState()
const history = () => editor().history
const blocks = (): readonly Block[] => canvas().blocks
const undoDepth = () => history().past.length

let storage: FakeStorage

beforeEach(() => {
  vi.useFakeTimers()
  stopCanvasSession()
  canvas().resetCanvas()
  resetBlockIdSequence()
  storage = createFakeStorage()
  startCanvasSession({ storage })
})

afterEach(() => {
  stopCanvasSession()
  vi.useRealTimers()
})

/** Ten mixed edits, the sequence the spec asks to be replayable both ways. */
function runTenMixedActions(): void {
  const sectionId = canvas().addBlock('section')
  const headingId = canvas().addBlock('heading')
  canvas().setBlockText(headingId, 'Welcome to BOSS')
  const textId = canvas().addBlock('text')
  canvas().moveBlockBy(headingId, 40, 24)
  canvas().resizeBlockBy(headingId, 'se', 40, 8)
  const buttonId = canvas().addBlock('button')
  canvas().bringBlockForward(sectionId)
  canvas().deleteBlock(textId)
  canvas().setBlockText(buttonId, 'Book a call')
}

describe('what does and does not become an undo step', () => {
  it('records one step per mutating action', () => {
    canvas().addBlock('heading')
    canvas().addBlock('button')

    expect(undoDepth()).toBe(2)
  })

  it('records a committed drag as a single step', () => {
    const id = canvas().addBlock('heading')
    const depthBefore = undoDepth()

    // The gesture fast path never touches the store mid-drag; it commits once on
    // pointerup, which is this one call.
    canvas().moveBlockBy(id, 37, 21)

    expect(undoDepth()).toBe(depthBefore + 1)
  })

  it('records nothing for actions the store treated as no-ops', () => {
    const id = canvas().addBlock('heading')
    const depthBefore = undoDepth()

    canvas().moveBlockBy(id, 0, 0)
    canvas().resizeBlockBy(id, 'se', 0, 0)
    canvas().moveBlockBy('does-not-exist', 40, 40)
    canvas().deleteBlock('does-not-exist')
    canvas().sendBlockBackward(id)
    canvas().bringBlockForward(id)

    expect(undoDepth()).toBe(depthBefore)
  })

  it('leaves selection and inline editing out of history entirely', () => {
    const id = canvas().addBlock('heading')
    const depthBefore = undoDepth()

    canvas().selectBlock(null)
    canvas().selectBlock(id)
    canvas().startEditingBlock(id)
    canvas().stopEditingBlock()

    expect(undoDepth()).toBe(depthBefore)
  })

  it('treats a committed text edit as one step, however long the text', () => {
    const id = canvas().addBlock('heading')
    const depthBefore = undoDepth()

    // The editor holds a local draft and calls the store once, on Enter/blur.
    canvas().setBlockText(id, 'A much longer headline than before')

    expect(undoDepth()).toBe(depthBefore + 1)
  })
})

describe('undo and redo', () => {
  it('restores every step of a 10-action mixed sequence deep-equal, both directions', () => {
    const snapshots: Block[][] = [structuredClone(blocks()) as Block[]]

    const record = () => snapshots.push(structuredClone(blocks()) as Block[])
    const sectionId = canvas().addBlock('section')
    record()
    const headingId = canvas().addBlock('heading')
    record()
    canvas().setBlockText(headingId, 'Welcome to BOSS')
    record()
    const textId = canvas().addBlock('text')
    record()
    canvas().moveBlockBy(headingId, 40, 24)
    record()
    canvas().resizeBlockBy(headingId, 'se', 40, 8)
    record()
    const buttonId = canvas().addBlock('button')
    record()
    canvas().bringBlockForward(sectionId)
    record()
    canvas().deleteBlock(textId)
    record()
    canvas().setBlockText(buttonId, 'Book a call')
    record()

    expect(snapshots).toHaveLength(11)
    expect(undoDepth()).toBe(10)

    // All the way back, asserting the whole document at every single step.
    for (let index = snapshots.length - 2; index >= 0; index -= 1) {
      undo()
      expect(blocks()).toEqual(snapshots[index])
    }
    expect(canUndo(history())).toBe(false)
    expect(blocks()).toEqual([])

    // ...and all the way forward again.
    for (let index = 1; index < snapshots.length; index += 1) {
      redo()
      expect(blocks()).toEqual(snapshots[index])
    }
    expect(canRedo(history())).toBe(false)
  })

  it('clears the redo stack once a new action is taken after an undo', () => {
    canvas().addBlock('heading')
    canvas().addBlock('button')
    undo()
    expect(canRedo(history())).toBe(true)

    canvas().addBlock('image')

    expect(canRedo(history())).toBe(false)
    expect(blocks().map((block) => block.type)).toEqual(['heading', 'image'])
  })

  it('does nothing at either end of the stack', () => {
    const emptyBlocks = blocks()

    undo()
    redo()

    expect(blocks()).toBe(emptyBlocks)
    expect(canUndo(history())).toBe(false)
    expect(canRedo(history())).toBe(false)
  })

  it('keeps the selection when the undone change left the block on the page', () => {
    const id = canvas().addBlock('heading')
    canvas().moveBlockBy(id, 40, 40)

    undo()

    expect(canvas().selectedBlockId).toBe(id)
  })

  it('drops a selection that points at a block the undo took away', () => {
    canvas().addBlock('heading')
    const id = canvas().addBlock('button')
    expect(canvas().selectedBlockId).toBe(id)

    undo()

    expect(blocks()).toHaveLength(1)
    expect(canvas().selectedBlockId).toBeNull()
  })

  it('replaying does not itself become an undo step', () => {
    canvas().addBlock('heading')
    canvas().addBlock('button')
    const depth = undoDepth()

    undo()
    redo()

    expect(undoDepth()).toBe(depth)
  })
})

describe('autosave', () => {
  it('writes once, about a second after the last change', () => {
    canvas().addBlock('heading')
    canvas().addBlock('button')

    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 1)
    expect(storage.entries.has(STORAGE_KEY)).toBe(false)

    vi.advanceTimersByTime(1)
    expect(storage.entries.get(STORAGE_KEY)).toBe(serialiseDocument(getCanvasDocument()))
  })

  it('never writes a design the undo stack has not already recorded', () => {
    const writes: { payload: string; committed: string }[] = []
    const passThrough = storage.setItem.bind(storage)
    storage.setItem = (key, value) => {
      writes.push({ payload: value, committed: serialiseDocument(history().present) })
      passThrough(key, value)
    }

    runTenMixedActions()
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    undo()
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)

    expect(writes.length).toBeGreaterThan(0)
    for (const write of writes) {
      expect(write.payload).toBe(write.committed)
    }
  })

  it('persists an undone state, so a reload does not resurrect it', () => {
    canvas().addBlock('heading')
    canvas().addBlock('button')
    undo()

    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)

    expect(storage.entries.get(STORAGE_KEY)).toBe(serialiseDocument({ blocks: blocks() }))
  })

  it('does not write for a selection change', () => {
    const id = canvas().addBlock('heading')
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    const afterAdd = storage.entries.get(STORAGE_KEY)

    canvas().selectBlock(null)
    canvas().selectBlock(id)
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)

    expect(storage.entries.get(STORAGE_KEY)).toBe(afterAdd)
  })

  it('warns without blocking when the browser refuses the write', () => {
    canvas().addBlock('heading')
    storage.failWrites(quotaExceededError())

    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)

    expect(editor().notice).toMatchObject({ kind: 'save-failed' })
    // The design itself is untouched — the client can carry on working.
    expect(blocks()).toHaveLength(1)
  })

  it('clears its own warning once a later save succeeds', () => {
    canvas().addBlock('heading')
    storage.failWrites(quotaExceededError())
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    expect(editor().notice).toMatchObject({ kind: 'save-failed' })

    storage.failWrites(null)
    canvas().addBlock('button')
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)

    expect(editor().notice).toBeNull()
  })

  it('never wipes the unread recovery warning just because a save worked', () => {
    stopCanvasSession()
    canvas().resetCanvas()
    storage.entries.set(STORAGE_KEY, '{ broken')
    startCanvasSession({ storage })
    expect(editor().notice).toMatchObject({ kind: 'recovered' })

    // The client starts again; one second later the first autosave lands.
    canvas().addBlock('heading')
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)

    expect(editor().notice).toMatchObject({ kind: 'recovered' })
    expect(storage.entries.has(STORAGE_KEY)).toBe(true)
  })

  it('flushes on demand', () => {
    canvas().addBlock('heading')

    flushAutosave()

    expect(storage.entries.has(STORAGE_KEY)).toBe(true)
  })
})

describe('reloading', () => {
  /** Everything a fresh page load does: new store, new session, same storage. */
  function reload(): void {
    stopCanvasSession()
    canvas().resetCanvas()
    startCanvasSession({ storage })
  }

  it('restores the design exactly, with no selection and no history', () => {
    runTenMixedActions()
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    const before = structuredClone(blocks()) as Block[]

    reload()

    expect(blocks()).toEqual(before)
    expect(canvas().selectedBlockId).toBeNull()
    expect(canvas().editingBlockId).toBeNull()
    expect(canUndo(history())).toBe(false)
    expect(canRedo(history())).toBe(false)
    expect(editor().notice).toBeNull()
  })

  it('starts fresh and quarantines the file when the payload is corrupt', () => {
    const corrupt = '{ not a blueprint'
    storage.entries.set(STORAGE_KEY, corrupt)

    reload()

    expect(blocks()).toEqual([])
    expect(storage.entries.get(RECOVERY_KEY)).toBe(corrupt)
    expect(editor().notice).toMatchObject({ kind: 'recovered' })
  })

  it('starts fresh and quarantines the file when the schema is unknown', () => {
    const future = JSON.stringify({ schemaVersion: 999, blocks: [] })
    storage.entries.set(STORAGE_KEY, future)

    reload()

    expect(blocks()).toEqual([])
    expect(storage.entries.get(RECOVERY_KEY)).toBe(future)
    expect(editor().notice).toMatchObject({ kind: 'recovered' })
  })

  it('runs without persistence at all rather than failing to start', () => {
    stopCanvasSession()
    canvas().resetCanvas()
    startCanvasSession({ storage: null })

    canvas().addBlock('heading')
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)

    expect(blocks()).toHaveLength(1)
    expect(editor().notice).toMatchObject({ kind: 'unavailable' })
  })
})

describe('start over', () => {
  it('clears the design, the history and the stored state', () => {
    runTenMixedActions()
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)
    expect(storage.entries.has(STORAGE_KEY)).toBe(true)

    startOver()

    expect(blocks()).toEqual([])
    expect(canvas().selectedBlockId).toBeNull()
    expect(canUndo(history())).toBe(false)
    expect(canRedo(history())).toBe(false)
    expect(storage.entries.has(STORAGE_KEY)).toBe(false)
    expect(storage.entries.has(RECOVERY_KEY)).toBe(false)
  })

  it('cannot be undone back into the old design', () => {
    canvas().addBlock('heading')

    startOver()
    undo()

    expect(blocks()).toEqual([])
  })

  it('leaves storage cleared even though the reset itself queued an autosave', () => {
    canvas().addBlock('heading')
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS)

    startOver()
    vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 2)

    expect(storage.entries.has(STORAGE_KEY)).toBe(false)
  })

  it('clears any standing notice', () => {
    editor().setNotice({ kind: 'near-quota', message: 'Getting big.' })

    startOver()

    expect(editor().notice).toBeNull()
  })
})
