import { describe, expect, it, vi } from 'vitest'

import { BLUEBIRD_SUBMISSION, bluebirdDocument } from '../../test/exportFixtures.ts'
import { generateBrief } from '../brief/generateBrief.ts'
import { buildSiteJson } from '../siteJson.ts'

import { buildNotificationPayload } from './payload.ts'
import { createNoopRelay, NOOP_RELAY_LOG_PREFIX } from './relay.ts'

/** The port ships as a stub, and the stub must not pretend anything was sent. */

const site = buildSiteJson(bluebirdDocument(), BLUEBIRD_SUBMISSION)

const payload = buildNotificationPayload({
  site,
  brief: generateBrief(site),
  packageFileName: 'blueprint_bluebird-bakery_3f2a9c1e.zip',
  packageBytes: 240_000,
  warnings: [],
})

describe('NoopRelay', () => {
  it('resolves `skipped`, never `sent`', async () => {
    const result = await createNoopRelay().send(payload)

    expect(result.status).toBe('skipped')
    expect(result.detail).toBe('no relay is wired yet')
  })

  it('logs the payload the real relay WOULD send', async () => {
    const log = vi.fn()
    await createNoopRelay({ log }).send(payload)

    expect(log).toHaveBeenCalledOnce()
    expect(log).toHaveBeenCalledWith(NOOP_RELAY_LOG_PREFIX, payload)
  })

  it('is inert without a log sink', async () => {
    await expect(createNoopRelay().send(payload)).resolves.toEqual({
      status: 'skipped',
      detail: 'no relay is wired yet',
    })
  })
})
