/**
 * Appendix A equality test B, standalone:
 *   generateBrief(parse(§7.1)) === §7.2, byte-exact,
 * with BOTH blocks extracted from docs/export-format.md at run time.
 *
 * Also runs, as diagnostics:
 *  - test C (normalized): the three frozen boilerplate regions vs §3.2's template
 *  - §3.3 rule 2's frame-tuple-anchored marker regexes (V7's counting contract)
 *
 * Usage: node tools/run-equality-test.ts [path-to-export-format.md]
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractSpecFixtures } from './extract.ts';
import { generateBrief } from '../src/generateBrief.ts';
import type { SiteJson } from '../src/types.ts';
import {
  DEFINITION_OF_DONE_LINES,
  RESPONSIVE_LINES,
  ROLE_LINES,
} from '../src/boilerplate.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SPEC = 'C:/Users/Cam/Documents/.ClaudeCode Projects/BOSS-Blueprint/docs/export-format.md';
const specPath = process.argv[2] ?? DEFAULT_SPEC;

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

function locate(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  const column = index - (before.lastIndexOf('\n') + 1) + 1;
  return { line, column };
}

function firstDivergence(actual: string, expected: string): number | null {
  const limit = Math.min(actual.length, expected.length);
  for (let i = 0; i < limit; i += 1) if (actual[i] !== expected[i]) return i;
  return actual.length === expected.length ? null : limit;
}

function reportDivergence(actual: string, expected: string, index: number): void {
  const { line, column } = locate(expected, Math.min(index, expected.length));
  const actualLines = actual.split('\n');
  const expectedLines = expected.split('\n');
  console.log(`\n  FIRST DIVERGENCE at char ${index} — line ${line}, column ${column}`);
  console.log(`  actual char:   ${JSON.stringify(actual[index] ?? '<EOF>')}`);
  console.log(`  expected char: ${JSON.stringify(expected[index] ?? '<EOF>')}`);
  const from = Math.max(0, line - 4);
  const to = Math.min(Math.max(actualLines.length, expectedLines.length), line + 3);
  console.log('\n  --- context (E = expected §7.2, A = actual generator output) ---');
  for (let i = from; i < to; i += 1) {
    const mark = i === line - 1 ? '>' : ' ';
    console.log(`  ${mark} E${String(i + 1).padStart(4)} | ${expectedLines[i] ?? '<no line>'}`);
    console.log(`  ${mark} A${String(i + 1).padStart(4)} | ${actualLines[i] ?? '<no line>'}`);
  }
  const e = expectedLines[line - 1] ?? '';
  const a = actualLines[line - 1] ?? '';
  console.log('\n  --- the diverging line, escaped ---');
  console.log(`  E: ${JSON.stringify(e)}`);
  console.log(`  A: ${JSON.stringify(a)}`);
  console.log(`  caret:  ${' '.repeat(Math.max(0, column - 1))}^ (column ${column})`);
}

/* ------------------------------------------------------------- test B */

const { siteJsonText, briefText } = extractSpecFixtures(specPath);
const site = JSON.parse(siteJsonText.text) as SiteJson;
const actual = generateBrief(site);
const expected = briefText.text;

console.log('EQUALITY TEST B — generateBrief(§7.1) === §7.2');
console.log(`  spec:          ${specPath}`);
console.log(`  §7.1 fence at spec line ${siteJsonText.startLine}, §7.2 fence at spec line ${briefText.startLine}`);
console.log(`  expected: ${expected.length} chars, ${Buffer.byteLength(expected, 'utf8')} bytes, sha256 ${sha256(expected)}`);
console.log(`  actual:   ${actual.length} chars, ${Buffer.byteLength(actual, 'utf8')} bytes, sha256 ${sha256(actual)}`);

const divergence = firstDivergence(actual, expected);
let failed = false;
if (divergence === null) {
  console.log('\n  RESULT: BYTE-EXACT ✔  (sha256 of both strings is identical above)');
} else {
  failed = true;
  console.log('\n  RESULT: NOT EQUAL ✘');
  reportDivergence(actual, expected, divergence);
  const outDir = join(HERE, '..', 'out');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'actual-brief.md'), actual, 'utf8');
  writeFileSync(join(outDir, 'expected-brief.md'), expected, 'utf8');
  console.log(`\n  wrote out/actual-brief.md and out/expected-brief.md for a full diff`);
}

