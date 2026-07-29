import { describe, expect, it, vi } from 'vitest'

import { BOSS_RELAY } from '../../../site.config.ts'
import { BLUEBIRD_SUBMISSION, bluebirdDocument } from '../../test/exportFixtures.ts'
import { generateBrief } from '../brief/generateBrief.ts'
import { buildSiteJson } from '../siteJson.ts'
import { finding, type Finding } from '../validate/types.ts'

import {
  createConfiguredRelay,
  createFormPostRelay,
  fitRelayRequest,
  relayRequestBody,
  RELAY_MISCONFIGURED_PREFIX,
  type FetchLike,
} from './formRelay.ts'
import { BRIEF_MARKER, SITE_JSON_MARKER } from './notificationText.ts'
import { buildNotificationPayload, type NotificationPayload } from './payload.ts'
import { NOOP_RELAY_LOG_PREFIX } from './relay.ts'
import type { RelayConfig } from './relayConfig.ts'

/**
 * THE ADAPTER, with `fetch` injected rather than stubbed globally — the same
 * reason every other impure edge in this codebase is a port: the request body is
 * then an ordinary value a test can read.
 */

const site = buildSiteJson(bluebirdDocument(), BLUEBIRD_SUBMISSION)

const warnings: Finding[] = [
  finding('V15', 'WARN', 'client', 'Nothing links to "Contact".', ['pg_0002']),
]

const HUGE = 10_000_000

function payloadWith(overrides: Partial<NotificationPayload> = {}): NotificationPayload {
  const built = buildNotificationPayload(
    {
      site,
      brief: generateBrief(site),
      packageFileName: 'blueprint_bluebird-bakery_3f2a9c1e.zip',
      packageBytes: 240_000,
      warnings,
    },
    HUGE,
  )
  return { ...built, ...overrides }
}

const CONFIG: RelayConfig = {
  endpoint: 'https://api.example.com/submit',
  credential: 'public-form-key',
  limitBytes: HUGE,
}

interface Recorded {
  readonly url: string
  readonly init: RequestInit
}

function recordingFetch(status = 200): { fetch: FetchLike; calls: Recorded[] } {
  const calls: Recorded[] = []
  const fetch: FetchLike = (url, init) => {
    calls.push({ url, init })
    return Promise.resolve({ status } as Response)
  }
  return { fetch, calls }
}

function rawBodyOf(call: Recorded): string {
  const { body } = call.init
  if (typeof body !== 'string') throw new Error('the relay must post a string body')
  return body
}

function bodyOf(call: Recorded): Record<string, unknown> {
  return JSON.parse(rawBodyOf(call)) as Record<string, unknown>
}

const silent = () => undefined

describe('the request', () => {
  it('POSTs JSON to the configured endpoint, with keepalive', async () => {
    const { fetch, calls } = recordingFetch()

    await createFormPostRelay(CONFIG, { fetch, log: silent }).send(payloadWith())

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe(CONFIG.endpoint)
    expect(calls[0]?.init.method).toBe('POST')
    expect(calls[0]?.init.keepalive).toBe(true)
    expect(calls[0]?.init.headers).toMatchObject({ 'Content-Type': 'application/json' })
  })

  it('carries the credential, the identity fields and the UUID in the subject', async () => {
    const { fetch, calls } = recordingFetch()

    await createFormPostRelay(CONFIG, { fetch, log: silent }).send(payloadWith())
    const body = bodyOf(calls[0] as Recorded)

    expect(body.access_key).toBe('public-form-key')
    expect(body.name).toBe('Dana Whitfield')
    expect(body.email).toBe('dana@bluebirdbakery.ca')
    expect(String(body.subject)).toContain('3f2a9c1e')
    expect(String(body.subject)).toContain('Bluebird Bakery')
    expect(String(body.message)).toContain('Nothing links to "Contact".')
  })

  it('sends NOTHING the client did not type — the key set is closed', async () => {
    const { fetch, calls } = recordingFetch()

    await createFormPostRelay(CONFIG, { fetch, log: silent }).send(payloadWith())

    expect(Object.keys(bodyOf(calls[0] as Recorded)).sort()).toEqual([
      'access_key',
      'botcheck',
      'email',
      'message',
      'name',
      'subject',
    ])
  })

  it('merges the static fields a provider demands, and renames what it renames', () => {
    const body = JSON.parse(
      relayRequestBody(payloadWith(), {
        ...CONFIG,
        credential: 'user-id',
        staticFields: { service_id: 'svc_1', template_id: 'tpl_1' },
        fields: {
          credential: 'user_id',
          subject: 'title',
          name: 'from_name',
          email: 'reply_to',
          message: 'content',
          honeypot: '',
        },
      }),
    ) as Record<string, unknown>

    expect(body).toMatchObject({ service_id: 'svc_1', template_id: 'tpl_1', user_id: 'user-id' })
    expect(body.from_name).toBe('Dana Whitfield')
    expect(body.title).toBeDefined()
    expect(body.botcheck).toBeUndefined()
  })

  it('nests the human fields when the provider wants them nested (EmailJS)', () => {
    const body = JSON.parse(
      relayRequestBody(payloadWith(), { ...CONFIG, nestFieldsUnder: 'template_params' }),
    ) as { access_key?: string; template_params?: Record<string, string> }

    expect(body.access_key).toBe('public-form-key')
    expect(body.template_params?.name).toBe('Dana Whitfield')
    expect(body).not.toHaveProperty('name')
  })
})

