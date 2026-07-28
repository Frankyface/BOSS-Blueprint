/**
 * `site.json` shapes — `docs/export-format.md` §2 (schemaVersion 1).
 *
 * These are the PUBLIC export contract, not the editor's document model: ids are
 * the remapped `pg_`/`blk_`/`nav_`/`stk_`/`img_` forms (§4.8/§4.6), geometry is
 * `frame: {x, y, w, h}`, optional client text is `null` rather than `''`, and the
 * discriminators are the export names (§4.7 — `imageSlot`, `navBar`).
 *
 * Structural only. Validation is the validator's job (§5); the brief generator and
 * the packager both assume a schema-valid, post-FIX `SiteJson`.
 */

export interface Frame {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** §2.8 — the link union carried by buttons and nav items. */
export type ExportLink =
  | { readonly kind: 'page'; readonly pageId: string }
  | { readonly kind: 'external'; readonly url: string }
  | { readonly kind: 'none' }

export interface ExportNavItem {
  readonly id: string
  readonly label: string
  readonly link: ExportLink
}

/** §2.6 — the fields every block carries, in the normative §7.1 key order. */
interface BlockCommon {
  readonly id: string
  readonly z: number
  readonly frame: Frame
  /** §2.6 — content-bearing types only; absent means `false`. */
  readonly fromTemplate?: boolean
}

export interface SectionBlock extends BlockCommon {
  readonly type: 'section'
  readonly background: string | null
}

export interface CopyBlock extends BlockCommon {
  readonly type: 'heading' | 'text'
  readonly copyMode: 'real' | 'generate'
  readonly text: string
  readonly generateDescription: string | null
  readonly lengthHint: string | null
}

export interface ImageSlotBlock extends BlockCommon {
  readonly type: 'imageSlot'
  readonly assetId: string | null
  readonly fit: 'cover' | 'contain'
  readonly description: string | null
}

export interface ButtonBlock extends BlockCommon {
  readonly type: 'button'
  readonly label: string
  readonly link: ExportLink
}

export interface NavBarBlock extends BlockCommon {
  readonly type: 'navBar'
  readonly items: readonly ExportNavItem[]
}

export type ExportBlock =
  | SectionBlock
  | CopyBlock
  | ImageSlotBlock
  | ButtonBlock
  | NavBarBlock

export type ExportBlockType = ExportBlock['type']

/** §2.9 — `role`/`targetBlockId` are DERIVED at export (§4.5), never stored. */
export interface ExportPenStroke {
  readonly id: string
  readonly points: readonly (readonly [number, number])[]
  readonly color: string
  readonly width: number
  readonly role: 'annotation' | 'imageSketch'
  readonly targetBlockId: string | null
}

export interface ExportPage {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly height: number
  readonly screenshot: string
  readonly blocks: readonly ExportBlock[]
  readonly penStrokes: readonly ExportPenStroke[]
}

export type AssetMimeType = 'image/jpeg' | 'image/png' | 'image/webp'

export interface ExportAsset {
  readonly id: string
  readonly path: string
  readonly originalFilename: string
  readonly mimeType: AssetMimeType
  readonly width: number
  readonly height: number
  readonly bytes: number
}

export interface ExportSiteSettings {
  readonly businessName: string
  readonly tagline: string | null
  readonly about: string | null
  readonly vibe: 'modern' | 'classic' | 'playful' | 'bold' | 'warm' | null
  readonly styleNotes: string | null
  readonly colors: readonly string[]
}

export interface ExportSubmission {
  readonly id: string
  readonly submittedAt: string
  readonly designCreatedAt: string | null
  readonly client: { readonly name: string; readonly email: string }
  readonly appVersion: string
}

export interface SiteJson {
  readonly schemaVersion: number
  readonly submission: ExportSubmission
  readonly siteSettings: ExportSiteSettings
  readonly pages: readonly ExportPage[]
  readonly assets: readonly ExportAsset[]
}

/** The one schemaVersion this module produces (§2.1). */
export const SCHEMA_VERSION = 1

/** §0.2 — the design width of a page, and the PNG render width. */
export const EXPORT_PAGE_WIDTH = 1200
