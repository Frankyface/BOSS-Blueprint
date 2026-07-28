#!/usr/bin/env node
/**
 * Extract the draft-07 JSON Schema from docs/export-format.md §2.2.
 *
 *   node scripts/roundtrip/extract-schema.mjs [--spec <md>] [--out <json>] [--check <json>]
 *
 * The gate calls the same extractor in-process, so the SPEC is the single source
 * of truth and this script never has to be run for the gate to work. It exists for
 * three jobs:
 *   --out    materialise the schema (e.g. to seed src/export/schema/site.v1.schema.json)
 *   --check  assert an existing schema file byte-matches §2.2 — this is Appendix A
 *            equality test A, runnable from CI without the app's test runner
 *   (neither) print the schema to stdout
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSchema } from './lib/schema-extract.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_SPEC = path.resolve(HERE, '..', '..', 'docs', 'export-format.md');

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback;
}

async function main() {
  const specPath = arg('--spec', DEFAULT_SPEC);
  const outPath = arg('--out');
  const checkPath = arg('--check');

  const specText = await readFile(specPath, 'utf8');
  const { schemaText, schema } = extractSchema(specText);

  if (checkPath) {
    const onDisk = await readFile(checkPath, 'utf8');
    if (onDisk === schemaText) {
      process.stdout.write(`OK  ${checkPath} byte-matches ${path.basename(specPath)} §2.2 (${schemaText.length} B)\n`);
      process.exit(0);
    }
    process.stderr.write(
      `DRIFT  ${checkPath} does not byte-match ${path.basename(specPath)} §2.2\n` +
        `       spec block ${schemaText.length} B, file ${onDisk.length} B\n`,
    );
    process.exit(1);
  }

  if (outPath) {
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, schemaText, 'utf8');
    process.stdout.write(`wrote ${outPath} (${schemaText.length} B, title: ${schema.title})\n`);
    process.exit(0);
  }

  process.stdout.write(schemaText);
}

main().catch((err) => {
  process.stderr.write(`extract-schema: ${err.message}\n`);
  process.exit(2);
});
