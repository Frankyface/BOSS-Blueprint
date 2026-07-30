/**
 * INK FIXTURE GEOMETRY — synthetic pen strokes with HAND-COMPUTABLE measurements.
 *
 * Test-support only: no production module imports this file.
 *
 * Every builder here is analytic, so a test can state what a measure MUST be rather
 * than snapshotting whatever the implementation happened to produce. A traced 100×100
 * square has a perimeter ratio of exactly 1; an inscribed circle's convex hull is
 * exactly π/4 of its box; a mouse-drawn horizontal rule has a bounding box of height
 * EXACTLY 0. That last one is not a curiosity — it is the degenerate case every ratio
 * in `metrics.ts` has to survive without producing `NaN` or `Infinity`.
 *
 * The drawing builders at the bottom (`pricingCards`, `headingAndColumns`,
 * `waveAndCat`, `navHeader`) are traced from the product owner's actual sketches. The
 * thresholds in `src/canvas/ink/constants.ts` were chosen against these shapes, so
 * they are the corpus, not decoration.
 */

import type { InkBlock, InkBlockKind } from '../canvas/ink/types.ts'
import type { PenPoint, PenStroke } from '../canvas/types.ts'

/** The two pen colours the fixtures use, so a colour-family split is visible at a glance. */
export const INK_BLUE = '#2B6CB0'
export const INK_RED = '#D94F30'

const DEFAULT_PEN_WIDTH = 4

export function penStroke(
  id: string,
  points: readonly PenPoint[],
  color: string = INK_BLUE,
  width: number = DEFAULT_PEN_WIDTH,
): PenStroke {
  return { id, points, color, width }
}

/**
 * A straight segment as exactly two points.
 *
 * `linePoints(x, y, w, 0)` is the mouse-drawn horizontal rule: its bounding box has
 * height 0, its aspect ratio would be `w / 0`, and its area would be 0.
 */
export function linePoints(x: number, y: number, w: number, h: number): PenPoint[] {
  return [
    { x, y },
    { x: x + w, y: y + h },
  ]
}

/** A closed axis-aligned rectangle traced corner to corner, back to the start. */
export function squarePoints(x: number, y: number, w: number, h: number): PenPoint[] {
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
    { x, y },
  ]
}

/** A circle sampled at `samples` even angles, starting at 3 o'clock so the box is exact. */
export function circlePoints(cx: number, cy: number, r: number, samples = 128): PenPoint[] {
  return Array.from({ length: samples + 1 }, (_, index) => {
    const angle = (2 * Math.PI * (index % samples)) / samples
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  })
}

export interface WaveSpec {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly amplitude: number
  readonly cycles: number
  readonly samples?: number
}

/**
 * A sine wave along `y`. THE fixture shape for both a body-text squiggle (small
 * amplitude, one cycle) and a background band (large amplitude, several cycles) —
 * the only difference between them is the numbers, which is exactly the claim the
 * classifier makes.
 */
export function wavePoints(spec: WaveSpec): PenPoint[] {
  const samples = spec.samples ?? 96
  return Array.from({ length: samples + 1 }, (_, index) => {
    const t = index / samples
    return {
      x: spec.x + spec.width * t,
      y: spec.y + spec.amplitude * Math.sin(2 * Math.PI * spec.cycles * t),
    }
  })
}

export interface RoundedBoxSpec {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly radius?: number
  /** How far short of (or past) the start the trace ends — the corner gap Cam draws. */
  readonly gap?: number
  readonly perCorner?: number
}

/**
 * A rounded rectangle traced clockwise from the top-left, stopping `gap` pixels short
 * of where it started. This is Cam's photographed defect: the outline is NOT closed.
 */
