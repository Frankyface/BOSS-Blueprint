/**
 * The six structured block types BOSS Blueprint will offer on the canvas.
 * Rendered as an inert palette until `feature-block-canvas` wires them up.
 */
export interface BlockTypeDefinition {
  /** Stable machine id — this is what ends up in the exported site.json. */
  readonly id: string
  /** Human label shown in the palette. */
  readonly label: string
  /** One-line plain-English explanation for non-technical clients. */
  readonly hint: string
}

export const BLOCK_TYPES: readonly BlockTypeDefinition[] = [
  { id: 'section', label: 'Section', hint: 'A full-width band of the page' },
  { id: 'heading', label: 'Heading', hint: 'A big line of title text' },
  { id: 'text', label: 'Text', hint: 'A paragraph of copy' },
  { id: 'image', label: 'Image', hint: 'A photo, logo or graphic' },
  { id: 'button', label: 'Button', hint: 'A clickable call to action' },
  { id: 'nav-bar', label: 'Nav bar', hint: 'The menu across the top' },
] as const

export const BLOCK_TYPE_COUNT = BLOCK_TYPES.length
