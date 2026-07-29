/**
 * MINTING THE SUBMISSION — `docs/export-format.md` §2.3, and V8's "minted this
 * submission" guarantee.
 *
 * V8 says freshness is enforced BY CONSTRUCTION, not by inspection: the UUID is
 * minted at the top of the submit action and never read back from storage, so
 * there is no code path by which a persisted id could reach a package. This
 * module is the only place that mints one.
 *
 * The same value is then stamped in three places (debate #2 binding) —
 * `submission.id`, the `brief.md` header comment, and the zip filename — all
 * three derived from this one object, which is why they cannot disagree.
 */

import type { SubmissionInfo } from '../export/siteJson.ts'

import type { LeadDetails } from './form.ts'

/** Injected so tests are deterministic; the app binds the real browser APIs. */
export interface SubmissionClock {
  readonly now: () => Date
  readonly randomUuid: () => string
}

const UUID_HEX_GROUPS = [8, 4, 4, 4, 12] as const
const VERSION_NIBBLE_INDEX = 12
const VARIANT_NIBBLE_INDEX = 16

/**
 * A v4 UUID from `crypto.getRandomValues`, for the environments whose `crypto`
 * predates `randomUUID` (older WebKit, and jsdom depending on its version). The
 * schema's pattern pins the version and variant nibbles, so they are set here
 * rather than left to chance.
 */
function uuidFromRandomBytes(): string {
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
  const nibbles = [...hex]
  nibbles[VERSION_NIBBLE_INDEX] = '4'
  nibbles[VARIANT_NIBBLE_INDEX] = '89ab'[bytes[8]! & 0x03] ?? '8'

  let cursor = 0
  return UUID_HEX_GROUPS.map((length) => {
    const group = nibbles.slice(cursor, cursor + length).join('')
    cursor += length
    return group
  }).join('-')
}

export function browserRandomUuid(): string {
  return typeof globalThis.crypto.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : uuidFromRandomBytes()
}

export const BROWSER_CLOCK: SubmissionClock = {
  now: () => new Date(),
  randomUuid: browserRandomUuid,
}

/**
 * The build's own version, injected by Vite (`__APP_VERSION__` in `vite.config.ts`)
 * rather than hand-maintained here, so `submission.appVersion` and the brief header
 * always name the build that produced them.
 */
export const APP_VERSION: string = __APP_VERSION__

export function mintSubmission(lead: LeadDetails, clock: SubmissionClock = BROWSER_CLOCK): SubmissionInfo {
  return {
    id: clock.randomUuid(),
    submittedAt: clock.now().toISOString(),
    // §2.3 permits null, and the document carries no creation timestamp: the
    // editor has never stored one, and inventing one at submit would be a
    // fabricated fact in a file whose whole job is to be true.
    designCreatedAt: null,
    client: { name: lead.clientName, email: lead.clientEmail },
    appVersion: APP_VERSION,
  }
}
