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
    /*
     * "A full-width band of the page" told a client who already knew what a
     * section was (UX audit P2): the audit's client read it, could not picture
     * what would appear, and clicked it first anyway because it was first. It
     * says what it LOOKS like now, and `PALETTE_ORDER` below stops it being the
     * thing an unsure client reaches for by default.
     */
    hint: 'A coloured background band behind other blocks',
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

/**
 * WHAT THE PALETTE OFFERS FIRST — a presentation order, and nothing more.
 *
 * `BLOCK_TYPES` above is the CONTRACT: its ids are the export discriminators and
 * its rectangles are the geometry every template and every stored document was
 * built against, so its order is left exactly where it was. This list is the only
 * thing P2 moves.
 *
 * Section goes last because it is the one block that is not a thing you can see
 * words on: the audit's client clicked it first (it was first), got a grey band
 * with no obvious purpose, and nearly stopped. Heading leads instead — it is what
 * every page starts with and what makes the canvas immediately look like a page.
 */
export const PALETTE_ORDER: readonly BlockTypeId[] = [
  'heading',
  'text',
  'image',
  'button',
  'nav-bar',
  'section',
]

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

/** The same six definitions, in the order the palette lists them. */
export const PALETTE_BLOCK_TYPES: readonly BlockTypeDefinition[] =
  PALETTE_ORDER.map(getBlockTypeDefinition)
