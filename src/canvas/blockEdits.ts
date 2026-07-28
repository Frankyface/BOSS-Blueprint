import { DEFAULT_IMAGE_FIT } from './imageAssets.ts'
import { linksEqual, NO_LINK } from './links.ts'
import {
  createNavItem,
  linkForLabel,
  navItemsFromText,
  normaliseNavLabel,
  withNavItems,
} from './navItems.ts'
import type { PageRef } from './navItems.ts'
import type { Block, BlockLink, BlockTypeId, CopyMode, ImageFit, NavItem } from './types.ts'

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
 *
 * Each field falls back with its own `??` rather than by spreading `block` over a
 * defaults object (review LOW-6). The spread form silently depended on absent keys
 * being ABSENT: a block carrying an explicit `copyMode: undefined` — which is what
 * `{ ...block, copyMode: someUndefinedValue }` produces at runtime, whatever the
 * types say — would overwrite the default with `undefined` and hand back a block
 * missing a field it is supposed to always have. `??` cannot do that.
 */
export function withTypeDefaults(block: Block): Block {
  if (isCopyBlock(block)) {
    return {
      ...block,
      copyMode: block.copyMode ?? DEFAULT_COPY_MODE,
      generateDescription: block.generateDescription ?? '',
      lengthHint: block.lengthHint ?? '',
    }
  }

  if (block.type === 'button') return { ...block, link: block.link ?? NO_LINK }
  if (block.type === 'nav-bar') return withNavItems(block, block.items ?? navItemsFromText(block.text))

  if (block.type === 'image') {
    return {
      ...block,
      imageData: block.imageData ?? '',
      originalFilename: block.originalFilename ?? '',
      fit: block.fit ?? DEFAULT_IMAGE_FIT,
      description: block.description ?? '',
    }
  }

  return block
}

/* --- The template flag ---------------------------------------------------- */

/**
 * WHICH TYPES MAY CARRY `fromTemplate` (`docs/export-format.md` §2.6, v2.3).
 *
 * A section band is a coloured strip: it has no text, no label and no
 * description, so there is nothing about it the client could "touch" and the flag
 * could never clear. A flagged section would therefore make the submit-time
 * untouched-filler warning (V23) permanent for every design that started from a
 * template, however thoroughly the client rewrote it. The spec's answer is a
 * producer-side rule — this one — plus a defensive strip at export.
 */
const TEMPLATE_FLAG_TYPES: ReadonlySet<BlockTypeId> = new Set<BlockTypeId>([
  'heading',
  'text',
  'button',
  'nav-bar',
  'image',
])

export function canCarryTemplateFlag(type: BlockTypeId): boolean {
  return TEMPLATE_FLAG_TYPES.has(type)
}

/** Still showing a starter template's example words, untouched by the client. */
export function isFromTemplate(block: Block): boolean {
  return block.fromTemplate === true && canCarryTemplateFlag(block.type)
}

/**
 * "The client has made this block their own."
 *
 * The key is REMOVED rather than set to `false`, so the flag has exactly two
 * shapes — present-and-true, or absent — and a block that is saved and reloaded
 * comes back identical to the one on screen. (`parseBlock` normalises an explicit
 * `false` from a hand-edited file the same way.) Absent is what a hand-added block
 * has always looked like, so an edited template block becomes indistinguishable
 * from one the client placed themselves, which is exactly what it now is.
 */
export function withTemplateFlagCleared(block: Block): Block {
  if (block.fromTemplate === undefined) return block

  const { fromTemplate, ...rest } = block
  void fromTemplate
  return rest
}

/**
 * THE CLEARING RULE, in one place: **content edits clear the flag; moving and
 * resizing do not** (`docs/export-format.md` §2.6 — "the client never touched its
 * content … moving/resizing doesn't clear it, editing content does").
 *
 * Worth stating why the contract draws the line there rather than at "any change
 * at all". The flag answers one question for Stage 3: *are these still OUR
 * example words?* Dragging our heading four grid squares to the left does not
 * make "Martina's Trattoria" the client's business name — it is still filler, and
 * a brief that stopped saying so because the box moved would be lying to the
 * builder. Retyping it is what makes it theirs.
 *
 * Everything that is not the box's position and size counts as content: the words,
 * the copy mode and its prompt, a button's target, a menu's items, a photo, its
 * fit and its description. Z-ORDER cannot reach here at all — reordering the array
 * never produces a new block object.
 */
