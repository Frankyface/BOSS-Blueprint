/**
 * STAGE 3 — WHAT IS THIS INK?
 *
 * FIRST MATCH WINS, in a fixed order, and the order carries meaning:
 *
 *   panel → rule → textPlaceholder → writing → navRow → artwork → annotation
 *
 * `rule` is tested before `textPlaceholder` so a dead-straight long line is a divider
 * and a wobblier one is a line of body text. `textPlaceholder` is tested before
 * `writing` because the horizontal squiggle is the single most common mark a
 * non-technical person makes and every design that skipped it mis-built it three
 * different ways. `artwork` is last but still POSITIVELY tested, so an arrow never
 * becomes art. And `annotation` — the residual — is still EMITTED: the ink returns to
 * the annotation pool the caller already narrates, but it is never dropped. The worst
 * case of this whole feature is "no change", never "wrong instruction".
 */

import { PAGE_WIDTH_PX } from '../constants.ts'
import type { PenStroke } from '../types.ts'

import {
  ARTWORK_BAND_MIN_W_PX,
  ARTWORK_MIN_ABS_TURN_RAD,
  ARTWORK_MIN_DIAG_PX,
  ARTWORK_MIN_PATH_PX,
  ARTWORK_MIN_STROKES,
  ARTWORK_SOLO_ABS_TURN_RAD,
  BAND_ASPECT_MIN,
  BAND_WIDTH_RATIO,
  PLACEHOLDER_ABS_TURN_MAX,
  PLACEHOLDER_ASPECT_MIN,
  PLACEHOLDER_CHORD_DEV_MAX,
  PLACEHOLDER_LEFT_TOL_PX,
  PLACEHOLDER_LINE_GAP_PX,
  PLACEHOLDER_MAX_H_PX,
  PLACEHOLDER_MIN_LINES,
  RULE_ASPECT_MIN,
  RULE_CHORD_DEV_MAX,
  RULE_FULL_WIDTH_RATIO,
  RULE_MAX_THICKNESS_PX,
  RULE_MAX_TILT_DEG,
  RULE_MIN_LENGTH_PX,
} from './constants.ts'
import { atLeast, atMost, worstMargin } from './margins.ts'
import { framesOfMembers } from './metrics.ts'
import { emitRegions } from './regions.ts'
import { inkAtoms } from './segment.ts'
import { glyphHeightOf, withEmphasis, withNavRows, wordBoxes, writingMargin } from './writing.ts'
import type {
  InkAtom,
  InkBlock,
  InkDraft,
  InkFrame,
  InkRegion,
  InkRegionOptions,
  InkRegionVariant,
  StrokeMetrics,
} from './types.ts'

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function aspectOf(frame: InkFrame): number {
  return frame.w / Math.max(frame.h, 1)
}

/* ── 2. rule ───────────────────────────────────────────────────────────────── */

/**
 * A rule is long, thin, dead straight and level.
 *
 * The tilt gate can never bind on its own — an aspect floor of 6 already caps the
 * chord at atan(1/6) ≈ 9.5°, inside the 12° allowance — but it is kept because it IS
 * the binding gate for the axis-swapped vertical form, and because a later loosening
 * of the aspect floor must not silently start admitting diagonals.
 */
function ruleDraft(member: StrokeMetrics): { margin: number; variant: InkRegionVariant } | null {
  const { bbox } = member
  const horizontal = worstMargin([
    atLeast(aspectOf(bbox), RULE_ASPECT_MIN),
    atMost(bbox.h, RULE_MAX_THICKNESS_PX),
    atMost(member.chordDev, RULE_CHORD_DEV_MAX),
    atLeast(bbox.w, RULE_MIN_LENGTH_PX),
    atMost(member.tiltDeg, RULE_MAX_TILT_DEG),
  ])
  if (horizontal !== null) {
    const full = bbox.w >= RULE_FULL_WIDTH_RATIO * PAGE_WIDTH_PX
    return { margin: horizontal, variant: full ? 'divider' : 'underline' }
  }

  const vertical = worstMargin([
    atLeast(bbox.h / Math.max(bbox.w, 1), RULE_ASPECT_MIN),
    atMost(bbox.w, RULE_MAX_THICKNESS_PX),
    atMost(member.chordDev, RULE_CHORD_DEV_MAX),
    atLeast(bbox.h, RULE_MIN_LENGTH_PX),
    atMost(90 - member.tiltDeg, RULE_MAX_TILT_DEG),
  ])
  return vertical === null ? null : { margin: vertical, variant: 'vertical' }
}

