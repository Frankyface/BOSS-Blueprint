import getStroke from 'perfect-freehand'
import type { StrokeOptions } from 'perfect-freehand'

import { roundCoordinate } from './penThinning.ts'
import type { PenPoint, PenStroke } from './types.ts'

/**
 * RENDERING a stroke: perfect-freehand (MIT) turns a point trail into the OUTLINE
 * of a nib-drawn line, and this module turns that outline into an SVG path.
 *
 * No canvas element anywhere — the canvas-engine decision (debate #1) puts the pen
 * layer in an SVG overlay of plain DOM, so the same markup that is on screen is
 * what the Stage 3 PNG capture rasterises.
 *
 * Pure and deterministic. `simulatePressure` is OFF: perfect-freehand's default
 * fakes pressure from pointer VELOCITY, which would make the stored geometry
 * depend on how fast the client's hand moved and how often their browser sampled —
 * unreproducible across engines and untestable. A constant-width line is also what
 * a marker annotation should look like.
 */
export const PEN_STROKE_OPTIONS: StrokeOptions = {
  thinning: 0,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: false,
  last: true,
}

/** Two decimals is well under a device pixel at 1:1 and keeps the `d` string short. */
const PATH_DECIMALS = 2

/**
 * The outline polygon as a closed path of quadratic curves through the midpoints
 * of consecutive outline points — the standard perfect-freehand rendering. Curves
 * rather than straight segments: the outline is dense, and `L` segments show as
 * visible faceting on the inside of a tight loop.
 */
function outlineToPath(outline: readonly (readonly number[])[]): string {
  const first = outline[0]
  if (!first || first.length < 2) return ''

  const round = (value: number) => roundCoordinate(value, PATH_DECIMALS)
  const parts: string[] = [`M ${String(round(first[0] ?? 0))} ${String(round(first[1] ?? 0))}`]

  for (let index = 0; index < outline.length; index += 1) {
    const point = outline[index]
    const next = outline[(index + 1) % outline.length]
    if (!point || !next) continue

    const x0 = point[0] ?? 0
    const y0 = point[1] ?? 0
    const x1 = next[0] ?? 0
    const y1 = next[1] ?? 0

    parts.push(
      `Q ${String(round(x0))} ${String(round(y0))} ` +
        `${String(round((x0 + x1) / 2))} ${String(round((y0 + y1) / 2))}`,
    )
  }

  parts.push('Z')
  return parts.join(' ')
}

/** The `d` of the FILLED outline for a finished (or in-progress) set of points. */
export function strokePathData(points: readonly PenPoint[], width: number): string {
  if (points.length === 0) return ''

  const outline = getStroke(
    points.map((point) => [point.x, point.y]),
    { ...PEN_STROKE_OPTIONS, size: width },
  )

  return outlineToPath(outline)
}

export function pathDataOfStroke(stroke: PenStroke): string {
  return strokePathData(stroke.points, stroke.width)
}

/**
 * A plain open polyline through the raw points — never painted, used only as the
 * eraser's hit target. The filled outline of a fine stroke is a few pixels wide and
 * nearly impossible to tap; a transparent polyline stroked far wider gives the
 * client (and Playwright) something honest to aim at.
 */
export function polylinePathData(points: readonly PenPoint[]): string {
  return points
    .map((point, index) => {
      const command = index === 0 ? 'M' : 'L'
      return `${command} ${String(roundCoordinate(point.x, PATH_DECIMALS))} ${String(roundCoordinate(point.y, PATH_DECIMALS))}`
    })
    .join(' ')
}

/** The rectangle a pointer position is measured against — a DOMRect, or a fake of one. */
export interface ViewportRect {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

function clamp(value: number, max: number): number {
  if (value < 0) return 0
  return value > max ? max : value
}

/**
 * Client (screen) coordinates → PAGE coordinates.
 *
 * Scale is derived from the overlay's own measured box rather than read from the
 * zoom state: the overlay IS the page, so a fit-to-window resize mid-stroke
 * corrects itself on the very next sample. Points are clamped to the page because
 * pointer capture keeps delivering samples after the client's hand leaves it, and
 * a stroke at x = -400 is off the exported PNG entirely.
 */
export function pointFromClient(
  rect: ViewportRect,
  clientX: number,
  clientY: number,
  pageWidth: number,
  pageHeight: number,
): PenPoint {
  const scaleX = rect.width > 0 ? pageWidth / rect.width : 1
  const scaleY = rect.height > 0 ? pageHeight / rect.height : 1

  return {
    x: clamp((clientX - rect.left) * scaleX, pageWidth),
    y: clamp((clientY - rect.top) * scaleY, pageHeight),
  }
}