export function withTemplateFlagClearedOnEdit(previous: Block, next: Block): Block {
  if (!isFromTemplate(next)) return next
  if (blockContentEqual(previous, next)) return next

  return withTemplateFlagCleared(next)
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

/* --- Image slots ---------------------------------------------------------- */

export function isImageBlock(block: Block): boolean {
  return block.type === 'image'
}

export function imageDataOf(block: Block): string {
  return block.imageData ?? ''
}

export function imageFilenameOf(block: Block): string {
  return block.originalFilename ?? ''
}

export function imageFitOf(block: Block): ImageFit {
  return block.fit ?? DEFAULT_IMAGE_FIT
}

export function imageDescriptionOf(block: Block): string {
  return block.description ?? ''
}

export function hasImage(block: Block): boolean {
  return isImageBlock(block) && imageDataOf(block).length > 0
}

/**
 * Put a photo in the slot, or (with `''`) take it back out.
 *
 * The photo and the name it arrived under move TOGETHER — an emptied slot that
 * kept `originalFilename` would put a filename in the export manifest for an asset
 * that is not in the package.
 *
 * The DESCRIPTION deliberately survives both: a client who uploads a stand-in and
 * then removes it still meant everything they wrote about the picture they want,
 * and an empty slot that still carries a description is the export's "SOURCE AN
 * IMAGE" instruction (§3.2), not an empty box.
 */
export function withImageData(block: Block, imageData: string, originalFilename = ''): Block {
  if (!isImageBlock(block)) return block
  return { ...block, imageData, originalFilename }
}

export function withImageFit(block: Block, fit: ImageFit): Block {
  if (!isImageBlock(block)) return block
  return { ...block, fit }
}

export function withImageDescription(block: Block, description: string): Block {
  if (!isImageBlock(block)) return block
  return { ...block, description: description.trim() }
}

/** Does this block point anywhere yet? Drives the linked marker on the page. */
export function isLinked(block: Block): boolean {
  if (block.type === 'button') return linkOf(block).kind !== 'none'
  if (block.type === 'nav-bar') return navItemsOf(block).some((item) => item.link.kind !== 'none')
  return false
}

/** `pages` is what the new item's label is matched against — see `linkForLabel`. */
export function withNavItemAdded(
  block: Block,
  label: string,
  pages: readonly PageRef[] = [],
): Block {
  if (block.type !== 'nav-bar') return block
  return withNavItems(block, [...navItemsOf(block), createNavItem(label, pages)])
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

/**
 * Rename one menu item.
 *
 * An empty label is REFUSED, not stored: clearing the field is a slip (or a
 * half-finished edit), and a blank menu entry is not something the export can
 * describe or a builder can build — `minLength: 1` in the schema (§2.7). The
 * block comes back unchanged, so it is not even an undo step, and the item keeps
 * the name it had. Removing an item is what the Remove button is for.
 *
 * The label is normalised by `normaliseNavLabel`, which also strips the comma
 * that would otherwise re-split the menu on the next inline text commit.
 *
 * Renaming an item to the name of a page ALSO wires it up — but only while it is
 * still unwired. A link the client has chosen (or one set by an earlier match) is
 * never quietly repointed by a typo in the label: what they said out loud in the
 * dropdown outranks what we can infer from a word.
 */
export function withNavItemLabel(
  block: Block,
  itemId: string,
  label: string,
  pages: readonly PageRef[] = [],
): Block {
  const normalised = normaliseNavLabel(label)
  if (normalised.length === 0) return block

  return withMappedNavItem(block, itemId, (item) => ({
    ...item,
    label: normalised,
    link: item.link.kind === 'none' ? linkForLabel(normalised, pages) : item.link,
  }))
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
 * EVERYTHING ABOUT A BLOCK EXCEPT THE BOX IT SITS IN.
 *
 * Split out of `blocksEqual` because the template flag needs exactly this
 * question — "did the client change anything other than where it is?" — and a
 * second, hand-maintained list of content fields would be the thing that silently
 * fell out of step the next time a field was added.
 */
function blockContentEqual(a: Block, b: Block): boolean {
  return (
    a.id === b.id &&
    a.type === b.type &&
    a.text === b.text &&
    copyModeOf(a) === copyModeOf(b) &&
    (a.generateDescription ?? '') === (b.generateDescription ?? '') &&
    (a.lengthHint ?? '') === (b.lengthHint ?? '') &&
    linksEqual(linkOf(a), linkOf(b)) &&
    navItemsEqual(navItemsOf(a), navItemsOf(b)) &&
    imageDataOf(a) === imageDataOf(b) &&
    imageFilenameOf(a) === imageFilenameOf(b) &&
    imageFitOf(a) === imageFitOf(b) &&
    imageDescriptionOf(a) === imageDescriptionOf(b)
  )
}

/**
 * Do these two blocks describe the same thing?
 *
 * The store returns the ORIGINAL array when an update changed nothing, so a no-op
 * gesture never churns React or lands on the undo stack. That promise is only as
 * good as this comparison, so it covers every field of every type — including
 * `fromTemplate` (batch-1 review LOW-2: a comparison that cannot see a field
 * cannot protect it, and this one guards the flag that survives a no-op edit).
 */
export function blocksEqual(a: Block, b: Block): boolean {
  return (
    a.x === b.x &&
    a.y === b.y &&
    a.width === b.width &&
    a.height === b.height &&
    isFromTemplate(a) === isFromTemplate(b) &&
    blockContentEqual(a, b)
  )
}
