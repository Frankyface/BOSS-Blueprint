import { describe, expect, it } from 'vitest'

import { BLUEPRINT_SCHEMA_VERSION, serialiseDocument } from '../canvas/blueprintFile.ts'
import type { Block, CanvasDocument } from '../canvas/types.ts'
import { createFakeStorage, quotaExceededError } from '../test/fakeStorage.ts'

import {
  RECOVERY_KEY,
  STORAGE_KEY,
  STORAGE_WARNING_BYTES,
  clearStoredDocument,
  loadDocument,
  payloadByteSize,
  saveDocument,
} from './canvasStorage.ts'

const block = (overrides: Partial<Block> = {}): Block => ({
  id: 'block-1',
  type: 'heading',
  x: 80,
  y: 120,
  width: 640,
  height: 72,
  text: 'Welcome',
  ...overrides,
})

const documentOf = (...blocks: Block[]): CanvasDocument => ({ blocks })

describe('saveDocument', () => {
  it('writes the serialised document under the versioned key', () => {
    const storage = createFakeStorage()
    const document = documentOf(block())

    const outcome = saveDocument(storage, document)

    expect(outcome.status).toBe('saved')
    expect(storage.entries.get(STORAGE_KEY)).toBe(serialiseDocument(document))
  })

  it('reports a quota failure instead of losing the write silently', () => {
    const storage = createFakeStorage()
    storage.failWrites(quotaExceededError())

    const outcome = saveDocument(storage, documentOf(block()))

    expect(outcome.status).toBe('quota-exceeded')
    expect(storage.entries.has(STORAGE_KEY)).toBe(false)
  })

  it('warns before the quota when a design gets large', () => {
    const storage = createFakeStorage()
    // One block whose text alone pushes the payload past the warning threshold.
    const oversizedText = 'x'.repeat(STORAGE_WARNING_BYTES)
    const outcome = saveDocument(storage, documentOf(block({ text: oversizedText })))

    expect(outcome.status).toBe('near-quota')
    // Still written: a warning, not a refusal.
    expect(storage.entries.has(STORAGE_KEY)).toBe(true)
  })

  it('reports any other write failure rather than throwing', () => {
    const storage = createFakeStorage()
    storage.failWrites(new Error('Storage is read-only here.'))

    const outcome = saveDocument(storage, documentOf(block()))

    expect(outcome).toMatchObject({ status: 'unavailable' })
  })

  it('says so when there is no storage at all', () => {
    expect(saveDocument(null, documentOf(block()))).toMatchObject({ status: 'unavailable' })
  })
})

describe('loadDocument', () => {
  it('reports an empty slot as empty, not as an error', () => {
    expect(loadDocument(createFakeStorage())).toEqual({ status: 'empty' })
  })

  it('restores exactly what was saved', () => {
    const storage = createFakeStorage()
    const document = documentOf(block(), block({ id: 'block-2', type: 'section', text: '' }))
    saveDocument(storage, document)

    const outcome = loadDocument(storage)

    expect(outcome.status).toBe('loaded')
    if (outcome.status !== 'loaded') return
    expect(outcome.document).toEqual(document)
  })

  it('says so when there is no storage at all', () => {
    expect(loadDocument(null)).toMatchObject({ status: 'unavailable' })
  })
})

describe('failing safe on a bad payload', () => {
  it('quarantines corrupt JSON under the recovery key instead of overwriting it', () => {
    const corrupt = '{ this is not json'
    const storage = createFakeStorage({ [STORAGE_KEY]: corrupt })

    const outcome = loadDocument(storage)

    expect(outcome.status).toBe('recovered')
    expect(storage.entries.get(RECOVERY_KEY)).toBe(corrupt)
    // The main slot is freed so the next autosave has somewhere to go.
    expect(storage.entries.has(STORAGE_KEY)).toBe(false)
  })

  it('quarantines a payload written by an unknown schema version', () => {
    const future = JSON.stringify({ schemaVersion: BLUEPRINT_SCHEMA_VERSION + 1, blocks: [] })
    const storage = createFakeStorage({ [STORAGE_KEY]: future })

    const outcome = loadDocument(storage)

    expect(outcome.status).toBe('recovered')
    expect(storage.entries.get(RECOVERY_KEY)).toBe(future)
  })

  it('leaves the original payload alone when even quarantining fails', () => {
    const corrupt = '{ broken'
    const storage = createFakeStorage({ [STORAGE_KEY]: corrupt })
    storage.failWrites(quotaExceededError())

    const outcome = loadDocument(storage)

    expect(outcome.status).toBe('recovered')
    expect(storage.entries.get(STORAGE_KEY)).toBe(corrupt)
  })

  it('a later save then replaces the freed slot, leaving the recovery copy intact', () => {
    const corrupt = '{ broken'
    const storage = createFakeStorage({ [STORAGE_KEY]: corrupt })
    loadDocument(storage)

    saveDocument(storage, documentOf(block()))

    expect(storage.entries.get(RECOVERY_KEY)).toBe(corrupt)
    expect(storage.entries.get(STORAGE_KEY)).toBe(serialiseDocument(documentOf(block())))
  })
})

describe('clearStoredDocument', () => {
  it('removes both the design and any quarantined copy', () => {
    const storage = createFakeStorage({ [STORAGE_KEY]: 'a', [RECOVERY_KEY]: 'b' })

    clearStoredDocument(storage)

    expect(storage.entries.size).toBe(0)
  })

  it('is a no-op without storage', () => {
    expect(() => clearStoredDocument(null)).not.toThrow()
  })
})

describe('payloadByteSize', () => {
  it('counts UTF-16 code units, which is what localStorage bills for', () => {
    expect(payloadByteSize('abcd')).toBe(8)
    expect(payloadByteSize('')).toBe(0)
  })
})