export function roundedBoxPoints(spec: RoundedBoxSpec): PenPoint[] {
  const radius = spec.radius ?? 24
  const perCorner = spec.perCorner ?? 8
  const { x, y, w, h } = spec
  const gap = spec.gap ?? 0
  const points: PenPoint[] = []

  const corner = (cx: number, cy: number, from: number, to: number): void => {
    for (let index = 0; index <= perCorner; index += 1) {
      const angle = from + ((to - from) * index) / perCorner
      points.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) })
    }
  }

  points.push({ x: x + radius + gap, y })
  points.push({ x: x + w - radius, y })
  corner(x + w - radius, y + radius, -Math.PI / 2, 0)
  points.push({ x: x + w, y: y + h - radius })
  corner(x + w - radius, y + h - radius, 0, Math.PI / 2)
  points.push({ x: x + radius, y: y + h })
  corner(x + radius, y + h - radius, Math.PI / 2, Math.PI)
  points.push({ x, y: y + radius })
  corner(x + radius, y + radius, Math.PI, (3 * Math.PI) / 2)

  return points
}

export interface PrintWordSpec {
  readonly idPrefix: string
  readonly x: number
  /** Top of the x-height band. Descenders hang below it. */
  readonly y: number
  readonly glyphHeight: number
  readonly glyphWidth: number
  readonly pitch: number
  readonly count: number
  readonly color?: string
  /** Indexes of glyphs that hang a descender (the 'g' in "Heading"). */
  readonly descenders?: readonly number[]
}

/**
 * PRINT handwriting: one small stroke per glyph, all sitting on one baseline.
 *
 * Each glyph is a "V" — two segments, a real bounding box, no accidental straightness.
 * The shape matters less than the STATISTICS: many strokes, each a small fraction of
 * the word's width, bottoms nearly level. That is the evidence the print route reads.
 */
export function printWordStrokes(spec: PrintWordSpec): PenStroke[] {
  const descenders = spec.descenders ?? []
  return Array.from({ length: spec.count }, (_, index) => {
    const left = spec.x + index * spec.pitch
    const drop = descenders.includes(index) ? spec.glyphHeight * 0.4 : 0
    const bottom = spec.y + spec.glyphHeight + drop
    return penStroke(
      `${spec.idPrefix}-${String(index)}`,
      [
        { x: left, y: spec.y },
        { x: left + spec.glyphWidth / 2, y: bottom },
        { x: left + spec.glyphWidth, y: spec.y },
      ],
      spec.color ?? INK_BLUE,
    )
  })
}

/** An Archimedean spiral from `fromR` to `toR` over `turns` — a curled cat tail. */
export function spiralPoints(
  cx: number,
  cy: number,
  fromR: number,
  toR: number,
  turns: number,
  startAngle = 0,
  samples = 48,
): PenPoint[] {
  return Array.from({ length: samples + 1 }, (_, index) => {
    const t = index / samples
    const radius = fromR + (toR - fromR) * t
    const angle = startAngle + 2 * Math.PI * turns * t
    return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) }
  })
}

export interface CursiveSpec {
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly loops: number
  readonly samples?: number
}

/**
 * CURSIVE: one unbroken looping trace, the way a wordmark like "Cats-R-Us" is signed.
 *
 * A prolate cycloid with a raised-cosine envelope. The loops are what give it the
 * accumulated turning the cursive route needs; the envelope is what keeps its convex
 * hull off the corners of its own bounding box, which is how a written word is told
 * apart from a scribbled-out blob that fills its box completely.
 */
export function cursivePoints(spec: CursiveSpec): PenPoint[] {
  const samples = spec.samples ?? 24 * spec.loops
  const span = 2 * Math.PI * spec.loops
  return Array.from({ length: samples + 1 }, (_, index) => {
    const t = (span * index) / samples
    const progress = t / span
    const envelope = 0.12 + 0.88 * Math.sin(Math.PI * progress)
    return {
      x: spec.x + spec.w * (progress - (0.16 * Math.sin(t)) / spec.loops),
      y: spec.y + (spec.h / 2) * (1 - envelope * Math.cos(t)),
    }
  })
}

export function inkBlock(
  id: string,
  type: InkBlockKind,
  x: number,
  y: number,
  w: number,
  h: number,
): InkBlock {
  return { id, type, frame: { x, y, w, h } }
}

