import { unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import { bluebirdDocument } from '../../test/exportFixtures.ts'
import { EMPTY_LEAD } from '../../submit/form.ts'
import { browserRandomUuid, mintSubmission } from '../../submit/submission.ts'
import { generateBrief } from '../brief/generateBrief.ts'
import { buildExportPayload } from '../siteJson.ts'

import { buildPackage } from './buildPackage.ts'
import { uuid8 } from './filename.ts'
import { APP_LADDER_PORTS } from './ladder.ts'

/**
 * ONE UUID PER SUBMISSION, MINTED ONCE, STAMPED IN THREE PLACES (debate #2
 * binding): `site.json`'s `submission.id`, the `brief.md` header comment, and
 * the zip filename. All three are derived from the ONE object `mintSubmission`
 * returns, which is what makes disagreement structurally impossible — this test
 * is what proves the derivation never grew a second source.
 */

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

const png = (height: number): Uint8Array => {
  const bytes = new Uint8Array(96)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const view = new DataView(bytes.buffer)
  view.setUint32(8, 13)
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  view.setUint32(16, 1200)
  view.setUint32(20, height)
  return bytes
}

function packageForSubmission() {
  const submission = mintSubmission({
    ...EMPTY_LEAD,
    clientName: 'Dana Whitfield',
    clientEmail: 'dana@bluebirdbakery.ca',
    businessName: 'Bluebird Bakery',
  })
  const payload = buildExportPayload(bluebirdDocument(), submission)
  const brief = generateBrief(payload.site)

  const built = buildPackage(
    {
      site: payload.site,
      brief,
      renders: payload.site.pages.map((page) => ({
        bytes: png(page.height),
        width: 1200,
        height: page.height,
        nonBlank: true,
        hasStrokes: page.penStrokes.length > 0,
      })),
      stagedAssets: payload.stagedAssets,
    },
    APP_LADDER_PORTS,
  )

  return { submission, built }
}

describe('the three stampings agree', () => {
  it('puts the same UUID in site.json, brief.md and the filename', () => {
    const { submission, built } = packageForSubmission()
    const unpacked = unzipSync(built.bytes)
    const decode = (path: string): string => new TextDecoder().decode(unpacked[path])

    const site = JSON.parse(decode('site.json')) as { submission: { id: string } }

    expect(site.submission.id).toBe(submission.id)
    expect(decode('brief.md')).toContain(`submission ${submission.id}`)
    expect(built.fileName).toContain(uuid8(submission.id))
    expect(built.fileName).toBe(`blueprint_bluebird-bakery_${uuid8(submission.id)}.zip`)
  })
})

describe('minting', () => {
  it('produces a schema-shaped v4 UUID', () => {
    expect(browserRandomUuid()).toMatch(UUID_V4)
  })

  it('mints a DIFFERENT id every submission — V8 freshness by construction', () => {
    const ids = new Set(Array.from({ length: 32 }, () => browserRandomUuid()))

    expect(ids.size).toBe(32)
  })

  it('stamps the build version rather than a hand-maintained literal', () => {
    const submission = mintSubmission(EMPTY_LEAD)

    expect(submission.appVersion).toMatch(/^\d+\.\d+\.\d+/)
  })

  it('records the submission time as an ISO instant, and no design creation time', () => {
    const submission = mintSubmission(EMPTY_LEAD)

    expect(submission.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    expect(submission.designCreatedAt).toBeNull()
  })
})
