/**
 * DRAWN REGIONS, NARRATED AS PAGE CONTENT — `docs/export-format.md` §3.2, §4.4 [N14]
 * and §5 V30.
 *
 * This module assembles a page's ink narration: the lead paragraphs that follow the
 * `Sketch:` line, and the bullet list that follows the block walkthrough. The bullets
 * themselves live in `inkBullets.ts` and what is inside a container in
 * `inkContents.ts`; the split is the 400-line house limit, and the seam is deliberate
 * — this file decides WHAT gets a bullet, those decide what a bullet SAYS.
 *
 * The root cause this whole feature fixes is a brief that told a zero-context builder,
 * in bold, "do not invent extra sections", and offered a pen mark exactly three
 * readings — "words, an arrow, or an emphasis mark" — with permission to skip it if
 * illegible. A perfect `penRegions` array produced nothing in the built site. Every
 * paragraph and bullet here removes one specific permission to ship nothing.
 *
 * TWO STANDING RULES, both machine-checked in `ink.test.ts` on every branch:
 *
 *  1. NO `«…»`, EVER. V7 requires every guillemet span to resolve to a real
 *     `site.json` string; ink carries geometry and never text.
 *  2. NO NUMBER THIS MODULE HAS NOT MEASURED. `text.lines` is `1` for EVERY `writing`
 *     region — `classify.ts` counts rows only for a `textPlaceholder` stack, never for
 *     handwriting — so no bullet prints a line count for handwriting. It prints the
 *     word count, the glyph height and the box, all of which the classifier really
 *     measured, and says "topmost first" where a line count would have been.
 */

import {
  EXPORT_PAGE_WIDTH,
  type ExportPage,
  type ExportPenRegion,
  type SiteJson,
} from '../types.ts'

import { regionBullet, setBullets } from './inkBullets.ts'
import { type CopySources, regionsOf, topLevelRegions } from './inkContents.ts'
import { num } from './text.ts'

export { regionsOf, topLevelRegions } from './inkContents.ts'

/**
 * §3.2 — whether the sections an ink bullet sends the builder to actually hold copy.
 * Read here, once, so no bullet has to guess whether `The business` is empty.
 */
export function copySourcesOf(site: SiteJson): CopySources {
  const settings = site.siteSettings
  return { hasBusinessWords: settings.tagline !== null || settings.about !== null }
}

/**
 * §4.3 — the long edge an image input carries. A page taller than this reaches the
 * builder DOWNSCALED, which is the one condition under which "look at the PNG" is
 * advice that cannot work.
 */
const IMAGE_INPUT_LONG_EDGE_PX = 2576

/** The magnification the rebuild ladder asks for when the PNG will not read. */
const INK_REBUILD_SCALE = 4

/* ── the per-page lead paragraphs ──────────────────────────────────────────── */

/** §3.2 — the pen-only page. Zero blocks and at least one region: the list IS the page. */
const PEN_ONLY_PAGE =
  '**This page has no blocks — the client drew it instead.** Everything on this page comes from ' +
  'the drawn regions below. Treat that list as the complete page, top to bottom, exactly as you ' +
  'would treat a block walkthrough: build every region, in the order given, with real markup and ' +
  'real styling. This page is not empty and it must not ship empty.'

/**
 * The three-tier reading ladder, and the reason a tall page needs no crop PNGs: tier 2
 * is resolution-independent, so transcription degrades gracefully instead of failing
 * silently, and a builder who cannot read a mark still builds the region.
 */
function readingLadder(page: ExportPage): string {
  return (
    '**The client drew part of this page by hand.** The drawn regions below are page content to ' +
    `BUILD, not notes about the blocks. \`${page.screenshot}\` is a 1× render of the ` +
    `${String(EXPORT_PAGE_WIDTH)} × ${num(page.height)} px page, so every coordinate below is a ` +
    'pixel in that PNG. Where a region asks you to read handwriting: (1) look at the PNG at the ' +
    "coordinates given; (2) if you cannot make the words out, rebuild that region's ink at " +
    `${String(INK_REBUILD_SCALE)}× — for each \`stk_\` id listed, take its \`points\`, \`color\` ` +
    'and `width` from `site.json` and draw one `<polyline>` per stroke into an SVG whose ' +
    `\`viewBox\` is the region's box, scaled ${String(INK_REBUILD_SCALE)}×, then render that and ` +
    'read it; (3) if it is still unreadable, build the region anyway using the fallback its bullet ' +
    'gives you and log it in BUILD_NOTES.md under "Pen marks I could not read" with the page, the ' +
    'region id and its coordinates. Never silently drop a region.'
  )
}

