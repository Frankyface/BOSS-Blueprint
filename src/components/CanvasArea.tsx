import { useMemo } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { PAGE_WIDTH_PX } from '../canvas/constants.ts'
import { pageHeightForContent } from '../canvas/geometry.ts'
import { useCanvasKeyboard } from '../hooks/useCanvasKeyboard.ts'
import { usePageScale } from '../hooks/usePageScale.ts'
import { selectCurrentBlocks, selectCurrentStrokes, useCanvasStore } from '../store/canvasStore.ts'

import { BlockView } from './BlockView.tsx'
import { CanvasToolbar } from './CanvasToolbar.tsx'
import { PenLayer } from './PenLayer.tsx'

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
  const blocks = useCanvasStore(selectCurrentBlocks)
  const strokes = useCanvasStore(selectCurrentStrokes)
  const currentPageId = useCanvasStore((state) => state.currentPageId)
  const selectedBlockId = useCanvasStore((state) => state.selectedBlockId)
  const editingBlockId = useCanvasStore((state) => state.editingBlockId)
  const selectBlock = useCanvasStore((state) => state.selectBlock)

  const { viewportRef, scale, getScale } = usePageScale()
  // Pen marks hold the page open exactly as blocks do — see `pageHeightForContent`.
  const pageHeight = useMemo(() => pageHeightForContent(blocks, strokes), [blocks, strokes])

  useCanvasKeyboard()

  // Blocks stop their own pointerdown, so anything reaching here is empty canvas.
  const handleBackgroundPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== PRIMARY_MOUSE_BUTTON) return
    selectBlock(null)
  }

  return (
    <main className="canvas-area" aria-label={CANVAS_LABEL} data-testid="canvas-area" data-tour="canvas">
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
            data-page-id={currentPageId}
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
            {/* Last child and top of the stacking order: pen marks paint over
                everything, and the layer is transparent to pointers when the pen
                is put away. Keyed by page so a switch cannot leak a half-drawn
                stroke onto the next one. */}
            <PenLayer key={currentPageId} pageHeight={pageHeight} />
          </div>
        </div>
      </div>
    </main>
  )
}
