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

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { SHIP_GATE_LEGS } from './thresholds.mjs';
import { runsRoot } from './sandbox.mjs';

const execFileP = promisify(execFile);

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

/** Rule-hash keys that are per-scenario rather than shared by every run. */
export const isScenarioRuleFile = (name) => /^scenario-.+\.json$/.test(name);

/** The `scenario-*.json` entry a run recorded, or null when it recorded none. */
export function scenarioRuleEntry(manifest) {
  const hashes = manifest?.ruleHashes?.start ?? {};
  const file = Object.keys(hashes).find(isScenarioRuleFile) ?? null;
  return file === null ? null : { file, hash: hashes[file] };
}

/**
 * The set-level assertions. Each one exists because a specific way of faking a ship gate
 * would otherwise work.
 *
 * RULE-HASH COMPARISON, corrected 2026-07-29 (docs/decisions.md). The original assertion —
 * "every rule-file hash identical across ALL three runs" — was unsatisfiable by construction,
 * because `RULE_FILES` includes the per-run scenario file while R9.4 *requires* the leg set to
 * span two scenarios. The A legs hash `scenario-A.json`, the B leg hashes `scenario-B.json`,
 * so demanding one of them of the others could never succeed. It is replaced by three checks
 * that preserve the anti-weakening property exactly:
 *
 *   (a) SHARED rule files are byte-equal across ALL runs — unchanged;
 *   (b) the scenario file is byte-equal across runs OF THE SAME SCENARIO (both A legs must
 *       agree on `scenario-A.json`);
 *   (c) EVERY run's recorded scenario hash equals the scenario file COMMITTED at the set's
 *       sha — so a doctored scenario cannot hide inside its own per-scenario group.
 *
 * (c) is what keeps (b) honest: without it, someone could edit `scenario-A.json` once and run
 * both A legs against the edited copy. `committedScenarioHashes` is resolved by the caller
 * (git), and its ABSENCE is a problem rather than a skip — a check that silently opts out is
 * the vacuous pass this harness exists to prevent.
 *
 * @param {object[]} runs
 * @param {{ committedScenarioHashes?: Record<string,string>|null }} options
 * @returns {{ ok: boolean, problems: string[], runs: object[] }}
 */
export function checkSet(runs, { committedScenarioHashes = null } = {}) {
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

  // (a) R9.3 — every SHARED rule file identical across all three runs.
  const [first, ...rest] = runs;
  if (first) {
    for (const { dir, manifest } of rest) {
      for (const [file, hash] of Object.entries(first.manifest.ruleHashes?.start ?? {})) {
        if (isScenarioRuleFile(file)) continue;
        if ((manifest.ruleHashes?.start ?? {})[file] !== hash) {
          problems.push(`${path.basename(dir)}: ${file} differs from the first run's copy`);
        }
      }
    }
  }

  // (b) the scenario file identical across runs OF THE SAME SCENARIO.
  const byScenario = new Map();
  for (const run of runs) {
    const key = String(run.manifest?.scenario ?? '?');
    if (!byScenario.has(key)) byScenario.set(key, []);
    byScenario.get(key).push(run);
  }
  for (const [scenario, group] of byScenario) {
    const [head, ...others] = group;
    const headEntry = scenarioRuleEntry(head.manifest);
    if (headEntry === null) {
      problems.push(`${path.basename(head.dir)}: recorded no scenario-*.json hash — R10.5 cannot be checked`);
      continue;
    }
    for (const run of others) {
      const entry = scenarioRuleEntry(run.manifest);
      if (entry === null) {
        problems.push(`${path.basename(run.dir)}: recorded no scenario-*.json hash — R10.5 cannot be checked`);
      } else if (entry.file !== headEntry.file || entry.hash !== headEntry.hash) {
        problems.push(
          `${path.basename(run.dir)}: ${entry.file} differs from the other scenario-${scenario} run's copy`,
        );
      }
    }
  }

  // (c) every run's scenario hash equals the file COMMITTED at the set's sha.
  if (committedScenarioHashes === null) {
    problems.push('could not read the committed scenario files at the set’s sha — R10.5 is unverifiable');
  } else {
    for (const { dir, manifest } of runs) {
      const entry = scenarioRuleEntry(manifest);
      if (entry === null) continue; // already reported by (b)
      const committed = committedScenarioHashes[entry.file];
      if (committed === undefined) {
        problems.push(`${path.basename(dir)}: ${entry.file} is not a committed scenario file at the set’s sha`);
      } else if (committed !== entry.hash) {
        problems.push(
          `${path.basename(dir)}: ${entry.file} does not match the committed file at the set’s sha — the scenario was edited`,
        );
      }
    }
  }

  return { ok: problems.length === 0, problems, runs };
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
/** Repo-relative, POSIX-separated — `git show <sha>:<path>` takes no backslashes. */
const SCENARIO_REPO_DIR = 'scripts/roundtrip/scenarios';

/**
 * The sha256 of each scenario file AS COMMITTED at `sha`, keyed by basename.
 *
 * Hashed from the raw blob so it is byte-comparable with `hashRuleFiles`, which hashes the
 * working-tree bytes. Returns null when git cannot answer — the caller treats that as a
 * problem, never as a pass.
 */
export async function committedScenarioHashesAt(sha, files) {
  if (typeof sha !== 'string' || sha === '') return null;
  const out = {};
  for (const file of files) {
    try {
      const { stdout } = await execFileP('git', ['show', `${sha}:${SCENARIO_REPO_DIR}/${file}`], {
        cwd: REPO_ROOT,
        encoding: 'buffer',
        maxBuffer: 64 * 1024 * 1024,
      });
      out[file] = createHash('sha256').update(stdout).digest('hex');
    } catch {
      return null;
    }
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const runs = argv.length > 0 ? (await loadRuns(argv)).filter((r) => isScored(r.manifest)) : await findRecentRuns(runsRoot());

  const shas = [...new Set(runs.map((r) => r.manifest?.git?.sha).filter(Boolean))];
  const scenarioFiles = [...new Set(runs.map((r) => scenarioRuleEntry(r.manifest)?.file).filter(Boolean))];
  // Only meaningful when the set agrees on one sha; the sha check below reports it otherwise.
  const committedScenarioHashes =
    shas.length === 1 ? await committedScenarioHashesAt(shas[0], scenarioFiles) : null;

  const result = checkSet(runs, { committedScenarioHashes });

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
