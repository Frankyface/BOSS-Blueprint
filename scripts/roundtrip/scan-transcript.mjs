/**
 * SEG-4 — zero-clarifying-questions detection (hard gate H2) + completion
 * cross-check (H3/H8) + BUILD_NOTES triage.
 *
 * `feature-roundtrip-harness.md` R5 is binding, and every rule here is code with a
 * unit test — none of it is judgment at run time (R10.2). The rule SETS live in
 * `thresholds.mjs` as data, not spelled inline here, precisely because ruling 6
 * changed one of them: a rule set that lives in one hash-tested constant cannot be
 * quietly edited between runs.
 *
 * Nothing in this module ever "waves through" a hit. R5.5: every rule-2 hit is an
 * auto-FAIL for the verdict, and the only permitted fix is a committed rule change
 * plus a corpus entry plus a full rerun.
 */

import { readFile } from 'node:fs/promises';

import {
  BUILD_SENTINEL,
  CHOICE_VERB_RE,
  FIRST_PERSON_OFFER_RE,
  FRICTION_PER_PAGE,
  INTERROGATIVE_LEAD_RE,
  PACKAGE_DEFECT_RE,
  PERMISSION_DENIAL_RE,
  QUESTION_PHRASES,
  QUOTE_SPAN_CAP,
  USER_INPUT_TOOLS,
  USER_INPUT_TOOL_PREDICATE,
} from './thresholds.mjs';

/** Thrown for R5.1's "a malformed line is an INFRA failure, never a skipped line". */
export class TranscriptInfraError extends Error {
  constructor(message, { line } = {}) {
    super(message);
    this.name = 'TranscriptInfraError';
    this.line = line ?? null;
  }
}

/* ═══════════════════════════ R5.1 · parsing ═══════════════════════════════ */

/**
 * Parse `transcript.jsonl` line by line. A malformed line throws — silently skipping
 * one is how a question hides.
 *
 * @param {string} text raw file contents
 * @returns {object[]} the events, in order
 */
export function parseTranscript(text) {
  const events = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    if (raw.trim() === '') continue;
    try {
      events.push(JSON.parse(raw));
    } catch (err) {
      throw new TranscriptInfraError(
        `transcript.jsonl line ${i + 1} is not valid JSON: ${err.message}`,
        { line: i + 1 },
      );
    }
  }
  return events;
}

/** Content items of an event, tolerating both `{content}` and `{message:{content}}`. */
function contentOf(event) {
  const c = event?.message?.content ?? event?.content;
  return Array.isArray(c) ? c : [];
}

/** R5.1 · every `tool_use` item across every `type: "assistant"` event. */
export function collectToolUses(events) {
  const uses = [];
  for (const event of events) {
    if (event?.type !== 'assistant') continue;
    for (const item of contentOf(event)) {
      if (item?.type === 'tool_use') uses.push(item);
    }
  }
  return uses;
}

/**
 * R5.1 · the final message the builder addressed to the user.
 *
 * The terminal `result` event when it succeeded; otherwise the text parts of the LAST
 * assistant event. `null` when neither exists — H2 is then unevaluable and the caller
 * must fail H3 as INCOMPLETE with an INFRA note.
 */
export function extractFinalText(events) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.type === 'result' && event?.subtype === 'success' && typeof event.result === 'string') {
      return event.result;
    }
  }
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event?.type !== 'assistant') continue;
    const text = contentOf(event)
      .filter((item) => item?.type === 'text' && typeof item.text === 'string')
      .map((item) => item.text)
      .join('\n');
    if (text.trim() !== '') return text;
  }
  return null;
}

/** The `result` event, whatever its subtype — R5.4 needs `error_max_turns`. */
export function terminalResult(events) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i]?.type === 'result') return events[i];
  }
  return null;
}

/* ═══════════════════════ R5.2 · rule 1, tool level ════════════════════════ */

/** Any tool_use whose NAME is a user-input tool fails H2 immediately. */
export function scanToolUses(toolUses) {
  const hits = [];
  for (const use of toolUses) {
    const name = typeof use?.name === 'string' ? use.name : '';
    if (USER_INPUT_TOOLS.includes(name)) {
      hits.push({ rule: 'R5.2', tool: name, reason: 'named user-input tool' });
    } else if (USER_INPUT_TOOL_PREDICATE.test(name)) {
      hits.push({ rule: 'R5.2', tool: name, reason: 'matches the user-input tool predicate' });
    }
  }
  return hits;
}

