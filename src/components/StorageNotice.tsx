import { useEditorStore } from '../store/editorStore.ts'

import './StorageNotice.css'

/**
 * The autosave's voice: a dismissible strip under the header.
 *
 * Deliberately non-blocking — no modal, no focus trap, nothing that stops the
 * client drawing. The one thing it must never do is stay silent while saving is
 * failing, which is the whole point of the quota warning.
 */
export function StorageNotice() {
  const notice = useEditorStore((state) => state.notice)
  const setNotice = useEditorStore((state) => state.setNotice)

  if (!notice) return null

  return (
    <div
      className="storage-notice"
      data-testid="storage-notice"
      data-notice-kind={notice.kind}
      role="status"
    >
      <p className="storage-notice__message">{notice.message}</p>
      <button
        type="button"
        className="storage-notice__dismiss"
        data-testid="storage-notice-dismiss"
        onClick={() => setNotice(null)}
      >
        Dismiss
      </button>
    </div>
  )
}
