import { describe, expect, it } from 'vitest'

import { SCHEMA_PATH, extractSchemaText, readRepoText, readSpec } from '../../test/specFixtures.ts'

/**
 * Appendix A equality test A: "the fenced JSON Schema in `docs/export-format.md`
 * §2.2 byte-matches `src/export/schema/site.v1.schema.json`".
 *
 * A spec whose thesis is "derive, never duplicate" must not let its own two copies
 * drift. The repo file is the single source of truth for the app; the doc's copy is
 * the mirror; editing one without the other fails here.
 *
 * Both sides are read from disk at test time and normalized to LF — the repo stores
 * LF but this checkout has `core.autocrlf=true`, so the working tree's endings are
 * git's choice, not the schema's content.
 */
describe('Appendix A equality test A — §2.2 schema vs the repo file', () => {
  const fromDoc = extractSchemaText(readSpec())
  const fromRepo = readRepoText(SCHEMA_PATH)

  it('byte-matches the fenced block in §2.2', () => {
    // eslint-disable-next-line no-console
    console.log(
      `[test A] §2.2 fence ${String(Buffer.byteLength(fromDoc, 'utf8'))} bytes · repo file ${String(Buffer.byteLength(fromRepo, 'utf8'))} bytes`,
    )
    expect(fromRepo).toBe(fromDoc)
  })

  it('is a draft-07 schema for schemaVersion 1', () => {
    const schema = JSON.parse(fromRepo) as { $schema: string; properties: { schemaVersion: { const: number } } }
    expect(schema.$schema).toBe('http://json-schema.org/draft-07/schema#')
    expect(schema.properties.schemaVersion.const).toBe(1)
  })

  it('never sets additionalProperties: false — §6.2 unknown-field tolerance', () => {
    expect(fromRepo.includes('additionalProperties')).toBe(false)
  })
})
