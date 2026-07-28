import { documentsEqual } from '../canvas/document.ts'
import type { CanvasDocument } from '../canvas/types.ts'

import { createAutosave } from './autosave.ts'
import type { Autosave } from './autosave.ts'
import { documentOf, getCanvasDocument, useCanvasStore } from './canvasStore.ts'
import { clearStoredDocument, getBrowserStorage, loadDocument, saveDocument } from './canvasStorage.ts'
import type { LoadOutcome, SaveOutcome, StorageLike } from './canvasStorage.ts'
import { useEditorStore } from './editorStore.ts'
import type { StorageNotice, StorageNoticeKind } from './editorStore.ts'
import { createHistory, pushHistory, redoHistory, undoHistory } from './history.ts'
import type { History } from './history.ts'

/**
 * THE SESSION — the one place the document store, the undo stack and localStorage
 * are wired together. Everything it composes is a pure module; the ordering rules
 * and the "am I replaying?" flag live only here.
 *
 * Two invariants this file exists to hold:
 *
 * 1. HISTORY IS COMMITTED BEFORE STORAGE IS SCHEDULED. Both react to the same store
 *    change, in that order, inside one subscriber — so an autosaved payload can
 *    never describe a state the undo stack has not recorded.
 *
 * 2. REPLAYING IS NOT A NEW ACTION. Applying an undo writes to the document store,
 *    which re-enters the subscriber; `isReplaying` stops that write from being
 *    pushed back onto the stack it just came from. Autosave still runs, because the
 *    undone design is what should survive a reload.
 */

interface Session {
  readonly storage: StorageLike | null
  readonly autosave: Autosave<CanvasDocument>
  readonly teardown: () => void
}

let session: Session | null = null
let isReplaying = false

export interface CanvasSessionOptions {
  /** Pass `null` for "no persistence"; omit to use the browser's localStorage. */
  readonly storage?: StorageLike | null
  readonly autosaveDelayMs?: number
}