describe('status mapping', () => {
  const cases: readonly [number, 'sent' | 'failed'][] = [
    [200, 'sent'],
    [202, 'sent'],
    [400, 'failed'],
    [422, 'failed'],
    [500, 'failed'],
    [503, 'failed'],
  ]

  it.each(cases)('HTTP %i → %s', async (status, expected) => {
    const { fetch } = recordingFetch(status)

    const result = await createFormPostRelay(CONFIG, { fetch, log: silent }).send(payloadWith())

    expect(result.status).toBe(expected)
    if (expected === 'failed') expect(result.detail).toContain(String(status))
  })

  it('resolves `failed` when the network throws — it never rejects', async () => {
    const log = vi.fn()
    const fetch: FetchLike = () => Promise.reject(new Error('offline'))

    const result = await createFormPostRelay(CONFIG, { fetch, log }).send(payloadWith())

    expect(result.status).toBe('failed')
    expect(result.detail).toContain('offline')
    expect(log).toHaveBeenCalledWith('relay: request failed', expect.any(Error))
  })
})

describe('the honeypot', () => {
  it('refuses to send at all when it is filled, before any fetch', async () => {
    const { fetch, calls } = recordingFetch()

    const result = await createFormPostRelay(CONFIG, { fetch, log: silent }).send(
      payloadWith({ honeypot: 'buy-cheap-links' }),
    )

    expect(result).toEqual({ status: 'skipped', detail: 'honeypot filled — nothing sent' })
    expect(calls).toHaveLength(0)
  })

  it('forwards the (empty) value into the provider’s own bot-check field', async () => {
    const { fetch, calls } = recordingFetch()

    await createFormPostRelay(CONFIG, { fetch, log: silent }).send(payloadWith())

    expect(bodyOf(calls[0] as Recorded).botcheck).toBe('')
  })
})

describe('the degrade ladder, measured on the real request body', () => {
  it('stays `full` when the body fits', () => {
    const request = fitRelayRequest(payloadWith(), CONFIG)

    expect(request.variant).toBe('full')
    expect(request.body).toContain(BRIEF_MARKER)
    expect(request.body).toContain(SITE_JSON_MARKER)
  })

  it('drops the brief first when the body is one byte over', () => {
    const full = fitRelayRequest(payloadWith(), CONFIG)

    const request = fitRelayRequest(payloadWith(), { ...CONFIG, limitBytes: full.byteLength - 1 })

    expect(request.variant).toBe('compressed')
    expect(request.body).not.toContain(BRIEF_MARKER)
    expect(request.body).toContain(SITE_JSON_MARKER)
  })

  it('drops the gzipped site.json next', () => {
    const compressed = fitRelayRequest(payloadWith(), {
      ...CONFIG,
      limitBytes: fitRelayRequest(payloadWith(), CONFIG).byteLength - 1,
    })

    const request = fitRelayRequest(payloadWith(), {
      ...CONFIG,
      limitBytes: compressed.byteLength - 1,
    })

    expect(request.variant).toBe('metadata-only')
    expect(request.body).not.toContain(SITE_JSON_MARKER)
  })

  it('SENDS the bottom rung even against an impossible budget', async () => {
    const { fetch, calls } = recordingFetch()

    const result = await createFormPostRelay(
      { ...CONFIG, limitBytes: 1 },
      { fetch, log: silent },
    ).send(payloadWith())

    expect(result.status).toBe('sent')
    expect(result.detail).toContain('metadata-only')
    expect(calls).toHaveLength(1)
    // The identity block is what "always fits" has to mean.
    const message = String(bodyOf(calls[0] as Recorded).message)
    expect(message).toContain('Dana Whitfield')
    expect(message).toContain('dana@bluebirdbakery.ca')
    expect(message).toContain('3f2a9c1e')
    expect(message).toContain('Pages:     2')
  })

  it('never climbs back up a payload that arrived already degraded', () => {
    const alreadyMetadata = buildNotificationPayload(
      {
        site,
        brief: generateBrief(site),
        packageFileName: 'blueprint_bluebird-bakery_3f2a9c1e.zip',
        packageBytes: 240_000,
        warnings,
      },
      1,
    )

    expect(fitRelayRequest(alreadyMetadata, CONFIG).variant).toBe('metadata-only')
  })
})

describe('createConfiguredRelay — the binding rule', () => {
  it('binds the Stage 3 stub for the config this repo ships, and never fetches', async () => {
    const log = vi.fn()
    const { fetch, calls } = recordingFetch()

    const relay = createConfiguredRelay(BOSS_RELAY, { fetch, log })
    const result = await relay.send(payloadWith())

    expect(relay.id).toBe('noop')
    expect(result.status).toBe('skipped')
    expect(calls).toHaveLength(0)
    expect(log).toHaveBeenCalledWith(NOOP_RELAY_LOG_PREFIX, expect.anything())
    expect(log).not.toHaveBeenCalledWith(RELAY_MISCONFIGURED_PREFIX, expect.anything())
  })

  it('falls back to the stub — loudly — when a pasted config is unusable', async () => {
    const log = vi.fn()
    const { fetch, calls } = recordingFetch()

    const relay = createConfiguredRelay({ endpoint: 'api.example.com', credential: '' }, { fetch, log })
    await relay.send(payloadWith())

    expect(relay.id).toBe('noop')
    expect(calls).toHaveLength(0)
    expect(log).toHaveBeenCalledWith(RELAY_MISCONFIGURED_PREFIX, [
      expect.stringContaining('not an absolute URL'),
      expect.stringContaining('access_key'),
    ])
  })

  it('binds the real adapter once the config is valid', () => {
    const { fetch } = recordingFetch()

    expect(createConfiguredRelay(CONFIG, { fetch, log: silent }).id).toBe('form-post')
  })
})
