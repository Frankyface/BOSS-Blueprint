/**
 * Appendix A boundary tests: "`w` exactly 600, 960, 1120; |leftGap − rightGap|
 * exactly 24 and 25; row overlap exactly at 50% of the shorter height; column
 * overlap exactly at 50% of the narrower width (§4.4 [N2]/[N4] — the dry-run's
 * D2 bugs were all boundary cases)".
 *
 * Run: node tools/boundary-tests.ts
 */

import type { Block } from '../src/types.ts';
import { columnPlacement, columnsOf, positionPhrase, rowsOf, sharesColumn, sharesRow } from '../src/layout.ts';
import { escapeClientText, quoteTruncated } from '../src/text.ts';

let failures = 0;
function eq(name: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`}`);
}

const box = (id: string, x: number, y: number, w: number, h: number, z = 0): Block => ({
  id,
  type: 'text',
  z,
  frame: { x, y, w, h },
  copyMode: 'real',
  text: id,
  generateDescription: null,
  lengthHint: null,
});

console.log('[N4] WIDTH BUCKETS');
eq('w = 1120 → full width', positionPhrase({ x: 40, y: 0, w: 1120, h: 10 }), 'spanning the full width');
// x=40 would make leftGap 40 / rightGap 41 → "centered"; x=0 isolates the width bucket.
eq('w = 1119 → wide', positionPhrase({ x: 0, y: 0, w: 1119, h: 10 }), 'wide, on the left');
eq('w = 960 → wide', positionPhrase({ x: 0, y: 0, w: 960, h: 10 }), 'wide, on the left');
eq('w = 959 → about half the width', positionPhrase({ x: 0, y: 0, w: 959, h: 10 }), 'about half the width, on the left');
eq('w = 600 → about half the width', positionPhrase({ x: 0, y: 0, w: 600, h: 10 }), 'about half the width, on the left');
eq('w = 599 → narrow', positionPhrase({ x: 0, y: 0, w: 599, h: 10 }), 'narrow, on the left');

console.log('\n[N4] HORIZONTAL PLACEMENT');
// w=600, x=312 → leftGap 312, rightGap 288, |diff| = 24 → centered
eq('|leftGap − rightGap| = 24 → centered', positionPhrase({ x: 312, y: 0, w: 600, h: 10 }), 'about half the width, centered');
// w=601, x=312 → leftGap 312, rightGap 287, |diff| = 25 → not centered
eq('|leftGap − rightGap| = 25 → on the right', positionPhrase({ x: 312, y: 0, w: 601, h: 10 }), 'about half the width, on the right');
eq('full-width omits the horizontal phrase', positionPhrase({ x: 0, y: 0, w: 1200, h: 10 }), 'spanning the full width');
eq('1040 inset 80 each side → wide, centered', positionPhrase({ x: 80, y: 0, w: 1040, h: 10 }), 'wide, centered');

console.log('\n[N2] ROW UNION (≥50% of the SHORTER height)');
eq('overlap exactly 50% of shorter → same row', sharesRow(box('a', 0, 0, 100, 100), box('b', 0, 50, 100, 200)), true);
eq('overlap 49% of shorter → different rows', sharesRow(box('a', 0, 0, 100, 100), box('b', 0, 51, 100, 200)), false);

console.log('\n[N2] COLUMN UNION (≥50% of the NARROWER width)');
eq('overlap exactly 50% of narrower → same column', sharesColumn(box('a', 0, 0, 100, 10), box('b', 50, 0, 200, 10)), true);
eq('overlap 49% of narrower → different columns', sharesColumn(box('a', 0, 0, 100, 10), box('b', 51, 0, 200, 10)), false);

console.log('\n[N2] TRANSITIVITY + ORDERING');
// hero pattern: one tall block pulls a stack of three beside it into one row
const hero = [
  box('tall', 700, 0, 400, 600, 3),
  box('s1', 0, 0, 400, 100, 0),
  box('s2', 0, 200, 400, 100, 1),
  box('s3', 0, 400, 400, 100, 2),
];
const heroRows = rowsOf(hero);
eq('tall block pulls a 3-stack into ONE row', heroRows.length, 1);
const heroColumns = columnsOf(heroRows[0]);
eq('…which splits into 2 columns', heroColumns.length, 2);
eq('…left column keeps 3 blocks in y order', heroColumns[0].map((b) => b.id).join(','), 's1,s2,s3');
eq('…right column is the tall block', heroColumns[1].map((b) => b.id).join(','), 'tall');

const three = [box('l', 0, 0, 300, 100, 0), box('m', 400, 0, 300, 100, 1), box('r', 800, 0, 300, 100, 2)];
const threeColumns = columnsOf(rowsOf(three)[0]);
eq('3 columns → left/middle/right', threeColumns.map((_, i) => columnPlacement(i, threeColumns.length)).join('/'), 'left/middle/right');

console.log('\n§3.3 RULE 7 ESCAPING');
eq('pipe', escapeClientText('a|b'), 'a\\|b');
eq('guillemets', escapeClientText('«x»'), '\\«x\\»');
eq('asterisk (v2.1)', escapeClientText('**bold**'), '\\*\\*bold\\*\\*');
eq('backtick', escapeClientText('`code`'), '\\`code\\`');
eq('leading hash', escapeClientText('# title'), '\\# title');
eq('leading dash', escapeClientText('- item'), '\\- item');
eq('leading gt', escapeClientText('> quote'), '\\> quote');
eq('leading digit-period (D6: literal reading)', escapeClientText('1. one'), '\\1. one');
eq('digits without a period are untouched', escapeClientText('123 Agricola St'), '123 Agricola St');
eq('CRLF → ↵', escapeClientText('a\r\nb'), 'a↵b');
eq('LF → ↵', escapeClientText('a\nb'), 'a↵b');
eq('literal marker cannot form the bold token', escapeClientText('**WRITE THIS COPY**'), '\\*\\*WRITE THIS COPY\\*\\*');

console.log('\n[N5]/[N7] TRUNCATION');
eq('≤40 chars is untouched', quoteTruncated('x'.repeat(40)), `«${'x'.repeat(40)}»`);
eq('>40 chars truncates and appends …', quoteTruncated('x'.repeat(41)), `«${'x'.repeat(40)}…»`);
eq('truncation happens BEFORE escaping (no split escape pairs)', quoteTruncated(`${'x'.repeat(40)}|`), `«${'x'.repeat(40)}…»`);

console.log(failures === 0 ? '\nALL BOUNDARY TESTS PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
