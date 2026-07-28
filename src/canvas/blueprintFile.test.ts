import { describe, expect, it } from 'vitest'

import {
  BLUEPRINT_SCHEMA_VERSION,
  emptyDocument,
  parseBlueprint,
  serialiseDocument,
} from './blueprintFile.ts'
import type { Block, CanvasDocument } from './types.ts'

const block = (overrides: Partial<Block> = {}): Block => ({
  id: 'block-1',
  type: 'heading',
  x: 80,
  y: 120,
  width: 640,
  height: 72,
  text: 'Welcome to BOSS',
  ...overrides,
})

const documentOf = (...blocks: Block[]): CanvasDocument => ({ blocks })

/** Serialise a hand-built payload so the corrupt cases read as real files. */
function payload(value: unknown): string {
  return JSON.stringify(value)
}

describe('serialiseDocument', () => {
  it('stamps the schema version onto every payload', () => {
    const parsed: unknown = JSON.parse(serialiseDocument(documentOf(block())))

    expect(parsed).toMatchObject({ schemaVersion: BLUEPRINT_SCHEMA_VERSION })
  })

  it('serialises an empty document', () => {
    const result = parseBlueprint(serialiseDocument(emptyDocument()))

    expect(result).toEqual({ status: 'ok', document: { blocks: [] } })
  })
})

describe('round trip', () => {
  it('restores a multi-block document deep-equal', () => {
    const original = documentOf(
      block({ id: 'a', type: 'section', text: '' }),
      block({ id: 'b', type: 'nav-bar', text: 'Home, About' }),
      block({ id: 'c', type: 'text', x: 0, y: -40, width: 1, height: 1, text: 'Copy' }),
    )
    const snapshot = structuredClone(original)

    const result = parseBlueprint(serialiseDocument(original))

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.document).toEqual(snapshot)
    // Parsing must produce fresh objects, never alias the input.
    expect(result.document.blocks).not.toBe(original.blocks)
  })

  it('survives a second trip through the format unchanged', () => {
    const original = documentOf(block(), block({ id: 'block-2', type: 'button' }))

    const once = parseBlueprint(serialiseDocument(original))
    expect(once.status).toBe('ok')
    if (once.status !== 'ok') return

    const twice = parseBlueprint(serialiseDocument(once.document))

    expect(twice).toEqual(once)
  })
})

describe('corrupt payloads', () => {
  it('rejects text that is not JSON', () => {
    expect(parseBlueprint('{not json at all')).toMatchObject({ status: 'corrupt' })
  })

  it('rejects JSON that is not a blueprint object', () => {
    expect(parseBlueprint('[]')).toMatchObject({ status: 'corrupt' })
    expect(parseBlueprint('"hello"')).toMatchObject({ status: 'corrupt' })
    expect(parseBlueprint('null')).toMatchObject({ status: 'corrupt' })
  })

  it('rejects a payload with no schema version', () => {
    expect(parseBlueprint(payload({ blocks: [] }))).toMatchObject({ status: 'corrupt' })
  })

  it('rejects a payload whose blocks are not a list', () => {
    const raw = payload({ schemaVersion: BLUEPRINT_SCHEMA_VERSION, blocks: { first: block() } })

    expect(parseBlueprint(raw)).toMatchObject({ status: 'corrupt' })
  })

  it('rejects an unknown block type rather than rendering nothing for it', () => {
    const raw = payload({
      schemaVersion: BLUEPRINT_SCHEMA_VERSION,
      blocks: [{ ...block(), type: 'carousel' }],
    })

    expect(parseBlueprint(raw)).toMatchObject({ status: 'corrupt' })
  })

  it.each([
    ['a missing id', { id: undefined }],
    ['an empty id', { id: '' }],
    ['a non-numeric position', { x: '80' }],
    ['a NaN position', { y: Number.NaN }],
    ['a zero width', { width: 0 }],
    ['a negative height', { height: -10 }],
    ['a non-string text', { text: 42 }],
  ])('rejects a block with %s', (_label, overrides) => {
    const raw = payload({
      schemaVersion: BLUEPRINT_SCHEMA_VERSION,
      blocks: [{ ...block(), ...overrides }],
    })

    expect(parseBlueprint(raw)).toMatchObject({ status: 'corrupt' })
  })

  it('rejects duplicate block ids', () => {
    const raw = payload({
      schemaVersion: BLUEPRINT_SCHEMA_VERSION,
      blocks: [block({ id: 'same' }), block({ id: 'same' })],
    })

    expect(parseBlueprint(raw)).toMatchObject({ status: 'corrupt' })
  })

  it('always explains itself, so the notice can say something useful', () => {
    const result = parseBlueprint('{oops')

    expect(result.status).toBe('corrupt')
    if (result.status !== 'corrupt') return
    expect(result.reason.length).toBeGreaterThan(0)
  })
})

describe('version mismatch', () => {
  it('reports a newer schema separately from corruption', () => {
    const future = BLUEPRINT_SCHEMA_VERSION + 1
    const raw = payload({ schemaVersion: future, blocks: [block()] })

    const result = parseBlueprint(raw)

    expect(result.status).toBe('unsupported-version')
    if (result.status !== 'unsupported-version') return
    expect(result.version).toBe(future)
    expect(result.reason).toContain(String(future))
  })

  it('reports an older schema the same way', () => {
    const raw = payload({ schemaVersion: 0, blocks: [] })

    expect(parseBlueprint(raw)).toMatchObject({ status: 'unsupported-version', version: 0 })
  })
})