function noticeForSave(outcome: SaveOutcome): StorageNotice | null {
  switch (outcome.status) {
    case 'saved':
      return null
    case 'near-quota':
      return {
        kind: 'near-quota',
        message:
          'This design is getting large for browser storage. Your work is still being saved, ' +
          'but consider starting a fresh page soon.',
      }
    case 'quota-exceeded':
      return {
        kind: 'save-failed',
        message:
          'Your browser ran out of space, so the latest changes could NOT be saved. ' +
          'Delete a few blocks or start over to free some room.',
      }
    case 'unavailable':
      return { kind: 'unavailable', message: `Your work is not being saved: ${outcome.reason}` }
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
function reportSave(outcome: SaveOutcome): void {
  const notice = noticeForSave(outcome)
  const { notice: current, setNotice } = useEditorStore.getState()

  if (notice !== null) {
    setNotice(notice)
    return
  }

  if (current !== null && SAVE_NOTICE_KINDS.has(current.kind)) setNotice(null)
}

function noticeForLoad(outcome: LoadOutcome): StorageNotice | null {
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
 * Write the queued design out the moment the page is being hidden.
 *
 * Without this, "accidental tab close" in the Goal is only true if the client
 * happened to pause for a second first: a change made and then immediately closed
 * dies in the debounce timer.
 *
 * `pagehide` + `visibilitychange`, deliberately NOT `beforeunload`. `beforeunload`
 * is unreliable on mobile, is skipped when a page is discarded, and registering it
 * at all disqualifies the page from the back/forward cache — a real cost for a
 * guarantee it does not actually provide. `pagehide` covers closing and navigating
 * away, `visibilitychange → hidden` covers switching tabs and backgrounding the
 * browser, and both are bfcache-safe.
 */
function installFlushOnHide(autosave: Autosave<CanvasDocument>): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => undefined
  }

  const flush = (): void => {
    autosave.flush()
  }
  const flushWhenHidden = (): void => {
    if (document.visibilityState === 'hidden') flush()
  }

  window.addEventListener('pagehide', flush)
  document.addEventListener('visibilitychange', flushWhenHidden)

  return () => {
    window.removeEventListener('pagehide', flush)
    document.removeEventListener('visibilitychange', flushWhenHidden)
  }
}

function applyHistory(next: History<CanvasDocument>): void {
  isReplaying = true
  try {
    useEditorStore.getState().setHistory(next)
    useCanvasStore.getState().replaceDocument(next.present)
  } finally {
    isReplaying = false
  }
}

/**
 * Hydrate from storage, then keep history and storage in step with the document.
 * Returns the teardown, which tests use and the app never needs.
 */
export function startCanvasSession(options: CanvasSessionOptions = {}): () => void {
  stopCanvasSession()

  const storage = options.storage === undefined ? getBrowserStorage() : options.storage
  const editor = useEditorStore.getState()
  const canvas = useCanvasStore.getState()

  const outcome = loadDocument(storage)
  if (outcome.status === 'loaded') {
    canvas.replaceDocument(outcome.document)
  }

  editor.setNotice(noticeForLoad(outcome))

  // A restored design is the starting point, not something to undo back past.
  editor.setHistory(createHistory(getCanvasDocument()))

  const autosave = createAutosave<CanvasDocument>({
    ...(options.autosaveDelayMs === undefined ? {} : { delayMs: options.autosaveDelayMs }),
    write: (document) => {
      reportSave(saveDocument(storage, document))
    },
  })

  const unsubscribe = useCanvasStore.subscribe((state, previous) => {
    // Selecting, deselecting, opening an editor and SWITCHING PAGES all leave the
    // document untouched, and so does any action the store treated as a no-op —
    // none of those are undo steps and none of them change what should be on disk.
    if (state.pages === previous.pages && state.siteSettings === previous.siteSettings) return

    const document: CanvasDocument = documentOf(state)

    if (!isReplaying) {
      useEditorStore
        .getState()
        .setHistory(pushHistory(useEditorStore.getState().history, document, documentsEqual))
    }

    autosave.schedule(document)
  })

  const stopFlushOnHide = installFlushOnHide(autosave)

  session = {
    storage,
    autosave,
    teardown: () => {
      unsubscribe()
      stopFlushOnHide()
    },
  }
  return stopCanvasSession
}

export function stopCanvasSession(): void {
  if (!session) return
  session.teardown()
  session.autosave.cancel()
  session = null
}

export function undo(): void {
  const { history } = useEditorStore.getState()
  const next = undoHistory(history)
  if (next === history) return
  applyHistory(next)
}

export function redo(): void {
  const { history } = useEditorStore.getState()
  const next = redoHistory(history)
  if (next === history) return
  applyHistory(next)
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

/**
 * "Start over": empty page, empty undo stack, empty storage. The reset itself is
 * flagged as a replay so it does not land on the stack we are about to throw away,
 * and the queued autosave is cancelled before the keys are removed so a timer that
 * was already ticking cannot write the old design back afterwards.
 */
export function startOver(): void {
  isReplaying = true
  try {
    useCanvasStore.getState().resetCanvas()
    // The fresh document itself, not an equal-looking copy: history's present must
    // be identical to what is on screen or the next edit records a phantom step.
    useEditorStore.getState().setHistory(createHistory(getCanvasDocument()))
  } finally {
    isReplaying = false
  }

  useEditorStore.getState().setToast(null)

  session?.autosave.cancel()
  clearStoredDocument(session?.storage ?? null)

  const { notice, setNotice } = useEditorStore.getState()
  if (notice !== null && NOTICE_KINDS_RESOLVED_BY_START_OVER.has(notice.kind)) setNotice(null)
}

/** Write any queued document immediately. */
export function flushAutosave(): void {
  session?.autosave.flush()
}
