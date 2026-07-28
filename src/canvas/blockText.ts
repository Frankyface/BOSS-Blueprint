import { getBlockTypeDefinition } from '../constants/blockTypes.ts'

import type { Block } from './types.ts'

/** Separator between Nav bar items in the single text field the client edits. */
export const NAV_ITEM_SEPARATOR = ','

/**
 * Text committed by the client, or the type's placeholder while it is still empty.
 * Rendering the placeholder (rather than seeding `text` with it) keeps "the client
 * actually wrote this" recoverable from the document.
 */
export function displayText(block: Block): string {
  const trimmed = block.text.trim()
  return trimmed.length > 0 ? trimmed : getBlockTypeDefinition(block.type).placeholderText
}

export function isShowingPlaceholder(block: Block): boolean {
  return block.text.trim().length === 0
}

/** A Nav bar's labels come from one comma-separated string: "Home, About, Contact". */
export function parseNavItems(text: string): readonly string[] {
  return text
    .split(NAV_ITEM_SEPARATOR)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

/** Text is stored trimmed — trailing whitespace is never meaningful in a sketch. */
export function normaliseBlockText(text: string): string {
  return text.trim()
}
