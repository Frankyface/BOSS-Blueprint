/**
 * STARTER TEMPLATE FIXTURES — review draft for Stage 2 `feature-templates.md`.
 * Written 2026-07-28 from `template-content-draft.md` (content design) against the
 * LANDED Stage-1 schema. NOT yet in the repo — intended landing spot:
 * `src/templates/starterTemplates.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT IS LANDED vs WHAT IS STAGE-2-ONLY
 * ─────────────────────────────────────────────────────────────────────────────
 * LANDED TODAY (src/canvas/types.ts · src/constants/blockTypes.ts · src/canvas/constants.ts):
 *   Block = { id, type, x, y, width, height, text }
 *   - `type` is one of the six palette ids: section | heading | text | image | button | nav-bar
 *   - geometry is unscaled page px on a 1200px-wide page, snapped to an 8px grid
 *   - PAINT ORDER IS ARRAY ORDER. Index 0 paints first (furthest back). There is NO `z`
 *     field on a block; the content draft's `z` column is expressed here as array position.
 *   - `text` is the client's own words; '' means "still showing the type's placeholder".
 *     Nav-bar labels live in `text` as one comma-separated string (canvas/blockText.ts),
 *     and a button's label is its `text` too — neither gets a separate field.
 *
 * STAGE-2-ONLY — every field below is marked `STAGE 2` at its declaration and does NOT
 * exist in the store yet. Each one is already specified by a stage-2 feature doc or ruled
 * on in docs/decisions.md; nothing here is invented for the templates:
 *   pages[]              → feature-multipage-nav.md (store has no page concept yet)
 *   fromTemplate: true   → docs/decisions.md 2026-07-28 "Template guardrails"
 *   copyMode / generateDescription / lengthHint → feature-copy-blocks.md
 *   fit / description (image)                   → feature-image-upload.md
 *   link (button) / items (nav-bar)             → feature-multipage-nav.md
 *   siteSettings                                → feature-site-settings.md
 * Field NAMES for the link union, `generateDescription`, `fit` and `description` follow the
 * ruled-on export contract (export-format draft §2.7–2.8, decisions.md 2026-07-28) so the
 * Stage-3 mapping is a rename-free copy. See RECONCILIATION.md.
 *
 * DROPPED from the content draft, per its own §9.2 fallback: `section.tone` and
 * `heading.level`. Neither exists in the landed code and neither is worth a new field —
 * the geometry already carries the hierarchy.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * INVARIANTS THIS FILE HOLDS (all machine-checked by validate-fixtures.mjs)
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. every x/y/width/height is a multiple of GRID_SIZE_PX (8)
 *  2. every block is inside the page: 0 ≤ x and x + width ≤ PAGE_WIDTH_PX (1200)
 *  3. array order = paint order: the full-width bands (nav-bar, section) come first,
 *     sorted by y; then content, sorted by (y, then x). This reproduces the landed
 *     insert rule (blockTypes `placement: 'stacked'` → back, `'cascade'` → front) and it
 *     is what puts the two hero photos UNDER their heading + button.
 *  4. section bands stack with no gaps and no overlaps, starting under the nav bar
 *  5. every content block sits wholly inside one band
 *  6. no two content blocks overlap, except the two deliberate hero overlaps
 *     (rest-home + shop-home: title and button laid over the full-band hero photo)
 *  7. every page: exactly one nav-bar at y=0 with one item per page in the template
 *  8. every page has 5–12 blocks; every `link.kind === 'page'` resolves within the template
 *  9. every image has a non-empty `description`; every generate block has a non-empty
 *     `generateDescription`; every real heading/text has non-empty `text`
 * 10. every block is at or above its type's `minSize` from blockTypes.ts
 * 11. every default string FITS its box at the landed sketch typography (BlockView.css:
 *     text 18px/1.55, heading 40px/1.15, button pill 18px bold nowrap). `.block-content` is
 *     `overflow: hidden`, so copy that does not fit is clipped — several boxes are taller
 *     than the content draft specified for exactly this reason (see RECONCILIATION.md).
 *
 * NOTE ON FILE SIZE: this is ~4× the repo's 400-line guide. At landing, split one file per
 * template (`src/templates/restaurant.ts`, …) re-exported from an `index.ts`.
 */

import { GRID_SIZE_PX, PAGE_WIDTH_PX } from '../canvas/constants.ts'
import { NAV_ITEM_SEPARATOR } from '../canvas/blockText.ts'
import type { Block } from '../canvas/types.ts'

/* ───────────────────────────── types ───────────────────────────── */

/** STAGE 2 (feature-multipage-nav.md) — where a button or nav item points. */
export type TemplateLink =
  | { readonly kind: 'page'; readonly pageId: string }
  | { readonly kind: 'external'; readonly url: string }
  | { readonly kind: 'none' }

/** STAGE 2 (feature-multipage-nav.md) — one labelled item in a nav bar. */
export interface TemplateNavItem {
  readonly id: string
  readonly label: string
  readonly link: TemplateLink
}

/**
 * A landed `Block`, plus the per-type fields Stage 2 adds. Every optional field below
 * applies to exactly one block type; a flat interface (rather than a discriminated union)
 * keeps this identical in shape to the landed `Block` the store already holds. Stage 2 may
 * prefer a union — the DATA in this file does not change either way.
 */
export interface TemplateBlock extends Block {
  /** STAGE 2 (decisions.md) — cleared on the client's first edit of this block. */
  readonly fromTemplate: true
  /** STAGE 2 (feature-copy-blocks.md) — heading + text only. */
  readonly copyMode?: 'real' | 'generate'
  /** STAGE 2 — the client's prompt; required when copyMode is 'generate'. */
  readonly generateDescription?: string
  /** STAGE 2 — optional length guidance for a generate block. */
  readonly lengthHint?: string
  /** STAGE 2 (feature-image-upload.md) — image only. */
  readonly fit?: 'cover' | 'contain'
  /** STAGE 2 — image only: what the photo should show. Doubles as the empty-slot coach line. */
  readonly description?: string
  /** STAGE 2 (feature-multipage-nav.md) — button only. */
  readonly link?: TemplateLink
  /** STAGE 2 (feature-multipage-nav.md) — nav-bar only; mirrors the labels in `text`. */
  readonly items?: readonly TemplateNavItem[]
}

