/**
 * ESCAPING, QUOTING AND NUMBER FORMATTING for `brief.md`.
 * `docs/export-format.md` §3.3 rules 7 and 8, §4.4 [N11].
 *
 * Every client-supplied string crosses this module before it reaches the brief.
 * That is the prompt-injection boundary as much as it is a Markdown one: rule 7's
 * escape set exists so client text can never form a bold token, fake a counted
 * `**WRITE THIS COPY**` marker, break the inventory table with a `|`, close a
 * guillemet quote early, or break out of a quoted `"filename"`.
 */

/** §3.3 rule 8 — CR/LF inside «…» render as this glyph so the quote stays on one line. */
export const NEWLINE_GLYPH = '↵'

/** §4.4 [N5]/[N7] — a referenced string is truncated to this many characters. */
export const TRUNCATE_CHARS = 40

/**
 * §3.3 rule 7 (v2.3) — characters that get a backslash wherever they appear.
 *
 * `\` is FIRST and is escaped in the same single pass, which is what makes the map
 * invertible: without it, `\«` is ambiguous between "escaped guillemet" and
 * "literal backslash then guillemet", and V7's reverse-the-escapes step has no
 * well-defined inverse. `"` joined the set in v2.3 so a filename cannot be broken
 * from inside (`"my \"best\" photo\|final.jpeg"`).
 */
const ESCAPED_CHARS = /[\\«»|*"`]/g

/** §3.3 rule 7 — a leading one of these would start a heading, a list or a quote. */
const LEADING_MARKDOWN = /^([#\->])/

/**
 * §3.3 rule 7 (v2.3) — a leading ordered-list marker escapes THE PERIOD: `1\.`.
 *
 * Not `\1.` — in CommonMark a backslash before a digit is a literal backslash and
 * escapes nothing, so the list marker would survive AND a stray `\` would ship.
 */
const LEADING_ORDERED_LIST = /^(\d+)\./

/**
 * §3.3 rule 7 — escape a client-supplied string before interpolation.
 *
 * Applies to businessName, tagline, about, styleNotes, page names, block text,
 * labels, descriptions, generateDescriptions, lengthHints and originalFilename.
 * Escaping happens everywhere the value appears; the «…» quoting is a separate,
 * narrower rule (§3.3 rule 7's scope-of-quoting paragraph).
 */
export function escapeClientText(raw: string): string {
  const escaped = raw.replace(ESCAPED_CHARS, (character) => `\\${character}`)
  const oneLine = escaped.replace(/\r\n|\r|\n/g, NEWLINE_GLYPH)

  if (LEADING_MARKDOWN.test(oneLine)) return oneLine.replace(LEADING_MARKDOWN, '\\$1')
  return oneLine.replace(LEADING_ORDERED_LIST, '$1\\.')
}

/** §3.3 rule 3 — copy and free prose are quoted with «…» guillemets. */
export function quote(raw: string): string {
  return `«${escapeClientText(raw)}»`
}

/**
 * §4.4 [N5]/[N7] — a referenced string, truncated to 40 chars with a trailing `…`.
 *
 * Truncate the RAW string, then escape (v2.3): escaping first could cut a `\«` pair
 * in half, and V7 reverses the escapes before comparing.
 */
export function quoteTruncated(raw: string): string {
  const truncated = raw.length > TRUNCATE_CHARS ? `${raw.slice(0, TRUNCATE_CHARS)}…` : raw
  return `«${escapeClientText(truncated)}»`
}

/** §3.3 rule 7 — the one non-guillemet quoting form: a filename in `"…"`. */
export function quoteFilename(raw: string): string {
  return `"${escapeClientText(raw)}"`
}

/** §4.4 [N11] — "coordinates and dimensions: as stored (integers stay integers, one decimal max)". */
export function num(value: number): string {
  if (Number.isInteger(value)) return String(value)
  return String(Math.round(value * 10) / 10)
}

/** The `(x, y, w, h)` tuple every block bullet carries — §3.3 rule 2's regex anchor. */
export function frameTuple(frame: { x: number; y: number; w: number; h: number }): string {
  return `(${num(frame.x)}, ${num(frame.y)}, ${num(frame.w)}, ${num(frame.h)})`
}

/** §4.4 [N11] — file sizes render as `~<round(bytes/1024)> KB`. */
export function kilobytes(bytes: number): string {
  return `~${String(Math.round(bytes / 1024))} KB`
}
