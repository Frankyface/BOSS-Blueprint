import { NAV_ITEM_SEPARATOR } from '../canvas/blockText.ts'
import { GRID_SIZE_PX, PAGE_WIDTH_PX } from '../canvas/constants.ts'
import type { Block, NavItem, SiteSettings } from '../canvas/types.ts'

/**
 * THE SHARED SKELETON every starter template is built on: the types, the column
 * system, and the two builders for the blocks that carry no content.
 *
 * One skeleton for all four templates — a client who learns one has learned all
 * four. Columns are named; individual block widths and heights are data, written
 * out literally in each template file, not derived here.
 *
 * The fixture data itself was designed and machine-validated before it landed
 * (`design-assets/templates/` — the content draft, the reconciliation of every
 * deviation from it, and the validator that became
 * `src/templates/starterTemplates.test.ts`). The invariants that file asserts are:
 *
 *  1. every x/y/width/height is a multiple of `GRID_SIZE_PX`
 *  2. every block is inside the page: `0 ≤ x` and `x + width ≤ PAGE_WIDTH_PX`
 *  3. array order IS paint order: full-width bands first (by y), then content in
 *     reading order — which reproduces the landed insert rule (`placement:
 *     'stacked'` → back, `'cascade'` → front) and is what puts the hero photos
 *     UNDER their heading and button
 *  4. section bands stack under the nav bar with no gaps and no overlaps
 *  5. every content block sits wholly inside one band
 *  6. no two content blocks overlap, bar the two deliberate hero overlaps
 *  7. every page: exactly one nav-bar at y=0, one item per page in the template
 *  8. 5–12 blocks per page; every `link.kind === 'page'` resolves within the template
 *  9. images carry a description, generate blocks a generateDescription, real copy text
 * 10. every block is at or above its type's `minSize`, and `fromTemplate` is on
 *     every content block and on no section band (export-format §2.6, v2.3)
 * 11. every default string FITS its box (`.block-content` is `overflow: hidden`, so
 *     copy that does not fit is CLIPPED — and would be baked into the Stage 3 PNG)
 */

/**
 * A CONTENT block seeded by a template, before the client has touched it.
 *
 * `fromTemplate` is what lets Stage 3's brief tell Cam which words are still ours
 * (docs/decisions.md 2026-07-28 "Template guardrails"); the store clears it the
 * first time the client edits the block's CONTENT.
 */
export interface TemplateContentBlock extends Block {
  readonly fromTemplate: true
}

/**
 * A background band. Never flagged — see `band()` for the ruling and the reason.
 * A separate type so the compiler, not a reviewer, is what stops a band from
 * being written with a flag on it.
 */
export interface SectionBlock extends Block {
  readonly type: 'section'
  /** `never` = the field may not be written at all. */
  readonly fromTemplate?: never
}

/** Anything a template page may hold. */
export type TemplateBlock = TemplateContentBlock | SectionBlock

/**
 * One page of a template.
 *
 * NO `slug`: the export derives slugs from the page name at package time
 * (`docs/export-format.md` §4.1, and `src/canvas/pages.ts` says the same), so
 * storing one here would be a second copy to keep in step for no gain. Page ids
 * are free-form and semantic, exactly as `pages.ts` mints them.
 */
export interface TemplatePage {
  readonly id: string
  readonly name: string
  /** Paint order == array order, exactly as in the landed store. */
  readonly blocks: readonly TemplateBlock[]
}

/**
 * The site-wide facts seeded with a template.
 *
 * `businessName` is typed `''` so it CANNOT ship non-empty: it is the one field
 * the client must really answer, and a template that filled it in would let
 * "Martina's Trattoria" ride all the way into the export (decisions.md).
 */
export interface TemplateSiteSettings extends SiteSettings {
  readonly businessName: ''
}

