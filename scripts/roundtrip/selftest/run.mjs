#!/usr/bin/env node
/**
 * Self-test harness.
 *
 *   node selftest/run.mjs [--spec <docs/export-format.md>] [--keep]
 *
 * 1. GREEN — build the synthetic minimal package from the spec's §7.1/§7.2 worked
 *    example (PNGs generated at the right dimensions, JPEG padded to the manifest's
 *    exact byte count) and assert the gate exits 0 with no FAIL.
 * 2. RED — apply every mutation in mutations.mjs and assert the gate fails (or
 *    warns) naming the RIGHT check.
 *
 * Exits 0 only when every expectation holds. Prints the red-path table for the README.
 */

import { spawnSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFixtureParts, writeZip } from './build-fixture.mjs';
import { MUTATIONS } from './mutations.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const GATE = path.join(ROOT, 'gate.mjs');
const DEFAULT_SPEC = path.resolve(
  process.env.BLUEPRINT_SPEC ?? 'C:/Users/Cam/Documents/.ClaudeCode Projects/BOSS-Blueprint/docs/export-format.md',
);

function runGate(zipPath, specPath, extraArgs = []) {
  const res = spawnSync(
    process.execPath,
    [GATE, '--package', zipPath, '--spec', specPath, '--no-manifest', '--json', ...extraArgs],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  if (res.error) throw res.error;
  let report = null;
  try {
    report = JSON.parse(res.stdout);
  } catch {
    throw new Error(`gate did not emit JSON (exit ${res.status}):\n${res.stdout}\n${res.stderr}`);
  }
  return { exitCode: res.status, report };
}

async function main() {
  const args = process.argv.slice(2);
  const specIdx = args.indexOf('--spec');
  const specPath = specIdx >= 0 ? args[specIdx + 1] : DEFAULT_SPEC;
  const keep = args.includes('--keep');
  const work = path.join(ROOT, '.selftest');

  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });

  const green = await buildFixtureParts(specPath);
  const greenZip = path.join(work, green.filename);
  await writeZip(greenZip, green.files, green.order);

  const lines = [];
  let failures = 0;

  // ---- GREEN -------------------------------------------------------------
  const greenRun = runGate(greenZip, specPath);
  const greenOk = greenRun.exitCode === 0 && greenRun.report.counts.FAIL === 0;
  if (!greenOk) failures += 1;
  lines.push('=== GREEN PATH ===');
  lines.push(
    `${greenOk ? 'OK  ' : 'BAD '} synthetic §7.1/§7.2 package: exit ${greenRun.exitCode}, ` +
      `${greenRun.report.counts.PASS} pass / ${greenRun.report.counts.WARN} warn / ` +
      `${greenRun.report.counts.FAIL} fail / ${greenRun.report.counts.SKIP} skip`,
  );
  if (greenRun.report.warned.length > 0) lines.push(`     warns: ${greenRun.report.warned.join(', ')}`);
  if (greenRun.report.failed.length > 0) lines.push(`     UNEXPECTED FAILS: ${greenRun.report.failed.join(', ')}`);
  lines.push('');

  // ---- RED ---------------------------------------------------------------
  lines.push('=== RED PATH ===');
  const rows = [];
  for (const mutation of MUTATIONS) {
    const parts = mutation.apply(green);
    // Each mutation gets its own directory so the zip keeps its own basename —
    // otherwise every red run would also trip the F01 filename check.
    const zipDir = path.join(work, mutation.name);
    await mkdir(zipDir, { recursive: true });
    const zipPath = path.join(zipDir, parts.filename);
    await writeZip(zipPath, parts.files, parts.order);

    const extra = [];
    if (mutation.gateArgs) {
      const idsFile = path.join(work, `${mutation.name}-internal-ids.json`);
      await writeFile(idsFile, JSON.stringify(mutation.internalIds ?? []), 'utf8');
      for (const a of mutation.gateArgs) extra.push(a === 'INTERNAL_IDS_FILE' ? idsFile : a);
    }

    const { exitCode, report } = runGate(zipPath, specPath, extra);
    const wantStatus = mutation.expectStatus ?? 'FAIL';
    // 'PASS' is a NEGATIVE expectation: the named check must stay clean (neither FAIL
    // nor WARN) — used to prove an exemption really exempts, not merely that a rule fires.
    const named =
      wantStatus === 'FAIL' ? report.failed : wantStatus === 'WARN' ? report.warned : [];
    const caught =
      wantStatus === 'PASS'
        ? !report.failed.includes(mutation.expect) && !report.warned.includes(mutation.expect)
        : named.includes(mutation.expect);
    const exitOk = wantStatus === 'FAIL' ? exitCode !== 0 : exitCode === 0;
    const alsoWarnOk = mutation.alsoWarn ? report.warned.includes(mutation.alsoWarn) : true;
    const ok = caught && exitOk && alsoWarnOk;
    if (!ok) failures += 1;

    const others = (wantStatus === 'FAIL' ? report.failed : report.failed).filter((id) => id !== mutation.expect);
    rows.push({
      ok,
      name: mutation.name,
      what: mutation.what,
      expect: `${mutation.expect}${mutation.alsoWarn ? ` + ${mutation.alsoWarn} warn` : ''}`,
      status: wantStatus,
      exitCode,
      caught,
      also: others,
    });
  }

  const w = (s, n) => String(s).padEnd(n);
  lines.push(
    `${w('', 4)}${w('mutation', 30)}${w('expects', 20)}${w('exit', 6)}${w('caught', 8)}also failed`,
  );
  for (const r of rows) {
    lines.push(
      `${w(r.ok ? 'OK  ' : 'BAD ', 4)}${w(r.name, 30)}${w(`${r.expect} ${r.status}`, 20)}${w(r.exitCode, 6)}` +
        `${w(r.caught ? 'yes' : 'NO', 8)}${r.also.length ? r.also.join(', ') : '—'}`,
    );
  }

  lines.push('');
  lines.push(
    failures === 0
      ? `SELF-TEST PASSED — green package clean, ${rows.length}/${rows.length} mutations caught by the right check`
      : `SELF-TEST FAILED — ${failures} expectation(s) unmet`,
  );

  process.stdout.write(`${lines.join('\n')}\n`);

  await writeFile(path.join(ROOT, 'selftest-results.txt'), `${lines.join('\n')}\n`, 'utf8');
  if (!keep) await rm(work, { recursive: true, force: true });
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`selftest: ${err.stack ?? err.message}\n`);
  process.exit(2);
});
