import { parseBlocks } from './blueprintBlock.ts'
import { PAGE_EXTRA_SPACE_MAX_PX } from './constants.ts'
import { createPage, HOME_PAGE_NAME, normalisePageName } from './pages.ts'
import { parsePenStrokes } from './penStrokes.ts'
import { emptySiteSettings, parseSiteSettings } from './siteSettings.ts'
import type { Block, CanvasDocument, Page, SiteSettings } from './types.ts'

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
 *
 * **2 — pages.** Version 1 was a single `{ blocks }` canvas; version 2 is
 * `{ siteSettings, pages[] }`. Version 1 payloads are MIGRATED on read (§below),
 * never quarantined: a client who sketched a page yesterday must find it here
 * today. Quarantine is reserved for payloads that are corrupt or written by a
 * version this build has never heard of.
 *
 * **ADDITIVE FIELDS DO NOT BUMP THIS.** The pen layer's `page.penStrokes`, the
 * image slot's `imageData`/`fit`/`description` and the page's `extraBottomPx` all
 * arrived after v2 shipped and all default cleanly when absent, so a v2 payload
 * written last week still parses to exactly the design it described (and an older
 * build meeting a page with added space reads it as a page without any, which is a
 * page that is 400px shorter, not a page that is lost). A bump means "older builds must not read
 * this", which costs every one of them their client's work — it is reserved for
 * changes that genuinely break, not for fields that grow.
 */
export const BLUEPRINT_SCHEMA_VERSION = 2

/** Older versions this build can read by migrating them forward. */
export const MIGRATABLE_SCHEMA_VERSIONS: readonly number[] = [1]

/** The page a migrated schema-1 canvas becomes. */
export const MIGRATED_PAGE_NAME = HOME_PAGE_NAME

export interface BlueprintFile {
  readonly schemaVersion: number
  readonly siteSettings: SiteSettings
  readonly pages: readonly Page[]
}

export type BlueprintParseResult =
  | {
      readonly status: 'ok'
      readonly document: CanvasDocument
      /** The version it was written as, when that was older than this build's. */
      readonly migratedFrom: number | null
    }
  /** Unreadable: not JSON, wrong shape, or a field that fails validation. */
  | { readonly status: 'corrupt'; readonly reason: string }
  /** Readable, but written by a schema this build does not understand. */
  | {
      readonly status: 'unsupported-version'
      readonly reason: string
      readonly version: number
    }

