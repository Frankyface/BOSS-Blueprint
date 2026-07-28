/**
 * CLI argument parsing for the round-trip package gate.
 * Pure: takes argv, returns a frozen options object or throws UsageError.
 */

export class UsageError extends Error {}

const FLAGS_WITH_VALUE = new Set([
  '--package',
  '--spec',
  '--schema',
  '--scenario',
  '--internal-ids',
  '--out',
  '--max-zip-mb',
]);

const BOOLEAN_FLAGS = new Set([
  '--no-manifest',
  '--json',
  '--quiet',
  '--strict-conventions',
  '--help',
  '-h',
]);

export const USAGE = `
Usage: node gate.mjs --package <zip> [options]

Round-trip PACKAGE GATE — docs/roundtrip-protocol.md §2 steps 1-3.
Replays docs/export-format.md v2.4 §5 validator rules V1-V27 against a real zip.

Required:
  --package <zip>        the export package to gate

Options:
  --no-manifest          skip protocol §2 step 4 (expected-manifest diff, Stage 4 work).
                         Without it the step is still skipped but reported as a WARN.
  --scenario <file>      reserved for step 4; not implemented here (reports SKIP).
  --spec <file>          path to docs/export-format.md (schema is EXTRACTED from §2.2).
                         Default: <script>/../../docs/export-format.md
  --schema <file>        use this JSON Schema file instead of extracting from the spec.
  --internal-ids <file>  newline- or JSON-array-delimited list of the app's internal ids,
                         enabling the exact V24 leak scan (see README limitations).
  --out <dir>            write report.json (+ extracted-schema.json) here.
  --max-zip-mb <n>       V10 budget in MB (default 15).
  --strict-conventions   promote §1 file-convention WARNs to FAIL.
  --json                 print the machine report to stdout instead of the text table.
  --quiet                only print the summary line and any FAIL/WARN lines.
  -h, --help             this text.

Exit codes: 0 = pass (no FAIL), 1 = at least one FAIL, 2 = usage / IO error.
`.trim();

/**
 * @param {string[]} argv raw process.argv.slice(2)
 * @returns {Readonly<object>}
 */
export function parseArgs(argv) {
  const out = {
    packagePath: null,
    specPath: null,
    schemaPath: null,
    scenarioPath: null,
    internalIdsPath: null,
    outDir: null,
    maxZipMb: 15,
    noManifest: false,
    json: false,
    quiet: false,
    strictConventions: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (BOOLEAN_FLAGS.has(token)) {
      if (token === '--no-manifest') out.noManifest = true;
      else if (token === '--json') out.json = true;
      else if (token === '--quiet') out.quiet = true;
      else if (token === '--strict-conventions') out.strictConventions = true;
      else out.help = true;
      continue;
    }
    if (FLAGS_WITH_VALUE.has(token)) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) {
        throw new UsageError(`${token} requires a value`);
      }
      i += 1;
      if (token === '--package') out.packagePath = value;
      else if (token === '--spec') out.specPath = value;
      else if (token === '--schema') out.schemaPath = value;
      else if (token === '--scenario') out.scenarioPath = value;
      else if (token === '--internal-ids') out.internalIdsPath = value;
      else if (token === '--out') out.outDir = value;
      else if (token === '--max-zip-mb') {
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) throw new UsageError(`--max-zip-mb must be a positive number, got "${value}"`);
        out.maxZipMb = n;
      }
      continue;
    }
    throw new UsageError(`unknown argument "${token}"`);
  }

  if (!out.help && !out.packagePath) throw new UsageError('--package <zip> is required');
  return Object.freeze(out);
}
