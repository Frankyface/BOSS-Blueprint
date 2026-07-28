import { redo, undo } from '../store/canvasSession.ts'
import { selectCanRedo, selectCanUndo, useEditorStore } from '../store/editorStore.ts'

/**
 * Undo/redo buttons, mirroring the Ctrl+Z / Ctrl+Y shortcuts for the clients who
 * never learned them. Disabled state is read straight off the stacks, so a greyed
 * button always means "there is genuinely nothing there".
 */
export function HistoryControls() {
  const isUndoAvailable = useEditorStore(selectCanUndo)
  const isRedoAvailable = useEditorStore(selectCanRedo)

  return (
    <>
      <button
        type="button"
        className="canvas-toolbar__button"
        data-testid="toolbar-undo"
        title="Undo (Ctrl+Z)"
        disabled={!isUndoAvailable}
        onClick={undo}
      >
        Undo
      </button>
      <button
        type="button"
        className="canvas-toolbar__button"
        data-testid="toolbar-redo"
        title="Redo (Ctrl+Y)"
        disabled={!isRedoAvailable}
        onClick={redo}
      >
        Redo
      </button>
    </>
  )
}
