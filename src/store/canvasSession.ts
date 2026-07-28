import { documentsEqual } from '../canvas/document.ts'
import type { CanvasDocument } from '../canvas/types.ts'

import { createAutosave } from './autosave.ts'
import type { Autosave } from './autosave.ts'
import type { CanvasState } from './canvasState.ts'
import {
  documentOf,
  getCanvasDocument,
  selectHasContent,
  useCanvasStore,
} from './canvasStore.ts'
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
 * The storage notice renders a Download button beside these for the same reason —
 * a sentence telling a worried client to go and find a control elsewhere is a
 * sentence they will read twice and act on once.
 */
function noticeForSave(outcome: SaveOutcome): StorageNotice | null {
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

/** Fields whose value lives in a local draft until they lose focus. */
const DRAFT_FIELD_TAGS: ReadonlySet<string> = new Set(['INPUT', 'TEXTAREA'])

/**
 * COMMIT WHAT THE CLIENT IS STILL TYPING, before anything is written out.
 *
 * Every text field in the editor keeps a LOCAL draft and writes to the store once,
 * on Enter or blur (`useCommittedField`, and `BlockTextEditor` before it) — that is
 * what makes a typed sentence one undo step instead of forty. The cost is that a
 * field which never lost focus has never reached the store at all: close the tab
 * mid-sentence and the autosave dutifully flushes a document that does not contain
 * what is visibly on screen (review HIGH-3). The most exposed of these are the
 * "about" and "style notes" textareas, which do not even commit on Enter — the
 * client's longest answers are the ones most likely to be lost.
 *
 * Blurring the focused field is the fix, and deliberately the whole fix: it fires
 * the commit path those components ALREADY have, synchronously, so there is one
 * rule about when a draft becomes real and no second copy of it here. A registry of
 * live field instances would be a parallel mechanism to keep in step with every
 * future field; this works for fields nobody remembered to register.
 */
function commitOpenDrafts(): void {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return
  if (!DRAFT_FIELD_TAGS.has(active.tagName) && !active.isContentEditable) return

  active.blur()
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

  // ORDER IS THE POINT: commit first, flush second. The blur writes to the store,
  // the subscriber schedules the autosave synchronously, and the flush then has the
  // client's last sentence in hand rather than the document as it was before it.
  //
  // `finally`, because the whole purpose of this handler is that the design reaches
  // storage. `commitOpenDrafts` calls a blur handler we do not own — any field in
  // the app, now or later — and a throw in one of them must not take the autosave
  // down with it. Worst case the client loses the sentence the broken field was
  // holding; without the `finally` they would lose the entire session's work
  // (review follow-up).
  const flush = (): void => {
    try {
      commitOpenDrafts()
    } finally {
      autosave.flush()
    }
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

/**
 * The blank-start coach card is help for an empty page, so the first thing the
 * client puts on the page retires it — for good, not just while that block is
 * there. Latched HERE, in the one subscriber that already sees every document
 * change, rather than in the card: a component would need an effect to notice, and
 * an effect that writes to a store paints the stale card first.
 */
function retireCoachOnFirstContent(state: CanvasState): void {
  const { startState, setStartState } = useEditorStore.getState()
  if (startState !== 'coaching') return
  if (!selectHasContent(state)) return

  setStartState('editing')
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

  /**
   * THE FIRST-VISIT RULE, in one line: no design to restore means the client has
   * not started one, so offer them a starting point.
   *
   * Deliberately derived from storage rather than remembered in a flag of its own.
   * A second persisted "has chosen" key would be a second thing that can be out of
   * step with the design itself — and the honest answer to "should we offer a
   * starting point?" is exactly "is there any work here to come back to?". It
   * follows that a client who picks Blank, places nothing and reloads is offered
   * the picker again, which is right: they have nothing to lose and no page to
   * come back to.
   *
   * `recovered` and `unavailable` land here too: a quarantined payload leaves them
   * on a fresh page, which is a start, and the notice explaining it stays on screen
   * behind the picker.
   */
  editor.setStartState(outcome.status === 'loaded' ? 'editing' : 'picker')
  editor.setPendingImport(null)
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

    retireCoachOnFirstContent(state)

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
 * MAKE THIS WHOLE DOCUMENT THE DESIGN — the one door a starter template and an
 * opened `.blueprint` file both come through.
 *
 * It is `startOver` in reverse, and shares its two rules. The swap is flagged as a
 * REPLAY so it does not land on the undo stack it is about to replace: a design
 * that has just been opened is the starting point, not a step to undo back past
 * (Ctrl+Z after opening a file must not silently restore the design it replaced).
 * And the history is rebuilt around the document the store actually holds, not an
 * equal-looking copy, so the next edit records a real step rather than a phantom.
 *
 * Autosave still runs — the subscriber schedules on every document change,
 * replaying or not — so the opened design survives a reload without a second
 * persistence path.
 */
export function openDesign(document: CanvasDocument): void {
  isReplaying = true
  try {
    useCanvasStore.getState().replaceDocument(document)
    useEditorStore.getState().setHistory(createHistory(getCanvasDocument()))
  } finally {
    isReplaying = false
  }

  const editor = useEditorStore.getState()
  editor.setStartState('editing')
  editor.setPendingImport(null)
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
 *
 * It is ALSO the "new design" path: clearing puts the client back exactly where a
 * first visit finds them, so the starting-point picker is offered again. That is
 * why there is no separate "new design" button — one action, one meaning, and no
 * second way to arrive at an empty page.
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
  useEditorStore.getState().setPendingImport(null)
  useEditorStore.getState().setStartState('picker')

  session?.autosave.cancel()
  clearStoredDocument(session?.storage ?? null)

  const { notice, setNotice } = useEditorStore.getState()
  if (notice !== null && NOTICE_KINDS_RESOLVED_BY_START_OVER.has(notice.kind)) setNotice(null)
}

/** Write any queued document immediately. */
export function flushAutosave(): void {
  session?.autosave.flush()
}
