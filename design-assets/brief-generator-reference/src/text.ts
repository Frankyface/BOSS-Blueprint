/**
 * Escaping, quoting and number formatting.
 * docs/export-format.md §3.3 rules 7 & 8, §4.4 [N11].
 */

/** §3.3 rule 8 — CR/LF inside «…» render as this glyph so the quote stays on one line. */
export const NEWLINE_GLYPH = '↵'; // ↵

/** §4.4 [N5]/[N7] — referenced client text is truncated to this many characters. */
export const TRUNCATE_CHARS = 40;

/** §3.3 rule 7 — characters that get a backslash wherever they appear. */
const ESCAPED_CHARS = /[«»|*`]/g;

/** §3.3 rule 7 — a leading one of these gets a `\` prefix. */
const LEADING_MARKDOWN = /^[#\->]/;

/**
 * §3.3 rule 7 — "digit-followed-by-period".
 *
 * SPEC DEFECT D6 (see README): the rule says *prefix* with `\`, which yields
 * `\1.` — in CommonMark a backslash before a digit is a literal backslash and
 * escapes nothing, so the ordered-list marker survives AND a stray `\` ships.
 * Implemented literally here (spec is normative); recommended v2.3 fix is to
 * escape the period instead (`1\.`). Byte-neutral on the §7.1 fixture.
 */
const LEADING_ORDERED_LIST = /^\d+\./;

/**
 * §3.3 rule 7 + rule 8 — escape a client-supplied string before interpolation.
 *
 * Applies to: businessName, tagline, about, styleNotes, page names, block text,
 * labels, descriptions, generateDescriptions, lengthHints, originalFilename.
 *
 * SPEC DEFECT D5 (see README): rule 7 does not list `\` itself, so a
 * client-typed backslash is emitted raw and V7's "reverse the rule-7 escapes"
 * step becomes ambiguous. Implemented per the literal rule (no `\` escaping).
 */
export function escapeClientText(raw: string): string {
  let s = raw.replace(ESCAPED_CHARS, (c) => `\\${c}`);
  s = s.replace(/\r\n|\r|\n/g, NEWLINE_GLYPH);
  if (LEADING_MARKDOWN.test(s) || LEADING_ORDERED_LIST.test(s)) s = `\\${s}`;
  return s;
}

/** §3.3 rule 3 — client text is quoted with «…» guillemets. */
export function quote(raw: string): string {
  return `«${escapeClientText(raw)}»`;
}

/** §4.4 [N5]/[N7] — escaped and truncated to 40 chars; truncation appends `…` (§5 V7). */
export function quoteTruncated(raw: string): string {
  const truncated =
    raw.length > TRUNCATE_CHARS ? `${raw.slice(0, TRUNCATE_CHARS)}…` : raw;
  // Truncate BEFORE escaping so a backslash-escape pair can never be split in
  // half (V7 reverses the escapes before comparing) — see README D7.
  const escaped = escapeClientText(truncated);
  return `«${escaped}»`;
}

/** §3.3 rule 7 — the only non-guillemet quoting form: a filename in "…". */
export function quoteFilename(raw: string): string {
  return `"${escapeClientText(raw)}"`;
}

/**
 * §4.4 [N11] — "Coordinates and dimensions: as stored (integers stay integers,
 * one decimal max)".
 */
export function num(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 10) / 10);
}

/** The `(x, y, w, h)` tuple every block bullet carries (§3.2, §3.3 rule 2 anchor). */
export function frameTuple(f: { x: number; y: number; w: number; h: number }): string {
  return `(${num(f.x)}, ${num(f.y)}, ${num(f.w)}, ${num(f.h)})`;
}

/** §4.4 [N11] — file sizes render as `~<round(bytes/1024)> KB`. */
export function kilobytes(bytes: number): string {
  return `~${Math.round(bytes / 1024)} KB`;
}