/**
 * THE NORMATIVE §7.1 FIXTURE, page one — the blocks and the two pen strokes exactly
 * as `docs/export-format.md` prints them.
 *
 * This is the byte-neutrality guard's input. The export contract is FROZEN, and the
 * committed brief for this page says both strokes are annotations; if this module
 * ever promotes either of them to a region, the round-trip package changes and the
 * freeze is broken. `stk_0001` must leave by the image-slot lock and `stk_0002` by the
 * block-overlap veto.
 */
export function specPageBlocks(): InkBlock[] {
  return [
    inkBlock('blk_0001', 'section', 0, 80, 1200, 520),
    inkBlock('blk_0002', 'section', 0, 640, 1200, 420),
    inkBlock('blk_0003', 'block', 0, 0, 1200, 64),
    inkBlock('blk_0004', 'block', 80, 160, 640, 96),
    inkBlock('blk_0005', 'block', 80, 280, 560, 120),
    inkBlock('blk_0006', 'block', 80, 432, 200, 56),
    inkBlock('blk_0007', 'imageSlot', 760, 144, 360, 400),
    inkBlock('blk_0008', 'block', 80, 700, 400, 64),
    inkBlock('blk_0009', 'block', 80, 788, 1040, 200),
    inkBlock('blk_0010', 'block', 80, 1000, 200, 56),
  ]
}

export function specPageStrokes(): PenStroke[] {
  return [
    penStroke(
      'stk_0001',
      [
        { x: 810, y: 210.5 },
        { x: 905.2, y: 188 },
        { x: 1010.4, y: 236.7 },
        { x: 1078.9, y: 330.2 },
        { x: 988.1, y: 402.6 },
        { x: 842.3, y: 388.9 },
      ],
      INK_RED,
    ),
    penStroke(
      'stk_0002',
      [
        { x: 60, y: 500 },
        { x: 140.5, y: 522.3 },
        { x: 252.8, y: 512.1 },
        { x: 300.2, y: 468.4 },
      ],
      INK_BLUE,
    ),
  ]
}

/* ── The four traced drawings ──────────────────────────────────────────────── */

const CARD_W = 320
const CARD_H = 260
const CARD_Y = 300

function pricingCard(index: number, left: number, glyphCount: number): PenStroke[] {
  const suffix = String(index)
  return [
    penStroke(
      `card${suffix}-box`,
      roundedBoxPoints({ x: left, y: CARD_Y, w: CARD_W, h: CARD_H, gap: 20 }),
    ),
    ...printWordStrokes({
      idPrefix: `card${suffix}-title`,
      x: left + 30,
      y: CARD_Y + 40,
      glyphHeight: 30,
      glyphWidth: 14,
      pitch: 22,
      count: glyphCount,
    }),
    ...[0, 1, 2].map((line) =>
      penStroke(
        `card${suffix}-line${String(line)}`,
        wavePoints({
          x: left + 30,
          y: CARD_Y + 110 + line * 50,
          width: 200,
          amplitude: 14,
          cycles: 1,
        }),
      ),
    ),
  ]
}

/**
 * DRAWING A — two hand-drawn rounded boxes side by side, each holding a handwritten
 * title and three squiggled feature bullets. The outlines are NOT closed: each trace
 * stops 20px short of where it began.
 */
export function pricingCards(): PenStroke[] {
  return [...pricingCard(1, 120, 10), ...pricingCard(2, 520, 12)]
}

/**
 * DRAWING B — the handwritten word "Heading" over four squiggles in two rows of two,
 * meaning two columns of body text. The trap is a classifier that swallows all five
 * runs of ink into one giant heading.
 */