/** STAGE 2 (feature-multipage-nav.md) — one page of a design. */
export interface TemplatePage {
  readonly id: string
  readonly name: string
  /**
   * STAGE 2 — kebab-case route. The export computes slugs fresh from `name` at export time
   * (export-format §4.1), so Stage 2 may choose NOT to persist this; it is stated here as
   * the expected derived value and as the id E2E tests can assert on.
   */
  readonly slug: string
  /** Paint order == array order, exactly as in the landed store. */
  readonly blocks: readonly TemplateBlock[]
}

/** STAGE 2 (feature-site-settings.md) — the site-wide facts seeded with a template. */
export interface TemplateSiteSettings {
  /** ALWAYS EMPTY (decisions.md): the one required field must be a real client answer. */
  readonly businessName: ''
  readonly tagline: string
  readonly about: string
  readonly vibe: 'modern' | 'classic' | 'playful' | 'bold' | 'warm' | null
  readonly styleNotes: string
  readonly colors: readonly string[]
}

export interface StarterTemplate {
  readonly id: 'restaurant' | 'trades' | 'portfolio' | 'shop'
  /** Title on the picker card (content draft §8.2). */
  readonly pickerTitle: string
  /** One-line description on the picker card (content draft §8.2). */
  readonly pickerLine: string
  readonly siteSettings: TemplateSiteSettings
  /** Ordered as the page strip shows them; pages[0] is the home page. */
  readonly pages: readonly TemplatePage[]
}

/* ─────────────────────────── shared geometry ───────────────────────────
 * One skeleton for all four templates: a client who learns one has learned all four.
 * Columns are named; individual block widths/heights are data, not constants.
 * Every value here is a multiple of GRID_SIZE_PX.
 */

/** Left/right page gutter. */
const MARGIN_X = 10 * GRID_SIZE_PX // 80
/** Usable width between the gutters. */
const CONTENT_WIDTH = PAGE_WIDTH_PX - MARGIN_X * 2 // 1040
/** Nav bar height; the nav sits at y=0 and page content starts under it. */
const NAV_HEIGHT = 9 * GRID_SIZE_PX // 72
/** Space between a band's top edge and its first block. */
const BAND_PAD_TOP = 6 * GRID_SIZE_PX // 48

/** Full-width content column. */
const COL_FULL = { x: MARGIN_X, width: CONTENT_WIDTH }
/** Even 2-col. Gutter is 48 (not 40) because 8px-grid halves of 1040 are 496, not 500. */
const COL_HALF_LEFT = { x: MARGIN_X, width: 496 }
const COL_HALF_RIGHT = { x: 624, width: 496 }
/** 60/40 2-col, 40px gutter. */
const COL_WIDE_LEFT = { x: MARGIN_X, width: 624 }
const COL_NARROW_RIGHT = { x: 744, width: 376 }
/** Even 3-col, 40px gutters. */
const COL_THIRD_1 = { x: MARGIN_X, width: 320 }
const COL_THIRD_2 = { x: 440, width: 320 }
const COL_THIRD_3 = { x: 800, width: 320 }
/** Portrait-beside-copy split (Portfolio · About), 80px gutter. */
const COL_PORTRAIT = { x: MARGIN_X, width: 440 }
const COL_BESIDE_PORTRAIT = { x: 600, width: 520 }

/* ─────────────────────────── block builders ───────────────────────────
 * Two builders only, for the blocks that carry no content: they exist so the 30 band
 * blocks and 12 nav bars cannot drift from each other. Every content block below is
 * written out literally.
 */

/** A full-width background band. Bands are the page's macro-structure. */
function band(id: string, y: number, height: number): TemplateBlock {
  return {
    id,
    type: 'section',
    x: 0,
    y,
    width: PAGE_WIDTH_PX,
    height,
    text: '',
    fromTemplate: true,
  }
}

/** `[label, pageId]` — one nav entry, before it is split into `text` + `items`. */
type NavEntry = readonly [label: string, pageId: string]

/**
 * The site menu. Writes the same labels into BOTH the landed `text` field (which is what
 * renders today) and the Stage-2 `items` array (which carries the link targets), so the
 * two can never disagree.
 */
function navBar(id: string, entries: readonly NavEntry[]): TemplateBlock {
  return {
    id,
    type: 'nav-bar',
    x: 0,
    y: 0,
    width: PAGE_WIDTH_PX,
    height: NAV_HEIGHT,
    text: entries.map(([label]) => label).join(`${NAV_ITEM_SEPARATOR} `),
    items: entries.map(
      ([label, pageId]): TemplateNavItem => ({
        id: `${id}-${pageId}`,
        label,
        link: { kind: 'page', pageId },
      }),
    ),
    fromTemplate: true,
  }
}

/* ═══════════════════════════ 1 · RESTAURANT ═══════════════════════════
 * Teaches: a page is a stack of full-width bands, words can sit on top of a photo, and
 * you can hand the writing to BOSS with "Write it for me".
 */

const RESTAURANT_NAV: readonly NavEntry[] = [
  ['Home', 'home'],
  ['Menu', 'menu'],
  ['Visit Us', 'visit'],
]

/** Restaurant · Home — band stack (each y is the previous band's y + height). */
const RH_HERO_Y = NAV_HEIGHT // 72
const RH_ABOUT_Y = RH_HERO_Y + 440 // 512
const RH_GALLERY_Y = RH_ABOUT_Y + 384 // 896

/** Restaurant · Menu. */
const RM_HEADER_Y = NAV_HEIGHT // 72
const RM_MENU_Y = RM_HEADER_Y + 224 // 296
const RM_CTA_Y = RM_MENU_Y + 520 // 816

/** Restaurant · Visit Us. */
const RV_HEADER_Y = NAV_HEIGHT // 72
const RV_DETAILS_Y = RV_HEADER_Y + 200 // 272
const RV_BOOK_Y = RV_DETAILS_Y + 440 // 712

