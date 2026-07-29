import { create } from 'zustand'

import { createAppSubmitPorts, downloadAgain } from '../submit/appPorts.ts'
import {
  EMPTY_LEAD,
  HONEYPOT_REFUSAL,
  isHoneypotTripped,
  leadProblems,
  normalizeLead,
  type LeadDetails,
  type LeadProblem,
} from '../submit/form.ts'
import { runSubmit } from '../submit/submitFlow.ts'
import type {
  ClientFinding,
  RenderFailure,
  SubmitProgress,
  SubmitReceipt,
} from '../submit/types.ts'
import type { RelayResult } from '../export/delivery/relay.ts'

import { documentOf, useCanvasStore } from './canvasStore.ts'
import { flushAutosave } from './canvasSession.ts'

/**
 * SUBMIT UI STATE — the takeover view's screen, its form draft and its outcome.
 *
 * Deliberately NOT in `canvasStore`: none of this is the document, none of it is
 * undoable, and none of it should be autosaved. The one field that IS part of the
 * document — the business name — is not copied here at all; it is read from and
 * written straight through to `siteSettings`, so the form and the Site panel can
 * never disagree and one edit is one undo step.
 */

export type SubmitScreen = 'closed' | 'form' | 'working' | 'blocked' | 'render-failed' | 'done'

/** The two fields that belong to the SUBMISSION rather than to the design. */
export interface ContactDraft {
  readonly clientName: string
  readonly clientEmail: string
  readonly quill: string
}

export interface SubmitState {
  readonly screen: SubmitScreen
  readonly contact: ContactDraft
  readonly problems: readonly LeadProblem[]
  readonly refusal: string | null
  readonly progress: SubmitProgress | null
  readonly findings: readonly ClientFinding[]
  readonly failure: RenderFailure | null
  readonly receipt: SubmitReceipt | null
  readonly relay: RelayResult | null
  readonly addressCopied: boolean
}

export interface SubmitActions {
  open: () => void
  close: () => void
  setContactField: (field: keyof ContactDraft, value: string) => void
  send: () => Promise<void>
  retry: () => Promise<void>
  saveAgain: () => void
  markAddressCopied: (copied: boolean) => void
}

const INITIAL: SubmitState = {
  screen: 'closed',
  contact: { clientName: '', clientEmail: '', quill: '' },
  problems: [],
  refusal: null,
  progress: null,
  findings: [],
  failure: null,
  receipt: null,
  relay: null,
  addressCopied: false,
}

/** The console is where §5's bug-class detail and the applied fixes belong. */
function logToConsole(message: string, detail?: unknown): void {
  if (detail === undefined) {
    console.info(message)
    return
  }
  console.info(message, detail)
}

/** The full lead: the two submission fields plus the document's business name. */
export function currentLead(contact: ContactDraft): LeadDetails {
  return {
    ...EMPTY_LEAD,
    ...contact,
    businessName: useCanvasStore.getState().siteSettings.businessName,
  }
}

export const useSubmitStore = create<SubmitState & SubmitActions>()((set, get) => {
  const runPipeline = async (): Promise<void> => {
    const lead = normalizeLead(currentLead(get().contact))

    // The honeypot first: a bot never gets as far as a field-level message.
    if (isHoneypotTripped(lead)) {
      set({ screen: 'form', refusal: HONEYPOT_REFUSAL, problems: [] })
      return
    }

    const problems = leadProblems(lead)
    if (problems.length > 0) {
      set({ screen: 'form', problems, refusal: null })
      return
    }

    // The Stage 1 close-out kept `flushAutosave` exported for exactly this: a
    // client who submits and closes the tab still finds their design next visit.
    flushAutosave()

    set({ screen: 'working', problems: [], refusal: null, findings: [], failure: null })

    const ports = createAppSubmitPorts({
      onProgress: (progress) => {
        set({ progress })
      },
      log: logToConsole,
    })

    const outcome = await runSubmit(
      { document: documentOf(useCanvasStore.getState()), lead },
      ports,
    )

    if (outcome.kind === 'blocked') {
      set({ screen: 'blocked', findings: outcome.findings, progress: null })
      return
    }
    if (outcome.kind === 'render-failed') {
      set({ screen: 'render-failed', failure: outcome.failure, progress: null })
      return
    }

    set({ screen: 'done', receipt: outcome.receipt, progress: null, relay: null })

    // Settles after the completion screen is already up; only `sent` shows.
    const relay = await outcome.relayResult
    if (get().receipt?.submissionId === outcome.receipt.submissionId) set({ relay })
  }

  return {
    ...INITIAL,

    open: () => {
      set({ screen: 'form', problems: [], refusal: null, findings: [], failure: null })
    },

    close: () => {
      set({ screen: 'closed', progress: null })
    },

    setContactField: (field, value) => {
      set((state) => ({ contact: { ...state.contact, [field]: value } }))
    },

    send: runPipeline,
    retry: runPipeline,

    saveAgain: () => {
      const { receipt } = get()
      if (receipt) downloadAgain(receipt.fileName, receipt.bytes)
    },

    markAddressCopied: (addressCopied) => {
      set({ addressCopied })
    },
  }
})

/**
 * "Take me to it" — leave the submit surface, open the offending page and select
 * the block. A takeover view rather than a modal is exactly what makes this a
 * normal state change (`feature-submit-gate.md` open question).
 */
export function jumpToBlock(pageId: string, blockId?: string): void {
  const canvas = useCanvasStore.getState()
  canvas.setCurrentPage(pageId)
  if (blockId !== undefined) canvas.selectBlock(blockId)
  useSubmitStore.getState().close()
}

export function resetSubmitStore(): void {
  useSubmitStore.setState(INITIAL)
}
