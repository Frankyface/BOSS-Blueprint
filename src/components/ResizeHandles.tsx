import type { PointerEvent as ReactPointerEvent } from 'react'

import type { ResizeHandle } from '../canvas/types.ts'
import { RESIZE_HANDLES } from '../canvas/types.ts'

interface ResizeHandlesProps {
  onHandlePointerDown: (event: ReactPointerEvent<HTMLElement>, handle: ResizeHandle) => void
}

/**
 * The eight corner/edge grips drawn around the selected block.
 * Pointer-only affordances (keyboard users resize via the store actions the
 * toolbar exposes), so they are hidden from the accessibility tree.
 */
export function ResizeHandles({ onHandlePointerDown }: ResizeHandlesProps) {
  return (
    <>
      {RESIZE_HANDLES.map((handle) => (
        <span
          key={handle}
          className={`resize-handle resize-handle--${handle}`}
          data-testid="resize-handle"
          data-handle={handle}
          aria-hidden="true"
          onPointerDown={(event) => onHandlePointerDown(event, handle)}
        />
      ))}
    </>
  )
}
