import { getBlockTypeDefinition } from '../constants/blockTypes.ts'
import { useCanvasStore } from '../store/canvasStore.ts'

import './CanvasToolbar.css'

const EMPTY_HINT = 'Click a block to select it. Double-click to type.'

/**
 * Selection toolbar above the page: what is selected, and the three actions that
 * are hard to discover from the block itself (stacking order and delete).
 * Delete is also bound to the Delete key — see `useCanvasKeyboard`.
 */
export function CanvasToolbar() {
  const blocks = useCanvasStore((state) => state.blocks)
  const selectedBlockId = useCanvasStore((state) => state.selectedBlockId)
  const bringBlockForward = useCanvasStore((state) => state.bringBlockForward)
  const sendBlockBackward = useCanvasStore((state) => state.sendBlockBackward)
  const deleteBlock = useCanvasStore((state) => state.deleteBlock)

  const selectedBlock = blocks.find((block) => block.id === selectedBlockId) ?? null
  const label = selectedBlock ? getBlockTypeDefinition(selectedBlock.type).label : null

  return (
    <div className="canvas-toolbar" data-testid="canvas-toolbar">
      <p className="canvas-toolbar__status" data-testid="canvas-toolbar-status">
        {label ? `${label} selected` : EMPTY_HINT}
      </p>
      <div className="canvas-toolbar__actions">
        <button
          type="button"
          className="canvas-toolbar__button"
          data-testid="toolbar-send-backward"
          disabled={!selectedBlock}
          onClick={() => selectedBlock && sendBlockBackward(selectedBlock.id)}
        >
          Send backward
        </button>
        <button
          type="button"
          className="canvas-toolbar__button"
          data-testid="toolbar-bring-forward"
          disabled={!selectedBlock}
          onClick={() => selectedBlock && bringBlockForward(selectedBlock.id)}
        >
          Bring forward
        </button>
        <button
          type="button"
          className="canvas-toolbar__button canvas-toolbar__button--danger"
          data-testid="toolbar-delete"
          disabled={!selectedBlock}
          onClick={() => selectedBlock && deleteBlock(selectedBlock.id)}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
