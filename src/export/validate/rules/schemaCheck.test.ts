import { describe, expect, it } from 'vitest'

import { bluebirdPackage, brokenPackage } from '../../../test/exportFixtures.ts'
import type { ExportBlock, SiteJson } from '../../types.ts'

import { v01Schema } from './schemaCheck.ts'

/**
 * V1 — ajv v8 + `ajv-formats`, `{ allErrors: true, strict: true }`, against the
 * §2.2 schema file the app ships.
 *
 * The malformed-timestamp case is Appendix A's REQUIRED red test: without
 * `ajv-formats`, `format: "date-time"` and `format: "email"` are silent no-ops, so a
 * schema that looks like it checks timestamps would not. If that test ever goes
 * green with the formats plugin removed, the plugin was never doing anything.
 */

describe('V1 schema validation', () => {
  it('accepts the §7.1 package', async () => {
    await expect(v01Schema(bluebirdPackage())).resolves.toEqual([])
  })

  it('rejects a malformed submittedAt — proving ajv-formats is wired', async () => {
    const red = brokenPackage((site) => {
      ;(site.submission as { submittedAt: string }).submittedAt = 'yesterday'
    })
    const findings = await v01Schema(red)
    expect(findings.length).toBeGreaterThan(0)
    expect(findings.some((finding) => finding.message.includes('date-time'))).toBe(true)
    expect(findings[0]?.audience).toBe('bug')
  })

  it('rejects a malformed client email — the other format', async () => {
    const red = brokenPackage((site) => {
      ;(site.submission.client as { email: string }).email = 'not-an-email'
    })
    const findings = await v01Schema(red)
    expect(findings.some((finding) => finding.message.includes('email'))).toBe(true)
  })

  it('rejects an id that does not match its pattern', async () => {
    const red = brokenPackage((site) => {
      const blocks = site.pages[0]?.blocks as ExportBlock[] | undefined
      const block = blocks?.[0]
      if (blocks && block) blocks[0] = { ...block, id: 'BLOCK-ONE' }
    })
    await expect(v01Schema(red)).resolves.not.toEqual([])
  })

  it('rejects a generate block whose description is null (the schema if/then)', async () => {
    const red = brokenPackage((site) => {
      const blocks = site.pages[0]?.blocks as ExportBlock[] | undefined
      const block = blocks?.[4]
      if (blocks && block) blocks[4] = { ...block, generateDescription: null } as ExportBlock
    })
    await expect(v01Schema(red)).resolves.not.toEqual([])
  })

  it('rejects a wrong schemaVersion', async () => {
    const red = brokenPackage((site) => ({ ...site, schemaVersion: 2 }))
    await expect(v01Schema(red)).resolves.not.toEqual([])
  })

  it('tolerates an unknown field anywhere (§6.2)', async () => {
    const green = bluebirdPackage()
    const future = { ...green, site: { ...green.site, revisionOf: 'abc' } as unknown as SiteJson }
    await expect(v01Schema(future)).resolves.toEqual([])
  })
})
