import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  extractExampleBrief,
  extractExampleSiteJsonText,
  extractTemplateRegion,
  normalizeWhitespace,
  readSpec,
} from '../../test/specFixtures.ts'
import type { SiteJson } from '../types.ts'

import { DEFINITION_OF_DONE_LINES, RESPONSIVE_LINES, ROLE_LINES } from './boilerplate.ts'
import { generateBrief } from './generateBrief.ts'

/**
 * Appendix A equality tests B and C.
 *
 * B is the test that makes every §3.2/§4.4 rule change provably reach the worked
 * example. Both sides are extracted from `docs/export-format.md` at test time, so
 * there is no committed expected output to drift — editing the spec is what turns
 * this red.
 */

const spec = readSpec()
const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex')

describe('Appendix A equality test B — generateBrief(§7.1) === §7.2', () => {
  const site = JSON.parse(extractExampleSiteJsonText(spec)) as SiteJson
  const expected = extractExampleBrief(spec)
  const actual = generateBrief(site)

  it('is byte-exact', () => {
    // Printed so the evidence in the feature file is reproducible from a test run.
    console.log(
      `[test B] expected ${String(Buffer.byteLength(expected, 'utf8'))} bytes sha256 ${sha256(expected)}\n` +
        `[test B] actual   ${String(Buffer.byteLength(actual, 'utf8'))} bytes sha256 ${sha256(actual)}`,
    )
    expect(actual).toBe(expected)
  })

  it('hashes identically on both sides', () => {
    expect(sha256(actual)).toBe(sha256(expected))
  })

  it('is deterministic — two calls produce the same bytes', () => {
    expect(generateBrief(site)).toBe(actual)
  })

  it('emits LF only, with a final newline (§1 file conventions)', () => {
    expect(actual.includes('\r')).toBe(false)
    expect(actual.endsWith('\n')).toBe(true)
  })

  it('emits unwrapped logical lines (§3.3 rule 10) — no bullet is a wrapped fragment', () => {
    const lines = actual.split('\n')
    const insideFence = (index: number): boolean => {
      let open = false
      for (let i = 0; i < index; i += 1) if (/^\s*```$/.test(lines[i] ?? '')) open = !open
      return open
    }
    const strays = lines.filter(
      (line, index) => /^\s{4}/.test(line) && !/^\s*```/.test(line) && !insideFence(index),
    )
    expect(strays).toEqual([])
  })
})

describe('Appendix A equality test C — frozen boilerplate vs the §3.2 template', () => {
  const regions: [string, readonly string[], string, string][] = [
    ['Your role', ROLE_LINES, '## Your role', '## The business'],
    ['Responsive rules', RESPONSIVE_LINES, '## Responsive rules', '## Site inventory'],
    ['Definition of done', DEFINITION_OF_DONE_LINES, '## Definition of done', '```'],
  ]

  it.each(regions)('%s matches §3.2 under whitespace normalization', (_name, constant, start, end) => {
    const fromSpec = extractTemplateRegion(start, end, spec)
    expect(normalizeWhitespace(constant.join('\n'))).toBe(normalizeWhitespace(fromSpec))
  })

  /**
   * The v2.3 ruling, asserted rather than assumed: byte-exact C is unsatisfiable
   * because §3.2 is displayed hard-wrapped while the emitted form is unwrapped
   * (§3.3 rule 10). If a future spec pass unwraps §3.2 too, this test fails and the
   * ruling can be revisited on evidence.
   */
  it.each(regions)('%s is NOT byte-identical to §3.2 — the reason C is normalized', (_name, constant, start, end) => {
    const fromSpec = extractTemplateRegion(start, end, spec)
    expect(fromSpec.trimEnd()).not.toBe(constant.join('\n'))
  })
})
