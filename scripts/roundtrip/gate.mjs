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
 *   3. an external replay of every machine-checkable §5 validator rule V1-V27
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
import { loadSchema, extractExampleSiteJson } from './lib/schema-extract.mjs';
import { deriveCanonicalOrder } from './lib/key-order.mjs';
import { runAllChecks } from './lib/rules/index.mjs';
import { renderReport, tally, failedIds, warnedIds } from './lib/report.mjs';
import { loadScenario } from './scenario-load.mjs';
import { diffManifest } from './manifest-diff.mjs';
import { POSITION_TOLERANCE_PX } from './thresholds.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Drop-in location is <repo>/scripts/roundtrip/, so the spec is two levels up. */
const DEFAULT_SPEC = path.resolve(HERE, '..', '..', 'docs', 'export-format.md');
const REPO_ROOT = path.resolve(HERE, '..', '..');

export async function runGate(argvOptions) {
  const options = argvOptions;
  const specPath = options.specPath ?? DEFAULT_SPEC;

  const { schema, schemaText, source } = await loadSchema({ schemaPath: options.schemaPath, specPath });
  const canonical = await loadCanonicalOrder(specPath);
  const pkg = await loadPackage(options.packagePath);
  const internalIds = await loadInternalIds(options.internalIdsPath);
  const manifest = await runManifestStep(options, pkg);

  const checks = runAllChecks(pkg, { schema, options, internalIds, canonical, manifest });

  const header = [
    `package : ${pkg.basename} (${(pkg.zipBytes / 1024).toFixed(1)} KB, ${pkg.entryNames.length} entries)`,
    `schema  : ${source}`,
    `steps   : protocol §2.1 layout · §2.2 ajv · §2.3 validator replay V1-V27` +
      `${options.noManifest ? ' · §2.4 skipped (--no-manifest)' : ''}` +
      `${manifest ? ` · §2.4 manifest diff vs scenario ${manifest.scenarioId}` : ''}`,
    '',
  ];

  return { pkg, checks, header, schemaText, schemaSource: source, manifest };
}

/**
 * Protocol §2 step 4. The scenario is schema-validated first (R1.4): an invalid
 * scenario is an INFRA fault in the harness, not a product FAIL, so it exits 2 rather
 * than producing a verdict nobody should trust.
 */
async function runManifestStep(options, pkg) {
  if (options.noManifest || !options.scenarioPath) return null;
  const scenario = await loadScenario(options.scenarioPath);
  if (pkg.site === null) {
    return {
      scenarioId: scenario.id,
      tolerancePx: POSITION_TOLERANCE_PX,
      matched: [],
      notes: [],
      problems: ['site.json is missing or unparseable — the manifest diff cannot run'],
    };
  }
  const result = await diffManifest({ site: pkg.site, scenario, repoRoot: REPO_ROOT });
  return { scenarioId: scenario.id, tolerancePx: POSITION_TOLERANCE_PX, ...result };
}

/**
 * V27's canon is the §7.1 fixture (§2.1: "§7.1 is the canon"). It is derived, never
 * hardcoded. If the spec cannot be read (e.g. only --schema was supplied), V27 SKIPs
 * rather than guessing an order.
 */
async function loadCanonicalOrder(specPath) {
  try {
    const specText = await readFile(specPath, 'utf8');
    return deriveCanonicalOrder(extractExampleSiteJson(specText).json);
  } catch {
    return null;
  }
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

  const { checks, header, schemaText, schemaSource, manifest } = result;
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

  /**
   * The Stage 4 dependency contract's machine output
   * (`feature-roundtrip-harness.md`, "Dependency contract on gate.mjs"):
   * `{ ok, steps: [{ id, ok, detail }], failures: [{ code, message, path }] }`.
   * Derived from the same checks as `report.json`, never a second source of truth —
   * `report.json` keeps Stage 3's richer shape unchanged.
   */
  const gateReport = {
    ok: exitCode === 0,
    steps: checks.map((c) => ({ id: c.id, ok: c.status !== 'FAIL', detail: c.detail || c.title })),
    failures: checks
      .filter((c) => c.status === 'FAIL')
      .flatMap((c) => c.problems.map((message) => ({ code: c.id, message, path: options.packagePath }))),
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
    await writeFile(path.join(options.outDir, 'gate-report.json'), `${JSON.stringify(gateReport, null, 2)}\n`, 'utf8');
    await writeFile(path.join(options.outDir, 'extracted-schema.json'), schemaText, 'utf8');
    if (manifest) {
      await writeFile(
        path.join(options.outDir, 'manifest-diff.json'),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8',
      );
    }
  }

  process.exit(exitCode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
