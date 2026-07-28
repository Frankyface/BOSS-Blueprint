import { useEditorStore } from '../store/editorStore.ts'

import './StorageNotice.css'

/**
 * Messages about the DESIGN — "that page is gone, and three links with it".
 *
 * A strip under the header, not a floating timed toast: it is non-blocking either
 * way, but a message that disappears on a timer is one a client can miss entirely,
 * and a timer is the classic source of a flaky cross-engine test. It stays until
 * dismissed, replaced, or made irrelevant by starting over.
 */
export function DesignToast() {
  const toast = useEditorStore((state) => state.toast)
  const setToast = useEditorStore((state) => state.setToast)

  if (toast === null) return null

  return (
    <div className="storage-notice storage-notice--design" data-testid="design-toast" role="status">
      <p className="storage-notice__message">{toast}</p>
      <button
        type="button"
        className="storage-notice__dismiss"
        data-testid="design-toast-dismiss"
        onClick={() => {
          setToast(null)
        }}
      >
        Dismiss
      </button>
    </div>
  )
}
