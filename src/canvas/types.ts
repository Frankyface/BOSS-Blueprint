/**
 * Core canvas data shapes. Everything here is plain JSON — the document state is
 * serialised verbatim into `site.json` at export time (Stage 3), so no class
 * instances, no functions, no `undefined` fields.
 */

/** The six structured block types the palette offers. */
export type BlockTypeId = 'section' | 'heading' | 'text' | 'image' | 'button' | 'nav-bar'

/** Geometry in unscaled page pixels (the page is a fixed 1200px design width). */
export interface BlockRect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface Size {
  readonly width: number
  readonly height: number
}

/** One placed block. Array order in the document is the paint order (z-order). */
export interface Block {
  readonly id: string
  readonly type: BlockTypeId
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** Client-typed copy. Empty string means "still showing the type's placeholder". */
  readonly text: string
}

/**
 * The DOCUMENT: the part of the canvas that is undoable, autosaved and exported.
 *
 * Selection and the open inline editor are deliberately NOT in here. They are
 * transient UI state: undoing should put the client's content back, not yank their
 * selection around, and a reloaded page should come back deselected.
 */
export interface CanvasDocument {
  readonly blocks: readonly Block[]
}

/** Compass ids of the eight resize handles drawn around a selected block. */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Narrowing helper for the geometry functions, which only care about the rectangle. */
export function toRect(block: Block): BlockRect {
  return { x: block.x, y: block.y, width: block.width, height: block.height }
}
