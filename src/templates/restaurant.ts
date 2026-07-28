import { PAGE_WIDTH_PX } from '../canvas/constants.ts'

import {
  BAND_PAD_TOP,
  COL_HALF_LEFT,
  COL_HALF_RIGHT,
  COL_THIRD_1,
  COL_THIRD_2,
  COL_THIRD_3,
  MARGIN_X,
  NAV_HEIGHT,
  band,
  navBar,
} from './layout.ts'
import type { NavEntry, StarterTemplate } from './layout.ts'

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