/* ------------------------------------- test C (normalized) — boilerplate */

const doc = readFileSync(specPath, 'utf8');
const normalize = (s: string): string => s.replace(/\s+/g, ' ').trim();

function templateRegion(startHeading: string, endHeading: string): string {
  const start = doc.indexOf(`\n${startHeading}\n`);
  const end = doc.indexOf(`\n${endHeading}\n`, start + 1);
  if (start < 0 || end < 0) throw new Error(`template region not found: ${startHeading}`);
  return doc.slice(start + 1, end);
}

console.log('\nEQUALITY TEST C — frozen boilerplate vs the §3.2 template');
const regions: Array<[string, readonly string[], string, string]> = [
  ['Your role', ROLE_LINES, '## Your role', '## The business'],
  ['Responsive rules', RESPONSIVE_LINES, '## Responsive rules', '## Site inventory'],
  ['Definition of done', DEFINITION_OF_DONE_LINES, '## Definition of done', '```'],
];
for (const [name, constant, startHeading, endHeading] of regions) {
  const fromSpec = templateRegion(startHeading, endHeading);
  const same = normalize(fromSpec) === normalize(constant.join('\n'));
  const byteSame = fromSpec.trimEnd() === constant.join('\n');
  console.log(
    `  ${name}: whitespace-normalized ${same ? 'MATCH' : 'MISMATCH'} · byte-identical to §3.2 ${byteSame ? 'yes' : 'no (§3.2 is displayed hard-wrapped — §3.3 rule 10)'}`,
  );
  if (!same) {
    const a = normalize(fromSpec).split(' ');
    const b = normalize(constant.join('\n')).split(' ');
    const i = a.findIndex((w, k) => w !== b[k]);
    console.log(`    first differing word #${i}: spec ${JSON.stringify(a[i])} vs constant ${JSON.stringify(b[i])}`);
    console.log(`    spec context:     ${a.slice(Math.max(0, i - 8), i + 8).join(' ')}`);
    console.log(`    constant context: ${b.slice(Math.max(0, i - 8), i + 8).join(' ')}`);
    failed = true;
  }
}

/* --------------------------------------------- V7 marker-count contract */

const WRITE_THIS_COPY_RE =
  /^\s*- \*\*(Heading|Text)\*\* [^(\n]*\((-?\d+(\.\d)?, ){3}-?\d+(\.\d)?\)[^\n]*?\*\*WRITE THIS COPY\*\* — client asks for: «/gm;
const SOURCE_AN_IMAGE_RE =
  /^\s*- \*\*Image slot\*\* [^(\n]*\((-?\d+(\.\d)?, ){3}-?\d+(\.\d)?\)[^\n]*?\*\*SOURCE AN IMAGE\*\* — no upload; client wants: «/gm;

const generateBlocks = site.pages.flatMap((p) =>
  p.blocks.filter((b) => (b.type === 'heading' || b.type === 'text') && b.copyMode === 'generate'),
).length;
const emptySlots = site.pages.flatMap((p) =>
  p.blocks.filter((b) => b.type === 'imageSlot' && b.assetId === null),
).length;
const writeCount = (actual.match(WRITE_THIS_COPY_RE) ?? []).length;
const imageCount = (actual.match(SOURCE_AN_IMAGE_RE) ?? []).length;

console.log('\nV7 MARKER COUNTS (§3.3 rule 2 regexes, run against the generated brief)');
console.log(`  WRITE THIS COPY: regex ${writeCount} vs generate blocks ${generateBlocks} — ${writeCount === generateBlocks ? 'OK' : 'MISMATCH'}`);
console.log(`  SOURCE AN IMAGE: regex ${imageCount} vs empty slots ${emptySlots} — ${imageCount === emptySlots ? 'OK' : 'MISMATCH'}`);
if (writeCount !== generateBlocks || imageCount !== emptySlots) failed = true;

process.exit(failed ? 1 : 0);
