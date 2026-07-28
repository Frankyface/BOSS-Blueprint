/**
 * Core canvas data shapes. Everything here is plain JSON — the document state is
 * serialised verbatim into `site.json` at export time (Stage 3), so no class
 * instances, no functions, no `undefined` fields.
 *
 * Field NAMES on the copy/link/settings shapes deliberately match the export
 * contract in `docs/export-format.md` §2 (`copyMode`, `generateDescription`,
 * `lengthHint`, `link.kind/pageId/url`, `items[].id/label/link`, and the
 * `siteSettings` keys) so Stage 3's generator is a remap of ids, not a rename of
 * fields. The two places the internal shape deliberately differs are recorded in
 * `staging/stage-2-full-sketching/feature-site-settings.md`: optional text is `''`
 * here and `null` there, and internal ids are free-form (§4.8 remaps them).
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

/**
 * Whether a copy block carries the client's own words or a description of the
 * words Claude should write at build time (`docs/export-format.md` §2.7).
 */
export type CopyMode = 'real' | 'generate'

/** Where a button or nav item points. Mirrors the export `link` union (§2.8). */
export type BlockLink =
  | { readonly kind: 'page'; readonly pageId: string }
  | { readonly kind: 'external'; readonly url: string }
  | { readonly kind: 'none' }

/** One entry in a nav bar's menu. */
export interface NavItem {
  readonly id: string
  readonly label: string
  readonly link: BlockLink
}

/** How an uploaded photo fills its slot (`docs/export-format.md` §2.7 `imageSlot`). */
export type ImageFit = 'cover' | 'contain'

/** One sample of a pen stroke, in unscaled page pixels. */
export interface PenPoint {
  readonly x: number
  readonly y: number
}

/**
 * One freehand pen stroke on a page (`docs/export-format.md` §2.9).
 *
 * GEOMETRY ONLY. `role` and `targetBlockId` are in the export schema but NOT here:
 * §4.5 computes both from pure geometry at package time, so storing them would let
 * derived data drift the moment a block moved underneath a stroke.
 */
export interface PenStroke {
  readonly id: string
  /** Draw order, thinned on commit. Always at least two points (a tap is a dot). */
  readonly points: readonly PenPoint[]
  /** `#rrggbb`, as drawn. */
  readonly color: string
  /** Stroke width in page pixels. */
  readonly width: number
}

/**
 * One placed block. Array order within a page is the paint order (z-order).
 *
 * The per-type fields are optional on this one flat interface rather than split
 * into a discriminated union: every consumer (geometry, z-order, the gesture fast
 * path, the immutable update helper) treats blocks uniformly, and a union would
 * make `{ ...block, ...rect }` fight the discriminant for no behavioural gain.
 * `parseBlueprint` is where per-type rigour lives — it validates the fields that
 * belong to a type and strips the ones that do not.
 */
export interface Block {
  readonly id: string
  readonly type: BlockTypeId
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** Client-typed copy. Empty string means "still showing the type's placeholder". */
  readonly text: string
  /** Copy blocks (heading, text) only. */
  readonly copyMode?: CopyMode
  /** Copy blocks in `generate` mode: the prompt the client wrote for Claude. */
  readonly generateDescription?: string
  /** Copy blocks: optional free-text length guidance ("~2 sentences"). */
  readonly lengthHint?: string
  /** Buttons only. */
  readonly link?: BlockLink
  /** Nav bars only. `text` is kept as the comma-joined labels of these. */
  readonly items?: readonly NavItem[]
  /**
   * Image slots: the uploaded photo as a `data:` URL, already compressed on
   * ingest. `''` means the slot is empty — which, with a `description`, is the
   * client deliberately asking us to source that image (§2.7).
   */
  readonly imageData?: string
  /**
   * Image slots: the name of the file the client chose, VERBATIM.
   *
   * Kept because the export's asset manifest requires it (§2.3/§4.6) and it
   * cannot be reconstructed at package time — the compressed data URL carries no
   * trace of where it came from. Metadata only: it is never used as a path, and
   * it is never sanitised here (the export owns naming).
   */
  readonly originalFilename?: string
  /** Image slots: how the photo fills the frame. */
  readonly fit?: ImageFit
  /** Image slots: the client's words about the photo. NOT alt text (§2.7). */
  readonly description?: string
}

/**
 * One page of the site. `id` is free-form and semantic (`page-menu`) — the export
 * remaps every id to its `pg_NNNN` public form (§4.8), and slugs are derived from
 * `name` at export time (§4.1), so neither is stored here.
 */
export interface Page {
  readonly id: string
  readonly name: string
  readonly blocks: readonly Block[]
  /**
   * The page's freehand pen marks, in draw order. Required rather than optional:
   * the export schema requires it (§2.9), and a field that is sometimes missing is
   * a field every consumer has to defend against. Payloads written before the pen
   * layer existed simply parse to `[]`.
   */
  readonly penStrokes: readonly PenStroke[]
}

/** The pick-list values, sourced from the export schema's `vibe` enum (§2.4). */
export type VibeId = 'modern' | 'classic' | 'playful' | 'bold' | 'warm'

/**
 * Site-wide facts the layout cannot express. Optional text is `''` rather than
 * `null` here (an empty input has no other honest value); the Stage 3 generator
 * maps `''` → `null` when writing `site.json`.
 */
export interface SiteSettings {
  readonly businessName: string
  readonly tagline: string
  readonly about: string
  readonly vibe: VibeId | null
  readonly styleNotes: string
  /** 0–3 `#rrggbb` strings, in preference order. */
  readonly colors: readonly string[]
}

/**
 * The DOCUMENT: the part of the editor that is undoable, autosaved and exported.
 *
 * Selection, the open inline editor and the CURRENT PAGE are deliberately NOT in
 * here. They are transient UI state: undoing should put the client's content back,
 * not yank their selection or teleport them to another page, and a reloaded page
 * should come back deselected on page one.
 */
export interface CanvasDocument {
  readonly siteSettings: SiteSettings
  /** Ordered; `pages[0]` is the homepage. Never empty. */
  readonly pages: readonly Page[]
}

/** Compass ids of the eight resize handles drawn around a selected block. */
export type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

export const RESIZE_HANDLES: readonly ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

/** Narrowing helper for the geometry functions, which only care about the rectangle. */
export function toRect(block: Block): BlockRect {
  return { x: block.x, y: block.y, width: block.width, height: block.height }
}
