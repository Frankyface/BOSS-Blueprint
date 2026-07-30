import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { clampExtraSpace } from '../canvas/geometry.ts'

const PRIMARY_MOUSE_BUTTON = 0

interface PageSpaceHandleProps {
  /** The room the page is holding open right now, straight from the document. */
  readonly extraBottomPx: number
  /** Live fit-to-window zoom, read at gesture time so a resize mid-drag is safe. */
  readonly getScale: () => number
  /** Show this much room without committing it; `null` hands the page back. */
  readonly onPreview: (extraBottomPx: number | null) => void
  readonly onCommit: (extraBottomPx: number) => void
}

interface Gesture {
  readonly pointerId: number
  readonly startClientY: number
  readonly startExtraPx: number
  extraPx: number
}

/**
 * THE GRAB BAR ALONG THE PAGE'S BOTTOM EDGE — pull down for more page, push up to
 * take it back.
 *
 * It is a SIBLING of `.canvas-page`, inside the scaler: that puts it exactly on the
 * page's bottom edge and lets it scroll and zoom with the sheet, while keeping it
 * out of the element the export renders (chrome must never reach a client's PNG).
 *
 * POINTER-ONLY AND `aria-hidden`, on the `ResizeHandles` precedent: a focusable grip
 * that does nothing on Enter is worse than no grip at all. That is only acceptable
 * because this handle adds no capability — every single thing it does is also on the
 * "Add space" and "Trim" buttons in the toolbar, which are keyboard-reachable and
 * announce their state. Delete this file and the feature still works; delete the
 * buttons and it does not.
 *
 * GESTURE FAST PATH (`useBlockGesture`, same reasoning): the store is NOT written
 * while the pointer is down. The drag previews through `onPreview` — React state in
 * the canvas, so the sheet, the scaler and the pen overlay all grow together — and
 * commits ONCE on release, so a two-second drag is one undo step, not two hundred.
 */
export function PageSpaceHandle({
  extraBottomPx,
  getScale,
  onPreview,
  onCommit,
}: PageSpaceHandleProps) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const gestureRef = useRef<Gesture | null>(null)

  const resolve = (gesture: Gesture, clientY: number): number => {
    const scale = getScale() || 1
    return clampExtraSpace(gesture.startExtraPx + (clientY - gesture.startClientY) / scale)
  }

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const element = elementRef.current
    if (!element || event.button !== PRIMARY_MOUSE_BUTTON) return

    event.preventDefault()
    event.stopPropagation()
    element.setPointerCapture(event.pointerId)

    gestureRef.current = {
      pointerId: event.pointerId,
      startClientY: event.clientY,
      startExtraPx: extraBottomPx,
      extraPx: extraBottomPx,
    }
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    gesture.extraPx = resolve(gesture, event.clientY)
    onPreview(gesture.extraPx)
  }

  /**
   * Release commits — and so does a cancelled pointer, because the client did drag
   * the page to a length and the browser taking over for a scroll is not a reason to
   * snap it back under their hand.
   */
  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.pointerId !== event.pointerId) return

    gestureRef.current = null
    const element = elementRef.current
    if (element?.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId)
    }

    const settled = resolve(gesture, event.clientY)
    // Commit first, then drop the preview: both land in one React batch, so the
    // page never renders a frame at its old length on the way back to the store.
    onCommit(settled)
    onPreview(null)
  }

  return (
    <div
      ref={elementRef}
      className="page-space-handle"
      data-testid="page-space-handle"
      aria-hidden="true"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <span className="page-space-handle__grip" />
    </div>
  )
}