export function headingAndColumns(): PenStroke[] {
  return [
    ...printWordStrokes({
      idPrefix: 'heading',
      x: 120,
      y: 180,
      glyphHeight: 56,
      glyphWidth: 26,
      pitch: 40,
      count: 7,
      descenders: [4],
    }),
    ...[0, 1].flatMap((column) =>
      [0, 1].map((row) =>
        penStroke(
          `col${String(column)}-line${String(row)}`,
          wavePoints({
            x: 120 + column * 320,
            y: 300 + row * 50,
            width: 240,
            amplitude: 14,
            cycles: 1,
          }),
        ),
      ),
    ),
  ]
}

/**
 * DRAWING C — a long red wave with tick marks hanging off it, and a blue cat outline
 * drawn UNDERNEATH it. Their bounding boxes OVERLAP, so no proximity constant can
 * separate them; only the colour family can.
 */
export function waveAndCat(): PenStroke[] {
  const wave = penStroke(
    'wave',
    wavePoints({ x: 60, y: 400, width: 1080, amplitude: 45, cycles: 3 }),
    INK_RED,
  )
  const ticks = [0, 1, 2, 3].map((index) =>
    penStroke(`tick-${String(index)}`, linePoints(200 + index * 240, 400, 0, 46), INK_RED),
  )
  return [wave, ...ticks, ...catStrokes()]
}

/**
 * An organic cat silhouette: ears, a head, a back, four legs and a tail in one trace,
 * plus eyes and whiskers. Its path is far longer than its bounding box's perimeter,
 * which is precisely why it can never be mistaken for a drawn panel.
 */
export function catStrokes(): PenStroke[] {
  const outline: PenPoint[] = [
    { x: 414, y: 450 },
    { x: 430, y: 420 },
    { x: 450, y: 350 },
    { x: 486, y: 400 },
    { x: 520, y: 386 },
    { x: 554, y: 400 },
    { x: 590, y: 350 },
    { x: 610, y: 420 },
    { x: 626, y: 452 },
    { x: 614, y: 486 },
    { x: 660, y: 500 },
    { x: 690, y: 542 },
    // The curled tail, tucked inside the silhouette's own box so the extra ink
    // lengthens the PATH without enlarging the perimeter it is measured against.
    ...spiralPoints(648, 522, 44, 12, 1.75, 0.6),
    { x: 684, y: 604 },
    { x: 668, y: 508 },
    { x: 620, y: 604 },
    { x: 604, y: 508 },
    { x: 556, y: 604 },
    { x: 540, y: 508 },
    { x: 492, y: 604 },
    { x: 476, y: 508 },
    { x: 428, y: 600 },
    { x: 420, y: 540 },
    { x: 404, y: 486 },
    { x: 414, y: 450 },
  ]
  return [
    penStroke('cat-outline', outline, INK_BLUE),
    penStroke('cat-eye-l', circlePoints(474, 440, 9, 16), INK_BLUE),
    penStroke('cat-eye-r', circlePoints(566, 440, 9, 16), INK_BLUE),
    penStroke('cat-whisker-l', linePoints(420, 470, -46, -6), INK_BLUE),
    penStroke('cat-whisker-r', linePoints(620, 470, 46, -6), INK_BLUE),
    penStroke('cat-mouth', wavePoints({ x: 496, y: 474, width: 48, amplitude: 7, cycles: 1 }), INK_BLUE),
  ]
}

function shifted(strokes: readonly PenStroke[], dx: number, dy: number): PenStroke[] {
  return strokes.map((stroke) =>
    penStroke(
      stroke.id,
      stroke.points.map((point) => ({ x: point.x + dx, y: point.y + dy })),
      stroke.color,
      stroke.width,
    ),
  )
}

/** Print words laid out left to right with a real word gap between them. */
function wordRow(idPrefix: string, x: number, y: number, glyphHeight: number, counts: readonly number[]): PenStroke[] {
  const pitch = Math.round(glyphHeight * 0.84)
  const glyphWidth = Math.round(glyphHeight * 0.58)
  const strokes: PenStroke[] = []
  let cursor = x
  counts.forEach((count, index) => {
    strokes.push(
      ...printWordStrokes({
        idPrefix: `${idPrefix}${String(index)}`,
        x: cursor,
        y,
        glyphHeight,
        glyphWidth,
        pitch,
        count,
      }),
    )
    cursor += (count - 1) * pitch + glyphWidth + Math.round(glyphHeight * 1.4)
  })
  return strokes
}

