import { getBlockTypeDefinition } from '../constants/blockTypes.ts'
import { useCanvasStore } from '../store/canvasStore.ts'

import { HistoryControls } from './HistoryControls.tsx'
import { StartOverButton } from './StartOverButton.tsx'

import './CanvasToolbar.css'

const EMPTY_HINT = 'Click a block to select it. Double-click to type.'

/**
 * Toolbar above the page, in two groups: page-wide actions (undo, redo, start over)
 * and the selection actions that are hard to discover from the block itself
 * (stacking order and delete). Both sets are also bound to keys — see
 * `useCanvasKeyboard`.
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
        <HistoryControls />
        <span className="canvas-toolbar__divider" aria-hidden="true" />
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
        <span className="canvas-toolbar__divider" aria-hidden="true" />
        <StartOverButton />
      </div>
    </div>
  )
}
