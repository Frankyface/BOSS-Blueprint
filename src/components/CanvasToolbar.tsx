import { getBlockTypeDefinition } from '../constants/blockTypes.ts'
import { selectSelectedBlock, useCanvasStore } from '../store/canvasStore.ts'

import { HistoryControls } from './HistoryControls.tsx'
import { PenControls } from './PenControls.tsx'
import { StartOverButton } from './StartOverButton.tsx'

import './CanvasToolbar.css'

const EMPTY_HINT = 'Click a block to select it. Double-click to type.'

/**
 * Toolbar above the page, in three groups: what is selected, the pen (which is a
 * MODE and so belongs next to the canvas it changes), and the page-wide/selection
 * actions — undo, redo, stacking order, delete, start over. The action keys are
 * also bound to the keyboard; see `useCanvasKeyboard`.
 */
export function CanvasToolbar() {
  const selectedBlock = useCanvasStore(selectSelectedBlock)
  const bringBlockForward = useCanvasStore((state) => state.bringBlockForward)
  const sendBlockBackward = useCanvasStore((state) => state.sendBlockBackward)
  const deleteBlock = useCanvasStore((state) => state.deleteBlock)

  const label = selectedBlock ? getBlockTypeDefinition(selectedBlock.type).label : null

  return (
    <div className="canvas-toolbar" data-testid="canvas-toolbar">
      <p className="canvas-toolbar__status" data-testid="canvas-toolbar-status">
        {label ? `${label} selected` : EMPTY_HINT}
      </p>
      <PenControls />
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
