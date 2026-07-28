import type { PointerEvent as ReactPointerEvent } from 'react'

import type { ResizeHandle } from '../canvas/types.ts'
import { RESIZE_HANDLES } from '../canvas/types.ts'

interface ResizeHandlesProps {
  onHandlePointerDown: (event: ReactPointerEvent<HTMLElement>, handle: ResizeHandle) => void
}

/**
 * The eight corner/edge grips drawn around the selected block.
 *
 * Pointer-only, and hidden from the accessibility tree because a focusable grip
 * that does nothing on Enter is worse than no grip at all. There is currently NO
 * keyboard route to move or resize a block — the canvas toolbar only exposes
 * stacking order, delete, undo/redo and start over. That is a known accessibility
 * gap, not an oversight in this comment: closing it means arrow-key nudging
 * (each press one undo step), which is a product decision rather than a tidy-up.
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
