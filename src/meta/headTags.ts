import { DEPLOYED_BASE_URL } from '../../site.config.ts'

/**
 * WHAT THE PAGE SAYS ABOUT ITSELF when it is pasted into a message.
 *
 * `index.html` is a static file — there is no server and no framework head
 * manager — so these strings are written there by hand. They are ALSO exported
 * here, and `headTags.test.ts` asserts the file agrees with them, because the
 * failure mode this guards against is silent: a relative `og:image` produces a
 * blank card in every chat client and nothing in the browser complains.
 *
 * Everything absolute is derived from `DEPLOYED_BASE_URL` (`site.config.ts`).
 * That paid off on 2026-07-31, when the app moved to the custom domain
 * `sketch.bossolutions.pro`: every URL below followed from one edited constant,
 * and the assertions here proved `index.html` had followed it too.
 */

/** ≤ 60 characters: past that, search results and tab titles truncate it. */
export const TITLE_MAX_LENGTH = 60

/** The window search engines and link unfurlers actually show. */
export const DESCRIPTION_MIN_LENGTH = 110
export const DESCRIPTION_MAX_LENGTH = 160

export const PAGE_TITLE = 'Sketch your website — BOSS Blueprint'

export const PAGE_DESCRIPTION =
  'Lay out your future website page by page in your browser — blocks, notes and photos — then send BOSS a ready-to-build package. Free, no account.'

/** Open Graph's own recommendation, and what every unfurler crops to. */
export const CARD_WIDTH = 1200
export const CARD_HEIGHT = 630

/** Committed bytes in `public/`; regenerate with `scripts/brand/make-brand-assets.mjs`. */
export const CARD_FILE_NAME = 'og-card.png'

export const CANONICAL_URL = DEPLOYED_BASE_URL
export const CARD_URL = `${DEPLOYED_BASE_URL}${CARD_FILE_NAME}`

export const CARD_ALT = 'BOSS Blueprint — sketch your website page by page'

/** Matches `--boss-ink`; the browser chrome tint on mobile and in installed tabs. */
export const THEME_COLOR = '#0b1220'

/**
 * The tags `index.html` must carry, as `name`/`property` → content. Split by
 * attribute because Open Graph is `property=` and Twitter is `name=`, and a
 * scraper that wants one will not read the other.
 */
export const META_NAME_TAGS: Readonly<Record<string, string>> = {
  description: PAGE_DESCRIPTION,
  'theme-color': THEME_COLOR,
  'twitter:card': 'summary_large_image',
  'twitter:title': PAGE_TITLE,
  'twitter:description': PAGE_DESCRIPTION,
  'twitter:image': CARD_URL,
  'twitter:image:alt': CARD_ALT,
}

export const META_PROPERTY_TAGS: Readonly<Record<string, string>> = {
  'og:type': 'website',
  'og:site_name': 'BOSS Blueprint',
  'og:title': PAGE_TITLE,
  'og:description': PAGE_DESCRIPTION,
  'og:url': CANONICAL_URL,
  'og:image': CARD_URL,
  'og:image:width': String(CARD_WIDTH),
  'og:image:height': String(CARD_HEIGHT),
  'og:image:alt': CARD_ALT,
}

/** Every self-hosted icon the head references. Each one must return 200. */
export const ICON_FILE_NAMES: readonly string[] = [
  'favicon.svg',
  'favicon.ico',
  'apple-touch-icon.png',
]