/**
 * DRAWING E — a WHOLE PAGE the client drew instead of blocking it out.
 *
 * This is the product owner's complaint in fixture form: he drew a nav bar, a
 * heading, two pricing cards and a cat, and none of them appeared in the built site.
 * It carries one instance of every shape `src/export/brief/ink.ts` has prose for — a
 * nav row over a full-width rule, a display heading, a two-member card set with
 * handwriting and squiggles inside each, an empty media box, freestanding artwork, a
 * line of body writing, a placeholder stack and a decorative band — so the generated
 * brief is the machine-readable proof that each one now reaches the builder.
 */
export function inkOnlyPage(): PenStroke[] {
  const CARD_Y_E = 400
  const cards = [120, 520].flatMap((left, index) => [
    penStroke(
      `e-card${String(index)}-box`,
      roundedBoxPoints({ x: left, y: CARD_Y_E, w: CARD_W, h: CARD_H, gap: 20 }),
    ),
    ...printWordStrokes({
      idPrefix: `e-card${String(index)}-title`,
      x: left + 30,
      y: CARD_Y_E + 40,
      glyphHeight: 30,
      glyphWidth: 14,
      pitch: 22,
      count: 10 + index * 2,
    }),
    ...[0, 1, 2].map((line) =>
      penStroke(
        `e-card${String(index)}-line${String(line)}`,
        wavePoints({ x: left + 30, y: CARD_Y_E + 110 + line * 50, width: 200, amplitude: 14, cycles: 1 }),
      ),
    ),
  ])

  return [
    ...wordRow('e-nav', 120, 60, 24, [4, 4, 7]),
    penStroke('e-rule', linePoints(120, 130, 960, 0)),
    ...printWordStrokes({
      idPrefix: 'e-heading',
      x: 200,
      y: 220,
      glyphHeight: 56,
      glyphWidth: 26,
      pitch: 40,
      count: 7,
      descenders: [4],
    }),
    ...cards,
    penStroke('e-media-box', squarePoints(900, CARD_Y_E, 240, 200)),
    ...shifted(catStrokes(), 0, 560),
    ...wordRow('e-body', 760, 1240, 26, [4, 5]),
    ...[0, 1, 2].map((line) =>
      penStroke(
        `e-copy${String(line)}`,
        wavePoints({ x: 120, y: 1320 + line * 50, width: 300, amplitude: 14, cycles: 1 }),
      ),
    ),
    penStroke('e-band', wavePoints({ x: 60, y: 1500, width: 1080, amplitude: 45, cycles: 3 }), INK_RED),
    ...[0, 1, 2, 3].map((index) =>
      penStroke(`e-band-tick${String(index)}`, linePoints(200 + index * 240, 1500, 0, 46), INK_RED),
    ),
  ]
}

/**
 * DRAWING D — a header rectangle holding a wordmark on the left and three nav words
 * on the right, with a full-width rule across its foot.
 */
export function navHeader(): PenStroke[] {
  const navWords = [4, 4, 7]
  let cursor = 700
  const nav: PenStroke[] = []
  navWords.forEach((count, index) => {
    nav.push(
      ...printWordStrokes({
        idPrefix: `nav${String(index)}`,
        x: cursor,
        y: 80,
        glyphHeight: 24,
        glyphWidth: 14,
        pitch: 20,
        count,
      }),
    )
    cursor += (count - 1) * 20 + 14 + 34
  })

  return [
    penStroke('header-box', roundedBoxPoints({ x: 60, y: 40, w: 1080, h: 160, gap: 18 })),
    penStroke('wordmark', cursivePoints({ x: 100, y: 72, w: 260, h: 56, loops: 4 })),
    ...nav,
    penStroke('header-rule', linePoints(100, 170, 1000, 0)),
  ]
}
