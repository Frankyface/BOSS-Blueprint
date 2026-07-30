import { useEffect, useMemo, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { PAGE_WIDTH_PX } from '../canvas/constants.ts'
import { hasContentBelow, pageHeightForContent } from '../canvas/geometry.ts'
import { useCanvasKeyboard } from '../hooks/useCanvasKeyboard.ts'
import { usePageScale } from '../hooks/usePageScale.ts'
import {
  selectCurrentBlocks,
  selectCurrentExtraBottom,
  selectCurrentStrokes,
  useCanvasStore,
} from '../store/canvasStore.ts'

import { BlockView } from './BlockView.tsx'
import { CanvasToolbar } from './CanvasToolbar.tsx'
import { PageSpaceHandle } from './PageSpaceHandle.tsx'
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
  const extraBottomPx = useCanvasStore(selectCurrentExtraBottom)
  const setPageSpace = useCanvasStore((state) => state.setPageSpace)

  const { viewportRef, scale, getScale } = usePageScale()

  /**
   * The length the bottom-edge handle is currently dragging the page to, or `null`
   * when nobody is dragging. The store is deliberately not written mid-gesture (the
   * fast path — see `PageSpaceHandle`), so this is where the preview lives; every
   * consumer of `pageHeight` below then grows together, the pen overlay included.
   */
  const [draftExtraPx, setDraftExtraPx] = useState<number | null>(null)
  const liveExtraPx = draftExtraPx ?? extraBottomPx

  // Pen marks hold the page open exactly as blocks do, and the client's own "Add
  // space" is added on top of both — see `pageHeightForContent`.
  const pageHeight = useMemo(
    () => pageHeightForContent(blocks, strokes, liveExtraPx),
    [blocks, strokes, liveExtraPx],
  )

  useCanvasKeyboard()

  /**
   * THE PAGE CONTINUES BELOW (UX audit P5). The decision is `hasContentBelow`,
   * which is unit-tested arithmetic; this is only the wiring that feeds it the
   * three numbers and re-asks after anything that can change them.
   *
   * `pageHeight` and `scale` are dependencies rather than observed, because a
   * block added off the bottom grows the CONTENT, not the scroller, and a
   * `ResizeObserver` on the viewport would never fire for it.
   */
  const [isPageClipped, setPageClipped] = useState(false)

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return

    const measure = () => {
      setPageClipped(
        hasContentBelow(viewport.scrollTop, viewport.clientHeight, viewport.scrollHeight),
      )
    }
    measure()

    viewport.addEventListener('scroll', measure, { passive: true })

    // jsdom has no ResizeObserver and no layout; there the one measurement stands.
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(viewport)

    return () => {
      viewport.removeEventListener('scroll', measure)
      observer?.disconnect()
    }
  }, [viewportRef, pageHeight, scale])

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
          {/* Chrome ON the page's bottom edge but OUTSIDE `.canvas-page`, so it
              scrolls and zooms with the sheet without ever being part of one. */}
          <PageSpaceHandle
            extraBottomPx={extraBottomPx}
            getScale={getScale}
            onPreview={setDraftExtraPx}
            onCommit={(next) => {
              setPageSpace(currentPageId, next)
            }}
          />
        </div>
      </div>
      {/* Chrome over the scroller, never inside the page: `pointer-events: none`
          so it cannot swallow a click, and outside the element the PNG renderer
          captures so it can never reach an exported page. */}
      <div
        className="canvas-area__more"
        data-testid="canvas-more"
        data-more={isPageClipped ? 'true' : 'false'}
        aria-hidden="true"
      />
    </main>
  )
}
