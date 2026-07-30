/**
 * INK REGIONS AS THE PACKAGE SEES THEM — `docs/export-format.md` §2.5 / §4.5.
 *
 * `src/canvas/ink/` answers "what is this run of ink?". This module is the only
 * thing that turns that answer into contract shape, and it does exactly three
 * jobs, none of them inference:
 *
 *   1. SPEAK EXPORT. The inference runs on the EXPORT blocks and the EXPORT
 *      strokes, so the ids it hands back are already `blk_NNNN`/`stk_NNNN` and
 *      the geometry it measured is the geometry the package ships. Running it on
 *      document strokes and translating afterwards would let the remap and the
 *      reading disagree — the same argument `penRoles.ts` makes for
 *      `targetBlockId`.
 *   2. DROP `annotation`. The ink module emits unmatched ink as an `annotation`
 *      region so nothing is ever lost; the CONTRACT has no such kind, because
 *      that ink is narrated by the [N7] cluster bullets exactly as it always was.
 *      Publishing it would tell a builder to construct a doodle.
 *   3. MINT SITE-WIDE IDS. The ink module is pure and per-page, so its `reg_`/
 *      `set_` ordinals restart on every page. Re-minting them through the export
 *      pass's own counter (§4.8) is what makes a region id mean one thing across
 *      the whole package.
 *   4. SAY WHICH KIND OF PANEL (§4.9.10). A drawn box with something drawn inside
 *      it is a `card`; a drawn box with nothing inside it is a `mediaBox` the
 *      builder fills with a real image. Both are `kind: "panel"` and the two used
 *      to be byte-identical in `site.json`, so a reviewer applying the JSON
 *      strictly built the empty one as a third card — see `panelVariant`.
 *
 * Pure and deterministic: same blocks + same strokes + same minter state → the
 * same regions, byte for byte.
 */

import { inkRegions } from '../canvas/ink/classify.ts'
import { toInkBlockKind, type InkBlock, type InkRegion } from '../canvas/ink/types.ts'
import type { PenStroke } from '../canvas/types.ts'

import type { IdPrefix } from './ids.ts'
import { roundCoordinate } from './penRoles.ts'
import type {
  ExportBbox,
  ExportBlock,
  ExportPenRegion,
  ExportPenStroke,
  ExportRegionText,
  PenRegionKind,
} from './types.ts'

/** Only the two prefixes this module mints, so a caller cannot pass the wrong one. */
export type RegionIdMinter = (prefix: Extract<IdPrefix, 'reg' | 'set'>) => string

/**
 * The ink module's `writing` sub-kinds. They are an EMPHASIS, not a shape, so they
 * travel in `text.emphasis` where a builder reading the field knows to set type at
 * that prominence — not in `variant`, which names what a thing IS.
 */
const EMPHASIS_VARIANTS: readonly string[] = ['display', 'heading', 'body']

/**
 * §4.9.10 — the two `panel` sub-kinds, and the only thing that separates them.
 *
 * `kind` cannot: a drawn pricing card and an empty drawn media box are both an
 * enclosure of ink, and the classifier calls both `panel`. What distinguishes them
 * is whether anything is drawn INSIDE, which is a property of the region tree, not
 * of the box's own geometry — so it is named here, in `variant`, rather than
 * inferred again by every consumer that walks `parentRegionId`.
 *
 * `variant` is a free producer string by design (§6.2), so a second value costs no
 * schema change and a consumer that does not know it falls back to `kind` and
 * builds a container either way.
 */
export const PANEL_CARD_VARIANT = 'card'
export const PANEL_MEDIA_VARIANT = 'mediaBox'

/** `annotation` is the one ink kind with no contract kind. Everything else maps 1:1. */
const PUBLISHED_KINDS: readonly string[] = [
  'panel',
  'writing',
  'navRow',
  'rule',
  'textPlaceholder',
  'artwork',
]

/** §2.2 requires `words >= 1`, so a region with no words carries no `text` at all. */
const MIN_TEXT_WORDS = 1

/** A single line is what one run of writing is, absent evidence of more. */
const DEFAULT_TEXT_LINES = 1

function isPublished(region: InkRegion): boolean {
  return PUBLISHED_KINDS.includes(region.kind)
}

/** The three facts the inference needs about a block, in ITS vocabulary (§4.7). */
function toInkBlocks(blocks: readonly ExportBlock[]): InkBlock[] {
  return blocks.map((block) => ({
    id: block.id,
    type: toInkBlockKind(block.type),
    frame: block.frame,
  }))
}

/**
 * Export strokes back into the `{x, y}` point shape the canvas layer speaks. The
 * VALUES are the export's own — RDP-thinned at ε = 0.75px and rounded to one
 * decimal — because those are the pixels the builder will actually see.
 */
