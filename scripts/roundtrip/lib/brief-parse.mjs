/**
 * brief.md parsing primitives for V7 / [N13].
 *
 * The two marker regexes are the v2.1 frame-tuple-anchored ones from
 * export-format.md §3.3 rule 2, copied character-for-character. A start-of-line
 * anchor alone matches nothing — the marker sits mid-bullet after the block type
 * and the (x, y, w, h) tuple — and a raw substring count would be inflatable by
 * client text and by the Definition-of-done boilerplate.
 */

export const WRITE_THIS_COPY_RE =
  /^\s*- \*\*(Heading|Text)\*\* [^(\n]*\((-?\d+(\.\d)?, ){3}-?\d+(\.\d)?\)[^\n]*?\*\*WRITE THIS COPY\*\* — client asks for: «/gm;

export const SOURCE_AN_IMAGE_RE =
  /^\s*- \*\*Image slot\*\* [^(\n]*\((-?\d+(\.\d)?, ){3}-?\d+(\.\d)?\)[^\n]*?\*\*SOURCE AN IMAGE\*\* — no upload; client wants: «/gm;

/** [N13] right-overflow marker, export-format.md §4.4 (one logical line in the emitted brief). */
export const N13_MARKER =
  ' (extends past the right page edge — clipped at x=1200 in the sketch PNG; site.json has the true width)';

/** Walkthrough block bullets — the only bullets that narrate a block (sections are group headers). */
export const WALKTHROUGH_BULLET_RE = /^[ \t]*- \*\*(Nav bar|Heading|Text|Button|Image slot)\*\*/gm;

/** Guillemet quote spans, honoring rule-7 backslash escaping so an escaped » cannot end a quote. */
export const QUOTE_RE = /«((?:\\[\s\S]|[^»\\])*)»/g;

/** Ids the brief may print (§3.3 rule 5 / V7). */
export const PRINTED_ID_RE = /\b(pg|blk|nav|stk|img)_[a-z0-9]{3,16}\b/g;

export function countMatches(text, re) {
  if (typeof text !== 'string') return 0;
  const rx = new RegExp(re.source, re.flags);
  let n = 0;
  while (rx.exec(text) !== null) n += 1;
  return n;
}

/** Split brief.md into `## ` sections; returns Map<title, body>. */
export function sections(text) {
  const out = new Map();
  if (typeof text !== 'string') return out;
  const lines = text.split('\n');
  let title = '(preamble)';
  let buf = [];
  for (const line of lines) {
    const m = /^## (.+?)\s*$/.exec(line);
    if (m) {
      out.set(title, buf.join('\n'));
      title = m[1];
      buf = [];
      continue;
    }
    buf.push(line);
  }
  out.set(title, buf.join('\n'));
  return out;
}

/** Find the section whose title starts with `prefix` (the copy-list title carries a count). */
export function sectionStartingWith(map, prefix) {
  for (const [title, body] of map) {
    if (title.startsWith(prefix)) return { title, body };
  }
  return null;
}

/**
 * §3.3 rule 7 (v2.4) escaping, forward direction.
 *   backslash-escape `\` FIRST (v2.3 — without it the map has no inverse), then
 *   « » | * " and backtick; prefix a leading # - > with `\`; a leading ordered-list
 *   marker escapes the PERIOD (`1\.`), because a backslash before a digit is a
 *   literal backslash in CommonMark and escapes nothing (v2.3).
 */
export function escapeClientText(s) {
  const escaped = String(s ?? '').replace(/[\\«»|*"`]/g, (c) => `\\${c}`);
  if (/^[#\->]/.test(escaped)) return `\\${escaped}`;
  return escaped.replace(/^(\d+)\./, '$1\\.');
}

/**
 * Reverse §3.3 rule 7 escaping (v2.4).
 *
 * Because rule 7 escapes `\` first, every backslash in an emitted client string is an
 * escape introducer, so the exact inverse is "drop each backslash and take the next
 * character literally" — one left-to-right pass. This is precisely the invertibility
 * property v2.3 added `\` to the escape set to guarantee, and it covers the
 * anywhere-escaped set, the leading-punctuation prefixes, and the `1\.` period form
 * without needing to know which produced a given pair.
 */
export function unescapeClientText(s) {
  return String(s).replace(/\\([\s\S])/g, '$1');
}

/** §3.3 rule 8: CR/LF render as ↵ inside «…». */
export function newlineGlyph(s) {
  return String(s).replace(/\r\n|\r|\n/g, '↵');
}

/** V7 comparison is whitespace-normalized. */
export function normalizeWs(s) {
  return String(s).replace(/\s+/g, ' ').trim();
}

/** [N5]/[N7] truncation: 40 chars + the ellipsis character. */
export function truncate40(s) {
  const str = String(s);
  return str.length > 40 ? `${str.slice(0, 40)}…` : str;
}

/** [N11] number rendering: integers stay integers, one decimal max. */
export function fmtNum(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return String(n);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10);
}

export function frameTuple(frame) {
  return `(${fmtNum(frame.x)}, ${fmtNum(frame.y)}, ${fmtNum(frame.w)}, ${fmtNum(frame.h)})`;
}
