import { useCallback, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'

import { moveRect, resizeRect } from '../canvas/geometry.ts'
import type { Block, BlockRect, ResizeHandle } from '../canvas/types.ts'
import { toRect } from '../canvas/types.ts'
import { getBlockTypeDefinition } from '../constants/blockTypes.ts'
import { useCanvasStore } from '../store/canvasStore.ts'

const PRIMARY_MOUSE_BUTTON = 0

interface Gesture {
  readonly pointerId: number
  /** `null` means "moving the whole block". */
  readonly handle: ResizeHandle | null
  readonly startClientX: number
  readonly startClientY: number
  readonly startRect: BlockRect
}

interface UseBlockGestureOptions {
  readonly block: Block
  readonly elementRef: RefObject<HTMLDivElement | null>
  /** Live fit-to-window zoom, read at gesture time so a resize mid-drag is safe. */
  readonly getScale: () => number
}

export interface BlockGestureHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
  onHandlePointerDown: (event: ReactPointerEvent<HTMLElement>, handle: ResizeHandle) => void
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void
}

/**
 * GESTURE FAST PATH — read before changing.
 *
 * While the pointer is down we do NOT touch the Zustand store: React would
 * re-render on every pointermove, which is what makes 30+ block canvases janky.
 * Instead the dragged element is previewed by writing its style directly
 * (`transform` for a move — compositor-only; width/height/left/top for a resize),
 * and the store is committed ONCE on pointerup.
 *
 * The preview uses the very same pure functions as the store action, applied to
 * the same start rect, so the committed result is pixel-identical to what the
 * client saw. On release we also write the final values imperatively before
 * committing, so there is no frame where the DOM and the store disagree.
 */
export function useBlockGesture({
  block,
  elementRef,
  getScale,
}: UseBlockGestureOptions): BlockGestureHandlers {
  const gestureRef = useRef<Gesture | null>(null)
  const selectBlock = useCanvasStore((state) => state.selectBlock)
  const moveBlockBy = useCanvasStore((state) => state.moveBlockBy)
  const resizeBlockBy = useCanvasStore((state) => state.resizeBlockBy)

  const resolveRect = useCallback(
    (gesture: Gesture, event: ReactPointerEvent<HTMLElement>) => {
      const scale = getScale() || 1
      const deltaX = (event.clientX - gesture.startClientX) / scale
      const deltaY = (event.clientY - gesture.startClientY) / scale

      const rect = gesture.handle
        ? resizeRect(
            gesture.startRect,
            gesture.handle,
            deltaX,
            deltaY,
            getBlockTypeDefinition(block.type).minSize,
          )
        : moveRect(gesture.startRect, deltaX, deltaY)

      return { rect, deltaX, deltaY }
    },
    [block.type, getScale],
  )

  const beginGesture = useCallback(
    (event: ReactPointerEvent<HTMLElement>, handle: ResizeHandle | null) => {
      const element = elementRef.current
      if (!element || event.button !== PRIMARY_MOUSE_BUTTON) return

      event.stopPropagation()
      element.setPointerCapture(event.pointerId)
      element.style.willChange = 'transform'

      gestureRef.current = {
        pointerId: event.pointerId,
        handle,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startRect: toRect(block),
      }
    },
    [block, elementRef],
  )

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      selectBlock(block.id)
      beginGesture(event, null)
    },
    [beginGesture, block.id, selectBlock],
  )

  const onHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>, handle: ResizeHandle) => {
      beginGesture(event, handle)
    },
    [beginGesture],
  )

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current
      const element = elementRef.current
      if (!gesture || !element || gesture.pointerId !== event.pointerId) return

      const { rect } = resolveRect(gesture, event)

      if (gesture.handle) {
        element.style.left = `${rect.x}px`
        element.style.top = `${rect.y}px`
        element.style.width = `${rect.width}px`
        element.style.height = `${rect.height}px`
        return
      }

      const offsetX = rect.x - gesture.startRect.x
      const offsetY = rect.y - gesture.startRect.y
      element.style.transform = `translate3d(${offsetX}px, ${offsetY}px, 0)`
    },
    [elementRef, resolveRect],
  )

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const gesture = gestureRef.current
      const element = elementRef.current
      if (!gesture || !element || gesture.pointerId !== event.pointerId) return

      gestureRef.current = null
      if (element.hasPointerCapture(event.pointerId)) {
        element.releasePointerCapture(event.pointerId)
      }

      const { rect, deltaX, deltaY } = resolveRect(gesture, event)

      // Land the element on the committed values, then hand control back to React.
      element.style.transform = ''
      element.style.willChange = ''
      element.style.left = `${rect.x}px`
      element.style.top = `${rect.y}px`
      element.style.width = `${rect.width}px`
      element.style.height = `${rect.height}px`

      if (gesture.handle) {
        resizeBlockBy(block.id, gesture.handle, deltaX, deltaY)
      } else {
        moveBlockBy(block.id, deltaX, deltaY)
      }
    },
    [block.id, elementRef, moveBlockBy, resizeBlockBy, resolveRect],
  )

  return { onPointerDown, onHandlePointerDown, onPointerMove, onPointerUp }
}