/* ── 3. textPlaceholder ────────────────────────────────────────────────────── */

/** One squiggle that stands for one line of body text. */
function placeholderMargin(member: StrokeMetrics): number | null {
  return worstMargin([
    atLeast(aspectOf(member.bbox), PLACEHOLDER_ASPECT_MIN),
    atMost(member.bbox.h, PLACEHOLDER_MAX_H_PX),
    atMost(member.chordDev, PLACEHOLDER_CHORD_DEV_MAX),
    atMost(member.absTurn, PLACEHOLDER_ABS_TURN_MAX),
  ])
}

/* ── 6. artwork ────────────────────────────────────────────────────────────── */

/**
 * The residual, but positively tested. A cat outline — many strokes, path length in
 * the thousands, huge accumulated turn — passes. An arrow, whose shaft and chevron
 * head accumulate about 2 rad between them, FAILS and returns to the annotation pool.
 * That turn floor is the entire defence against promoting marginalia to artwork.
 */
function artworkMargin(atom: InkAtom): number | null {
  const path = sum(atom.members.map((member) => member.pathLength))
  const turn = sum(atom.members.map((member) => member.absTurn))

  if (atom.members.length >= ARTWORK_MIN_STROKES) {
    return worstMargin([
      atLeast(Math.hypot(atom.bbox.w, atom.bbox.h), ARTWORK_MIN_DIAG_PX),
      atLeast(path, ARTWORK_MIN_PATH_PX),
      atLeast(turn, ARTWORK_MIN_ABS_TURN_RAD),
    ])
  }

  // One or two strokes carry less evidence, so they need more turn — or real width.
  const wandersOrSpans =
    turn >= ARTWORK_SOLO_ABS_TURN_RAD
      ? atLeast(turn, ARTWORK_SOLO_ABS_TURN_RAD)
      : atLeast(atom.bbox.w, ARTWORK_BAND_MIN_W_PX)
  return worstMargin([atLeast(path, ARTWORK_MIN_PATH_PX), wandersOrSpans])
}

function artworkVariant(atom: InkAtom): InkRegionVariant | null {
  const band =
    atom.bbox.w >= BAND_WIDTH_RATIO * PAGE_WIDTH_PX && aspectOf(atom.bbox) >= BAND_ASPECT_MIN
  return band ? 'band' : null
}

/* ── the per-atom pass ─────────────────────────────────────────────────────── */

const EMPTY_DRAFT = {
  variant: null,
  forcedUnsure: false,
  forcedClear: false,
  glyphHeight: null,
  words: null,
  lines: null,
  align: null,
} as const

function classifyAtom(atom: InkAtom): InkDraft {
  // `card` here is the SHAPE — a closed run of ink with room inside it — and it is
  // all geometry can say. Whether that room holds anything is a property of the
  // PUBLISHED tree, not of the box, so §4.9.10's `card` / `mediaBox` split is made
  // at the contract boundary in `src/export/penRegions.ts`: this module parents
  // unclassifiable ink to the enclosure that holds it and that ink is dropped on
  // the way out, so a box holding one doodle has a child here and none there.
  if (atom.isEnclosure) {
    return { ...EMPTY_DRAFT, atom, kind: 'panel', variant: 'card', margin: atom.enclosureMargin }
  }

  const solo = atom.members.length === 1 ? atom.members[0] : undefined
  if (solo) {
    const rule = ruleDraft(solo)
    if (rule) return { ...EMPTY_DRAFT, atom, kind: 'rule', variant: rule.variant, margin: rule.margin }

    const placeholder = placeholderMargin(solo)
    if (placeholder !== null) {
      return { ...EMPTY_DRAFT, atom, kind: 'textPlaceholder', margin: placeholder, lines: 1 }
    }
  }

  const writing = writingMargin(atom)
  if (writing !== null) {
    const glyphHeight = glyphHeightOf(atom.members)
    return {
      ...EMPTY_DRAFT,
      atom,
      kind: 'writing',
      margin: writing,
      glyphHeight,
      words: wordBoxes(atom.members, glyphHeight),
    }
  }

  const artwork = artworkMargin(atom)
  if (artwork !== null) {
    return {
      ...EMPTY_DRAFT,
      atom,
      kind: 'artwork',
      variant: artworkVariant(atom),
      margin: artwork,
      forcedUnsure: atom.members.length < ARTWORK_MIN_STROKES,
    }
  }

  return { ...EMPTY_DRAFT, atom, kind: 'annotation', margin: null }
}

