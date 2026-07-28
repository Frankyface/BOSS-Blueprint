/**
 * Extract the JSON Schema from docs/export-format.md §2.2 so the SPEC stays the
 * single source of truth (export-format.md §2.2: "CI asserts the fenced block
 * below byte-matches the repo file").
 *
 * Also extracts the §7.1 worked-example site.json and the §7.2 brief.md, which the
 * self-test harness uses to build a synthetic minimal package.
 */

import { readFile } from 'node:fs/promises';

/**
 * The spec is authored with LF (§1's own file convention) but git `core.autocrlf=true`
 * hands us CRLF on Windows checkouts. Normalizing here keeps every extracted artifact —
 * schema bytes, §7.1, §7.2 — independent of the developer's git config; without it the
 * gate's verdict would depend on how the repo happened to be cloned.
 */
function normalizeEol(text) {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Find the line index of a heading, tolerant of trailing whitespace. */
function headingIndex(lines, heading) {
  const idx = lines.findIndex((l) => l.trimEnd() === heading);
  if (idx === -1) throw new Error(`heading not found in spec: ${heading}`);
  return idx;
}

/**
 * Read the first fenced block after `fromLine` whose opening fence info-string
 * matches `lang`. Handles fences of 3+ backticks (§7.2 uses a 4-backtick fence).
 */
function fencedBlockAfter(lines, fromLine, lang) {
  for (let i = fromLine; i < lines.length; i += 1) {
    const open = /^(`{3,})([a-zA-Z]*)\s*$/.exec(lines[i]);
    if (!open) continue;
    const [, ticks, info] = open;
    if (lang && info !== lang) continue;
    const closeRe = new RegExp(`^\`{${ticks.length},}\\s*$`);
    for (let j = i + 1; j < lines.length; j += 1) {
      if (closeRe.test(lines[j])) {
        return { body: lines.slice(i + 1, j).join('\n'), startLine: i + 1, endLine: j };
      }
    }
    throw new Error(`unterminated \`\`\` fence starting at spec line ${i + 1}`);
  }
  throw new Error(`no \`\`\`${lang} fence found after spec line ${fromLine + 1}`);
}

/**
 * @param {string} specText contents of docs/export-format.md
 * @returns {{ schemaText: string, schema: object }}
 */
export function extractSchema(specText) {
  const lines = normalizeEol(specText).split('\n');
  const start = headingIndex(lines, '### 2.2 JSON Schema (draft-07)');
  const { body } = fencedBlockAfter(lines, start, 'json');
  const schemaText = `${body}\n`;
  let schema;
  try {
    schema = JSON.parse(body);
  } catch (err) {
    throw new Error(`§2.2 fenced JSON block does not parse: ${err.message}`);
  }
  if (schema.$schema !== 'http://json-schema.org/draft-07/schema#') {
    throw new Error(`§2.2 block is not a draft-07 schema ($schema = ${schema.$schema})`);
  }
  return { schemaText, schema };
}

/** @returns {{ text: string, json: object }} the §7.1 worked-example site.json */
export function extractExampleSiteJson(specText) {
  const lines = normalizeEol(specText).split('\n');
  const start = headingIndex(lines, '### 7.1 `site.json`');
  const { body } = fencedBlockAfter(lines, start, 'json');
  return { text: `${body}\n`, json: JSON.parse(body) };
}

/** @returns {string} the §7.2 worked-example brief.md, verbatim */
export function extractExampleBrief(specText) {
  const lines = normalizeEol(specText).split('\n');
  const start = headingIndex(lines, '### 7.2 Generated `brief.md`');
  const { body } = fencedBlockAfter(lines, start, 'markdown');
  return `${body}\n`;
}

/**
 * Load the schema, preferring an explicit --schema file, else extracting from the spec.
 * @returns {Promise<{ schema: object, schemaText: string, source: string }>}
 */
export async function loadSchema({ schemaPath, specPath }) {
  if (schemaPath) {
    const schemaText = normalizeEol(await readFile(schemaPath, 'utf8'));
    return { schema: JSON.parse(schemaText), schemaText, source: `file ${schemaPath}` };
  }
  const specText = await readFile(specPath, 'utf8');
  const { schema, schemaText } = extractSchema(specText);
  return { schema, schemaText, source: `extracted from ${specPath} §2.2` };
}
