import { MIN_STROKE_POINTS, thinStroke } from './penThinning.ts'
import type { PenPoint, PenStroke } from './types.ts'

/**
 * PEN STROKES — the palette, the factory, and the untrusted-input boundary.
 *
 * Everything here is pure. Rendering lives in `penPath.ts`, the tool's current
 * colour/width lives in `src/store/penTool.ts`, and the strokes themselves live in
 * the DOCUMENT (`page.penStrokes`) so they undo, autosave and export like every
 * other thing the client makes.
 *
 * The stroke shape is ADDITIVE to schema v2: a payload written before the pen
 * layer existed simply has no `penStrokes` key and parses to `[]`, which is why
 * this feature does not bump `BLUEPRINT_SCHEMA_VERSION` (a bump means migration,
 * and there is nothing here to migrate).
 */

export interface PenColorOption {
  readonly id: string
  readonly label: string
  /** `#rrggbb` — the export schema's colour pattern (§2.9). */
  readonly hex: string
}

export interface PenWidthOption {
  readonly id: string
  readonly label: string
  readonly px: number
}

/**
 * A sketch palette, not a paint box — and FOUR EQUAL COLOURS, none of which means
 * anything by itself.
 *
 * The labels used to read "Red (notes)", from a time when every mark on the page
 * was marginalia and the only question about a stroke was which block it referred
 * to. That is no longer true: `src/canvas/ink/**` reads a drawn box as a card and a
 * scribble as artwork whatever colour they are drawn in, so a swatch that tells the
 * client one colour is for notes is now teaching them the opposite of what the tool
 * does — the product owner drew a background wave in red and was surprised it was
 * not built. What colour DOES mean is separation: the ink module segments a page
 * into colour families, so drawing a second thing in a second colour is how you say
 * "these are two things". That is a property of using two colours, not of any one
 * of them, so it belongs in the hint text and not in a swatch's name.
 *
 * THE HEXES ARE FROZEN. Each of these four strings is written verbatim into every
 * saved `.blueprint` and into `site.json` (§2.9), and the colour-family grouping
 * keys on them — changing one would silently re-read designs already on a client's
 * disk. Labels are copy; hexes are data. `penStrokes.test.ts` pins them.
 */
export const PEN_COLORS: readonly PenColorOption[] = [
  { id: 'red', label: 'Red', hex: '#d92d20' },
  { id: 'ink', label: 'Ink', hex: '#1f2937' },
  { id: 'blue', label: 'Blue', hex: '#2f6df6' },
  { id: 'green', label: 'Green', hex: '#15803d' },
]

/** Two widths, far enough apart to be told apart at fit-to-window zoom. */
export const PEN_WIDTHS: readonly PenWidthOption[] = [
  { id: 'fine', label: 'Fine', px: 4 },
  { id: 'bold', label: 'Bold', px: 12 },
]

/**
 * THE PEN STARTS IN INK, NOT IN RED — and it is named, not indexed.
 *
 * It used to be `PEN_COLORS[0]`, which was red back when the pen existed to
 * annotate a layout the blocks had already built. The pen's primary job is now to
 * BUILD (`src/canvas/ink/**`), and the first stroke a client draws is far more
 * likely to be a box, a heading or a picture than a correction — so the colour in
 * hand should be the one you would draw a design in, not the one you would mark it
 * up in. Red is still one click away, and still means nothing special.
 *
 * Looked up by id rather than by position so that reordering the swatches (a copy
 * decision) can never silently change which colour the pen starts in (a behaviour
 * decision). The `??` fallback is the same string as the `ink` swatch above.
 */
export const DEFAULT_PEN_COLOR =
  PEN_COLORS.find((color) => color.id === 'ink')?.hex ?? '#1f2937'
export const DEFAULT_PEN_WIDTH = PEN_WIDTHS[0]?.px ?? 4

/** Sanity ceiling for a parsed width — a 900px "stroke" is a corrupt payload. */
export const MAX_PEN_WIDTH_PX = 64

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/

/** Monotonic within a session; `Date.now` keeps ids unique across reloads too. */
let sequence = 0

export function createStrokeId(): string {
  sequence += 1
  return `stroke-${Date.now().toString(36)}-${sequence.toString(36)}`
}

/** Test-only: makes generated ids comparable across runs. */
export function resetStrokeIdSequence(): void {
  sequence = 0
}

/**
 * Build the stroke that gets committed on pointerup — thinned once, here, so the
 * store never sees the raw sample trail. Returns `null` when there is nothing to
 * record (a stray pointerdown with no samples at all).
 */
export function createStroke(
  points: readonly PenPoint[],
  color: string,
  width: number,
): PenStroke | null {
  const thinned = thinStroke(points)
  if (thinned.length < MIN_STROKE_POINTS) return null

  return { id: createStrokeId(), points: thinned, color, width }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parsePoint(value: unknown): PenPoint | null {
  if (!isRecord(value)) return null
  const { x, y } = value
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null
  return { x, y }
}

function parsePoints(value: unknown): readonly PenPoint[] | null {
  if (!Array.isArray(value)) return null
  if (value.length < MIN_STROKE_POINTS) return null

  const points: PenPoint[] = []
  for (const candidate of value) {
    const point = parsePoint(candidate)
    if (!point) return null
    points.push(point)
  }

  return points
}

/**
 * One stroke out of an untrusted payload. `null` means the file cannot be trusted
 * — the same contract every other parser in this folder follows. The colour is
 * checked for FORMAT, not for membership of `PEN_COLORS`: changing the palette
 * later must not make yesterday's saved design unreadable.
 */
export function parsePenStroke(value: unknown): PenStroke | null {
  if (!isRecord(value)) return null

  const { id, color, width } = value
  if (typeof id !== 'string' || id.length === 0) return null
  if (typeof color !== 'string' || !HEX_COLOR.test(color)) return null
  if (!isFiniteNumber(width) || width <= 0 || width > MAX_PEN_WIDTH_PX) return null

  const points = parsePoints(value.points)
  return points === null ? null : { id, points, color, width }
}

/**
 * A page's whole pen layer. A MISSING list is `[]` — that is the entire story of
 * reading a pre-pen-layer v2 payload. Anything present but malformed is still
 * corruption, so a truncated file is never silently accepted as "no strokes".
 */
export function parsePenStrokes(value: unknown): readonly PenStroke[] | null {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value)) return null

  const strokes: PenStroke[] = []
  for (const candidate of value) {
    const stroke = parsePenStroke(candidate)
    if (!stroke) return null
    strokes.push(stroke)
  }

  return strokes
}

/** Newest last: draw order IS paint order, and the export walks it the same way. */
export function withStrokeAdded(
  strokes: readonly PenStroke[],
  stroke: PenStroke,
): readonly PenStroke[] {
  return [...strokes, stroke]
}

/** Identity in, identity out when the id is not there — an erase that erased nothing. */
export function withStrokeRemoved(
  strokes: readonly PenStroke[],
  strokeId: string,
): readonly PenStroke[] {
  if (!strokes.some((stroke) => stroke.id === strokeId)) return strokes
  return strokes.filter((stroke) => stroke.id !== strokeId)
}

/** Fresh ids for a duplicated page — stroke ids are unique site-wide, like blocks. */
export function duplicateStrokes(strokes: readonly PenStroke[]): readonly PenStroke[] {
  return strokes.map((stroke) => ({ ...stroke, id: createStrokeId() }))
}
