import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resetBlockIdSequence } from '../canvas/blockFactory.ts'
import { createFakeStorage } from '../test/fakeStorage.ts'
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
    expect(editor().notice?.message).toMatch(/getting large/i)
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
