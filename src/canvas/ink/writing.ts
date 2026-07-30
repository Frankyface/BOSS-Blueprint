/**
 * WRITING, AND THE NAV ROW IT SOMETIMES TURNS OUT TO BE.
 *
 * Handwriting is the hardest thing on the page to read as geometry, because print and
 * cursive share almost no measurable property: print is many small marks on one
 * baseline, cursive is one long looping trace. So there are TWO evidence routes and a
 * run of ink needs only one of them. Without the cursive route every single-stroke
 * signed wordmark is lost; without the print route every neatly lettered heading is.
 *
 * The nav pass is deliberately LAST and page-level, because it needs a fact no single
 * region knows: which word in the top band is the biggest. That one is the brand, and
 * the regular ones beside it are the navigation.
 */

import { PAGE_WIDTH_PX } from '../constants.ts'

import {
  ALIGN_TOL_PX,
  GLYPH_HEIGHT_HIGH_RATIO,
  GLYPH_HEIGHT_LOW_RATIO,
  HEADING_MIN_GLYPH_PX,
  HEADING_MIN_REAL_GLYPH_PX,
  HEADING_RELATIVE_RATIO,
  NAV_GAP_CV,
  NAV_MAX_WORDS,
  NAV_MAX_WORD_WIDTH_RATIO,
  NAV_MIN_GAP_RATIO,
  NAV_MIN_SPAN_RATIO,
  NAV_MIN_WORDS,
  NAV_RULE_ATTACH_PX,
  NAV_TOP_BAND_PX,
  RULE_FULL_WIDTH_RATIO,
  TEXT_BASELINE_SPREAD_MAX,
  TEXT_CURSIVE_ABS_TURN_RAD,
  TEXT_CURSIVE_HULL_FILL_MAX,
  TEXT_CURSIVE_MAX_STROKES,
  TEXT_CURSIVE_MIN_ASPECT,
  TEXT_GLYPH_WIDTH_RATIO,
  TEXT_MIN_ASPECT,
  TEXT_PRINT_MIN_STROKES,
  TEXT_WIDEST_GLYPH_RATIO,
  WORD_SPLIT_GAP_RATIO,
} from './constants.ts'
import { atLeast, atMost, worstMargin } from './margins.ts'
import { convexHullArea, median, standardDeviation, unionFrame } from './metrics.ts'
import type {
  InkAlign,
  InkAtom,
  InkDraft,
  InkFrame,
  InkRegionVariant,
  StrokeMetrics,
} from './types.ts'

function aspectOf(frame: InkFrame): number {
  return frame.w / Math.max(frame.h, 1)
}

/** Robust median glyph height: a median, then a re-median over the plausible band. */
export function glyphHeightOf(members: readonly StrokeMetrics[]): number {
  const heights = members.map((member) => member.bbox.h)
  const rough = median(heights)
  const plausible = heights.filter(
    (height) => height >= GLYPH_HEIGHT_LOW_RATIO * rough && height <= GLYPH_HEIGHT_HIGH_RATIO * rough,
  )
  return plausible.length > 0 ? median(plausible) : rough
}

/** Members split into word boxes at horizontal gaps of over a glyph-height-and-a-bit. */
export function wordBoxes(
  members: readonly StrokeMetrics[],
  glyphHeight: number,
): readonly InkFrame[] {
  const ordered = [...members].sort((a, b) => a.bbox.x - b.bbox.x || a.ordinal - b.ordinal)
  const threshold = WORD_SPLIT_GAP_RATIO * Math.max(glyphHeight, 1)
  const words: InkFrame[] = []
  let current: InkFrame | null = null

  for (const member of ordered) {
    if (current === null) {
      current = member.bbox
      continue
    }
    if (member.bbox.x - (current.x + current.w) >= threshold) {
      words.push(current)
      current = member.bbox
    } else {
      current = unionFrame(current, member.bbox)
    }
  }
  if (current !== null) words.push(current)
  return words
}

/**
 * TWO EVIDENCE ROUTES, because print and cursive look nothing alike.
 *
 * PRINT reads the statistics of many small marks on one baseline. Its glyph-width
 * terms are the WAVE FILTER: a wavy line is one stroke spanning the whole atom,
 * whereas handwriting is many strokes each spanning a small fraction of it.
 *
 * CURSIVE reads one unbroken looping trace. Without it every single-stroke cursive
 * word is lost, and a signed wordmark is exactly that.
 */
export function writingMargin(atom: InkAtom): number | null {
  const members = atom.members
  const widths = members.map((member) => member.bbox.w)
  const atomWidth = Math.max(atom.bbox.w, 1)
  const aspect = aspectOf(atom.bbox)

  if (members.length >= TEXT_PRINT_MIN_STROKES) {
    const bottoms = members.map((member) => member.bbox.y + member.bbox.h)
    const spread = (Math.max(...bottoms) - Math.min(...bottoms)) / Math.max(atom.bbox.h, 1)
    const print = worstMargin([
      atLeast(aspect, TEXT_MIN_ASPECT),
      atMost(median(widths) / atomWidth, TEXT_GLYPH_WIDTH_RATIO),
      atMost(Math.max(...widths) / atomWidth, TEXT_WIDEST_GLYPH_RATIO),
      atMost(spread, TEXT_BASELINE_SPREAD_MAX),
    ])
    if (print !== null) return print
  }

  if (members.length > TEXT_CURSIVE_MAX_STROKES) return null
  const hull = convexHullArea(members.flatMap((member) => member.points))
  return worstMargin([
    atLeast(
      members.reduce((total, member) => total + member.absTurn, 0),
      TEXT_CURSIVE_ABS_TURN_RAD,
    ),
    atMost(hull / Math.max(atom.bbox.w * atom.bbox.h, 1), TEXT_CURSIVE_HULL_FILL_MAX),
    atLeast(aspect, TEXT_CURSIVE_MIN_ASPECT),
  ])
}

