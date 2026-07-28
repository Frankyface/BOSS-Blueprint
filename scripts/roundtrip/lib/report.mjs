/**
 * Report model. Every check returns one immutable CheckResult; the gate prints
 * them as PASS/WARN/FAIL/SKIP lines and derives the exit code from them.
 *
 * `class` mirrors export-format.md §5's three outcome classes plus two the spec
 * implies but does not number:
 *   BLOCK  — §5 BLOCK. Violation => FAIL.
 *   FIX    — §5 FIX. The gate does not fix; it asserts the FIXED-STATE INVARIANT
 *            holds in a shipped package (the app already ran the fix pass), so a
 *            violation in a delivered zip is a real defect => FAIL.
 *   WARN   — §5 WARN. Violation => WARN, never blocks.
 *   CONV   — §1 "File conventions" / §4 naming rules with no V-number.
 *            Violation => WARN (=> FAIL under --strict-conventions).
 *   STEP   — a protocol §2 step that is informational or skipped.
 */

export const PASS = 'PASS';
export const WARN = 'WARN';
export const FAIL = 'FAIL';
export const SKIP = 'SKIP';

/**
 * @param {object} spec
 * @param {string} spec.id      stable check id, e.g. "V06"
 * @param {string} spec.title   one-line human description
 * @param {string} spec.ref     spec citation, e.g. "export-format §5 V6"
 * @param {'BLOCK'|'FIX'|'WARN'|'CONV'|'STEP'} spec.cls
 * @param {string[]} [spec.problems] one message per violation; empty = PASS
 * @param {string} [spec.detail] measured facts printed on the PASS line
 * @param {boolean} [spec.skipped]
 * @param {boolean} [spec.strictConventions]
 */
export function check({ id, title, ref, cls, problems = [], detail = '', skipped = false, strictConventions = false }) {
  const failing = problems.length > 0;
  let status;
  if (skipped) status = SKIP;
  else if (!failing) status = PASS;
  else if (cls === 'BLOCK' || cls === 'FIX') status = FAIL;
  else if (cls === 'CONV') status = strictConventions ? FAIL : WARN;
  else status = WARN;
  return Object.freeze({ id, title, ref, cls, status, problems: Object.freeze([...problems]), detail });
}

const COLORS = {
  PASS: '[32m',
  WARN: '[33m',
  FAIL: '[31m',
  SKIP: '[90m',
};
const RESET = '[0m';

function paint(status, useColor) {
  return useColor ? `${COLORS[status]}${status}${RESET}` : status;
}

/**
 * Render the human report.
 * @param {ReadonlyArray<object>} checks
 * @param {{ quiet?: boolean, color?: boolean, header?: string[] }} opts
 */
export function renderReport(checks, { quiet = false, color = false, header = [] } = {}) {
  const lines = [...header];
  const idWidth = Math.max(...checks.map((c) => c.id.length), 4);
  for (const c of checks) {
    if (quiet && c.status === PASS) continue;
    const detail = c.detail ? `  — ${c.detail}` : '';
    lines.push(`${paint(c.status, color)}  ${c.id.padEnd(idWidth)}  ${c.title}${detail}`);
    for (const p of c.problems) lines.push(`        ${c.status === FAIL ? '✗' : '!'} ${p}`);
  }
  const counts = tally(checks);
  lines.push('');
  lines.push(
    `${counts.FAIL > 0 ? 'GATE FAILED' : 'GATE PASSED'} — ` +
      `${counts.PASS} pass, ${counts.WARN} warn, ${counts.FAIL} fail, ${counts.SKIP} skip ` +
      `(${checks.length} checks)`,
  );
  return lines.join('\n');
}

export function tally(checks) {
  const counts = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 };
  for (const c of checks) counts[c.status] += 1;
  return counts;
}

export function failedIds(checks) {
  return checks.filter((c) => c.status === FAIL).map((c) => c.id);
}

export function warnedIds(checks) {
  return checks.filter((c) => c.status === WARN).map((c) => c.id);
}