/* ═══════════════ R5.3 · rule 2, final-message scan (exact order) ══════════ */

const FENCE_RE = /^[ \t]*(```|~~~)[\s\S]*?^[ \t]*\1[ \t]*$/gm;
const INLINE_CODE_RE = /`[^`\n]*`/g;
const GUILLEMET_RE = /«[^»]*»/g;
const STRAIGHT_QUOTE_RE = new RegExp(`"[^"\\n]{0,${QUOTE_SPAN_CAP}}"`, 'g');
const CURLY_QUOTE_RE = new RegExp(`“[^”\\n]{0,${QUOTE_SPAN_CAP}}”`, 'g');

/**
 * Steps 1–4 of R5.3, in that exact order. Blanking (rather than deleting) keeps every
 * surviving character at its original index, so the offsets reported in
 * `scan-report.json` point into the text a human will actually read.
 */
export function stripForScan(finalText) {
  const normalised = finalText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  let out = normalised;
  for (const re of [FENCE_RE, INLINE_CODE_RE, GUILLEMET_RE, STRAIGHT_QUOTE_RE, CURLY_QUOTE_RE]) {
    out = out.replace(re, (match) => match.replace(/[^\n]/g, ' '));
  }
  return out;
}

/**
 * R5.3 step 5 · split on `\n` first, then each line on `(?<=[.!?])\s+`.
 * @returns {{ text: string, offset: number }[]}
 */
export function candidateSentences(stripped) {
  const out = [];
  let lineStart = 0;
  for (const line of stripped.split('\n')) {
    let cursor = 0;
    for (const piece of line.split(/(?<=[.!?])\s+/)) {
      const at = line.indexOf(piece, cursor);
      const start = at === -1 ? cursor : at;
      cursor = start + piece.length;
      const trimmed = piece.trim();
      if (trimmed !== '') {
        out.push({ text: trimmed, offset: lineStart + start + piece.indexOf(trimmed) });
      }
    }
    lineStart += line.length + 1;
  }
  return out;
}

/** R5.3 2a · trailing decoration is stripped before the `?` test. */
function endsInQuestionMark(sentence) {
  return /\?$/.test(sentence.replace(/[*_)\]"\s]+$/, ''));
}

/** R5.3 · returns every rule-2 hit, each with its sentence, rule id and char offset. */
export function scanFinalText(finalText) {
  const stripped = stripForScan(finalText);
  const hits = [];
  for (const { text, offset } of candidateSentences(stripped)) {
    if (endsInQuestionMark(text)) {
      if (INTERROGATIVE_LEAD_RE.test(text)) {
        hits.push({ rule: 'R5.3-2a-lead', sentence: text, offset });
        continue;
      }
      if (CHOICE_VERB_RE.test(text)) {
        hits.push({ rule: 'R5.3-2a-reverse', sentence: text, offset });
        continue;
      }
      // Clause 3 — an offer about the builder itself, which needs no `you` at all.
      if (FIRST_PERSON_OFFER_RE.test(text)) {
        hits.push({ rule: 'R5.3-2a-offer', sentence: text, offset });
        continue;
      }
    }
    const phrase = QUESTION_PHRASES.find((re) => re.test(text));
    if (phrase) {
      hits.push({ rule: `R5.3-2b:${phrase.source}`, sentence: text, offset });
    }
  }
  return { stripped, hits };
}

/* ═══════════════ R5.6 · permission-denial detection (harness-protective) ══ */

/** Flatten a tool_result's content to a string, whatever shape it arrived in. */
function toolResultText(item) {
  const c = item?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.map((part) => (typeof part === 'string' ? part : (part?.text ?? ''))).join('\n');
  }
  return typeof item?.text === 'string' ? item.text : '';
}

/**
 * A builder forced to ask because a tool was blocked is measuring the harness, not the
 * package — so this count is what routes an H2 FAIL to `harness` instead of `product`.
 */
export function scanPermissionDenials(events) {
  const denials = [];
  for (const event of events) {
    if (event?.type !== 'user') continue;
    for (const item of contentOf(event)) {
      if (item?.type !== 'tool_result' || item?.is_error !== true) continue;
      const text = toolResultText(item);
      if (PERMISSION_DENIAL_RE.test(text)) {
        denials.push({ toolUseId: item.tool_use_id ?? null, excerpt: text.slice(0, 200) });
      }
    }
  }
  return denials;
}

/* ═══════════════════════ R5.7 · BUILD_NOTES triage ═══════════════════════ */

/**
 * Entries are markdown bullets or non-heading paragraphs. Package-defect candidates do
 * NOT fail H2 — the builder judged instead of asking, which is the designed behaviour —
 * but each one enters the routing table as a potential format defect.
 */
export function triageBuildNotes(notesText, pageCount) {
  const entries = [];
  for (const raw of (notesText ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const bullet = line.replace(/^([-*+]|\d+\.)\s+/, '');
    if (bullet.length < 3) continue;
    entries.push(bullet);
  }
  const defectCandidates = entries.filter((e) => PACKAGE_DEFECT_RE.test(e));
  const friction = pageCount > 0 && entries.length > FRICTION_PER_PAGE * pageCount;
  return { entryCount: entries.length, entries, defectCandidates, friction };
}

/* ═══════════════════════ the segment-level scan ══════════════════════════ */

/**
 * @param {object} input
 * @param {string} input.transcriptText
 * @param {string|null} input.buildNotesText
 * @param {boolean} input.indexHtmlExists
 * @param {boolean} input.buildNotesExists
 * @param {number} input.pageCount
 * @returns {object} the `scan-report.json` payload
 */
export function scanSegment({
  transcriptText,
  buildNotesText = null,
  indexHtmlExists = false,
  buildNotesExists = false,
  pageCount = 0,
}) {
  const events = parseTranscript(transcriptText);
  const toolUses = collectToolUses(events);
  const finalText = extractFinalText(events);
  const result = terminalResult(events);
  const denials = scanPermissionDenials(events);

  const toolHits = scanToolUses(toolUses);
  const textScan = finalText === null ? { hits: [] } : scanFinalText(finalText);
  const hits = [...toolHits, ...textScan.hits];

  const finalNonEmptyLine = finalText === null
    ? null
    : (finalText.replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean).pop() ?? null);

  const sentinelPresent = finalNonEmptyLine === BUILD_SENTINEL;
  const maxTurns = result?.subtype === 'error_max_turns';

  const h2 = { ok: hits.length === 0 && finalText !== null, hits, evaluable: finalText !== null };
  const h8 = { ok: buildNotesExists };
  const h3 = {
    ok: sentinelPresent && indexHtmlExists && buildNotesExists && !maxTurns,
    sentinelPresent,
    indexHtmlExists,
    buildNotesExists,
    maxTurns,
    unevaluableFinalText: finalText === null,
  };

  // R5.6 — an H2 failure WITH a denial is the harness's fault, never the product's.
  const routing = !h2.ok && denials.length >= 1 ? 'harness' : (!h2.ok ? 'product' : null);

  return {
    h2,
    h3,
    h8,
    routing,
    finalText,
    finalNonEmptyLine,
    toolUseNames: toolUses.map((u) => u?.name ?? null),
    permissionDenials: denials,
    permissionDenialWarn: h2.ok && denials.length >= 1,
    buildNotes: triageBuildNotes(buildNotesText, pageCount),
    eventCount: events.length,
  };
}

/** Convenience wrapper for `run.mjs`: read the files, scan, return the report. */
export async function scanFiles({ transcriptPath, buildNotesPath, indexHtmlExists, pageCount }) {
  const transcriptText = await readFile(transcriptPath, 'utf8');
  let buildNotesText = null;
  let buildNotesExists = false;
  try {
    buildNotesText = await readFile(buildNotesPath, 'utf8');
    buildNotesExists = true;
  } catch {
    buildNotesExists = false;
  }
  return scanSegment({
    transcriptText,
    buildNotesText,
    indexHtmlExists,
    buildNotesExists,
    pageCount,
  });
}
