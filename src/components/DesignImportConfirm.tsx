import { overwritePrompt } from '../canvas/designFile.ts'
import { cancelPendingImport, confirmPendingImport } from '../store/designFileSession.ts'
import { useEditorStore } from '../store/editorStore.ts'

import './StorageNotice.css'

const KEEP = 'Keep what I have'
const REPLACE = 'Yes, open it'

/**
 * "This would replace the design you have open." — the two-step confirmation for
 * opening a file over real work.
 *
 * The same shape as "Start over" (`StartOverButton`) and for the same reasons: a
 * native `window.confirm` blocks the page, looks like a browser warning rather
 * than part of the tool, and is the one bit of UI that behaves differently in all
 * three engines. This is an ordinary strip with two ordinary buttons, and it reads
 * as an undoable decision right up to the last click.
 *
 * It only ever appears once the file has already been READ AND VALIDATED, so a
 * client is never asked to risk their work for a file that turns out to be a
 * photo — and until they answer, the design on screen has not been touched at all.
 */
export function DesignImportConfirm() {
  const pendingImport = useEditorStore((state) => state.pendingImport)

  if (pendingImport === null) return null

  return (
    <div
      className="storage-notice storage-notice--design"
      data-testid="design-import-confirm"
      role="alertdialog"
      aria-label="Confirm opening a design file"
    >
      <p className="storage-notice__message">{overwritePrompt(pendingImport.fileName)}</p>
      <button
        type="button"
        className="storage-notice__dismiss"
        data-testid="design-import-cancel"
        onClick={cancelPendingImport}
      >
        {KEEP}
      </button>
      <button
        type="button"
        className="storage-notice__dismiss"
        data-testid="design-import-confirmed"
        onClick={confirmPendingImport}
      >
        {REPLACE}
      </button>
    </div>
  )
}
