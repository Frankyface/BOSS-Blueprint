import { useMemo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { PAGE_WIDTH_PX } from '../canvas/constants.ts'
import { pathDataOfStroke, pointFromClient, polylinePathData, strokePathData } from '../canvas/penPath.ts'
import { createStroke } from '../canvas/penStrokes.ts'
import type { PenPoint } from '../canvas/types.ts'
import { selectCurrentStrokes, useCanvasStore } from '../store/canvasStore.ts'
import { usePenToolStore } from '../store/penTool.ts'

import './PenLayer.css'

const PRIMARY_MOUSE_BUTTON = 0

/**
 * How wide the eraser's invisible hit line is. A 4px stroke is almost impossible
 * to hit exactly; this is the "close enough is what you meant" allowance.
 */
export const ERASER_HIT_WIDTH_PX = 20

interface PenLayerProps {
  /** The page grows with its content, and the overlay is exactly the page. */
  pageHeight: number
}

interface PenGesture {
  readonly pointerId: number
  readonly points: PenPoint[]
}

/**
 * THE PEN LAYER — one SVG overlay per page, above every block.
 *
 * It lives INSIDE `.canvas-page`, so it inherits the page's fit-to-window
 * transform: strokes scroll and zoom with the page for free, and their coordinates
 * are page pixels with no bookkeeping. Strokes always paint above the blocks,
 * which is also what the export contract promises (§2.9).
 *
 * DRAWING FOLLOWS THE GESTURE FAST PATH (`useBlockGesture`, same reasoning): while
 * the pointer is down nothing is written to Zustand. The in-progress line is
 * previewed by setting the `d` attribute of one dedicated path element directly,
 * and the store is written ONCE on pointerup — so a scribble is one re-render, one
 * undo step and one autosave rather than one of each per sample.
 *
 * When the tool is off the whole overlay is `pointer-events: none` (see
 * `PenLayer.css`), which is what "block editing still works normally" means in
 * practice: the overlay is not in the way, it is not there.
 */
export function PenLayer({ pageHeight }: PenLayerProps) {
  const strokes = useCanvasStore(selectCurrentStrokes)
  const addPenStroke = useCanvasStore((state) => state.addPenStroke)
  const removePenStroke = useCanvasStore((state) => state.removePenStroke)

  const mode = usePenToolStore((state) => state.mode)
  const color = usePenToolStore((state) => state.color)
  const width = usePenToolStore((state) => state.width)

  const rootRef = useRef<SVGSVGElement | null>(null)
  const liveRef = useRef<SVGPathElement | null>(null)
  const gestureRef = useRef<PenGesture | null>(null)

  const painted = useMemo(
    () =>
      strokes.map((stroke) => ({
        id: stroke.id,
        color: stroke.color,
        outline: pathDataOfStroke(stroke),
        hitLine: polylinePathData(stroke.points),
        hitWidth: Math.max(stroke.width, ERASER_HIT_WIDTH_PX),
      })),
    [strokes],
  )

  const readPoint = (event: ReactPointerEvent<SVGSVGElement>): PenPoint | null => {
    const root = rootRef.current
    if (!root) return null

    return pointFromClient(
      root.getBoundingClientRect(),
      event.clientX,
      event.clientY,
      PAGE_WIDTH_PX,
      pageHeight,
    )
  }

  /** Preview without React: one attribute write per pointermove, nothing else. */
  const paintLive = (points: readonly PenPoint[]) => {
    liveRef.current?.setAttribute('d', strokePathData(points, width))
  }

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (mode !== 'draw' || event.button !== PRIMARY_MOUSE_BUTTON) return

    const point = readPoint(event)
    if (!point) return

    event.preventDefault()
    rootRef.current?.setPointerCapture(event.pointerId)
    gestureRef.current = { pointerId: event.pointerId, points: [point] }
    paintLive([point])
  }

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    const point = readPoint(event)
    if (!point) return

    gesture.points.push(point)
    paintLive(gesture.points)
  }

  /**
   * Release commits. A cancelled pointer (the browser taking over for a scroll or
   * a system gesture) commits too: the client drew something, and silently binning
   * their mark because the OS interrupted is the wrong answer.
   */
  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    gestureRef.current = null
    const root = rootRef.current
    if (root?.hasPointerCapture(event.pointerId)) root.releasePointerCapture(event.pointerId)

    liveRef.current?.setAttribute('d', '')

    const stroke = createStroke(gesture.points, color, width)
    if (stroke) addPenStroke(stroke)
  }

  const handleErase = (event: ReactPointerEvent<SVGGElement>, strokeId: string) => {
    if (mode !== 'erase' || event.button !== PRIMARY_MOUSE_BUTTON) return
    event.preventDefault()
    removePenStroke(strokeId)
  }

  return (
    <svg
      ref={rootRef}
      className="pen-layer"
      data-testid="pen-layer"
      data-pen-mode={mode}
      data-stroke-count={painted.length}
      width={PAGE_WIDTH_PX}
      height={pageHeight}
      viewBox={`0 0 ${String(PAGE_WIDTH_PX)} ${String(pageHeight)}`}
      // Decorative: the strokes' meaning is carried by the exported PNG and JSON,
      // and the canvas itself is already labelled.
      aria-hidden="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {painted.map((stroke) => (
        <g
          key={stroke.id}
          className="pen-layer__stroke"
          data-testid="pen-stroke"
          data-stroke-id={stroke.id}
          data-stroke-color={stroke.color}
          onPointerDown={(event) => {
            handleErase(event, stroke.id)
          }}
        >
          <path d={stroke.outline} fill={stroke.color} />
          <path
            className="pen-layer__hit"
            d={stroke.hitLine}
            fill="none"
            stroke="transparent"
            strokeWidth={stroke.hitWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      ))}

      {/* The in-progress stroke: one element, written to imperatively, never by React. */}
      <path ref={liveRef} className="pen-layer__live" data-testid="pen-live-stroke" d="" fill={color} />
    </svg>
  )
}
