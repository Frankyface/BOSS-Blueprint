import { BLOCK_TYPES } from '../constants/blockTypes.ts'

import type { Block, BlockTypeId, CanvasDocument } from './types.ts'

/**
 * THE `.blueprint` FILE FORMAT.
 *
 * This module is the single definition of how a BOSS Blueprint document is written
 * down and read back. Autosave uses it today; Stage 2's export/import and Stage 3's
 * site.json build package use the very same functions, so there is exactly one
 * place where the on-disk shape can drift.
 *
 * It is pure: string in, value out, no storage and no globals. Everything crossing
 * this boundary is untrusted (a hand-edited localStorage entry, a file dragged in
 * from another machine, a payload written by a future version), so parsing
 * validates every field and never trusts `JSON.parse`'s `any`.
 */

/**
 * Bumped only when the document shape changes incompatibly. It travels INSIDE the
 * payload — an older build meeting a newer payload reads this field, fails safe and
 * keeps the data, which it could not do if the version only lived in the key.
 */
export const BLUEPRINT_SCHEMA_VERSION = 1

export interface BlueprintFile {
  readonly schemaVersion: number
  readonly blocks: readonly Block[]
}

export type BlueprintParseResult =
  | { readonly status: 'ok'; readonly document: CanvasDocument }
  /** Unreadable: not JSON, wrong shape, or a block that fails validation. */
  | { readonly status: 'corrupt'; readonly reason: string }
  /** Readable, but written by a schema this build does not understand. */
  | {
      readonly status: 'unsupported-version'
      readonly reason: string
      readonly version: number
    }

const KNOWN_BLOCK_TYPES: ReadonlySet<string> = new Set(
  BLOCK_TYPES.map((definition) => definition.id),
)

export function emptyDocument(): CanvasDocument {
  return { blocks: [] }
}

export function serialiseDocument(document: CanvasDocument): string {
  const file: BlueprintFile = {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    blocks: document.blocks,
  }
  return JSON.stringify(file)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBlockTypeId(value: unknown): value is BlockTypeId {
  return typeof value === 'string' && KNOWN_BLOCK_TYPES.has(value)
}

/** One block, field by field. `null` means "this payload cannot be trusted". */
function parseBlock(value: unknown): Block | null {
  if (!isRecord(value)) return null

  const { id, type, x, y, width, height, text } = value

  if (typeof id !== 'string' || id.length === 0) return null
  if (!isBlockTypeId(type)) return null
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null
  if (!isFiniteNumber(width) || width <= 0) return null
  if (!isFiniteNumber(height) || height <= 0) return null
  if (typeof text !== 'string') return null

  return { id, type, x, y, width, height, text }
}

function corrupt(reason: string): BlueprintParseResult {
  return { status: 'corrupt', reason }
}

/**
 * Read a serialised document back. Never throws: the caller decides what a bad
 * payload means, and for autosave that decision is "start fresh, keep the file".
 */
export function parseBlueprint(raw: string): BlueprintParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return corrupt('The saved design is not valid JSON.')
  }

  if (!isRecord(parsed)) return corrupt('The saved design is not a blueprint object.')

  const { schemaVersion, blocks } = parsed

  if (!isFiniteNumber(schemaVersion)) {
    return corrupt('The saved design has no schema version.')
  }

  if (schemaVersion !== BLUEPRINT_SCHEMA_VERSION) {
    return {
      status: 'unsupported-version',
      version: schemaVersion,
      reason: `The saved design was made by a different version of BOSS Blueprint (schema ${String(schemaVersion)}, this build reads ${String(BLUEPRINT_SCHEMA_VERSION)}).`,
    }
  }

  if (!Array.isArray(blocks)) return corrupt('The saved design has no list of blocks.')

  const parsedBlocks: Block[] = []
  for (const candidate of blocks) {
    const block = parseBlock(candidate)
    if (!block) return corrupt('The saved design contains a block that could not be read.')
    parsedBlocks.push(block)
  }

  // Ids double as React keys and as the handle every action takes, so a duplicate
  // is a corrupt document rather than something to silently render.
  if (new Set(parsedBlocks.map((block) => block.id)).size !== parsedBlocks.length) {
    return corrupt('The saved design contains duplicate block ids.')
  }

  return { status: 'ok', document: { blocks: parsedBlocks } }
}