function downscaleWarning(page: ExportPage): string {
  const ratio = (Math.round((IMAGE_INPUT_LONG_EDGE_PX / page.height) * 100) / 100).toFixed(2)
  return (
    `This page is ${String(EXPORT_PAGE_WIDTH)} × ${num(page.height)} px — taller than the ` +
    `${String(IMAGE_INPUT_LONG_EDGE_PX)} px long edge your image input carries, so this PNG reaches ` +
    `you downscaled to about ${ratio}× and fine handwriting may not survive it. For every region ` +
    `below that asks you to read handwriting, go straight to the ${String(INK_REBUILD_SCALE)}× rebuild.`
  )
}

/**
 * §2.5 `extraBottomPx` — room the client added on purpose, not a spacer to reproduce.
 *
 * It is the room the client ADDED (§4.2: purely additive, on top of the +160 breathing
 * room and the grid rounding), never the gap you can measure below the last element.
 * Calling it the gap sent two of three test builders into a paragraph of arithmetic
 * trying to reconcile the number with the geometry.
 */
function closingSpace(extraBottomPx: number): string {
  const room = `${num(extraBottomPx)}px`
  return (
    `The client deliberately added ${room} of empty space at the bottom of this page with the ` +
    `editor's "Add space" control. That room is added on top of the closing space every page ` +
    'already has below its last element, so the gap you can measure under the last thing in the ' +
    `PNG is larger than ${room} — the ${room} is the client's request, not the measurement. Read ` +
    'it as design intent: real breathing room at the end of this page — generous bottom padding on ' +
    `the final section, or a quiet closing band — not a ${room} empty spacer element.`
  )
}

/** The paragraphs that follow the `Sketch:` line. Blank-line separation is the caller's. */
export function inkLeadParagraphs(page: ExportPage): string[] {
  const paragraphs: string[] = []
  if (regionsOf(page).length > 0) {
    if (page.blocks.length === 0) paragraphs.push(PEN_ONLY_PAGE)
    paragraphs.push(readingLadder(page))
    if (page.height > IMAGE_INPUT_LONG_EDGE_PX) paragraphs.push(downscaleWarning(page))
  }
  const extra = page.extraBottomPx ?? 0
  if (extra > 0) paragraphs.push(closingSpace(extra))
  return paragraphs
}

/* ── the bullet list ───────────────────────────────────────────────────────── */

/** §3.2 — the header that separates drawn content from the block bullets above it. */
const INK_SECTION_HEADER = '**What the client drew on this page** — build every one of these:'

/**
 * The `<h1>` sentence goes on exactly one region per page, and only when no heading
 * block supplies one — it is the only thing that makes definition-of-done item 2's
 * "each page has exactly one `<h1>`" satisfiable on a page the client drew instead of
 * blocking out. Ties go to the first in emission order, so it is deterministic.
 */
function h1RegionId(page: ExportPage): string | null {
  if (page.blocks.some((block) => block.type === 'heading')) return null

  let best: ExportPenRegion | null = null
  for (const region of topLevelRegions(page)) {
    if (region.kind !== 'writing' || region.text === null) continue
    if (region.text.emphasis === 'body') continue
    if (best?.text == null || region.text.glyphHeight > best.text.glyphHeight) best = region
  }
  return best?.id ?? null
}

/**
 * One bullet per TOP-LEVEL region, in the producer's own depth-first order, plus one
 * indented bullet per member of a sibling set. A set is emitted where its FIRST member
 * falls and its remaining members are not emitted again, so the list stays in reading
 * order and every region is narrated exactly once.
 */
export function inkRegionBullets(page: ExportPage, sources: CopySources): string[] {
  const all = regionsOf(page)
  const top = topLevelRegions(page)
  if (top.length === 0) return []

  const h1 = h1RegionId(page)
  const emitted = new Set<string>()
  const bullets: string[] = []

  for (const region of top) {
    if (emitted.has(region.id)) continue

    if (region.kind === 'panel' && region.setId !== null) {
      const members = top
        .filter((other) => other.setId === region.setId)
        .sort((a, b) => (a.setIndex ?? 0) - (b.setIndex ?? 0))
      for (const member of members) emitted.add(member.id)
      bullets.push(...setBullets(members, page, all, sources))
      continue
    }

    emitted.add(region.id)
    bullets.push(regionBullet(region, page, all, region.id === h1, sources))
  }

  return [INK_SECTION_HEADER, ...bullets, '']
}

/**
 * The copy-list fallback's condition: a site with nothing to write from BLOCKS, but
 * copy in its ink. Saying "the client wrote all their own copy" there denies the
 * client's headline twice.
 *
 * `textPlaceholder` joins the predicate in v2.5. A page whose only ink was
 * placeholder squiggles fell through to the "all their own copy" fallback while
 * stacks of body copy the builder had to WRITE waited in the walkthrough — the same
 * denial, one region kind over.
 */
export function siteHasDrawnCopy(site: SiteJson): boolean {
  return site.pages.some((page) =>
    regionsOf(page).some(
      (region) =>
        region.kind === 'writing' || region.kind === 'navRow' || region.kind === 'textPlaceholder',
    ),
  )
}