export interface StarterTemplate {
  readonly id: 'restaurant' | 'trades' | 'portfolio' | 'shop'
  /** Title on the picker card. */
  readonly pickerTitle: string
  /** One-line description on the picker card. */
  readonly pickerLine: string
  readonly siteSettings: TemplateSiteSettings
  /** Ordered as the page strip shows them; `pages[0]` is the home page. */
  readonly pages: readonly TemplatePage[]
}

/* ─────────────────────────── shared geometry ─────────────────────────── */

/** Left/right page gutter. */
export const MARGIN_X = 10 * GRID_SIZE_PX // 80
/** Usable width between the gutters. */
export const CONTENT_WIDTH = PAGE_WIDTH_PX - MARGIN_X * 2 // 1040
/** Nav bar height; the nav sits at y=0 and page content starts under it. */
export const NAV_HEIGHT = 9 * GRID_SIZE_PX // 72
/** Space between a band's top edge and its first block. */
export const BAND_PAD_TOP = 6 * GRID_SIZE_PX // 48

/** Full-width content column. */
export const COL_FULL = { x: MARGIN_X, width: CONTENT_WIDTH }
/** Even 2-col. Gutter is 48 (not 40) because 8px-grid halves of 1040 are 496, not 500. */
export const COL_HALF_LEFT = { x: MARGIN_X, width: 496 }
export const COL_HALF_RIGHT = { x: 624, width: 496 }
/** 60/40 2-col, 40px gutter. */
export const COL_WIDE_LEFT = { x: MARGIN_X, width: 624 }
export const COL_NARROW_RIGHT = { x: 744, width: 376 }
/** Even 3-col, 40px gutters. */
export const COL_THIRD_1 = { x: MARGIN_X, width: 320 }
export const COL_THIRD_2 = { x: 440, width: 320 }
export const COL_THIRD_3 = { x: 800, width: 320 }
/** Portrait-beside-copy split (Portfolio · About), 80px gutter. */
export const COL_PORTRAIT = { x: MARGIN_X, width: 440 }
export const COL_BESIDE_PORTRAIT = { x: 600, width: 520 }

/* ─────────────────────────── block builders ───────────────────────────
 * Two builders only, for the blocks that carry no content: they exist so the 31
 * band blocks and 12 nav bars cannot drift from each other. Every content block
 * is written out literally in its template file.
 */

/**
 * A full-width background band. Bands are the page's macro-structure.
 *
 * DELIBERATELY UNFLAGGED — the one place this file departs from the reviewed
 * fixture source, on a ruling made after it was written (`docs/decisions.md`
 * 2026-07-28 "Export format v2.3", `docs/export-format.md` §2.6). A band has no
 * text, label or description, so nothing the client could do to it would ever
 * clear a `fromTemplate` flag, and the submit-time untouched-filler warning would
 * fire for every template start forever — however completely the design had been
 * rewritten. The flag is only ever set on content-bearing types.
 */
export function band(id: string, y: number, height: number): SectionBlock {
  return { id, type: 'section', x: 0, y, width: PAGE_WIDTH_PX, height, text: '' }
}

/** `[label, pageId]` — one nav entry, before it is split into `text` + `items`. */
export type NavEntry = readonly [label: string, pageId: string]

/**
 * The site menu. Writes the same labels into BOTH `text` (which is what renders,
 * and what the inline editor edits) and the `items` array (which carries the link
 * targets), so the two can never disagree — the same invariant `withNavItems`
 * holds for every nav bar the client edits by hand.
 */
export function navBar(id: string, entries: readonly NavEntry[]): TemplateContentBlock {
  return {
    id,
    type: 'nav-bar',
    x: 0,
    y: 0,
    width: PAGE_WIDTH_PX,
    height: NAV_HEIGHT,
    text: entries.map(([label]) => label).join(`${NAV_ITEM_SEPARATOR} `),
    items: entries.map(
      ([label, pageId]): NavItem => ({
        id: `${id}-${pageId}`,
        label,
        link: { kind: 'page', pageId },
      }),
    ),
    fromTemplate: true,
  }
}
