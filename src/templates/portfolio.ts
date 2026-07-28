import {
  BAND_PAD_TOP,
  COL_BESIDE_PORTRAIT,
  COL_HALF_LEFT,
  COL_HALF_RIGHT,
  COL_PORTRAIT,
  COL_THIRD_1,
  COL_THIRD_2,
  COL_THIRD_3,
  COL_WIDE_LEFT,
  MARGIN_X,
  NAV_HEIGHT,
  band,
  navBar,
} from './layout.ts'
import type { NavEntry, StarterTemplate } from './layout.ts'

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
