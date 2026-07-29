/**
 * THE DELIVERY RELAY PORT — `docs/decisions.md` 2026-07-27 debate #2, and Cam's
 * sequencing ruling: **the relay is wired LAST**.
 *
 * Download-first means the package is already on the client's disk before this
 * interface is ever touched. The relay is a kilobyte-scale NOTIFICATION to Cam —
 * "a package exists, here is who made it and what it contains" — never the
 * delivery mechanism for the zip itself (no free text-relay tier carries
 * attachments reliably; that is the whole finding debate #2 rests on).
 *
 * Stage 3 ships `NoopRelay`. The real provider adapter is one module implementing
 * this interface and one binding changed — which is why the payload builder and
 * its degrade ladder are written and tested NOW, while the requirements are
 * fresh, rather than left as a promise of a seam.
 */

import type { NotificationPayload } from './payload.ts'

export type RelayStatus = 'sent' | 'skipped' | 'failed'

export interface RelayResult {
  readonly status: RelayStatus
  /** For the console; never shown to the client (§ the UI must not claim delivery). */
  readonly detail?: string
}

export interface DeliveryRelay {
  readonly id: string
  readonly send: (payload: NotificationPayload) => Promise<RelayResult>
}

/** What a no-op relay logs, so a dev can see the payload the real one would send. */
export const NOOP_RELAY_LOG_PREFIX = '[BOSS Blueprint] DeliveryRelay stub — payload NOT sent:'

export interface NoopRelayOptions {
  /** Where the stub writes its log. Injected so a test can read it back. */
  readonly log?: (message: string, payload: NotificationPayload) => void
}

/**
 * The stub Stage 3 ships. It resolves `skipped` — NOT `sent` — because the
 * completion screen only adds "we have been notified" for a `sent` outcome, and
 * a stub that claimed success would put a lie on screen.
 *
 * The log sink is injected rather than reached for: `src/export/**` stays free of
 * `console`, and the app binds one in `src/submit/appPorts.ts`.
 */
export function createNoopRelay(options: NoopRelayOptions = {}): DeliveryRelay {
  return {
    id: 'noop',
    send: (payload) => {
      options.log?.(NOOP_RELAY_LOG_PREFIX, payload)
      return Promise.resolve({ status: 'skipped', detail: 'no relay is wired yet' })
    },
  }
}