export function serialiseDocument(document: CanvasDocument): string {
  const file: BlueprintFile = {
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    siteSettings: document.siteSettings,
    pages: document.pages,
  }
  return JSON.stringify(file)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function corrupt(reason: string): BlueprintParseResult {
  return { status: 'corrupt', reason }
}

function ok(document: CanvasDocument, migratedFrom: number | null): BlueprintParseResult {
  return { status: 'ok', document, migratedFrom }
}

/**
 * `page.extraBottomPx` — the empty room the client added below their content.
 *
 * Mirrors `parseTemplateFlag`'s absent-is-the-one-shape rule (`blueprintBlock.ts`):
 * a finite number inside the allowed range rounds to whole pixels and survives, and
 * EVERYTHING else — absent, null, zero, negative, NaN, a string, a value past the
 * cap — normalises to ABSENT.
 *
 * Normalised rather than refused, which is the opposite of how this file treats a
 * bad block. The asymmetry is deliberate and is about what the client loses: a
 * nonsense amount here costs them empty space, so quarantining the whole design
 * over it would be by far the more destructive answer.
 */
function parseExtraBottom(value: unknown): number | undefined {
  if (!isFiniteNumber(value)) return undefined

  const rounded = Math.round(value)
  if (rounded <= 0 || rounded > PAGE_EXTRA_SPACE_MAX_PX) return undefined
  return rounded
}

function parsePage(value: unknown): Page | null {
  if (!isRecord(value)) return null

  const { id, name } = value
  if (typeof id !== 'string' || id.length === 0) return null
  if (typeof name !== 'string') return null

  const pageName = normalisePageName(name)
  if (pageName.length === 0) return null

  const blocks = parseBlocks(value.blocks)
  if (blocks === null) return null

  // Absent = a page saved before the pen layer existed. That is not corruption,
  // it is a page with no marks on it.
  const penStrokes = parsePenStrokes(value.penStrokes)
  if (penStrokes === null) return null

  const page: Page = { id, name: pageName, blocks, penStrokes }
  const extraBottomPx = parseExtraBottom(value.extraBottomPx)
  return extraBottomPx === undefined ? page : { ...page, extraBottomPx }
}

/** Ids are React keys and the handle every action takes — a repeat is corruption. */
function hasDuplicates(ids: readonly string[]): boolean {
  return new Set(ids).size !== ids.length
}

function allBlockIds(pages: readonly Page[]): readonly string[] {
  return pages.flatMap((page) => page.blocks.map((block: Block) => block.id))
}

function allStrokeIds(pages: readonly Page[]): readonly string[] {
  return pages.flatMap((page) => page.penStrokes.map((stroke) => stroke.id))
}

/** The current shape: `{ schemaVersion: 2, siteSettings, pages[] }`. */
function parseCurrent(parsed: Record<string, unknown>): BlueprintParseResult {
  const siteSettings = parseSiteSettings(parsed.siteSettings)
  if (!siteSettings) return corrupt('The saved design has unreadable site settings.')

  const rawPages = parsed.pages
  if (!Array.isArray(rawPages)) return corrupt('The saved design has no list of pages.')
  if (rawPages.length === 0) return corrupt('The saved design has no pages in it.')

  const pages: Page[] = []
  for (const candidate of rawPages) {
    const page = parsePage(candidate)
    if (!page) return corrupt('The saved design contains a page that could not be read.')
    pages.push(page)
  }

  if (hasDuplicates(pages.map((page) => page.id))) {
    return corrupt('The saved design contains duplicate page ids.')
  }

  // Site-wide, not per page: the export numbers blocks across the whole site
  // (§4.8), so two pages sharing a block id would collide there too.
  if (hasDuplicates(allBlockIds(pages))) {
    return corrupt('The saved design contains duplicate block ids.')
  }

  // Strokes are numbered site-wide at export too (§4.8), so the same rule applies.
  if (hasDuplicates(allStrokeIds(pages))) {
    return corrupt('The saved design contains duplicate pen stroke ids.')
  }

  return ok({ siteSettings, pages }, null)
}

/**
 * MIGRATION — schema 1 (`{ blocks }`) becomes schema 2's single page named "Home".
 *
 * Nothing is invented and nothing is dropped: the blocks come through the same
 * per-field validator as a current payload (which is also what fills in the new
 * per-type defaults — copy mode `real`, unlinked buttons, nav items derived from
 * the comma-separated labels the old build stored in `text`), and site settings
 * start empty because version 1 had nowhere to put them.
 */
function parseLegacyV1(parsed: Record<string, unknown>): BlueprintParseResult {
  const blocks = parseBlocks(parsed.blocks)
  if (blocks === null) {
    if (!Array.isArray(parsed.blocks)) return corrupt('The saved design has no list of blocks.')
    return corrupt('The saved design contains a block that could not be read.')
  }

  if (hasDuplicates(blocks.map((block) => block.id))) {
    return corrupt('The saved design contains duplicate block ids.')
  }

  const home = createPage(MIGRATED_PAGE_NAME, [], blocks)
  return ok({ siteSettings: emptySiteSettings(), pages: [home] }, 1)
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

  const { schemaVersion } = parsed

  if (!isFiniteNumber(schemaVersion)) {
    return corrupt('The saved design has no schema version.')
  }

  if (schemaVersion === BLUEPRINT_SCHEMA_VERSION) return parseCurrent(parsed)
  if (MIGRATABLE_SCHEMA_VERSIONS.includes(schemaVersion)) return parseLegacyV1(parsed)

  return {
    status: 'unsupported-version',
    version: schemaVersion,
    reason: `The saved design was made by a different version of BOSS Blueprint (schema ${String(schemaVersion)}, this build reads ${String(BLUEPRINT_SCHEMA_VERSION)}).`,
  }
}
