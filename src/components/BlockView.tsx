import { memo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

import { copyModeOf, isCopyBlock, isLinked } from '../canvas/blockEdits.ts'
import type { Block } from '../canvas/types.ts'
import { getBlockTypeDefinition } from '../constants/blockTypes.ts'
import { useBlockGesture } from '../hooks/useBlockGesture.ts'
import { beginTextEdit } from '../store/textEditing.ts'

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

  /**
   * Double-click is "open this block for editing", whatever that means for the
   * type. For an image slot it means the file picker — the slot has no inline text
   * editor for it to collide with, and clients try double-clicking a photo box
   * long before they find the button on it.
   *
   * Reaching for the input through the DOM (rather than lifting it up here) keeps
   * every piece of upload wiring inside `ImageSlot`: one file input, one handler,
   * one place that knows how ingest works.
   */
  const handleDoubleClick = () => {
    if (block.type === 'image') {
      elementRef.current?.querySelector<HTMLInputElement>('[data-testid="image-file-input"]')?.click()
      return
    }

    if (definition.textMode === 'none') return
    // No seed: a double-click opens on the block's own words, all selected.
    beginTextEdit(block.id)
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