/**
 * A run with no real letters is not a heading, whatever the page median collapses to.
 * Two guards this branch used to lack while every other ratio in the module has them:
 *
 *  - the REAL-LETTER FLOOR gates BOTH heading routes, so a degenerate ≈0 glyph height
 *    (a flat dashed divider) can never be promoted — a flat line has no letters to
 *    size, so it is body at most;
 *  - the FLOORED DENOMINATOR (`Math.max(pageMedian, 1)`, the same guard `aspect`,
 *    `glyphHeightOf` and the rest already use) stops an all-flat page whose median is 0
 *    from reading the relative test as `0 ≥ 1.5·0`, i.e. `0 ≥ 0`, and promoting anyway.
 */
function emphasisOf(glyphHeight: number, tallest: number, pageMedian: number): InkRegionVariant {
  if (glyphHeight < HEADING_MIN_REAL_GLYPH_PX) return 'body'
  if (glyphHeight >= HEADING_MIN_GLYPH_PX && glyphHeight >= tallest) return 'display'
  if (glyphHeight >= HEADING_MIN_GLYPH_PX) return 'heading'
  return glyphHeight >= HEADING_RELATIVE_RATIO * Math.max(pageMedian, 1) ? 'heading' : 'body'
}

export function withEmphasis(drafts: readonly InkDraft[], scopes: ReadonlyMap<string, InkAtom>): readonly InkDraft[] {
  const heights = drafts
    .filter((draft) => draft.kind === 'writing')
    .map((draft) => draft.glyphHeight ?? 0)
  if (heights.length === 0) return drafts

  const tallest = Math.max(...heights)
  const pageMedian = median(heights)
  const pageFrame: InkFrame = { x: 0, y: 0, w: PAGE_WIDTH_PX, h: 0 }

  return drafts.map((draft) => {
    if (draft.kind !== 'writing') return draft
    const scope = draft.atom.parentKey ? scopes.get(draft.atom.parentKey)?.frame : undefined
    return {
      ...draft,
      variant: emphasisOf(draft.glyphHeight ?? 0, tallest, pageMedian),
      align: alignWithin(draft.atom.frame, scope ?? pageFrame),
    }
  })
}

function alignWithin(frame: InkFrame, scope: InkFrame): InkAlign {
  const centre = frame.x + frame.w / 2
  const scopeCentre = scope.x + scope.w / 2
  if (Math.abs(centre - scopeCentre) <= ALIGN_TOL_PX) return 'center'
  const fromLeft = frame.x - scope.x
  const fromRight = scope.x + scope.w - (frame.x + frame.w)
  return fromLeft <= fromRight ? 'left' : 'right'
}

/**
 * A page-level pass that RECLASSIFIES writing, run after emphasis so it can see which
 * word is the biggest one in the top band — that one is the brand, and the regular
 * ones beside it are the nav.
 *
 * Regularity, not just spacing, is what separates a nav row from a sentence: the gaps
 * between nav items are near-equal, and a sentence's are not.
 */
export function withNavRows(drafts: readonly InkDraft[], scopes: ReadonlyMap<string, InkAtom>): readonly InkDraft[] {
  const inTopBand = (draft: InkDraft): boolean => {
    if (draft.atom.frame.y <= NAV_TOP_BAND_PX) return true
    const scope = draft.atom.parentKey ? scopes.get(draft.atom.parentKey) : undefined
    return scope !== undefined && scope.frame.y <= NAV_TOP_BAND_PX
  }

  const banded = drafts.filter((draft) => draft.kind === 'writing' && inTopBand(draft))
  const tallestInBand = Math.max(0, ...banded.map((draft) => draft.glyphHeight ?? 0))
  const rules = drafts.filter(
    (draft) => draft.kind === 'rule' && draft.atom.bbox.w >= RULE_FULL_WIDTH_RATIO * PAGE_WIDTH_PX,
  )

  return drafts.map((draft) => {
    if (draft.kind !== 'writing' || !inTopBand(draft)) return draft
    const words = draft.words ?? []
    const glyphHeight = draft.glyphHeight ?? 0
    if (words.length < NAV_MIN_WORDS || words.length > NAV_MAX_WORDS) return draft
    if (glyphHeight >= tallestInBand) return draft

    const gaps = words
      .slice(1)
      .map((word, index) => word.x - ((words[index]?.x ?? 0) + (words[index]?.w ?? 0)))
    const medianGap = median(gaps)
    const nav = worstMargin([
      atLeast(medianGap, NAV_MIN_GAP_RATIO * Math.max(glyphHeight, 1)),
      atMost(standardDeviation(gaps), NAV_GAP_CV * Math.max(medianGap, 1)),
      atMost(median(words.map((word) => word.w)), NAV_MAX_WORD_WIDTH_RATIO * PAGE_WIDTH_PX),
    ])
    if (nav === null) return draft

    const corroborated =
      draft.atom.frame.w >= NAV_MIN_SPAN_RATIO * PAGE_WIDTH_PX ||
      rules.some((rule) => {
        const below = rule.atom.frame.y - (draft.atom.frame.y + draft.atom.frame.h)
        return below >= 0 && below <= NAV_RULE_ATTACH_PX
      })

    return {
      ...draft,
      kind: 'navRow',
      variant: null,
      margin: Math.min(nav, draft.margin ?? nav),
      forcedUnsure: false,
      forcedClear: corroborated,
    }
  })
}
