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
  /**
   * §2.9's scope note — WHICH KIND OF NOTE AN UNCLAIMED MARK IS.
   *
   * A closed two-value enum, and deliberately still two: a stroke some `penRegion`
   * lists in `strokeIds` is that region's content, so `role` is simply not asked
   * about it and this value is inert. A third value would restate what
   * `strokeIds` already says, on the other side of the same relation.
   */
  readonly role: 'annotation' | 'imageSketch'
  /** Scoped exactly as `role` is: a guess about unclaimed ink, inert on claimed ink. */
  readonly targetBlockId: string | null
}

/**
 * §2.2 `bbox` — a rectangle with the same four keys as `frame` and DELIBERATELY
 * NOT the same schema definition.
 *
 * `frame` sets `w`/`h` to `exclusiveMinimum: 0` because a block with no extent is
 * a bug. A REGION with no extent is not: a mouse-drawn straight horizontal rule
 * has a bounding-box height of exactly 0, which the `rule` classifier explicitly
 * admits (`src/canvas/ink/metrics.ts` carries the zero-extent guard for the same
 * reason). `$ref`-ing `frame` here would have V1 BLOCK a package on the single
 * most common thing a client draws.
 */
export interface ExportBbox {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/**
 * §2.2 — what a region IS.
 *
 * A closed enum, and SHORTER than the ink module's `InkRegionKind`: `annotation`
 * is absent on purpose. Ink that matched no classifier is not published as a
 * region at all — it stays in the [N7] annotation-cluster pool the brief already
 * narrates, which is what makes the worst case of this feature "no change" rather
 * than "confident wrong instruction".
 */
export type PenRegionKind =
  | 'panel'
  | 'writing'
  | 'navRow'
  | 'rule'
  | 'textPlaceholder'
  | 'artwork'

/** §2.2 — the measurements a builder needs to set drawn words as real type. */
export interface ExportRegionText {
  readonly lines: number
  readonly words: number
  readonly glyphHeight: number
  readonly align: 'left' | 'center' | 'right'
  readonly emphasis: 'display' | 'heading' | 'body'
}

/**
 * §2.2 — one inferred region of ink.
 *
 * Flat, with explicit `null`s rather than a per-kind union, for the same reason
 * `ExportBlock`'s common fields are flat: every consumer walks regions uniformly.
 *
 * `variant` is a free producer-controlled string ON PURPOSE, so a new sub-kind
 * never has to touch the schema again. The values shipped today are `card` |
 * `mediaBox` (panel), `divider` | `underline` | `vertical` (rule) and `band`
 * (artwork); a consumer that does not recognise one must fall back to the `kind`
 * (§6.2).
 *
 * A `panel` ALWAYS carries one of its two (§4.9.10): `card` when a region sits
 * inside it, `mediaBox` when none does. That word is the only thing separating a
 * drawn pricing card from an empty box the builder fills with a real image —
 * `kind`, `bbox` and `strokeIds` cannot tell them apart — and V28 BLOCKs a package
 * whose variant disagrees with its own region tree.
 */
export interface ExportPenRegion {
  readonly id: string
  readonly kind: PenRegionKind
  readonly variant?: string
  readonly confidence: 'clear' | 'unsure'
  readonly bbox: ExportBbox
  /** Export stroke ids, in draw order. Never empty. */
  readonly strokeIds: readonly string[]
  /** The containing `panel` region on the same page, or `null` at the top level. */
  readonly parentRegionId: string | null
  /** `set_NNNN` when this panel is one instance of a repeated component. */
  readonly setId: string | null
  readonly setIndex: number | null
  /** `writing`/`navRow` only — everything else carries no words to measure. */
  readonly text: ExportRegionText | null
}

export interface ExportPage {
  readonly id: string
  readonly name: string
  readonly slug: string
  readonly height: number
  /**
   * §2.5 — empty room the client deliberately added below their content, ALREADY
   * INCLUDED in `height`. Absent means none, and it is only ever written when > 0.
   *
   * It earns its place in the contract by telling the builder something `height`
   * alone cannot: that the closing whitespace is design intent, not an accident of
   * where the last block happened to land.
   */
  readonly extraBottomPx?: number
  readonly screenshot: string
  readonly blocks: readonly ExportBlock[]
  readonly penStrokes: readonly ExportPenStroke[]
  /**
   * §2.5 — what the producer INFERRED the page's ink to be (§4.5 / the ink module).
   *
   * Absent, never `[]`, when nothing was inferred: an empty array would change the
   * bytes of every package that ships only annotation ink, including the normative
   * §7.1 fixture. Derived at export from `blocks` and `penStrokes`, never stored —
   * geometry moves, and a stored reading would go stale the moment a block did.
   */
  readonly penRegions?: readonly ExportPenRegion[]
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
