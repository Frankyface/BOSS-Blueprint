import { getBlockTypeDefinition } from '../constants/blockTypes.ts'
import { selectSelectedBlock, useCanvasStore } from '../store/canvasStore.ts'
import { usePenToolStore } from '../store/penTool.ts'

import { HistoryControls } from './HistoryControls.tsx'
import { PageSpaceControls, PageSpaceHint } from './PageSpaceControls.tsx'
import { PenControls } from './PenControls.tsx'
import { PenSettings } from './PenSettings.tsx'
import { StartOverButton } from './StartOverButton.tsx'

import './CanvasToolbar.css'

const EMPTY_HINT = 'Click a block to select it. Double-click to type.'

/**
 * Toolbar above the page, in TWO LINES that never trade places.
 *
 * LINE 1 — THE CONTROLS. What the pen is, how long the page is, and the
 * page-wide/selection actions — undo, redo, stacking order, delete, start over. The
 * action keys are also bound to the keyboard; see `useCanvasKeyboard`. Page length
 * sits next to the pen on purpose: "add room to draw in" is the reason a client
 * reaches for it, and both are about the sheet rather than about a selection.
 *
 * LINE 2 — THE STRIP: whatever the pen needs set right now, and ONE line of words
 * about where things stand. It is a fixed height and it never wraps, which is the
 * whole point — see `CanvasToolbar.css` for why the drawing area depends on it.
 *
 * The strip carries the pen's line INSTEAD of the block hint while the pen is out,
 * not as well as: blocks are locked then, so "click a block to select it" is advice
 * that cannot be taken, and two competing sentences would only fight for the room.
 */
export function CanvasToolbar() {
  const selectedBlock = useCanvasStore(selectSelectedBlock)
  const bringBlockForward = useCanvasStore((state) => state.bringBlockForward)
  const sendBlockBackward = useCanvasStore((state) => state.sendBlockBackward)
  const deleteBlock = useCanvasStore((state) => state.deleteBlock)
  const penMode = usePenToolStore((state) => state.mode)

  const label = selectedBlock ? getBlockTypeDefinition(selectedBlock.type).label : null

  return (
    <div className="canvas-toolbar" data-testid="canvas-toolbar">
      <div className="canvas-toolbar__controls">
        <PenControls />
        <PageSpaceControls />
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
      <div className="canvas-toolbar__strip" data-testid="canvas-toolbar-strip">
        <PenSettings />
        {penMode === 'off' && (
          <p
            className="canvas-toolbar__message canvas-toolbar__status"
            data-testid="canvas-toolbar-status"
          >
            {label ? `${label} selected` : EMPTY_HINT}
          </p>
        )}
        <PageSpaceHint />
      </div>
    </div>
  )
}
