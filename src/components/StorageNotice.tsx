import { downloadDesignAndAnnounce } from '../store/designFileSession.ts'
import { useEditorStore } from '../store/editorStore.ts'
import type { StorageNoticeKind } from '../store/editorStore.ts'

import './StorageNotice.css'

const RESCUE_LABEL = 'Download design'

/**
 * KINDS THE DOWNLOAD BUTTON RESCUES: the ones where the browser has stopped being
 * a safe place to keep the design.
 *
 * `recovered` is deliberately absent — that message is about a payload we could
 * NOT read, and the design on screen at that moment is a fresh empty page. Offering
 * to download it would hand the client an empty file and call it a rescue.
 */
const RESCUE_KINDS: ReadonlySet<StorageNoticeKind> = new Set<StorageNoticeKind>([
  'near-quota',
  'save-failed',
  'unavailable',
])

/**
 * The autosave's voice: a dismissible strip under the header.
 *
 * Deliberately non-blocking — no modal, no focus trap, nothing that stops the
 * client drawing. The one thing it must never do is stay silent while saving is
 * failing, which is the whole point of the quota warning.
 *
 * AND IT CARRIES THE WAY OUT (UX audit MAJOR). "Your browser has run out of room"
 * is only half of what a client needs; the other half is the one action that loses
 * nothing, within reach of the sentence that says why they need it. Downloading
 * does not touch localStorage, so it works precisely when saving has stopped.
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
      {RESCUE_KINDS.has(notice.kind) && (
        <button
          type="button"
          className="storage-notice__rescue"
          data-testid="storage-notice-download"
          onClick={() => {
            downloadDesignAndAnnounce()
          }}
        >
          {RESCUE_LABEL}
        </button>
      )}
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
