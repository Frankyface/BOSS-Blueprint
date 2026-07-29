/**
 * R9 — the run manifest, and the rule-file hashing that makes anti-weakening visible.
 *
 * R9.3 is the important half: every rule file is hashed at run START and again at run
 * END. Any difference marks the run `INVALID` and `ship-gate.mjs` refuses it. Editing a
 * rule mid-run is the single easiest way to fake a PASS, and it leaves no trace anywhere
 * else — so it leaves one here.
 */

import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { RULE_FILES } from './thresholds.mjs';

const run = promisify(execFile);

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function hashFile(file) {
  try {
    return sha256(await readFile(file));
  } catch {
    return null;
  }
}

/**
 * @param {string} harnessDir `scripts/roundtrip`
 * @param {string|null} scenarioFile hashed too — R10.5, the scenario is not a tuning knob
 */
export async function hashRuleFiles(harnessDir, scenarioFile = null) {
  const files = [...RULE_FILES.map((name) => path.join(harnessDir, name)), ...(scenarioFile ? [scenarioFile] : [])];
  const out = {};
  for (const file of files) {
    out[path.basename(file)] = await hashFile(file);
  }
  return out;
}

/** True when any rule file changed between the two snapshots. */
export function ruleFilesDrifted(start, end) {
  const keys = new Set([...Object.keys(start), ...Object.keys(end)]);
  return [...keys].filter((key) => start[key] !== end[key]);
}

export async function gitFacts(repoRoot) {
  try {
    const [{ stdout: sha }, { stdout: status }] = await Promise.all([
      run('git', ['rev-parse', 'HEAD'], { cwd: repoRoot }),
      run('git', ['status', '--porcelain'], { cwd: repoRoot }),
    ]);
    return { sha: sha.trim(), clean: status.trim() === '', dirtyFiles: status.trim() === '' ? [] : status.trim().split('\n') };
  } catch {
    return { sha: null, clean: false, dirtyFiles: ['git is unavailable'] };
  }
}

/**
 * R3.6 — deployed-bundle freshness. Reads the hashed entry filename out of the local
 * `dist/index.html` and compares it with the deployed one. A mismatch aborts as
 * PRECONDITION and is never scored: the 2026-07-28 UX audit found the live deploy had no
 * Submit control at all, and a `deployed` leg against that build would have burned a full
 * builder budget to produce a spectacular, meaningless FAIL.
 */
export function entryScriptOf(html) {
  const match = /<script[^>]+src="([^"]*assets\/index-[^"]+\.js)"/.exec(html);
  return match ? path.posix.basename(match[1]) : null;
}

export async function assertDeployedIsHead({ distIndexHtml, deployedUrl, fetchImpl = fetch }) {
  const local = entryScriptOf(await readFile(distIndexHtml, 'utf8'));
  const response = await fetchImpl(deployedUrl, { redirect: 'follow' });
  const deployed = entryScriptOf(await response.text());
  return { ok: local !== null && local === deployed, local, deployed, url: deployedUrl };
}

/** Write the manifest; callers mutate their copy and re-write it as segments finish. */
export async function writeManifest(runDir, manifest) {
  await writeFile(path.join(runDir, 'run-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifest;
}