export const RESTAURANT_TEMPLATE: StarterTemplate = {
  id: 'restaurant',
  pickerTitle: 'Restaurant or café',
  pickerLine: 'Hero photo, your story, a menu page and how to find you.',
  siteSettings: {
    businessName: '',
    tagline: 'Hand-rolled pasta, one room, no rush.',
    about: '',
    vibe: 'warm',
    styleNotes: '',
    colors: [],
  },
  pages: [
    {
      id: 'home',
      name: 'Home',
      slug: 'home',
      blocks: [
        // ── bands (back) ──
        navBar('rest-home-nav', RESTAURANT_NAV),
        band('rest-home-hero-band', RH_HERO_Y, 440),
        band('rest-home-about-band', RH_ABOUT_Y, 384),
        band('rest-home-gallery-band', RH_GALLERY_Y, 336),
        // ── content (front), in reading order ──
        {
          id: 'rest-home-hero-photo',
          type: 'image',
          x: 0,
          y: RH_HERO_Y,
          width: PAGE_WIDTH_PX,
          height: 440,
          text: '',
          fit: 'cover',
          description:
            'A wide, warm photo of your dining room during dinner service — lights on, tables full.',
          fromTemplate: true,
        },
        {
          // DELIBERATE OVERLAP: this heading and the button below it sit ON the hero photo.
          id: 'rest-home-hero-title',
          type: 'heading',
          x: MARGIN_X,
          y: RH_HERO_Y + 160,
          width: 704,
          height: 88,
          text: "Martina's Trattoria",
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'rest-home-hero-cta',
          type: 'button',
          x: MARGIN_X,
          y: RH_HERO_Y + 280,
          width: 240,
          height: 56,
          text: 'See our menu',
          link: { kind: 'page', pageId: 'menu' },
          fromTemplate: true,
        },
        {
          id: 'rest-home-about-title',
          ...COL_HALF_LEFT,
          type: 'heading',
          y: RH_ABOUT_Y + BAND_PAD_TOP,
          height: 56,
          text: 'Our story',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'rest-home-about-body',
          ...COL_HALF_LEFT,
          type: 'text',
          y: RH_ABOUT_Y + 128,
          height: 200,
          text: '',
          copyMode: 'generate',
          generateDescription:
            'A warm story about the family behind the restaurant — we opened in 2009, everything is made from scratch that morning, and the recipes came from my grandmother in Puglia.',
          lengthHint: '3 sentences',
          fromTemplate: true,
        },
        {
          id: 'rest-home-gallery-1',
          ...COL_THIRD_1,
          type: 'image',
          y: RH_GALLERY_Y + BAND_PAD_TOP,
          height: 240,
          text: '',
          fit: 'cover',
          description: 'Your best-looking plate of food, shot from above in daylight.',
          fromTemplate: true,
        },
        {
          id: 'rest-home-gallery-2',
          ...COL_THIRD_2,
          type: 'image',
          y: RH_GALLERY_Y + BAND_PAD_TOP,
          height: 240,
          text: '',
          fit: 'cover',
          description: 'Something being made — hands rolling pasta, the grill, the espresso machine.',
          fromTemplate: true,
        },
        {
          id: 'rest-home-gallery-3',
          ...COL_THIRD_3,
          type: 'image',
          y: RH_GALLERY_Y + BAND_PAD_TOP,
          height: 240,
          text: '',
          fit: 'cover',
          description: 'People enjoying themselves in your room. Ask regulars for permission first.',
          fromTemplate: true,
        },
      ],
    },
    {
      id: 'menu',
      name: 'Menu',
      slug: 'menu',
      blocks: [
        navBar('rest-menu-nav', RESTAURANT_NAV),
        band('rest-menu-header-band', RM_HEADER_Y, 224),
        band('rest-menu-band', RM_MENU_Y, 520),
        band('rest-menu-cta-band', RM_CTA_Y, 240),
        {
          id: 'rest-menu-title',
          ...COL_HALF_LEFT,
          type: 'heading',
          y: RM_HEADER_Y + BAND_PAD_TOP,
          height: 64,
          text: 'Our menu',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'rest-menu-intro',
          x: MARGIN_X,
          y: RM_HEADER_Y + 136,
          width: 720,
          height: 72,
          type: 'text',
          text: "Kitchen open Tuesday to Sunday, 5pm to 10pm. The menu changes with what's good that week.",
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'rest-menu-starters-title',
          ...COL_HALF_LEFT,
          type: 'heading',
          y: RM_MENU_Y + BAND_PAD_TOP,
          height: 56,
          text: 'To start',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'rest-menu-mains-title',
          ...COL_HALF_RIGHT,
          type: 'heading',
          y: RM_MENU_Y + BAND_PAD_TOP,
          height: 56,
          text: 'Mains',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'rest-menu-starters-list',
          ...COL_HALF_LEFT,
          type: 'text',
          y: RM_MENU_Y + 112,
          height: 344,
          text: 'Focaccia, olive oil, sea salt — 8\nBurrata, grilled peaches, basil — 16\nArancini, three per order — 12\nChopped salad, red wine vinaigrette — 11\n\nReplace these with your real dishes and prices. One dish per line keeps it easy to read.',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'rest-menu-mains-list',
          ...COL_HALF_RIGHT,
          type: 'text',
          y: RM_MENU_Y + 112,
          height: 344,
          text: 'Tagliatelle bolognese — 26\nCacio e pepe — 23\nRoast chicken, potatoes, lemon — 29\nWhole fish for two — 54\n\nGot a long menu? Copy this block for each section — desserts, wine, specials.',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'rest-menu-cta-title',
          x: MARGIN_X,
          y: RM_CTA_Y + BAND_PAD_TOP,
          width: 600,
          height: 56,
          type: 'heading',
          text: 'Come hungry',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'rest-menu-cta-button',
          x: MARGIN_X,
          y: RM_CTA_Y + 128,
          width: 240,
          height: 56,
          type: 'button',
          text: 'Book a table',
          link: { kind: 'page', pageId: 'visit' },
          fromTemplate: true,
        },
      ],
    },
    {
      id: 'visit',
      name: 'Visit Us',
      slug: 'visit-us',
      blocks: [
        navBar('rest-visit-nav', RESTAURANT_NAV),
        band('rest-visit-header-band', RV_HEADER_Y, 200),
        band('rest-visit-details-band', RV_DETAILS_Y, 440),
        band('rest-visit-book-band', RV_BOOK_Y, 280),
        {
          id: 'rest-visit-title',
          ...COL_HALF_LEFT,
          type: 'heading',
          y: RV_HEADER_Y + BAND_PAD_TOP,
          height: 64,
          text: 'Visit us',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'rest-visit-where-title',
          ...COL_HALF_LEFT,
          type: 'heading',
          y: RV_DETAILS_Y + BAND_PAD_TOP,
          height: 56,
          text: 'Where to find us',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'rest-visit-photo',
          ...COL_HALF_RIGHT,
          type: 'image',
          y: RV_DETAILS_Y + BAND_PAD_TOP,
          height: 344,
          text: '',
          fit: 'cover',
          description:
            'A photo of your storefront from across the street, so people recognise it when they walk up.',
          fromTemplate: true,
        },
        {
          id: 'rest-visit-where-body',
          ...COL_HALF_LEFT,
          type: 'text',
          y: RV_DETAILS_Y + 112,
          height: 304,
          text: '148 Barrington Street\nHalifax, NS  B3J 1Z4\n(902) 555-0134\n\nTuesday – Thursday  5pm – 10pm\nFriday – Saturday  5pm – 11pm\nSunday  4pm – 9pm\nClosed Mondays\n\nStreet parking after 6pm, lot around the back.',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'rest-visit-book-title',
          ...COL_HALF_LEFT,
          type: 'heading',
          y: RV_BOOK_Y + BAND_PAD_TOP,
          height: 56,
          text: 'Book a table',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'rest-visit-book-body',
          ...COL_HALF_LEFT,
          type: 'text',
          y: RV_BOOK_Y + 112,
          height: 104,
          text: "Call us on (902) 555-0134, or tell BOSS which booking service you use and we'll wire the button up to it.",
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'rest-visit-book-button',
          x: COL_HALF_RIGHT.x,
          y: RV_BOOK_Y + 112,
          width: 264,
          height: 56,
          type: 'button',
          text: 'Back to the menu',
          link: { kind: 'page', pageId: 'menu' },
          fromTemplate: true,
        },
      ],
    },
  ],
}

