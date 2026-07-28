import type { LoadOutcome, SaveOutcome } from './canvasStorage.ts'
import { useEditorStore } from './editorStore.ts'
import type { StorageNotice, StorageNoticeKind } from './editorStore.ts'

/**
 * WHAT THE AUTOSAVE SAYS OUT LOUD — every sentence the client reads about storage,
 * and the rules for when one message may replace another.
 *
 * Split out of `canvasSession.ts` (which is the WIRING: history, autosave, the
 * flush-on-hide) when that file passed the 400-line ceiling. The division is a real
 * one rather than a filing convenience: this module is pure copy plus two small
 * decisions about precedence, and it is where to look when the question is "what
 * does the client see when saving goes wrong?".
 */

/**
 * WHAT TO SAY WHEN STORAGE IS RUNNING OUT — and, more importantly, WHAT TO DO.
 *
 * Both messages lead with "download your design" (UX audit MAJOR). The old ones
 * advised "start over" and "delete a few blocks": the first is the single most
 * destructive control in the app, the second throws away the client's work — and
 * neither mentioned the button that actually rescues everything. Downloading is
 * unaffected by a full localStorage (the audit's own probe recovered a 6.4MB design
 * that way), so it is the first thing to reach for and the only thing that loses
 * nothing. Freeing room comes second, and is phrased as a way to carry on HERE.
 *
 * `StorageNotice` renders a Download button beside these for the same reason — a
 * sentence telling a worried client to go and find a control elsewhere is a
 * sentence they will read twice and act on once.
 */
export function noticeForSave(outcome: SaveOutcome): StorageNotice | null {
  switch (outcome.status) {
    case 'saved':
      return null
    case 'near-quota':
      return {
        kind: 'near-quota',
        message:
          'This design is nearly as large as your browser will hold. It is still being saved — ' +
          'but download your design now to keep everything safe.',
      }
    case 'quota-exceeded':
      return {
        kind: 'save-failed',
        message:
          'Your browser has run out of room, so your latest changes are NOT being saved. ' +
          'Download your design now to keep everything safe, then remove a photo or two to ' +
          'carry on here.',
      }
    case 'unavailable':
      return {
        kind: 'unavailable',
        message:
          `Your work is not being saved: ${outcome.reason} ` +
          'Download your design to keep it safe.',
      }
  }
}

/** Kinds the SAVE path owns, and is therefore allowed to clear when a save works. */
const SAVE_NOTICE_KINDS: ReadonlySet<StorageNoticeKind> = new Set([
  'near-quota',
  'save-failed',
  'unavailable',
])

/**
 * Report the result of a write without trampling anything else.
 *
 * A clean save clears a previous SAVE problem only. It must never quietly dismiss
 * the "we couldn't read your old design" warning: that is a one-off message the
 * client has to see, and the very next autosave — one second after they place their
 * first block — would otherwise wipe it off the screen mid-read.
 */
export function reportSave(outcome: SaveOutcome): void {
  const notice = noticeForSave(outcome)
  const { notice: current, setNotice } = useEditorStore.getState()

  if (notice !== null) {
    setNotice(notice)
    return
  }

  if (current !== null && SAVE_NOTICE_KINDS.has(current.kind)) setNotice(null)
}

export function noticeForLoad(outcome: LoadOutcome): StorageNotice | null {
  if (outcome.status === 'recovered') {
    return {
      kind: 'recovered',
      message: `${outcome.reason} We've started you on a fresh page and kept the old file in case it can be rescued.`,
    }
  }

  if (outcome.status === 'unavailable') {
    return { kind: 'unavailable', message: `Your work is not being saved: ${outcome.reason}` }
  }

  return null
}

/**
 * Kinds that describe the DESIGN, and so stop being true the moment it is cleared:
 * the page is no longer large, the failed save no longer matters, and the
 * quarantined file has just been deleted along with everything else.
 *
 * `unavailable` is deliberately absent — "this browser will not let us save your
 * work" is a standing fact about the browser, not about the design, and it is still
 * every bit as true after starting over.
 */
const NOTICE_KINDS_RESOLVED_BY_START_OVER: ReadonlySet<StorageNoticeKind> = new Set([
  'near-quota',
  'save-failed',
  'recovered',
])

/** Clear the notices that starting over has just made untrue, and only those. */
export function clearNoticesResolvedByStartOver(): void {
  const { notice, setNotice } = useEditorStore.getState()
  if (notice !== null && NOTICE_KINDS_RESOLVED_BY_START_OVER.has(notice.kind)) setNotice(null)
}
