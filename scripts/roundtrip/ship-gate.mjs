#!/usr/bin/env node
/**
 * R9.4 — the STAGE DoD CHECKER. It validates three clean runs **as a set**, which is a
 * different question from "did each run pass": three PASSes from three different commits,
 * or with a rule file edited between them, prove nothing about any single build.
 *
 *   node scripts/roundtrip/ship-gate.mjs [<runDir> <runDir> <runDir>]
 *
 * With no arguments it finds the three most recent scored runs under the run root.
 * Exit 0 ⇔ the stage DoD's round-trip criterion is met.
 */

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHIP_GATE_LEGS } from './thresholds.mjs';
import { runsRoot } from './sandbox.mjs';

/** A run that aborted as PRECONDITION or INFRA is not a verdict, so it is not a candidate. */
function isScored(manifest) {
  return typeof manifest?.verdict === 'string' && !manifest.error;
}

export async function loadRuns(dirs) {
  const runs = [];
  for (const dir of dirs) {
    const text = await readFile(path.join(dir, 'run-manifest.json'), 'utf8').catch(() => null);
    if (text === null) continue;
    runs.push({ dir, manifest: JSON.parse(text) });
  }
  return runs;
}

export async function findRecentRuns(root, limit = 3) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const dirs = entries.filter((e) => e.isDirectory()).map((e) => path.join(root, e.name)).sort().reverse();
  const runs = (await loadRuns(dirs)).filter((r) => isScored(r.manifest));
  return runs.slice(0, limit);
}

/**
 * The set-level assertions. Each one exists because a specific way of faking a ship gate
 * would otherwise work.
 * @returns {{ ok: boolean, problems: string[], runs: object[] }}
 */
export function checkSet(runs) {
  const problems = [];

  if (runs.length !== 3) problems.push(`expected 3 scored runs, found ${runs.length}`);

  for (const { dir, manifest } of runs) {
    if (manifest.invalid) problems.push(`${path.basename(dir)}: INVALID — rule files changed mid-run (${(manifest.ruleDrift ?? []).join(', ')})`);
    if (!manifest.git?.clean) problems.push(`${path.basename(dir)}: the worktree was dirty`);
    if (manifest.cached) problems.push(`${path.basename(dir)}: a segment was served from cache — R10.4 bars it from the ship gate`);
    if (!String(manifest.verdict ?? '').startsWith('PASS')) problems.push(`${path.basename(dir)}: verdict is "${manifest.verdict}"`);
  }

  const shas = new Set(runs.map((r) => r.manifest.git?.sha));
  if (shas.size > 1) problems.push(`the runs are from ${shas.size} different commits: ${[...shas].join(', ')}`);

  const legs = runs.map((r) => `${r.manifest.scenario}/${r.manifest.target}`).sort();
  const wanted = SHIP_GATE_LEGS.map((l) => `${l.scenario}/${l.target}`).sort();
  if (JSON.stringify(legs) !== JSON.stringify(wanted)) {
    problems.push(`the leg set is [${legs.join(', ')}], expected [${wanted.join(', ')}]`);
  }

  // R9.3 — every rule file must hash identically across ALL three runs.
  const [first, ...rest] = runs;
  if (first) {
    for (const { dir, manifest } of rest) {
      for (const [file, hash] of Object.entries(first.manifest.ruleHashes?.start ?? {})) {
        if ((manifest.ruleHashes?.start ?? {})[file] !== hash) {
          problems.push(`${path.basename(dir)}: ${file} differs from the first run's copy`);
        }
      }
    }
  }

  return { ok: problems.length === 0, problems, runs };
}

async function main() {
  const argv = process.argv.slice(2);
  const runs = argv.length > 0 ? (await loadRuns(argv)).filter((r) => isScored(r.manifest)) : await findRecentRuns(runsRoot());
  const result = checkSet(runs);

  for (const { dir, manifest } of runs) {
    process.stdout.write(
      `${String(manifest.verdict).padEnd(14)} ${manifest.scenario}/${manifest.target}  ${String(manifest.git?.sha ?? '').slice(0, 7)}  ${path.basename(dir)}\n`,
    );
  }
  process.stdout.write('\n');
  if (result.ok) {
    process.stdout.write('SHIP GATE PASSED — three clean runs, one commit, no rule drift, no cached segments\n');
    process.exit(0);
  }
  for (const problem of result.problems) process.stdout.write(`  ✗ ${problem}\n`);
  process.stdout.write('\nSHIP GATE FAILED\n');
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
