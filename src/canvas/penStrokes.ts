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
 * A sketch palette, not a paint box. Red leads because the feature's own goal
 * leads with annotation ("make this bigger!") and red is the one colour a builder
 * reads as a margin note rather than as part of the design; ink, blue and green
 * cover sketching an image and marking up a second thing on the same page.
 */
export const PEN_COLORS: readonly PenColorOption[] = [
  { id: 'red', label: 'Red (notes)', hex: '#d92d20' },
  { id: 'ink', label: 'Ink', hex: '#1f2937' },
  { id: 'blue', label: 'Blue', hex: '#2f6df6' },
  { id: 'green', label: 'Green', hex: '#15803d' },
]

/** Two widths, far enough apart to be told apart at fit-to-window zoom. */
export const PEN_WIDTHS: readonly PenWidthOption[] = [
  { id: 'fine', label: 'Fine', px: 4 },
  { id: 'bold', label: 'Bold', px: 12 },
]

export const DEFAULT_PEN_COLOR = PEN_COLORS[0]?.hex ?? '#d92d20'
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
