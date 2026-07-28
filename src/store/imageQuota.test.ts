import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetBlockIdSequence } from '../canvas/blockFactory.ts'
import { createFakeStorage, quotaExceededError } from '../test/fakeStorage.ts'
import type { FakeStorage } from '../test/fakeStorage.ts'

import { flushAutosave, startCanvasSession, stopCanvasSession } from './canvasSession.ts'
import { useCanvasStore } from './canvasStore.ts'
import { payloadByteSize, STORAGE_KEY, STORAGE_WARNING_BYTES } from './canvasStorage.ts'
import { useEditorStore } from './editorStore.ts'

/**
 * IMAGES MEET THE STORAGE BUDGET.
 *
 * Uploads are the first thing this tool stores that is measured in hundreds of
 * kilobytes, so the near-quota warning stops being a theoretical guardrail and
 * becomes the one that actually fires. This proves the two halves join up: a few
 * compressed photos really do push the payload past the 4MB warning line, and the
 * client really is told before the browser starts refusing writes.
 */

const canvas = () => useCanvasStore.getState()
const editor = () => useEditorStore.getState()

/**
 * A stand-in for one compressed upload — a 1600px-long-edge JPEG at q0.8 is
 * typically 250–400KB, which is ~340–550K base64 characters.
 */
const COMPRESSED_PHOTO_CHARS = 450_000

function photoDataUrl(): string {
  return `data:image/jpeg;base64,${'A'.repeat(COMPRESSED_PHOTO_CHARS)}`
}

function addPhoto(index: number): void {
  const id = canvas().addBlock('image')
  canvas().setBlockImage(id, photoDataUrl(), `photo-${String(index)}.jpg`)
}

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

describe('a design carrying uploaded photos', () => {
  it('says nothing about storage while the design is still small', () => {
    addPhoto(1)
    flushAutosave()

    expect(editor().notice).toBeNull()
  })

  it('warns the client once a few photos push it past the 4MB line', () => {
    // Each photo is ~0.9MB of UTF-16 localStorage, so five clear the warning line.
    for (let index = 1; index <= 5; index += 1) addPhoto(index)
    flushAutosave()

    const stored = storage.getItem(STORAGE_KEY)
    expect(stored).not.toBeNull()
    expect(payloadByteSize(stored ?? '')).toBeGreaterThanOrEqual(STORAGE_WARNING_BYTES)

    expect(editor().notice).toMatchObject({ kind: 'near-quota' })
    expect(editor().notice?.message).toMatch(/nearly as large as your browser will hold/i)
  })

  it('is still SAVED when the warning fires — near-quota is a heads-up, not a failure', () => {
    for (let index = 1; index <= 5; index += 1) addPhoto(index)
    flushAutosave()

    const stored = storage.getItem(STORAGE_KEY) ?? ''
    const parsed = JSON.parse(stored) as { pages: { blocks: { imageData?: string }[] }[] }
    const photos = parsed.pages[0]?.blocks.filter((block) => (block.imageData ?? '').length > 0)

    expect(photos).toHaveLength(5)
  })

  it('clears the warning again once the photos are removed', () => {
    for (let index = 1; index <= 5; index += 1) addPhoto(index)
    flushAutosave()
    expect(editor().notice?.kind).toBe('near-quota')

    for (const block of canvas().pages[0]?.blocks ?? []) canvas().deleteBlock(block.id)
    flushAutosave()

    expect(editor().notice).toBeNull()
  })

  /**
   * THE DROPPED WRITE, on the path that actually causes it (UX audit MAJOR).
   *
   * The audit's client added photos until the browser refused, and reported the
   * blocks "vanishing on reload" with nothing said. This is that exact sequence:
   * the store ACCEPTS the photo (so it is on screen), the autosave that follows is
   * refused by the browser, and the question is whether the client is told. The
   * notice is the only thing standing between them and silent loss, so it is
   * pinned here rather than left to the generic session test.
   */
  it('says so out loud when a photo is accepted but the save that follows is refused', () => {
    addPhoto(1)
    flushAutosave()
    expect(editor().notice).toBeNull()

    storage.failWrites(quotaExceededError())
    addPhoto(2)
    flushAutosave()

    // Told, in terms that lead with the action that rescues everything…
    expect(editor().notice).toMatchObject({ kind: 'save-failed' })
    expect(editor().notice?.message).toMatch(/download your design/i)
    // …and never advises the destructive one.
    expect(editor().notice?.message).not.toMatch(/start over/i)

    // The photo really is in the store and on screen — unsaved, not lost.
    expect(canvas().pages[0]?.blocks).toHaveLength(2)
    // …and it really was NOT written: what is on disk is the one-photo design.
    const stored = storage.getItem(STORAGE_KEY) ?? ''
    const parsed = JSON.parse(stored) as { pages: { blocks: unknown[] }[] }
    expect(parsed.pages[0]?.blocks).toHaveLength(1)
  })

  it('leads with downloading rather than deleting when the warning fires', () => {
    for (let index = 1; index <= 5; index += 1) addPhoto(index)
    flushAutosave()

    expect(editor().notice?.kind).toBe('near-quota')
    expect(editor().notice?.message).toMatch(/download your design/i)
    expect(editor().notice?.message).not.toMatch(/start over|delete/i)
  })

  it('survives the round trip: a restarted session finds every photo and filename', () => {
    addPhoto(1)
    addPhoto(2)
    flushAutosave()

    stopCanvasSession()
    canvas().resetCanvas()
    startCanvasSession({ storage })

    const blocks = canvas().pages[0]?.blocks ?? []
    expect(blocks).toHaveLength(2)
    expect(blocks[0]?.imageData).toBe(photoDataUrl())
    expect(blocks.map((block) => block.originalFilename)).toEqual(['photo-1.jpg', 'photo-2.jpg'])
  })
})
