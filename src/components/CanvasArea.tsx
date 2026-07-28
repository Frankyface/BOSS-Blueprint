import { useMemo } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { PAGE_WIDTH_PX } from '../canvas/constants.ts'
import { pageHeightForRects } from '../canvas/geometry.ts'
import { useCanvasKeyboard } from '../hooks/useCanvasKeyboard.ts'
import { usePageScale } from '../hooks/usePageScale.ts'
import { useCanvasStore } from '../store/canvasStore.ts'

import { BlockView } from './BlockView.tsx'
import { CanvasToolbar } from './CanvasToolbar.tsx'

import './CanvasArea.css'

const CANVAS_LABEL = 'Page canvas'
const EMPTY_HINT = 'Pick a block from the left to start your page.'
const PRIMARY_MOUSE_BUTTON = 0

/**
 * The virtual page: a white 1200px-wide sheet that grows downwards, scaled to fit
 * the window and scrollable. Blocks are plain absolutely-positioned DOM elements
 * inside it — no canvas element anywhere (see the canvas-engine decision).
 */
export function CanvasArea() {
  const blocks = useCanvasStore((state) => state.blocks)
  const selectedBlockId = useCanvasStore((state) => state.selectedBlockId)
  const editingBlockId = useCanvasStore((state) => state.editingBlockId)
  const selectBlock = useCanvasStore((state) => state.selectBlock)

  const { viewportRef, scale, getScale } = usePageScale()
  const pageHeight = useMemo(() => pageHeightForRects(blocks), [blocks])

  useCanvasKeyboard()

  // Blocks stop their own pointerdown, so anything reaching here is empty canvas.
  const handleBackgroundPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== PRIMARY_MOUSE_BUTTON) return
    selectBlock(null)
  }

  return (
    <main className="canvas-area" aria-label={CANVAS_LABEL} data-testid="canvas-area">
      <CanvasToolbar />
      <div
        className="canvas-area__viewport"
        data-testid="canvas-viewport"
        ref={viewportRef}
        onPointerDown={handleBackgroundPointerDown}
      >
        <div
          className="canvas-area__scaler"
          style={{ width: `${PAGE_WIDTH_PX * scale}px`, height: `${pageHeight * scale}px` }}
        >
          <div
            className="canvas-page"
            data-testid="canvas-page"
            data-page-scale={scale}
            data-page-width={PAGE_WIDTH_PX}
            data-page-height={pageHeight}
            style={{
              width: `${PAGE_WIDTH_PX}px`,
              height: `${pageHeight}px`,
              transform: `scale(${scale})`,
            }}
          >
            {blocks.length === 0 && <p className="canvas-page__empty">{EMPTY_HINT}</p>}
            {blocks.map((block, index) => (
              <BlockView
                key={block.id}
                block={block}
                zIndex={index + 1}
                isSelected={block.id === selectedBlockId}
                isEditing={block.id === editingBlockId}
                getScale={getScale}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  )
}
