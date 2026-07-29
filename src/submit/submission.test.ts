import { afterEach, describe, expect, it, vi } from 'vitest'

import { EMPTY_LEAD } from './form.ts'
import { BROWSER_CLOCK, browserRandomUuid, mintSubmission } from './submission.ts'

/**
 * V8's freshness is enforced BY CONSTRUCTION — the id is minted here and never
 * read back from storage. What this file proves is the other half: that the
 * minted value is schema-shaped on every engine, including the ones whose
 * `crypto` predates `randomUUID`.
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Everything `crypto` offers except `randomUUID` — older WebKit, older jsdom. */
function withoutRandomUuid(): void {
  const fill = globalThis.crypto.getRandomValues.bind(globalThis.crypto)
  vi.stubGlobal('crypto', {
    getRandomValues: (bytes: Uint8Array<ArrayBuffer>) => fill(bytes),
  })
}

describe('browserRandomUuid', () => {
  it('uses the platform generator when there is one', () => {
    expect(browserRandomUuid()).toMatch(UUID_V4)
  })

  it('falls back to getRandomValues, pinning the version and variant nibbles', () => {
    withoutRandomUuid()

    const ids = Array.from({ length: 64 }).map(() => browserRandomUuid())
    for (const id of ids) expect(id).toMatch(UUID_V4)
    expect(new Set(ids).size).toBe(64)
  })

  it('still produces a valid UUID when every random byte is zero', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(0),
    })

    expect(browserRandomUuid()).toMatch(UUID_V4)
  })

  it('still produces a valid UUID when every random byte is 0xff', () => {
    vi.stubGlobal('crypto', {
      getRandomValues: (bytes: Uint8Array) => bytes.fill(0xff),
    })

    expect(browserRandomUuid()).toMatch(UUID_V4)
  })
})

describe('mintSubmission', () => {
  it('takes its id and its clock from the injected port', () => {
    const submission = mintSubmission(
      { ...EMPTY_LEAD, clientName: 'Dana', clientEmail: 'dana@example.com' },
      { now: () => new Date('2026-07-28T14:03:22.000Z'), randomUuid: () => 'fixed-id' },
    )

    expect(submission.id).toBe('fixed-id')
    expect(submission.submittedAt).toBe('2026-07-28T14:03:22.000Z')
    expect(submission.client).toEqual({ name: 'Dana', email: 'dana@example.com' })
  })

  it('defaults to the browser clock', () => {
    const before = Date.now()
    const submission = mintSubmission(EMPTY_LEAD)

    expect(Date.parse(submission.submittedAt)).toBeGreaterThanOrEqual(before)
    expect(BROWSER_CLOCK.now()).toBeInstanceOf(Date)
  })
})
