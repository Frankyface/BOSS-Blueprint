import { linksEqual, NO_LINK } from './links.ts'
import { createNavItem, navItemsFromText, withNavItems } from './navItems.ts'
import type { Block, BlockLink, BlockTypeId, CopyMode, NavItem } from './types.ts'

/**
 * Pure single-block edits: copy mode, link target, nav items — plus the equality
 * rule the store uses to decide an action changed nothing.
 *
 * Every function takes a block and returns a block. No store, no React, and the
 * only ids minted come from the nav-item factory.
 */

/** Heading and Text are the copy blocks (`docs/export-format.md` §2.7). */
const COPY_BLOCK_TYPES: ReadonlySet<BlockTypeId> = new Set<BlockTypeId>(['heading', 'text'])

export const COPY_MODES: readonly CopyMode[] = ['real', 'generate']

/** A block carries the client's own words until they say otherwise. */
export const DEFAULT_COPY_MODE: CopyMode = 'real'

export function isCopyBlockType(type: BlockTypeId): boolean {
  return COPY_BLOCK_TYPES.has(type)
}

export function isCopyBlock(block: Block): boolean {
  return isCopyBlockType(block.type)
}

export function copyModeOf(block: Block): CopyMode {
  return block.copyMode ?? DEFAULT_COPY_MODE
}

/**
 * Fill in the fields a block's type always carries.
 *
 * The factory runs this on every new block for one reason: a saved-and-reloaded
 * block must be IDENTICAL to the one that was on screen. The parser defaults these
 * same fields on read, so a factory that left them off would quietly change every
 * block's shape at the first reload.
 */
export function withTypeDefaults(block: Block): Block {
  if (isCopyBlock(block)) {
    return {
      copyMode: DEFAULT_COPY_MODE,
      generateDescription: '',
      lengthHint: '',
      ...block,
    }
  }

  if (block.type === 'button') return { link: NO_LINK, ...block }
  if (block.type === 'nav-bar') return withNavItems(block, block.items ?? navItemsFromText(block.text))

  return block
}

/** True when this block is a placeholder Claude has to fill in at build time. */
export function isGenerateBlock(block: Block): boolean {
  return isCopyBlock(block) && copyModeOf(block) === 'generate'
}

/**
 * Switch a copy block's mode.
 *
 * Nothing is thrown away: `text` survives a switch to `generate` (the export
 * contract calls it *context* in that mode) and `generateDescription` survives a
 * switch back to `real`. A client flipping the toggle to see what it does must not
 * lose what they already typed on either side.
 */
export function withCopyMode(block: Block, mode: CopyMode): Block {
  if (!isCopyBlock(block)) return block
  return { ...block, copyMode: mode }
}

export function withGenerateDescription(block: Block, description: string): Block {
  if (!isCopyBlock(block)) return block
  return { ...block, generateDescription: description.trim() }
}

export function withLengthHint(block: Block, hint: string): Block {
  if (!isCopyBlock(block)) return block
  return { ...block, lengthHint: hint.trim() }
}

export function linkOf(block: Block): BlockLink {
  return block.link ?? NO_LINK
}

export function withLink(block: Block, link: BlockLink): Block {
  if (block.type !== 'button') return block
  return { ...block, link }
}

export function navItemsOf(block: Block): readonly NavItem[] {
  return block.items ?? []
}

/** Does this block point anywhere yet? Drives the linked marker on the page. */
export function isLinked(block: Block): boolean {
  if (block.type === 'button') return linkOf(block).kind !== 'none'
  if (block.type === 'nav-bar') return navItemsOf(block).some((item) => item.link.kind !== 'none')
  return false
}

export function withNavItemAdded(block: Block, label: string): Block {
  if (block.type !== 'nav-bar') return block
  return withNavItems(block, [...navItemsOf(block), createNavItem(label)])
}

export function withNavItemRemoved(block: Block, itemId: string): Block {
  if (block.type !== 'nav-bar') return block
  return withNavItems(
    block,
    navItemsOf(block).filter((item) => item.id !== itemId),
  )
}

function withMappedNavItem(block: Block, itemId: string, update: (item: NavItem) => NavItem): Block {
  if (block.type !== 'nav-bar') return block
  return withNavItems(
    block,
    navItemsOf(block).map((item) => (item.id === itemId ? update(item) : item)),
  )
}

export function withNavItemLabel(block: Block, itemId: string, label: string): Block {
  return withMappedNavItem(block, itemId, (item) => ({ ...item, label: label.trim() }))
}

export function withNavItemLink(block: Block, itemId: string, link: BlockLink): Block {
  return withMappedNavItem(block, itemId, (item) => ({ ...item, link }))
}

function navItemsEqual(a: readonly NavItem[], b: readonly NavItem[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false

  return a.every((item, index) => {
    const other = b[index]
    if (!other) return false
    return item.id === other.id && item.label === other.label && linksEqual(item.link, other.link)
  })
}

/**
 * Do these two blocks describe the same thing?
 *
 * The store returns the ORIGINAL array when an update changed nothing, so a no-op
 * gesture never churns React or lands on the undo stack. That promise is only as
 * good as this comparison, so it covers every field of every type.
 */
export function blocksEqual(a: Block, b: Block): boolean {
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    a.text === b.text &&
    copyModeOf(a) === copyModeOf(b) &&
    (a.generateDescription ?? '') === (b.generateDescription ?? '') &&
    (a.lengthHint ?? '') === (b.lengthHint ?? '') &&
    linksEqual(linkOf(a), linkOf(b)) &&
    navItemsEqual(navItemsOf(a), navItemsOf(b))
  )
}
