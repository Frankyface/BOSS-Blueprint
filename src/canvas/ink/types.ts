/**
 * INK REGION INFERENCE — the data shapes.
 *
 * This module answers one question the rest of the app has never asked: is this run
 * of ink a THING (a card, a heading, a line of body text, a nav row) or a NOTE about
 * a thing? Everything downstream of that answer — building a drawn box as a real
 * component instead of describing it as "a handwritten annotation" — depends on the
 * shapes below.
 *
 * PURE GEOMETRY, NO STATE. No ML, no network, no DOM, no React, no `Date`, no
 * `Math.random`. Every function over these types is deterministic: the same input
 * yields byte-identical output, which is what makes the whole feature unit-provable
 * before a single builder dollar is spent.
 *
 * IDS ARE THE CALLER'S. `InkBlock.id` and `PenStroke.id` are echoed back verbatim in
 * `InkRegion.strokeIds`, so the export can pass its `blk_NNNN`/`stk_NNNN` ids and the
 * editor overlay can pass document ids, and neither has to translate the result.
 */

import type { PenPoint } from '../types.ts'

/**
 * A rectangle in unscaled page pixels, in the EXPORT's `{x, y, w, h}` spelling
 * rather than the editor's `{x, y, width, height}`.
 *
 * The export contract (`docs/export-format.md` §2.6) is the shape this module's
 * output is destined for, and one of its two callers already speaks it; picking the
 * other spelling would mean a rename on the way out of the module that a diff could
 * not see through.
 */
