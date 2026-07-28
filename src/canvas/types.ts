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
