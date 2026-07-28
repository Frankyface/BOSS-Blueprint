/**
 * SPEC FIXTURE EXTRACTION — Appendix A requires the equality tests to read their
 * fixtures out of `docs/export-format.md` ITSELF, so the spec stays the single
 * source of truth and a spec edit is what turns a test red. There is deliberately
 * no committed copy of the expected output for test B to drift from.
 *
 * Test-support only: no production module imports this file (it does I/O).
 *
 * LINE ENDINGS: the repo stores LF (`git ls-files --eol` → `i/lf`) and §1 mandates
 * LF in the package, but this repo checks out with `core.autocrlf=true`, so a
 * Windows working tree hands us CRLF. Normalizing on read is what makes the
 * byte-exact comparison a comparison of CONTENT rather than of the developer's git
 * config; the generator's own output is always LF and is never normalized.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Paths are resolved from the Vitest root (the repo root — `npm test` runs there)
 * rather than from `import.meta.url`, which the jsdom environment rewrites to a
 * non-`file:` URL.
 */
const REPO_ROOT = process.cwd()

export const SPEC_PATH = resolve(REPO_ROOT, 'docs/export-format.md')

export const SCHEMA_PATH = resolve(REPO_ROOT, 'src/export/schema/site.v1.schema.json')

/** Read a repo text file as LF, whatever the working tree's line endings are. */
export function readRepoText(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
}

export function readSpec(): string {
  return readRepoText(SPEC_PATH)
}

function headingIndex(lines: readonly string[], heading: string): number {
  const index = lines.findIndex((line) => line.trimEnd() === heading)
  if (index < 0) throw new Error(`heading not found in the spec: ${heading}`)
  return index
}

/**
 * The first fenced block after `fromLine` whose info string is `language`.
 *
 * Fences of 3+ backticks are handled because §7.2 is a FOUR-backtick fence that
 * CONTAINS a three-backtick fence (the rule-8 verbatim sub-block) — closing on the
 * first ``` would truncate the expected brief mid-address.
 */
function fencedBlockAfter(
  lines: readonly string[],
  fromLine: number,
  language: string,
): { body: string; startLine: number } {
  for (let i = fromLine; i < lines.length; i += 1) {
    const open = /^(`{3,})([a-zA-Z]*)\s*$/.exec(lines[i] ?? '')
    if (!open) continue

    const ticks = open[1] ?? ''
    if (open[2] !== language) continue

    const close = new RegExp(`^\`{${String(ticks.length)},}\\s*$`)
    for (let j = i + 1; j < lines.length; j += 1) {
      if (close.test(lines[j] ?? '')) {
        return { body: lines.slice(i + 1, j).join('\n'), startLine: i + 2 }
      }
    }
    throw new Error(`unterminated fence starting at spec line ${String(i + 1)}`)
  }
  throw new Error(`no \`\`\`${language} fence found after spec line ${String(fromLine + 1)}`)
}

/** §2.2 — the JSON Schema, exactly as the fence carries it plus a final newline. */
export function extractSchemaText(spec: string = readSpec()): string {
  const lines = spec.split('\n')
  const { body } = fencedBlockAfter(lines, headingIndex(lines, '### 2.2 JSON Schema (draft-07)'), 'json')
  return `${body}\n`
}

/** §7.1 — the worked-example `site.json`, as text and parsed. */
export function extractExampleSiteJsonText(spec: string = readSpec()): string {
  const lines = spec.split('\n')
  const { body } = fencedBlockAfter(lines, headingIndex(lines, '### 7.1 `site.json`'), 'json')
  return `${body}\n`
}

/** §7.2 — the worked-example `brief.md`, verbatim. */
export function extractExampleBrief(spec: string = readSpec()): string {
  const lines = spec.split('\n')
  const { body } = fencedBlockAfter(lines, headingIndex(lines, '### 7.2 Generated `brief.md`'), 'markdown')
  return `${body}\n`
}

/**
 * A `## `-delimited region of the §3.2 template, for equality test C. Returns the
 * text from `startHeading` up to (not including) `endHeading`.
 */
export function extractTemplateRegion(
  startHeading: string,
  endHeading: string,
  spec: string = readSpec(),
): string {
  const start = spec.indexOf(`\n${startHeading}\n`)
  if (start < 0) throw new Error(`template region not found: ${startHeading}`)
  const end = spec.indexOf(`\n${endHeading}\n`, start + 1)
  if (end < 0) throw new Error(`template region has no end: ${endHeading}`)
  return spec.slice(start + 1, end)
}

/** Equality test C's comparison (v2.3): whitespace-normalized, not byte-exact. */
export function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
