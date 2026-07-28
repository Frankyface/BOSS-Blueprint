#!/usr/bin/env node
/**
 * BOSS Blueprint — round-trip PACKAGE GATE.
 *
 *   node scripts/roundtrip/gate.mjs --package <zip> [--no-manifest]
 *
 * Implements docs/roundtrip-protocol.md §2 steps 1-3 against a real export zip:
 *   1. filename convention + EXACT §1 zip entry layout
 *   2. ajv (draft-07 + formats) validation of site.json against the schema
 *      EXTRACTED FROM docs/export-format.md §2.2 — the spec stays source of truth
 *   3. an external replay of every machine-checkable §5 validator rule V1-V26
 *
 * This gate imports NO app code: it re-derives everything from the spec and the
 * package, so it can fail a package the app's own validator would have passed.
 *
 * Exit 0 = pass (no FAIL lines). Nonzero = at least one FAIL. 2 = usage/IO error.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, UsageError, USAGE } from './lib/args.mjs';
import { loadPackage } from './lib/package-load.mjs';
import { loadSchema } from './lib/schema-extract.mjs';
import { runAllChecks } from './lib/rules/index.mjs';
import { renderReport, tally, failedIds, warnedIds } from './lib/report.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Drop-in location is <repo>/scripts/roundtrip/, so the spec is two levels up. */
const DEFAULT_SPEC = path.resolve(HERE, '..', '..', 'docs', 'export-format.md');

export async function runGate(argvOptions) {
  const options = argvOptions;
  const specPath = options.specPath ?? DEFAULT_SPEC;

  const { schema, schemaText, source } = await loadSchema({ schemaPath: options.schemaPath, specPath });
  const pkg = await loadPackage(options.packagePath);
  const internalIds = await loadInternalIds(options.internalIdsPath);

  const checks = runAllChecks(pkg, { schema, options, internalIds });

  const header = [
    `package : ${pkg.basename} (${(pkg.zipBytes / 1024).toFixed(1)} KB, ${pkg.entryNames.length} entries)`,
    `schema  : ${source}`,
    `steps   : protocol §2.1 layout · §2.2 ajv · §2.3 validator replay V1-V26` +
      `${options.noManifest ? ' · §2.4 skipped (--no-manifest)' : ''}`,
    '',
  ];

  return { pkg, checks, header, schemaText, schemaSource: source };
}

async function loadInternalIds(file) {
  if (!file) return null;
  const text = await readFile(file, 'utf8');
  const trimmed = text.trim();
  if (trimmed.startsWith('[')) return JSON.parse(trimmed).map(String);
  return trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof UsageError) {
      process.stderr.write(`gate: ${err.message}\n\n${USAGE}\n`);
      process.exit(2);
    }
    throw err;
  }

  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    process.exit(0);
  }

  let result;
  try {
    result = await runGate(options);
  } catch (err) {
    process.stderr.write(`gate: ${err.message}\n`);
    process.exit(2);
  }

  const { checks, header, schemaText, schemaSource } = result;
  const counts = tally(checks);
  const exitCode = counts.FAIL > 0 ? 1 : 0;

  const machine = {
    package: options.packagePath,
    schemaSource,
    passed: exitCode === 0,
    counts,
    failed: failedIds(checks),
    warned: warnedIds(checks),
    checks: checks.map((c) => ({ ...c, problems: [...c.problems] })),
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(machine, null, 2)}\n`);
  } else {
    process.stdout.write(
      `${renderReport(checks, { quiet: options.quiet, color: process.stdout.isTTY === true, header })}\n`,
    );
  }

  if (options.outDir) {
    await mkdir(options.outDir, { recursive: true });
    await writeFile(path.join(options.outDir, 'report.json'), `${JSON.stringify(machine, null, 2)}\n`, 'utf8');
    await writeFile(path.join(options.outDir, 'extracted-schema.json'), schemaText, 'utf8');
  }

  process.exit(exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
