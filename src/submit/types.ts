/**
 * THE SUBMIT FLOW'S VOCABULARY.
 *
 * Kept separate from the orchestrator so the store, the components and the tests
 * can name these shapes without pulling the pipeline in.
 */

import type { LadderPorts } from '../export/zip/ladder.ts'
import type { PageRenderBytes } from '../export/zip/buildPackage.ts'
import type { DeliveryRelay, RelayResult } from '../export/delivery/relay.ts'
import type { Audience, RuleId } from '../export/validate/types.ts'

import type { SubmissionClock } from './submission.ts'

/**
 * A validator finding, translated for the UI: the `jumpTo` here carries INTERNAL
 * app ids, not the package's `pg_`/`blk_` ordinals, because that is what the
 * canvas store navigates by. Translating once, here, is why no component has to
 * know the remap exists.
 */
export interface ClientFinding {
  readonly rule: RuleId
  readonly audience: Audience
  readonly message: string
  readonly jumpTo?: { readonly pageId: string; readonly blockId?: string }
}

export type SubmitPhase = 'checking' | 'rendering' | 'packaging' | 'finishing'

export interface SubmitProgress {
  readonly phase: SubmitPhase
  /** "Rendering page 2 of 4…" — multi-page PNG rendering is seconds, not ms. */
  readonly label: string
}

/** Everything the completion screen needs, and the retained Blob source. */
export interface SubmitReceipt {
  readonly fileName: string
  /** Retained so "Download it again" re-issues THIS package, not a new one. */
  readonly bytes: Uint8Array
  readonly sizeBytes: number
  readonly submissionId: string
  readonly uuid8: string
  readonly businessName: string
  readonly pageCount: number
  readonly warnings: readonly ClientFinding[]
  /** True when an OPTIONAL ladder rung fired — the meter says so in one line. */
  readonly ladderFired: boolean
  readonly mailtoHref: string
  /** `null` until the relay settles; only `sent` ever reaches the screen. */
  readonly relay: RelayResult | null
}

export interface RenderFailure {
  readonly clientMessage: string
  readonly detail: string
}

export type SubmitOutcome =
  | { readonly kind: 'blocked'; readonly findings: readonly ClientFinding[] }
  | { readonly kind: 'render-failed'; readonly failure: RenderFailure }
  | {
      readonly kind: 'done'
      readonly receipt: SubmitReceipt
      /**
       * Settles AFTER the completion screen is already up. Never rejects — a
       * relay that fails is not the client's problem, their package is on disk.
       */
      readonly relayResult: Promise<RelayResult>
    }

export interface SubmitPorts {
  readonly clock: SubmissionClock
  /** One page PNG, by INTERNAL page id. Rejects with the renderer's typed error. */
  readonly renderPage: (pageId: string) => Promise<PageRenderBytes>
  readonly download: (fileName: string, bytes: Uint8Array) => void
  readonly relay: DeliveryRelay
  readonly ladder: LadderPorts
  readonly onProgress: (progress: SubmitProgress) => void
  /** Console detail: applied fixes, bug-class findings, the relay payload. */
  readonly log: (message: string, detail?: unknown) => void
}