export interface InkFrame {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/**
 * The only three things this module needs to know about a placed block.
 *
 * `imageSlot` triggers the §4.5 slot lock (ink inside a photo slot is a sketch OF
 * that photo and was never design), `section` is EXEMPT from the block-overlap veto
 * (a full-width band always overlaps, exactly as §4.5 exempts sections from the
 * annotation guess), and `block` is everything else. Deliberately NOT the editor's
 * `BlockTypeId` nor the export's `ExportBlockType`: the two vocabularies disagree
 * (`image`/`imageSlot`, `nav-bar`/`navBar`) and importing either would tie the canvas
 * layer to a spelling it does not own. `toInkBlockKind` maps both.
 */
export type InkBlockKind = 'section' | 'imageSlot' | 'block'

export interface InkBlock {
  readonly id: string
  readonly type: InkBlockKind
  readonly frame: InkFrame
}

/**
 * Both callers' block-type vocabularies, mapped onto the three facts this module
 * uses. Unknown strings fall to `block`, which is the SAFE default: a `block` is
 * veto-eligible, so an unrecognised type keeps ink near it out of the region
 * pipeline rather than promoting a note to a design element.
 */
export function toInkBlockKind(type: string): InkBlockKind {
  if (type === 'section') return 'section'
  if (type === 'imageSlot' || type === 'image') return 'imageSlot'
  return 'block'
}

/** Every per-stroke measure Stage 0 computes, carried through the whole pipeline. */
export interface StrokeMetrics {
  readonly id: string
  /** Draw order within the page. The tie-break of last resort, so it is never dropped. */
  readonly ordinal: number
  readonly color: string
  readonly width: number
  readonly points: readonly PenPoint[]
  /** Bounding box of the raw points. A straight line has `h === 0` — see `metrics.ts`. */
  readonly bbox: InkFrame
  /** `bbox` inflated by `width / 2`, which is where the ink is actually painted. */
  readonly inkBbox: InkFrame
  readonly pathLength: number
  /** Distance from the last point back to the first. Small ⇒ the shape closes. */
  readonly closureGap: number
  /** `pathLength ÷ bbox perimeter`. ≈1 for a rectangle, ≈0.79 for an ellipse. */
  readonly perimeterRatio: number
  /** Max perpendicular distance to the first→last chord, as a fraction of it. */
  readonly chordDev: number
  /** Angle of the first→last chord away from horizontal, 0..90 degrees. */
  readonly tiltDeg: number
  /** Convex-hull area ÷ bbox area. Full for a blob, small for a wandering line. */
  readonly hullFill: number
  /** Σ|turn| along the resampled polyline. Scale-invariant; see `metrics.ts`. */
  readonly absTurn: number
  /** `w ÷ max(h, 1)`. The `max` is the zero-extent guard, not a fudge. */
  readonly aspect: number
}

/**
 * One segmented run of ink: a scope, a colour family, a stroke set and a box.
 * Stage 2's output and Stage 3's input.
 */
export interface InkAtom {
  /** `atom_<lowest member ordinal>` — unique because atoms partition the strokes. */
  readonly key: string
  readonly color: string
  /** Members in draw order. Never empty. */
  readonly members: readonly StrokeMetrics[]
  /** Union of the members' raw bboxes. */
  readonly bbox: InkFrame
  /** Union of the members' ink bboxes — the box handed to a builder. */
  readonly frame: InkFrame
  readonly isEnclosure: boolean
  /**
   * How comfortably the enclosure gates were passed, as a relative margin. `0` for a
   * non-enclosure. Stage 5 reads it rather than re-deriving it, so the confidence a
   * panel reports is the confidence the test that made it actually measured.
   */
  readonly enclosureMargin: number
  /** The enclosing atom's `key`, or `null` at the top level. */
  readonly parentKey: string | null
  /** The lowest member ordinal. */
  readonly ordinal: number
}

/** What a region IS. `annotation` is the safety valve — see `InkRegion.kind`. */
export type InkRegionKind =
  | 'panel'
  | 'rule'
  | 'textPlaceholder'
  | 'writing'
  | 'navRow'
  | 'artwork'
  | 'annotation'

/**
 * The per-kind qualifier. `null` where the kind admits no variant.
 *
 * A `panel` is always `card` HERE, because geometry can only see the shape of the
 * box. The contract's second panel sub-kind — `mediaBox`, a box with nothing
 * published inside it (§4.9.10) — is decided by `src/export/penRegions.ts` over the
 * regions that survive the `annotation` drop, which is a set this module cannot see.
 */
export type InkRegionVariant =
  | 'card'
  | 'divider'
  | 'underline'
  | 'vertical'
  | 'band'
  | 'display'
  | 'heading'
  | 'body'

/**
 * TWO LEVELS ONLY. There is deliberately no `low`: anything that would rank lower is
 * not a region at all, it is an `annotation`. Uncertainty always resolves TOWARD
 * today's behaviour, never toward a confident wrong instruction.
 */
export type InkConfidence = 'clear' | 'unsure'

export type InkAlign = 'left' | 'center' | 'right'

/**
 * One inferred region.
 *
 * Flat with explicit `null`s rather than a discriminated union of per-kind payloads,
 * for the same reason `Block` is flat: every consumer (ordering, sibling sets,
 * narration, the overlay) walks regions uniformly, and a union would make that walk
 * fight the discriminant for no behavioural gain. Every key is always present, so
 * two runs over the same design serialize byte-identically.
 *
 * `kind: 'annotation'` means "this ink matched no classifier". It is emitted as a
 * region ANYWAY — losing the client's work is the one unacceptable outcome — and the
 * caller is expected to hand those strokes back to today's annotation narration
 * unchanged. The worst case of this whole feature is "no change", never "wrong
 * instruction".
 */
export interface InkRegion {
  /** `reg_NNNN`, an ordinal in emission order. */
  readonly id: string
  readonly kind: InkRegionKind
  readonly variant: InkRegionVariant | null
  /** The ink bbox: where a builder should actually put the thing. */
  readonly frame: InkFrame
  /** The colour family this region was segmented in (`#rrggbb`). */
  readonly color: string
  /** Caller ids, in draw order. The union over all regions partitions the candidates. */
  readonly strokeIds: readonly string[]
  /** The containing `panel` region's id, or `null` at the top level. */
  readonly parentId: string | null
  readonly confidence: InkConfidence
  /** `set_NNNN` when this panel is one instance of a repeated component. */
  readonly setId: string | null
  /** Position within `setId`: left→right for a row, top→bottom for a column. */
  readonly setIndex: number | null
  /** `writing` only: where it sits within its scope. */
  readonly align: InkAlign | null
  /** `writing`/`navRow` only: how many words the ink splits into. */
  readonly words: number | null
  /** `textPlaceholder` only: how many lines of body text the stack stands for. */
  readonly lines: number | null
  /** `writing`/`navRow` only: the robust median glyph height, in page pixels. */
  readonly glyphHeight: number | null
  /** `rule` variant `underline` only: the writing region it sits beneath. */
  readonly attachedToId: string | null
}

/**
 * Ordinal seeds, so a multi-page export can number regions and sets site-wide
 * (§4.8) while this function stays pure and per-page.
 */
export interface InkRegionOptions {
  readonly firstRegionOrdinal?: number
  readonly firstSetOrdinal?: number
}

/**
 * ONE ATOM (or one merged stack of them) WITH THE VERDICT ATTACHED.
 *
 * The working shape between Stage 3 and Stage 5. It carries what the classifiers
 * measured but not yet what the caller sees: no id, because ids are assigned in
 * emission order, and no confidence, because a page-level pass can still promote it.
 */
export interface InkDraft {
  readonly atom: InkAtom
  readonly kind: InkRegionKind
  readonly variant: InkRegionVariant | null
  /** `null` means "matched nothing measurable", which always reads as `unsure`. */
  readonly margin: number | null
  readonly forcedUnsure: boolean
  /**
   * An INDEPENDENT corroborating signal outranks a thin geometric margin. A nav row
   * whose word gaps only just cleared their threshold is still certain when a
   * full-width rule sits right beneath it — that rule is evidence the gaps are not.
   */
  readonly forcedClear: boolean
  readonly glyphHeight: number | null
  /** Word boxes, kept as boxes so the nav pass can measure the gaps between them. */
  readonly words: readonly InkFrame[] | null
  readonly lines: number | null
  readonly align: InkAlign | null
}