/* ── the page-level passes ─────────────────────────────────────────────────── */

function mergedAtom(atoms: readonly InkAtom[]): InkAtom {
  const members = atoms
    .flatMap((atom) => atom.members)
    .sort((a, b) => a.ordinal - b.ordinal)
  const ordinal = Math.min(...members.map((member) => member.ordinal))
  const { bbox, frame } = framesOfMembers(members)
  return {
    key: `atom_${String(ordinal)}`,
    color: atoms[0]?.color ?? '',
    members,
    bbox,
    frame,
    isEnclosure: false,
    enclosureMargin: 0,
    parentKey: atoms[0]?.parentKey ?? null,
    ordinal,
  }
}

/**
 * A STACK of squiggles is one paragraph, not N dividers.
 *
 * Grouped by LEFT EDGE first and only then chained down the page: two columns of body
 * text interleave by `y`, so a purely vertical walk would zip the left column's first
 * line to the right column's first line. Sharing a left edge is what makes a run of
 * lines one block of text.
 */
function stackPlaceholders(drafts: readonly InkDraft[]): readonly InkDraft[] {
  const stackable = drafts.filter((draft) => draft.kind === 'textPlaceholder')
  if (stackable.length === 0) return drafts

  const columns = new Map<string, InkDraft[]>()
  for (const draft of [...stackable].sort((a, b) => a.atom.bbox.x - b.atom.bbox.x || a.atom.ordinal - b.atom.ordinal)) {
    const scope = draft.atom.parentKey ?? ''
    const existing = [...columns.entries()].find(
      ([key, members]) =>
        key.startsWith(`${scope}|`) &&
        Math.abs(draft.atom.bbox.x - (members[0]?.atom.bbox.x ?? 0)) <= PLACEHOLDER_LEFT_TOL_PX,
    )
    if (existing) existing[1].push(draft)
    else columns.set(`${scope}|${String(draft.atom.ordinal)}`, [draft])
  }

  const stacked: InkDraft[] = []
  for (const column of columns.values()) {
    let run: InkDraft[] = []
    const flush = (): void => {
      if (run.length === 0) return
      if (run.length < PLACEHOLDER_MIN_LINES) {
        stacked.push(...run)
        run = []
        return
      }
      stacked.push({
        ...EMPTY_DRAFT,
        atom: mergedAtom(run.map((draft) => draft.atom)),
        kind: 'textPlaceholder',
        margin: Math.min(...run.map((draft) => draft.margin ?? 0)),
        lines: run.length,
      })
      run = []
    }

    for (const draft of [...column].sort((a, b) => a.atom.bbox.y - b.atom.bbox.y)) {
      const previous = run[run.length - 1]
      const gap = previous
        ? draft.atom.bbox.y + draft.atom.bbox.h - (previous.atom.bbox.y + previous.atom.bbox.h)
        : 0
      if (previous && gap > PLACEHOLDER_LINE_GAP_PX) flush()
      run.push(draft)
    }
    flush()
  }

  return [...drafts.filter((draft) => draft.kind !== 'textPlaceholder'), ...stacked]
}

/**
 * THE ENTRY POINT — one page's blocks and strokes in, its inferred regions out.
 *
 * Pure: no `Date`, no `Math.random`, no I/O, no mutation of the inputs. The same
 * drawing always produces byte-identical regions, which is what lets the export and
 * the editor overlay show the client and the builder the same reading.
 */
export function inkRegions(
  blocks: readonly InkBlock[],
  strokes: readonly PenStroke[],
  options: InkRegionOptions = {},
): readonly InkRegion[] {
  const atoms = inkAtoms(blocks, strokes)
  if (atoms.length === 0) return []

  const scopes = new Map(atoms.map((atom) => [atom.key, atom]))
  const classified = stackPlaceholders(atoms.map(classifyAtom))
  return emitRegions(withNavRows(withEmphasis(classified, scopes), scopes), options)
}
