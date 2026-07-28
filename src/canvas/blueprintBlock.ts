import { DEFAULT_COPY_MODE, isCopyBlockType } from './blockEdits.ts'
import { DEFAULT_IMAGE_FIT, isImageDataUrl, isImageFit } from './imageAssets.ts'
import { NO_LINK, parseLink } from './links.ts'
import { NAV_ITEMS_SCHEMA_MAX, navItemsFromText, parseNavItem, withNavItems } from './navItems.ts'
import type { Block, BlockTypeId, CopyMode, NavItem } from './types.ts'
import { BLOCK_TYPES } from '../constants/blockTypes.ts'

/**
 * ONE BLOCK, field by field — the untrusted-input boundary for everything inside
 * a `.blueprint` payload.
 *
 * It does two jobs at once, deliberately:
 *
 * 1. **Validation.** Anything malformed returns `null`, which the caller turns
 *    into a corrupt-file outcome. Fields are never coerced into shape.
 * 2. **Normalisation, which IS the schema-1 → 2 migration.** A block written by
 *    the old build simply has none of the copy/link/nav fields, so filling in the
 *    per-type defaults here is all a migrated block needs — no separate migration
 *    path to keep in step with this one.
 *
 * The returned object is built key by key, so fields that do not belong to a type
 * (a `link` on a heading, say) are dropped rather than carried into the export.
 */

const KNOWN_BLOCK_TYPES: ReadonlySet<string> = new Set(BLOCK_TYPES.map((entry) => entry.id))

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isBlockTypeId(value: unknown): value is BlockTypeId {
  return typeof value === 'string' && KNOWN_BLOCK_TYPES.has(value)
}

function parseCopyMode(value: unknown): CopyMode | null {
  if (value === undefined || value === null) return DEFAULT_COPY_MODE
  if (value === 'real' || value === 'generate') return value
  return null
}

/** Optional free text: absent is empty, present-but-not-a-string is corruption. */
function parseOptionalText(value: unknown): string | null {
  if (value === undefined || value === null) return ''
  return typeof value === 'string' ? value : null
}

/**
 * A slot's photo. Absent is an empty slot; present must be a `data:` URL of one of
 * the three raster types (`imageAssets.ts`). That check is a SECURITY boundary as
 * much as a validation one: a `.blueprint` file is untrusted input, and a
 * `data:image/svg+xml` or `data:text/html` URL rendered into an `<img>` on our own
 * origin is a script-injection vector.
 */
function parseImageData(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return ''
  return isImageDataUrl(value) ? value : null
}

function parseNavItems(value: unknown): readonly NavItem[] | null {
  if (!Array.isArray(value)) return null
  if (value.length > NAV_ITEMS_SCHEMA_MAX) return null

  const items: NavItem[] = []
  for (const candidate of value) {
    const item = parseNavItem(candidate)
    if (!item) return null
    items.push(item)
  }

  if (new Set(items.map((item) => item.id)).size !== items.length) return null
  return items
}

/** Add the fields that belong to this block's type, defaulting what is missing. */
function withTypeFields(base: Block, value: Record<string, unknown>): Block | null {
  if (isCopyBlockType(base.type)) {
    const copyMode = parseCopyMode(value.copyMode)
    const generateDescription = parseOptionalText(value.generateDescription)
    const lengthHint = parseOptionalText(value.lengthHint)
    if (copyMode === null || generateDescription === null || lengthHint === null) return null

    return { ...base, copyMode, generateDescription, lengthHint }
  }

  if (base.type === 'button') {
    if (value.link === undefined || value.link === null) return { ...base, link: NO_LINK }
    const link = parseLink(value.link)
    return link === null ? null : { ...base, link }
  }

  if (base.type === 'image') {
    const imageData = parseImageData(value.imageData)
    const description = parseOptionalText(value.description)
    // Verbatim, untrimmed: it is the client's own filename, metadata for the
    // export manifest (§4.6) and never a path.
    const originalFilename = parseOptionalText(value.originalFilename)
    if (imageData === null || description === null || originalFilename === null) return null

    // An unknown fit is corruption, but a MISSING one is just a pre-upload block.
    if (value.fit !== undefined && value.fit !== null && !isImageFit(value.fit)) return null
    const fit = isImageFit(value.fit) ? value.fit : DEFAULT_IMAGE_FIT

    return { ...base, imageData, originalFilename, fit, description }
  }

  if (base.type === 'nav-bar') {
    // No `items` at all = a schema-1 nav bar, whose labels lived in `text`.
    if (value.items === undefined || value.items === null) {
      return withNavItems(base, navItemsFromText(base.text))
    }

    const items = parseNavItems(value.items)
    return items === null ? null : withNavItems(base, items)
  }

  return base
}

/** One block. `null` means "this payload cannot be trusted". */
export function parseBlock(value: unknown): Block | null {
  if (!isRecord(value)) return null

  const { id, type, x, y, width, height, text } = value

  if (typeof id !== 'string' || id.length === 0) return null
  if (!isBlockTypeId(type)) return null
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null
  if (!isFiniteNumber(width) || width <= 0) return null
  if (!isFiniteNumber(height) || height <= 0) return null
  if (typeof text !== 'string') return null

  return withTypeFields({ id, type, x, y, width, height, text }, value)
}

/** A whole page's worth. `null` on the first block that fails. */
export function parseBlocks(value: unknown): readonly Block[] | null {
  if (!Array.isArray(value)) return null

  const blocks: Block[] = []
  for (const candidate of value) {
    const block = parseBlock(candidate)
    if (!block) return null
    blocks.push(block)
  }

  return blocks
}