/* ═══════════════════════════ 2 · TRADES / SERVICES ═══════════════════════════
 * Teaches: one band per service, a phone-first call to action above the fold, and that
 * duplicating a band is how you add the next service.
 */

const TRADES_NAV: readonly NavEntry[] = [
  ['Home', 'home'],
  ['Services', 'services'],
  ['Get a Quote', 'quote'],
]

/** Trades · Home. */
const TH_HERO_Y = NAV_HEIGHT // 72
const TH_SERVICES_Y = TH_HERO_Y + 424 // 496

/** Trades · Services. */
const TS_HEADER_Y = NAV_HEIGHT // 72
const TS_A_Y = TS_HEADER_Y + 200 // 272
const TS_B_Y = TS_A_Y + 400 // 672

/** Trades · Get a Quote. */
const TQ_HEADER_Y = NAV_HEIGHT // 72
const TQ_CONTACT_Y = TQ_HEADER_Y + 224 // 296
const TQ_AREA_Y = TQ_CONTACT_Y + 440 // 736

export const TRADES_TEMPLATE: StarterTemplate = {
  id: 'trades',
  pickerTitle: 'Trades & services',
  pickerLine: 'Phone-first, one band per service, and a quote page.',
  siteSettings: {
    businessName: '',
    tagline: 'Licensed, insured, and we show up when we say we will.',
    about: '',
    vibe: 'bold',
    styleNotes: '',
    colors: [],
  },
  pages: [
    {
      id: 'home',
      name: 'Home',
      slug: 'home',
      blocks: [
        navBar('trade-home-nav', TRADES_NAV),
        band('trade-home-hero-band', TH_HERO_Y, 424),
        band('trade-home-services-band', TH_SERVICES_Y, 480),
        {
          id: 'trade-home-hero-title',
          x: MARGIN_X,
          y: TH_HERO_Y + 64,
          width: 624,
          height: 104,
          type: 'heading',
          text: 'Ridgeway Plumbing & Heating',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'trade-home-hero-photo',
          ...COL_NARROW_RIGHT,
          type: 'image',
          y: TH_HERO_Y + 64,
          height: 296,
          text: '',
          fit: 'cover',
          description:
            'A photo of you and your van, or you on a job. People hire the person, not the logo — a real photo beats a stock one every time.',
          fromTemplate: true,
        },
        {
          id: 'trade-home-hero-sub',
          x: MARGIN_X,
          y: TH_HERO_Y + 192,
          width: 560,
          height: 72,
          type: 'text',
          text: 'Licensed, insured, and serving the Annapolis Valley since 2011. Same-day emergency callouts.',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'trade-home-hero-cta',
          x: MARGIN_X,
          y: TH_HERO_Y + 288,
          width: 264,
          height: 56,
          type: 'button',
          text: 'Get a free quote',
          link: { kind: 'page', pageId: 'quote' },
          fromTemplate: true,
        },
        {
          id: 'trade-home-services-title',
          ...COL_HALF_LEFT,
          type: 'heading',
          y: TH_SERVICES_Y + BAND_PAD_TOP,
          height: 56,
          text: 'What we do',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'trade-home-service-1',
          ...COL_THIRD_1,
          type: 'text',
          y: TH_SERVICES_Y + 128,
          height: 240,
          text: 'Boilers & furnaces\n\nInstalls, servicing and repairs on gas, oil and electric. We carry common parts on the van so most jobs finish the same day.',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'trade-home-service-2',
          ...COL_THIRD_2,
          type: 'text',
          y: TH_SERVICES_Y + 128,
          height: 240,
          text: 'Bathrooms & wet rooms\n\nFull fit-outs and small upgrades. We handle the plumbing, tiling and the mess, and we tidy up before we leave.',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          // Deliberately the same size as the two written-out services either side of it:
          // side by side, the client sees both copy modes at once.
          id: 'trade-home-service-3',
          ...COL_THIRD_3,
          type: 'text',
          y: TH_SERVICES_Y + 128,
          height: 240,
          text: '',
          copyMode: 'generate',
          generateDescription:
            "Short blurb about our 24/7 emergency callout service — under an hour into town, no weekend surcharge, and we'll tell you the price before we start.",
          lengthHint: '40–60 words',
          fromTemplate: true,
        },
        {
          id: 'trade-home-services-cta',
          x: MARGIN_X,
          y: TH_SERVICES_Y + 392,
          width: 280,
          height: 56,
          type: 'button',
          text: 'See all our services',
          link: { kind: 'page', pageId: 'services' },
          fromTemplate: true,
        },
      ],
    },
    {
      id: 'services',
      name: 'Services',
      slug: 'services',
      blocks: [
        navBar('trade-svc-nav', TRADES_NAV),
        band('trade-svc-header-band', TS_HEADER_Y, 200),
        band('trade-svc-a-band', TS_A_Y, 400),
        band('trade-svc-b-band', TS_B_Y, 440),
        {
          id: 'trade-svc-title',
          x: MARGIN_X,
          y: TS_HEADER_Y + BAND_PAD_TOP,
          width: 600,
          height: 64,
          type: 'heading',
          text: 'Our services',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'trade-svc-a-title',
          ...COL_HALF_LEFT,
          type: 'heading',
          y: TS_A_Y + BAND_PAD_TOP,
          height: 56,
          text: 'Boilers & furnaces',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'trade-svc-a-photo',
          ...COL_HALF_RIGHT,
          type: 'image',
          y: TS_A_Y + BAND_PAD_TOP,
          height: 304,
          text: '',
          fit: 'cover',
          description:
            "A job you're proud of. Before-and-after side by side works well if you have one.",
          fromTemplate: true,
        },
        {
          id: 'trade-svc-a-body',
          ...COL_HALF_LEFT,
          type: 'text',
          y: TS_A_Y + 120,
          height: 224,
          text: "What's included, roughly what it costs, and how long it takes. Two or three short paragraphs is plenty — people are checking you're the right trade, not reading a brochure.",
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'trade-svc-b-title',
          ...COL_HALF_LEFT,
          type: 'heading',
          y: TS_B_Y + BAND_PAD_TOP,
          height: 56,
          text: 'Bathrooms & wet rooms',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'trade-svc-b-photo',
          ...COL_HALF_RIGHT,
          type: 'image',
          y: TS_B_Y + BAND_PAD_TOP,
          height: 304,
          text: '',
          fit: 'cover',
          description:
            'A finished job for this service. Daylight, phone camera is fine, wide enough to see the whole room.',
          fromTemplate: true,
        },
        {
          id: 'trade-svc-b-body',
          ...COL_HALF_LEFT,
          type: 'text',
          y: TS_B_Y + 120,
          height: 224,
          text: "This band is a copy of the one above. Add a service by duplicating it and changing the words and the photo — that's the whole trick to building this page.",
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'trade-svc-b-cta',
          x: MARGIN_X,
          y: TS_B_Y + 360,
          width: 264,
          height: 56,
          type: 'button',
          text: 'Get a free quote',
          link: { kind: 'page', pageId: 'quote' },
          fromTemplate: true,
        },
      ],
    },
    {
      id: 'quote',
      name: 'Get a Quote',
      slug: 'get-a-quote',
      blocks: [
        navBar('trade-quote-nav', TRADES_NAV),
        band('trade-quote-header-band', TQ_HEADER_Y, 224),
        band('trade-quote-contact-band', TQ_CONTACT_Y, 440),
        band('trade-quote-area-band', TQ_AREA_Y, 336),
        {
          id: 'trade-quote-title',
          ...COL_WIDE_LEFT,
          type: 'heading',
          y: TQ_HEADER_Y + BAND_PAD_TOP,
          height: 64,
          text: 'Get a free quote',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'trade-quote-intro',
          x: MARGIN_X,
          y: TQ_HEADER_Y + 136,
          width: 704,
          height: 56,
          type: 'text',
          text: "Tell us what's going on and we'll come back to you within one working day.",
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'trade-quote-contact-title',
          ...COL_HALF_LEFT,
          type: 'heading',
          y: TQ_CONTACT_Y + BAND_PAD_TOP,
          height: 56,
          text: 'Call, text or email',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'trade-quote-badges',
          ...COL_HALF_RIGHT,
          type: 'image',
          y: TQ_CONTACT_Y + BAND_PAD_TOP,
          height: 280,
          text: '',
          fit: 'contain',
          description:
            'Your licence numbers, insurer and trade association badges, as one image. This is the block that makes strangers trust you.',
          fromTemplate: true,
        },
        {
          id: 'trade-quote-contact-body',
          ...COL_HALF_LEFT,
          type: 'text',
          y: TQ_CONTACT_Y + 112,
          height: 280,
          text: '(902) 555-0188\nhello@ridgewayplumbing.ca\n\nMonday – Friday  7am – 6pm\nEmergencies, any hour\n\nWant a contact form here instead of a phone number? Write down the boxes you want people to fill in and BOSS will build the real form.',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'trade-quote-area-title',
          ...COL_HALF_LEFT,
          type: 'heading',
          y: TQ_AREA_Y + BAND_PAD_TOP,
          height: 56,
          text: 'Areas we cover',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'trade-quote-area-body',
          ...COL_HALF_LEFT,
          type: 'text',
          y: TQ_AREA_Y + 112,
          height: 160,
          text: '',
          copyMode: 'generate',
          generateDescription:
            "A friendly line naming the towns we cover — Wolfville, Kentville, New Minas and Berwick — and saying we'll still travel further for bigger jobs.",
          lengthHint: '2 sentences',
          fromTemplate: true,
        },
        {
          id: 'trade-quote-area-cta',
          x: COL_HALF_RIGHT.x,
          y: TQ_AREA_Y + 112,
          width: 264,
          height: 56,
          type: 'button',
          text: 'See what we do',
          link: { kind: 'page', pageId: 'services' },
          fromTemplate: true,
        },
      ],
    },
  ],
}

