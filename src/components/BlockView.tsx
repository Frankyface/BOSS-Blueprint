import { memo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { copyModeOf, isCopyBlock, isLinked } from '../canvas/blockEdits.ts'
import type { Block } from '../canvas/types.ts'
import { getBlockTypeDefinition } from '../constants/blockTypes.ts'
import { useBlockGesture } from '../hooks/useBlockGesture.ts'
import { useCanvasStore } from '../store/canvasStore.ts'

import { BlockContent } from './BlockContent.tsx'
import { BlockTextEditor } from './BlockTextEditor.tsx'
import { ResizeHandles } from './ResizeHandles.tsx'

import './BlockView.css'

interface BlockViewProps {
  block: Block
  /** Paint order, supplied by the page (array index + 1). */
  zIndex: number
  isSelected: boolean
  isEditing: boolean
  getScale: () => number
}

/**
 * One absolutely-positioned block on the virtual page.
 *
 * Memoised on purpose: the page re-renders on every store change, and with 30+
 * blocks only the ones whose props actually changed may re-render. All props are
 * primitives or stable references (`block` identity only changes when that block
 * changes; `getScale` never changes).
 */
export const BlockView = memo(function BlockView({
  block,
  zIndex,
  isSelected,
  isEditing,
  getScale,
}: BlockViewProps) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const startEditingBlock = useCanvasStore((state) => state.startEditingBlock)
  const definition = getBlockTypeDefinition(block.type)

  const { onPointerDown, onHandlePointerDown, onPointerMove, onPointerUp } = useBlockGesture({
    block,
    elementRef,
    getScale,
  })

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    // While the editor is open the textarea owns the pointer; still swallow the
    // event so the page background doesn't deselect the block underneath.
    if (isEditing) {
      event.stopPropagation()
      return
    }
    onPointerDown(event)
  }

  const handleDoubleClick = () => {
    if (definition.textMode === 'none') return
    startEditingBlock(block.id)
  }

  return (
    <div
      ref={elementRef}
      role="group"
      aria-label={`${definition.label} block`}
      className={`canvas-block canvas-block--${block.type}`}
      data-testid="canvas-block"
      data-block-id={block.id}
      data-block-type={block.type}
      data-selected={isSelected ? 'true' : 'false'}
      data-editing={isEditing ? 'true' : 'false'}
      data-copy-mode={isCopyBlock(block) ? copyModeOf(block) : undefined}
      data-linked={isLinked(block) ? 'true' : 'false'}
      data-z={zIndex}
      data-x={block.x}
      data-y={block.y}
      data-width={block.width}
      data-height={block.height}
      style={{
        left: `${block.x}px`,
        top: `${block.y}px`,
        width: `${block.width}px`,
        height: `${block.height}px`,
        zIndex,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={handleDoubleClick}
    >
      <BlockContent block={block} />
      {isEditing && <BlockTextEditor block={block} />}
      {isSelected && !isEditing && <ResizeHandles onHandlePointerDown={onHandlePointerDown} />}
    </div>
  )
})
