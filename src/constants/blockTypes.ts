import type { BlockRect, BlockTypeId, Size } from '../canvas/types.ts'

/**
 * The six structured block types BOSS Blueprint offers on the canvas.
 * One table drives the palette, the default geometry, the min-size clamps and the
 * placeholder copy — so a block type can never be half-added.
 */

/** How a fresh block of this type is positioned relative to what is already there. */
export type BlockPlacement =
  /** Full-width band: x = 0, stacked below the last full-width block. */
  | 'stacked'
  /** Free-floating: lands at its default spot, nudged down-right per existing sibling. */
  | 'cascade'

/** Whether (and how) the block's text can be edited inline. */
export type BlockTextMode = 'none' | 'single-line' | 'multi-line'

export interface BlockTypeDefinition {
  /** Stable machine id — this is what ends up in the exported site.json. */
  readonly id: BlockTypeId
  /** Human label shown in the palette. */
  readonly label: string
  /** One-line plain-English explanation for non-technical clients. */
  readonly hint: string
  /** Size, and starting position, of a freshly added block. */
  readonly defaultRect: BlockRect
  /** Resizing can never take the block below this. */
  readonly minSize: Size
  readonly placement: BlockPlacement
  readonly textMode: BlockTextMode
  /** Rendered on the block until the client types their own copy. */
  readonly placeholderText: string
}

/**
 * `as const satisfies` rather than a plain `: readonly BlockTypeDefinition[]`
 * annotation: the annotation alone would widen every literal back to `string` and
 * make the trailing `as const` dead weight. This way each entry is still checked
 * against the interface, and the table keeps its literal types — which is what lets
 * `BLOCK_TYPES.map((d) => d.id)` produce `BlockTypeId` instead of `string`.
 */
export const BLOCK_TYPES = [
  {
    id: 'section',
    label: 'Section',
    hint: 'A full-width band of the page',
    defaultRect: { x: 0, y: 0, width: 1200, height: 240 },
    minSize: { width: 160, height: 64 },
    placement: 'stacked',
    textMode: 'none',
    placeholderText: 'Section band',
  },
  {
    id: 'heading',
    label: 'Heading',
    hint: 'A big line of title text',
    defaultRect: { x: 80, y: 120, width: 640, height: 72 },
    minSize: { width: 96, height: 40 },
    placement: 'cascade',
    textMode: 'single-line',
    placeholderText: 'Your headline here',
  },
  {
    id: 'text',
    label: 'Text',
    hint: 'A paragraph of copy',
    defaultRect: { x: 80, y: 240, width: 640, height: 160 },
    minSize: { width: 96, height: 48 },
    placement: 'cascade',
    textMode: 'multi-line',
    placeholderText:
      'Describe this part of the page in a sentence or two. Double-click to type your own words.',
  },
  {
    id: 'image',
    label: 'Image',
    hint: 'A photo, logo or graphic',
    defaultRect: { x: 80, y: 440, width: 400, height: 280 },
    minSize: { width: 64, height: 64 },
    placement: 'cascade',
    textMode: 'none',
    placeholderText: 'Image',
  },
  {
    id: 'button',
    label: 'Button',
    hint: 'A clickable call to action',
    defaultRect: { x: 80, y: 760, width: 200, height: 56 },
    minSize: { width: 64, height: 32 },
    placement: 'cascade',
    textMode: 'single-line',
    placeholderText: 'Get in touch',
  },
  {
    id: 'nav-bar',
    label: 'Nav bar',
    hint: 'The menu across the top',
    defaultRect: { x: 0, y: 0, width: 1200, height: 72 },
    minSize: { width: 240, height: 40 },
    placement: 'stacked',
    textMode: 'single-line',
    placeholderText: 'Home, About, Services, Contact',
  },
] as const satisfies readonly BlockTypeDefinition[]

export const BLOCK_TYPE_COUNT = BLOCK_TYPES.length

const DEFINITIONS_BY_ID: ReadonlyMap<BlockTypeId, BlockTypeDefinition> = new Map(
  BLOCK_TYPES.map((definition) => [definition.id, definition]),
)

/**
 * Look up a block type's definition.
 * Throws on an unknown id: that can only mean corrupt imported state, and silently
 * rendering nothing would hide the bug (validate at the boundary).
 */
export function getBlockTypeDefinition(id: BlockTypeId): BlockTypeDefinition {
  const definition = DEFINITIONS_BY_ID.get(id)
  if (!definition) {
    throw new Error(`Unknown block type: ${id}`)
  }
  return definition
}

/** True when double-clicking the block should open the inline text editor. */
export function hasEditableText(id: BlockTypeId): boolean {
  return getBlockTypeDefinition(id).textMode !== 'none'
}