/* ═══════════════════════════ 3 · PORTFOLIO ═══════════════════════════
 * Teaches: pictures are the content, captions are optional extras, and the landing page
 * doesn't have to be called "Home".
 */

const PORTFOLIO_NAV: readonly NavEntry[] = [
  ['Work', 'work'],
  ['About', 'about'],
  ['Contact', 'contact'],
]

/** Portfolio · Work (the home page). */
const PW_INTRO_Y = NAV_HEIGHT // 72
const PW_GRID_Y = PW_INTRO_Y + 264 // 336

/** Portfolio · About. */
const PA_ABOUT_Y = NAV_HEIGHT // 72
const PA_CLIENTS_Y = PA_ABOUT_Y + 504 // 576

/** Portfolio · Contact. */
const PC_HEADER_Y = NAV_HEIGHT // 72
const PC_REACH_Y = PC_HEADER_Y + 320 // 392
const PC_CTA_Y = PC_REACH_Y + 424 // 816

export const PORTFOLIO_TEMPLATE: StarterTemplate = {
  id: 'portfolio',
  pickerTitle: 'Portfolio',
  pickerLine: 'A grid of your work, an about page, and a way to hire you.',
  siteSettings: {
    businessName: '',
    tagline: "Portrait and food photography, Halifax and anywhere you'll fly me.",
    about: '',
    vibe: 'modern',
    styleNotes: '',
    colors: [],
  },
  pages: [
    {
      // Named "Work", not "Home" — on purpose: page names are the client's to choose.
      // It is still the home page, because pages[0] is.
      id: 'work',
      name: 'Work',
      slug: 'work',
      blocks: [
        navBar('port-work-nav', PORTFOLIO_NAV),
        band('port-work-intro-band', PW_INTRO_Y, 264),
        band('port-work-grid-band', PW_GRID_Y, 840),
        {
          id: 'port-work-title',
          x: MARGIN_X,
          y: PW_INTRO_Y + BAND_PAD_TOP,
          width: 704,
          height: 72,
          type: 'heading',
          text: 'Nadia Osei — Photography',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'port-work-sub',
          ...COL_WIDE_LEFT,
          type: 'text',
          y: PW_INTRO_Y + 136,
          height: 72,
          text: 'Portraits, restaurants and small brands. Based in Halifax, happy to travel.',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'port-work-img-a',
          ...COL_THIRD_1,
          type: 'image',
          y: PW_GRID_Y + BAND_PAD_TOP,
          height: 320,
          text: '',
          fit: 'cover',
          description:
            'Your single best piece of work. Whatever you put here is what people judge you on.',
          fromTemplate: true,
        },
        {
          id: 'port-work-img-b',
          ...COL_THIRD_2,
          type: 'image',
          y: PW_GRID_Y + BAND_PAD_TOP,
          height: 320,
          text: '',
          fit: 'cover',
          description: 'A second piece, ideally a different kind of job from the first.',
          fromTemplate: true,
        },
        {
          id: 'port-work-img-c',
          ...COL_THIRD_3,
          type: 'image',
          y: PW_GRID_Y + BAND_PAD_TOP,
          height: 320,
          text: '',
          fit: 'cover',
          description:
            'A third piece. Aim for variety across the row rather than six versions of one shoot.',
          fromTemplate: true,
        },
        {
          // Only image A gets a caption, on purpose: it shows the pattern without
          // cluttering the grid.
          id: 'port-work-cap-a',
          ...COL_THIRD_1,
          type: 'text',
          y: PW_GRID_Y + 384,
          height: 56,
          text: '',
          copyMode: 'generate',
          generateDescription:
            'One line naming this project — the client, what I shot for them, and where.',
          lengthHint: 'one line',
          fromTemplate: true,
        },
        {
          id: 'port-work-img-d',
          ...COL_THIRD_1,
          type: 'image',
          y: PW_GRID_Y + 480,
          height: 296,
          text: '',
          fit: 'cover',
          description: 'Row two — keep going, or delete this row if three pieces is your best work.',
          fromTemplate: true,
        },
        {
          id: 'port-work-img-e',
          ...COL_THIRD_2,
          type: 'image',
          y: PW_GRID_Y + 480,
          height: 296,
          text: '',
          fit: 'cover',
          description: 'Another piece. Copy this block across for as many as you want.',
          fromTemplate: true,
        },
        {
          // Sits in the empty third cell of row two so the grid still reads as a grid.
          id: 'port-work-cta',
          x: COL_THIRD_3.x,
          y: PW_GRID_Y + 504,
          width: 264,
          height: 56,
          type: 'button',
          text: 'Work with me',
          link: { kind: 'page', pageId: 'contact' },
          fromTemplate: true,
        },
      ],
    },
    {
      id: 'about',
      name: 'About',
      slug: 'about',
      blocks: [
        navBar('port-about-nav', PORTFOLIO_NAV),
        band('port-about-band', PA_ABOUT_Y, 504),
        band('port-about-clients-band', PA_CLIENTS_Y, 400),
        {
          id: 'port-about-portrait',
          ...COL_PORTRAIT,
          type: 'image',
          y: PA_ABOUT_Y + BAND_PAD_TOP,
          height: 400,
          text: '',
          fit: 'cover',
          description:
            'A photo of you. Clients hire a person — this is the most important picture on your site after your work.',
          fromTemplate: true,
        },
        {
          id: 'port-about-title',
          ...COL_BESIDE_PORTRAIT,
          type: 'heading',
          y: PA_ABOUT_Y + 64,
          height: 64,
          text: 'About Nadia',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'port-about-body',
          ...COL_BESIDE_PORTRAIT,
          type: 'text',
          y: PA_ABOUT_Y + 152,
          height: 264,
          text: 'Who you are, how you got here, and what it\'s like to work with you. Write it the way you\'d say it out loud — three short paragraphs beats one long one.\n\nNot sure where to start? Switch this block to "Write it for me" and just tell us the gist.',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'port-about-clients-title',
          ...COL_HALF_LEFT,
          type: 'heading',
          y: PA_CLIENTS_Y + BAND_PAD_TOP,
          height: 56,
          text: 'Clients & press',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'port-about-logos',
          ...COL_HALF_RIGHT,
          type: 'image',
          y: PA_CLIENTS_Y + BAND_PAD_TOP,
          height: 176,
          text: '',
          fit: 'contain',
          description: 'Your client logos in a single row, saved as one image.',
          fromTemplate: true,
        },
        {
          id: 'port-about-clients-list',
          ...COL_PORTRAIT,
          type: 'text',
          y: PA_CLIENTS_Y + 120,
          height: 240,
          text: "The Coast\nSaltscapes Magazine\nTwo If By Sea\nHalifax Seaport Market\n\nOne name per line. Delete this whole band if you're just starting out — an empty client list is worse than no client list.",
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'port-about-cta',
          x: COL_HALF_RIGHT.x,
          y: PA_CLIENTS_Y + 256,
          width: 264,
          height: 56,
          type: 'button',
          text: 'See my work',
          link: { kind: 'page', pageId: 'work' },
          fromTemplate: true,
        },
      ],
    },
    {
      id: 'contact',
      name: 'Contact',
      slug: 'contact',
      blocks: [
        navBar('port-contact-nav', PORTFOLIO_NAV),
        band('port-contact-header-band', PC_HEADER_Y, 320),
        band('port-contact-band', PC_REACH_Y, 424),
        band('port-contact-cta-band', PC_CTA_Y, 240),
        {
          id: 'port-contact-title',
          x: MARGIN_X,
          y: PC_HEADER_Y + 56,
          width: 600,
          height: 64,
          type: 'heading',
          text: "Let's talk",
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'port-contact-intro',
          x: MARGIN_X,
          y: PC_HEADER_Y + 136,
          width: 600,
          height: 112,
          type: 'text',
          text: "Tell me what you're shooting, roughly when, and where. I'll come back with availability and a price the same week.",
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'port-contact-reach-title',
          ...COL_HALF_LEFT,
          type: 'heading',
          y: PC_REACH_Y + BAND_PAD_TOP,
          height: 56,
          text: 'How to reach me',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'port-contact-photo',
          ...COL_HALF_RIGHT,
          type: 'image',
          y: PC_REACH_Y + BAND_PAD_TOP,
          height: 320,
          text: '',
          fit: 'cover',
          description:
            'A behind-the-scenes shot from a shoot — you working, not a posed portrait.',
          fromTemplate: true,
        },
        {
          id: 'port-contact-reach-body',
          ...COL_HALF_LEFT,
          type: 'text',
          y: PC_REACH_Y + 112,
          height: 224,
          text: "nadia@nadiaosei.ca\n(902) 555-0176\n@nadiaoseiphoto\n\nPrefer people fill in a form? List the questions you'd want answered and BOSS will build it.",
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'port-contact-cta-title',
          x: MARGIN_X,
          y: PC_CTA_Y + BAND_PAD_TOP,
          width: 1040,
          height: 56,
          type: 'heading',
          text: 'Based in Halifax, shooting Canada-wide',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'port-contact-cta',
          x: MARGIN_X,
          y: PC_CTA_Y + 120,
          width: 264,
          height: 56,
          type: 'button',
          text: 'Back to my work',
          link: { kind: 'page', pageId: 'work' },
          fromTemplate: true,
        },
      ],
    },
  ],
}