function toInkStrokes(strokes: readonly ExportPenStroke[]): PenStroke[] {
  return strokes.map((stroke) => ({
    id: stroke.id,
    points: stroke.points.map(([x, y]) => ({ x, y })),
    color: stroke.color,
    width: stroke.width,
  }))
}

function toBbox(frame: InkRegion['frame']): ExportBbox {
  return {
    x: roundCoordinate(frame.x),
    y: roundCoordinate(frame.y),
    w: roundCoordinate(frame.w),
    h: roundCoordinate(frame.h),
  }
}

/**
 * `writing` and `navRow` only. Everything else — a panel, a rule, a drawn cat —
 * has no words to count, and inventing a `text` block for it would tell a builder
 * to look for lettering that is not there.
 *
 * `lines` falls back to 1 because the ink module counts lines for a
 * `textPlaceholder` STACK (where each squiggle is a line) and not for handwriting,
 * whose letters it measures rather than its rows. One run of writing is one line
 * unless something measured says otherwise.
 */
function toRegionText(region: InkRegion): ExportRegionText | null {
  if (region.kind !== 'writing' && region.kind !== 'navRow') return null

  const words = region.words ?? 0
  if (words < MIN_TEXT_WORDS) return null

  const emphasis = region.variant
  return {
    lines: region.lines ?? DEFAULT_TEXT_LINES,
    words,
    glyphHeight: roundCoordinate(region.glyphHeight ?? 0),
    align: region.align ?? 'left',
    emphasis: emphasis === 'display' || emphasis === 'heading' ? emphasis : 'body',
  }
}

/**
 * `variant` carries sub-KINDS only; the emphasis words are `text.emphasis`'s job.
 *
 * A `panel`'s sub-kind is decided HERE and not in the ink module, because it is
 * decided over the PUBLISHED regions. The ink module parents unclassifiable ink to
 * the enclosure that holds it, and that ink is dropped at this boundary — so a box
 * containing one doodle has a child in the module's tree and nothing at all in the
 * package. [N14]'s empty-box branch walks the published tree; computing the variant
 * anywhere else would let `site.json` and `brief.md` disagree about the same box.
 */
function toVariant(region: InkRegion, hasContents: boolean): { readonly variant?: string } {
  if (region.kind === 'panel') {
    return { variant: hasContents ? PANEL_CARD_VARIANT : PANEL_MEDIA_VARIANT }
  }
  const { variant } = region
  if (variant === null || EMPHASIS_VARIANTS.includes(variant)) return {}
  return { variant }
}

/**
 * THE ENTRY POINT — a page's export blocks and export strokes in, its published
 * regions out, with every id minted from `mint`.
 *
 * `mint` is the export pass's own counter, so calling this once per page in page
 * order yields dense site-wide ordinals. Ids are assigned in EMISSION order, which
 * is the depth-first order the ink module already put the regions in, so a parent
 * is always numbered before its children and V28's order check holds by
 * construction.
 */
export function toExportRegions(
  blocks: readonly ExportBlock[],
  strokes: readonly ExportPenStroke[],
  mint: RegionIdMinter,
): readonly ExportPenRegion[] {
  const published = inkRegions(toInkBlocks(blocks), toInkStrokes(strokes)).filter(isPublished)
  if (published.length === 0) return []

  // Two passes, because `parentRegionId` and `setId` name ids that must already
  // exist. Minting first and mapping second is what keeps the ordinals dense
  // across the `annotation` drop — a region that is not published never takes a
  // number, so the sequence has no holes for a reader to wonder about.
  const regionIds = new Map<string, string>()
  const setIds = new Map<string, string>()
  for (const region of published) {
    regionIds.set(region.id, mint('reg'))
    if (region.setId !== null && !setIds.has(region.setId)) setIds.set(region.setId, mint('set'))
  }

  // Which panels have something drawn inside them, over the PUBLISHED set — a
  // region with a parent is content in it, and a descendant can only exist through
  // a direct child, so "names me as parent" is the whole test.
  const withContents = new Set(
    published.flatMap((region) => (region.parentId === null ? [] : [region.parentId])),
  )

  return published.map((region) => ({
    id: regionIds.get(region.id) ?? '',
    kind: region.kind as PenRegionKind,
    ...toVariant(region, withContents.has(region.id)),
    confidence: region.confidence,
    bbox: toBbox(region.frame),
    strokeIds: [...region.strokeIds],
    parentRegionId: region.parentId === null ? null : (regionIds.get(region.parentId) ?? null),
    setId: region.setId === null ? null : (setIds.get(region.setId) ?? null),
    setIndex: region.setIndex,
    text: toRegionText(region),
  }))
}
