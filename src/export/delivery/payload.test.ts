import { gunzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { BLUEBIRD_SUBMISSION, bluebirdDocument } from '../../test/exportFixtures.ts'
import { generateBrief } from '../brief/generateBrief.ts'
import { buildSiteJson } from '../siteJson.ts'
import { finding, type Finding } from '../validate/types.ts'

import { encodeBase64 } from './base64.ts'
import {
  buildNotificationPayload,
  demoteNotificationPayload,
  type PayloadInput,
} from './payload.ts'

/**
 * THE DEGRADE LADDER — full → compressed → metadata-only. The identity block is
 * never negotiable, which is the property the last rung has to prove.
 */

const site = buildSiteJson(bluebirdDocument(), BLUEBIRD_SUBMISSION)

const warnings: Finding[] = [
  finding('V15', 'WARN', 'client', 'Nothing links to "Contact".', ['pg_0002']),
  finding('V23', 'WARN', 'client', 'Some template placeholder text is still in your design.', ['blk_0004']),
]

const input = (): PayloadInput => ({
  site,
  brief: generateBrief(site),
  packageFileName: 'blueprint_bluebird-bakery_3f2a9c1e.zip',
  packageBytes: 240_000,
  warnings,
})

const decodeBase64 = (base64: string): Uint8Array =>
  Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))

describe('base64', () => {
  it('round-trips through the browser decoder', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255])

    expect([...decodeBase64(encodeBase64(bytes))]).toEqual([...bytes])
  })

  it('pads like every other encoder', () => {
    expect(encodeBase64(new TextEncoder().encode('a'))).toBe('YQ==')
    expect(encodeBase64(new TextEncoder().encode('ab'))).toBe('YWI=')
    expect(encodeBase64(new TextEncoder().encode('abc'))).toBe('YWJj')
  })
})

describe('the degrade ladder', () => {
  it('stays `full` when the payload fits', () => {
    const payload = buildNotificationPayload(input(), 1_000_000)

    expect(payload.variant).toBe('full')
    expect(payload.brief).toContain('## Your role')
    expect(payload.siteJsonGzipBase64).not.toBeNull()
  })

  it('drops the brief first, keeping the gzipped site.json', () => {
    const full = buildNotificationPayload(input(), 1_000_000)
    const justOver = JSON.stringify(full).length - 1

    const payload = buildNotificationPayload(input(), justOver)
    expect(payload.variant).toBe('compressed')
    expect(payload.brief).toBeNull()
    expect(payload.siteJsonGzipBase64).not.toBeNull()
  })

  it('falls all the way back to metadata-only', () => {
    const payload = buildNotificationPayload(input(), 1)

    expect(payload.variant).toBe('metadata-only')
    expect(payload.brief).toBeNull()
    expect(payload.siteJsonGzipBase64).toBeNull()
  })

  it('carries name, email, UUID, page count and the WARN list in every variant', () => {
    for (const limit of [1_000_000, 12_000, 1]) {
      const payload = buildNotificationPayload(input(), limit)

      expect(payload.client).toEqual({ name: 'Dana Whitfield', email: 'dana@bluebirdbakery.ca' })
      expect(payload.submissionId).toBe(BLUEBIRD_SUBMISSION.id)
      expect(payload.uuid8).toBe('3f2a9c1e')
      expect(payload.pageCount).toBe(2)
      expect(payload.businessName).toBe('Bluebird Bakery')
      expect(payload.packageFileName).toBe('blueprint_bluebird-bakery_3f2a9c1e.zip')
      expect(payload.warnings.map((warning) => warning.rule)).toEqual(['V15', 'V23'])
    }
  })
})

describe('the honeypot', () => {
  it('defaults to empty — the only value a real submission has', () => {
    expect(buildNotificationPayload(input(), 1_000_000).honeypot).toBe('')
  })

  it('is carried through every rung, so the relay can refuse on any of them', () => {
    for (const limit of [1_000_000, 12_000, 1]) {
      const payload = buildNotificationPayload({ ...input(), honeypot: 'spam' }, limit)

      expect(payload.honeypot).toBe('spam')
    }
  })
})

describe('demoteNotificationPayload', () => {
  it('sheds the brief on the way to `compressed`', () => {
    const payload = demoteNotificationPayload(buildNotificationPayload(input(), 1_000_000), 'compressed')

    expect(payload.variant).toBe('compressed')
    expect(payload.brief).toBeNull()
    expect(payload.siteJsonGzipBase64).not.toBeNull()
  })

  it('sheds both on the way to `metadata-only`', () => {
    const payload = demoteNotificationPayload(buildNotificationPayload(input(), 1_000_000), 'metadata-only')

    expect(payload.variant).toBe('metadata-only')
    expect(payload.brief).toBeNull()
    expect(payload.siteJsonGzipBase64).toBeNull()
  })

  it('leaves the source object untouched', () => {
    const source = buildNotificationPayload(input(), 1_000_000)

    demoteNotificationPayload(source, 'metadata-only')

    expect(source.variant).toBe('full')
    expect(source.brief).not.toBeNull()
    expect(source.siteJsonGzipBase64).not.toBeNull()
  })

  it('never promotes — a shed brief cannot be invented back', () => {
    const compressed = buildNotificationPayload(input(), 12_000)
    expect(compressed.variant).toBe('compressed')

    expect(demoteNotificationPayload(compressed, 'full')).toBe(compressed)

    const metadata = buildNotificationPayload(input(), 1)
    expect(demoteNotificationPayload(metadata, 'compressed')).toBe(metadata)
  })
})

describe('the gzipped site.json', () => {
  it('inflates back to the canonical text', () => {
    const payload = buildNotificationPayload(input(), 1_000_000)
    const text = new TextDecoder().decode(gunzipSync(decodeBase64(payload.siteJsonGzipBase64 ?? '')))

    expect(JSON.parse(text)).toEqual(site)
  })

  it('is deterministic — no wall-clock in the gzip header', () => {
    const first = buildNotificationPayload(input(), 1_000_000)
    const second = buildNotificationPayload(input(), 1_000_000)

    expect(first.siteJsonGzipBase64).toBe(second.siteJsonGzipBase64)
  })
})