/* ═══════════════════════════ 4 · SHOP ═══════════════════════════
 * Teaches: the product card — a picture with a name and price underneath, copied across a
 * row — and where the "buy" part of a real shop will be wired in later.
 */

const SHOP_NAV: readonly NavEntry[] = [
  ['Home', 'home'],
  ['Shop', 'shop'],
  ['Find Us', 'contact'],
]

/** Shop · Home. */
const SH_HERO_Y = NAV_HEIGHT // 72
const SH_FEATURED_Y = SH_HERO_Y + 424 // 496

/** Shop · Shop. */
const SS_HEADER_Y = NAV_HEIGHT // 72
const SS_GRID_Y = SS_HEADER_Y + 224 // 296

/** Shop · Find Us. */
const SC_HEADER_Y = NAV_HEIGHT // 72
const SC_STORE_Y = SC_HEADER_Y + 200 // 272
const SC_SHIP_Y = SC_STORE_Y + 440 // 712

export const SHOP_TEMPLATE: StarterTemplate = {
  id: 'shop',
  pickerTitle: 'Shop',
  pickerLine: 'Product pictures with names and prices, plus your opening hours.',
  siteSettings: {
    businessName: '',
    tagline: 'Small-batch goods, made on the South Shore.',
    about: '',
    vibe: 'warm',
    styleNotes: '',
    colors: [],
  },
  pages: [
    {
      id: 'home',
      name: 'Home',
      slug: 'home',
      blocks: [
        navBar('shop-home-nav', SHOP_NAV),
        band('shop-home-hero-band', SH_HERO_Y, 424),
        band('shop-home-featured-band', SH_FEATURED_Y, 560),
        {
          id: 'shop-home-hero-photo',
          type: 'image',
          x: 0,
          y: SH_HERO_Y,
          width: PAGE_WIDTH_PX,
          height: 424,
          text: '',
          fit: 'cover',
          description:
            'A wide shot of your products together, or of the shop itself. Leave some plain space on the left so the words below sit on top of it comfortably.',
          fromTemplate: true,
        },
        {
          // DELIBERATE OVERLAP: heading + button sit ON the hero photo (same lesson as
          // the Restaurant home page).
          id: 'shop-home-hero-title',
          x: MARGIN_X,
          y: SH_HERO_Y + 160,
          width: 664,
          height: 80,
          type: 'heading',
          text: 'Northwind Goods',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'shop-home-hero-cta',
          x: MARGIN_X,
          y: SH_HERO_Y + 272,
          width: 280,
          height: 56,
          type: 'button',
          text: 'Shop the collection',
          link: { kind: 'page', pageId: 'shop' },
          fromTemplate: true,
        },
        {
          id: 'shop-home-featured-title',
          ...COL_HALF_LEFT,
          type: 'heading',
          y: SH_FEATURED_Y + BAND_PAD_TOP,
          height: 56,
          text: "This month's picks",
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'shop-home-feat-1',
          ...COL_THIRD_1,
          type: 'image',
          y: SH_FEATURED_Y + 128,
          height: 280,
          text: '',
          fit: 'cover',
          description: 'Your best seller, shot on a plain background in daylight.',
          fromTemplate: true,
        },
        {
          id: 'shop-home-feat-2',
          ...COL_THIRD_2,
          type: 'image',
          y: SH_FEATURED_Y + 128,
          height: 280,
          text: '',
          fit: 'cover',
          description: 'Something new, or seasonal.',
          fromTemplate: true,
        },
        {
          id: 'shop-home-feat-3',
          ...COL_THIRD_3,
          type: 'image',
          y: SH_FEATURED_Y + 128,
          height: 280,
          text: '',
          fit: 'cover',
          description: 'The one people always ask about.',
          fromTemplate: true,
        },
        {
          id: 'shop-home-promise',
          ...COL_FULL,
          type: 'text',
          y: SH_FEATURED_Y + 432,
          height: 72,
          text: '',
          copyMode: 'generate',
          generateDescription:
            'One warm line about what makes our stuff different — made by hand in small batches on the South Shore, no synthetic fragrance, free local delivery over $75.',
          lengthHint: '1–2 sentences',
          fromTemplate: true,
        },
      ],
    },
    {
      id: 'shop',
      name: 'Shop',
      slug: 'shop',
      blocks: [
        navBar('shop-shop-nav', SHOP_NAV),
        band('shop-shop-header-band', SS_HEADER_Y, 224),
        band('shop-shop-grid-band', SS_GRID_Y, 600),
        {
          id: 'shop-shop-title',
          x: MARGIN_X,
          y: SS_HEADER_Y + BAND_PAD_TOP,
          width: 400,
          height: 64,
          type: 'heading',
          text: 'Shop',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'shop-shop-intro',
          x: MARGIN_X,
          y: SS_HEADER_Y + 136,
          width: 664,
          height: 72,
          type: 'text',
          text: 'Everything is made in small batches, so what you see here is what we have.',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'shop-shop-img-1',
          ...COL_THIRD_1,
          type: 'image',
          y: SS_GRID_Y + BAND_PAD_TOP,
          height: 296,
          text: '',
          fit: 'cover',
          description:
            "One product, plain background, shot straight on. Keep every product photo the same distance and background — that's what makes a shop page look tidy.",
          fromTemplate: true,
        },
        {
          id: 'shop-shop-img-2',
          ...COL_THIRD_2,
          type: 'image',
          y: SS_GRID_Y + BAND_PAD_TOP,
          height: 296,
          text: '',
          fit: 'cover',
          description: 'Second product, framed exactly like the first.',
          fromTemplate: true,
        },
        {
          id: 'shop-shop-img-3',
          ...COL_THIRD_3,
          type: 'image',
          y: SS_GRID_Y + BAND_PAD_TOP,
          height: 296,
          text: '',
          fit: 'cover',
          description: 'Third product. Copy this picture-and-caption pair for every item you sell.',
          fromTemplate: true,
        },
        {
          // The image + caption pair is the unit to copy — worth saying in the picker copy.
          id: 'shop-shop-cap-1',
          ...COL_THIRD_1,
          type: 'text',
          y: SS_GRID_Y + 360,
          height: 72,
          text: 'Cedar & Sea Salt candle\n$28',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'shop-shop-cap-2',
          ...COL_THIRD_2,
          type: 'text',
          y: SS_GRID_Y + 360,
          height: 72,
          text: 'Linen tea towel, two-pack\n$34',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'shop-shop-cap-3',
          ...COL_THIRD_3,
          type: 'text',
          y: SS_GRID_Y + 360,
          height: 72,
          text: 'Stoneware mug\n$42',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'shop-shop-cta',
          x: MARGIN_X,
          y: SS_GRID_Y + 464,
          width: 304,
          height: 56,
          type: 'button',
          text: 'Questions? Talk to us',
          link: { kind: 'page', pageId: 'contact' },
          fromTemplate: true,
        },
      ],
    },
    {
      id: 'contact',
      name: 'Find Us',
      slug: 'find-us',
      blocks: [
        navBar('shop-contact-nav', SHOP_NAV),
        band('shop-contact-header-band', SC_HEADER_Y, 200),
        band('shop-contact-store-band', SC_STORE_Y, 440),
        band('shop-contact-ship-band', SC_SHIP_Y, 320),
        {
          id: 'shop-contact-title',
          ...COL_HALF_LEFT,
          type: 'heading',
          y: SC_HEADER_Y + BAND_PAD_TOP,
          height: 64,
          text: 'Find us',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'shop-contact-store-title',
          ...COL_HALF_LEFT,
          type: 'heading',
          y: SC_STORE_Y + BAND_PAD_TOP,
          height: 56,
          text: 'In the shop',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'shop-contact-store-photo',
          ...COL_HALF_RIGHT,
          type: 'image',
          y: SC_STORE_Y + BAND_PAD_TOP,
          height: 344,
          text: '',
          fit: 'cover',
          description:
            'Your storefront from the sidewalk, sign visible. This is how people find you on foot.',
          fromTemplate: true,
        },
        {
          id: 'shop-contact-store-body',
          ...COL_HALF_LEFT,
          type: 'text',
          y: SC_STORE_Y + 112,
          height: 280,
          text: '22 Montague Street\nLunenburg, NS  B0J 2C0\n(902) 555-0119\n\nThursday – Saturday  10am – 5pm\nSunday  11am – 4pm\n\nWant a map on this page? Say so and BOSS will drop one in.',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'shop-contact-ship-title',
          x: MARGIN_X,
          y: SC_SHIP_Y + BAND_PAD_TOP,
          width: 560,
          height: 56,
          type: 'heading',
          text: 'Online orders & shipping',
          copyMode: 'real',
          fromTemplate: true,
        },
        {
          id: 'shop-contact-ship-body',
          x: MARGIN_X,
          y: SC_SHIP_Y + 112,
          width: 560,
          height: 144,
          type: 'text',
          text: '',
          copyMode: 'generate',
          generateDescription:
            'Two plain sentences about shipping — we ship Canada-wide, $12 flat rate, free over $75, and orders go out within two business days.',
          lengthHint: '2 sentences',
          fromTemplate: true,
        },
        {
          id: 'shop-contact-ship-cta',
          x: 704,
          y: SC_SHIP_Y + 112,
          width: 264,
          height: 56,
          type: 'button',
          text: 'Back to the shop',
          link: { kind: 'page', pageId: 'shop' },
          fromTemplate: true,
        },
      ],
    },
  ],
}

/**
 * The picker's four starter templates, in display order.
 * Blank ("Start blank") is deliberately NOT a fixture: it is zero blocks plus a dismissible
 * coach overlay (docs/decisions.md 2026-07-28), so there is nothing here to seed.
 */
export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  RESTAURANT_TEMPLATE,
  TRADES_TEMPLATE,
  PORTFOLIO_TEMPLATE,
  SHOP_TEMPLATE,
]
