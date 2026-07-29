/**
 * THE REAL RELAY — one generic form-POST adapter behind the `DeliveryRelay` port.
 *
 * `relay.ts` promised this would be "one module implementing this interface and
 * one binding changed". This is that module, and `src/submit/appPorts.ts` is that
 * binding.
 *
 * ONE ADAPTER, NOT FOUR. Cam has not picked a provider (`help.md`), so this is
 * built for the CLASS the debate surveyed rather than for a name: HTTPS POST to a
 * fixed endpoint, JSON body, public form key in the body, 2xx = accepted. Four
 * per-provider modules would mean three of them dead on arrival and a fourth
 * nobody had ever run. The differences live in `RelayConfig`.
 *
 * `fetch` is a PORT. `src/export/**` reaches for no global — the browser's fetch
 * is handed in by `appPorts.ts`, which is also what lets the unit tests assert a
 * request body without stubbing anything global, and what keeps this file honest
 * in jsdom.
 */

import {
  demoteNotificationPayload,
  RELAY_PAYLOAD_LIMIT_BYTES,
  type NotificationPayload,
  type PayloadVariant,
} from './payload.ts'
import { notificationBody, notificationSubject } from './notificationText.ts'
import {
  DEFAULT_RELAY_FIELDS,
  isRelayReady,
  isRelayTouched,
  relayConfigProblems,
  type RelayConfig,
} from './relayConfig.ts'
import { createNoopRelay, type DeliveryRelay, type RelayResult } from './relay.ts'

/** Just enough of `fetch` to send one POST and read one status. */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export interface RelayLog {
  (message: string, detail?: unknown): void
}

export interface FormRelayPorts {
  readonly fetch: FetchLike
  readonly log: RelayLog
}

export const FORM_RELAY_ID = 'form-post'
export const RELAY_MISCONFIGURED_PREFIX =
  '[BOSS Blueprint] DeliveryRelay is configured but unusable — nothing will be sent:'

/** full → compressed → metadata-only, in shedding order (debate #2). */
const LADDER: readonly PayloadVariant[] = ['full', 'compressed', 'metadata-only']

const HTTP_OK_FLOOR = 200
const HTTP_OK_CEILING = 300

export interface RelayRequest {
  readonly variant: PayloadVariant
  readonly body: string
  readonly byteLength: number
}

function utf8Length(text: string): number {
  return new TextEncoder().encode(text).length
}

/** The JSON body for exactly one rung — no size decision, just assembly. */
export function relayRequestBody(payload: NotificationPayload, config: RelayConfig): string {
  const fields = config.fields ?? DEFAULT_RELAY_FIELDS
  const mapped: Record<string, string> = {}

  if (fields.subject !== '') mapped[fields.subject] = notificationSubject(payload)
  if (fields.name !== '') mapped[fields.name] = payload.client.name
  if (fields.email !== '') mapped[fields.email] = payload.client.email
  if (fields.message !== '') mapped[fields.message] = notificationBody(payload)
  // Forwarded, not inspected: the provider gets to apply its own bot rule too.
  if (fields.honeypot !== '') mapped[fields.honeypot] = payload.honeypot

  const nest = config.nestFieldsUnder ?? ''
  const envelope: Record<string, unknown> = {
    ...(config.staticFields ?? {}),
    ...(nest === '' ? mapped : { [nest]: mapped }),
  }
  if (fields.credential !== '') envelope[fields.credential] = config.credential

  return JSON.stringify(envelope)
}

/**
 * The degrade ladder, measured against the REQUEST rather than the payload.
 *
 * The payload builder already fitted the payload object to its own budget; what
 * a provider actually rejects is the body, which additionally carries the
 * subject, the rendered message and any static fields. So the rung is chosen
 * here, on the bytes that will really be posted.
 *
 * The bottom rung is returned WITHOUT a measurement. `metadata-only` is bounded
 * by a name, an email and four numbers — "it always fits" is a property of its
 * shape, and an identity block Cam can act on beats a notification that was never
 * sent because it did not fit.
 */
export function fitRelayRequest(payload: NotificationPayload, config: RelayConfig): RelayRequest {
  const limit = config.limitBytes ?? RELAY_PAYLOAD_LIMIT_BYTES

  for (const variant of LADDER) {
    const candidate = demoteNotificationPayload(payload, variant)
    // A payload that arrived already degraded cannot climb back up.
    if (candidate.variant !== variant) continue

    const body = relayRequestBody(candidate, config)
    const byteLength = utf8Length(body)
    if (byteLength <= limit || variant === 'metadata-only') return { variant, body, byteLength }
  }

  const floor = demoteNotificationPayload(payload, 'metadata-only')
  const body = relayRequestBody(floor, config)
  return { variant: 'metadata-only', body, byteLength: utf8Length(body) }
}

async function post(
  request: RelayRequest,
  config: RelayConfig,
  ports: FormRelayPorts,
): Promise<RelayResult> {
  const response = await ports.fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: request.body,
    /*
     * The client may close the tab the second their download lands — this fires
     * after it, so without `keepalive` the notification is a coin flip. It is
     * also the honest reason the byte budget is 64 kB: that is the ceiling the
     * keepalive fetch itself imposes.
     */
    keepalive: true,
  })

  if (response.status >= HTTP_OK_FLOOR && response.status < HTTP_OK_CEILING) {
    return { status: 'sent', detail: `${request.variant} · ${String(request.byteLength)} bytes` }
  }
  return { status: 'failed', detail: `relay refused: HTTP ${String(response.status)}` }
}

/**
 * The adapter. Never rejects: a relay that throws would make every caller
 * responsible for a failure that is, by design, none of the client's business.
 */
export function createFormPostRelay(config: RelayConfig, ports: FormRelayPorts): DeliveryRelay {
  return {
    id: FORM_RELAY_ID,
    send: async (payload) => {
      // Belt and braces. The store refuses a tripped honeypot before the pipeline
      // starts; if one ever reaches here, nothing leaves the browser.
      if (payload.honeypot.trim() !== '') {
        return { status: 'skipped', detail: 'honeypot filled — nothing sent' }
      }

      const request = fitRelayRequest(payload, config)
      try {
        return await post(request, config, ports)
      } catch (error) {
        ports.log('relay: request failed', error)
        return { status: 'failed', detail: `relay request failed: ${String(error)}` }
      }
    },
  }
}

/**
 * THE BINDING RULE — what the app gets for a given config.
 *
 * Three states, and only one of them makes a request:
 *  · untouched (how this ships) → the Stage 3 stub, constructed exactly as
 *    before. Same status, same log line, no network. Nothing about the app moves.
 *  · touched but broken → the stub as well, plus a loud console line naming every
 *    problem. A typo in a pasted key must degrade to today's behaviour, never to
 *    a silent misfire against a wrong URL.
 *  · ready → the form relay.
 */
export function createConfiguredRelay(config: RelayConfig, ports: FormRelayPorts): DeliveryRelay {
  if (isRelayReady(config)) return createFormPostRelay(config, ports)

  if (isRelayTouched(config)) ports.log(RELAY_MISCONFIGURED_PREFIX, relayConfigProblems(config))

  return createNoopRelay({
    log: (message, payload) => {
      ports.log(message, payload)
    },
  })
}
