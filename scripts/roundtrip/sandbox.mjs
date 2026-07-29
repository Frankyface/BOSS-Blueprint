/**
 * R3 — sandbox and isolation. Everything that makes "zero context" a MECHANICAL fact
 * rather than an intention.
 *
 * Four properties are asserted here, every run, before any session starts:
 *   R3.2  no ancestor of the sandbox holds a CLAUDE.md / AGENTS.md / .claude settings
 *   R3.3  the sterile config dir holds settings.json plus AT MOST one credential file
 *   R3.4  exactly one credential, by a recorded method, contents never read or logged
 *   R3.5  an allowlist with no npx/npm entry — the house ban on
 *         --dangerously-skip-permissions is honoured by scoping, not by bypassing
 *
 * A failure of any of them aborts as PRECONDITION, never as a product FAIL: an
 * environment defect that scored against the package would be the harness lying about
 * what it measured.
 */

import { access, mkdir, readdir, copyFile, rm, writeFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  BANNED_ALLOW_RE,
  BUILDER_ALLOW,
  BUILDER_DENY,
  CONTEXT_LEAK_FILES,
  CREDENTIAL_FILENAMES,
  ENV_ALLOWLIST,
  ENV_SCRUB_PREFIXES,
  MANAGED_POLICY_PATHS,
  RUNS_DIR_ENV,
  RUNS_DIR_SUBPATH,
} from './thresholds.mjs';

export class PreconditionError extends Error {
  constructor(message, detail = []) {
    super(message);
    this.name = 'PreconditionError';
    this.detail = detail;
  }
}

/* ─────────────────────────── R3.1 · the run root ─────────────────────────── */

/**
 * OUTSIDE the repo tree, ruled 2026-07-28 (Open Question 2). The protocol said both
 * "the sandbox sits outside the repo" and "roundtrip-runs/ is gitignored", which cannot
 * both be true — and the repo-internal reading would put the project's own CLAUDE.md in
 * the builder's ancestor chain, defeating the entire zero-context premise. Outside wins;
 * `.gitignore` keeps the line as belt-and-braces, and R3.2's ancestor walk is the real
 * guard because it runs wherever the root points.
 */
export function runsRoot(env = process.env) {
  const override = env[RUNS_DIR_ENV];
  if (override) return path.resolve(override);
  const base = env.LOCALAPPDATA ?? path.join(os.homedir(), '.local', 'share');
  return path.join(base, ...RUNS_DIR_SUBPATH);
}

/** `<runsRoot>/<UTC-timestamp>_<scenario>_<gitsha7>` — protocol §0. */
export function runDirName({ startedAt, scenarioId, gitSha }) {
  const stamp = startedAt.toISOString().replace(/[:.]/g, '-').replace(/Z$/, 'Z');
  return `${stamp}_${scenarioId}_${(gitSha ?? 'nogit').slice(0, 7)}`;
}

/* ─────────────────────── R3.2 · the ancestor assertion ───────────────────── */

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/**
 * Walk from `dir` to the filesystem root. Any context file found is a hard abort with
 * the offending path printed — a silent leak here would invalidate every verdict the
 * run produced without leaving a trace in the evidence.
 */
export async function assertNoAncestorContext(dir) {
  const offenders = [];
  let current = path.resolve(dir);
  for (;;) {
    for (const name of CONTEXT_LEAK_FILES) {
      if (await exists(path.join(current, name))) offenders.push(path.join(current, name));
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  if (offenders.length > 0) {
    throw new PreconditionError(
      `context would leak into the sterile session from ${offenders.length} ancestor file(s)`,
      [
        ...offenders,
        '',
        `Point ${RUNS_DIR_ENV} at a directory whose whole ancestor chain is clean and rerun.`,
        'On Windows the ruled default sits under the user profile, so a personal ~/.claude',
        'or a stray CLAUDE.md in the home directory trips this — which is the check doing',
        'its job, not a false alarm. C:\\Users\\Public\\boss-blueprint\\roundtrip-runs works.',
      ],
    );
  }
  return { ok: true, walkedFrom: path.resolve(dir) };
}

/* ─────────────────── R3.3 / R3.4 / R3.5 · the sterile config dir ─────────── */

/** The allowlist file, generated from `thresholds.mjs` so it cannot drift from the test. */
export function builderSettings() {
  return { permissions: { allow: [...BUILDER_ALLOW], deny: [...BUILDER_DENY] } };
}

/** R3.5's anti-weakening assertion, callable on any settings object. */
export function assertAllowlistHermetic(settings) {
  const offenders = (settings?.permissions?.allow ?? []).filter((entry) => BANNED_ALLOW_RE.test(entry));
  if (offenders.length > 0) {
    throw new PreconditionError(
      'the builder allowlist reintroduces a network hole (ruling 5 denies npx and npm)',
      offenders,
    );
  }
}

/**
 * Find the CLI credential file in the REAL config dir. Only the PATH is returned;
 * the contents are never read, printed or archived — the run directory is committed
 * evidence in part, so a credential that entered it could not be un-committed.
 */
export async function findCliCredential(env = process.env, homeDir = os.homedir()) {
  const roots = [env.CLAUDE_CONFIG_DIR, path.join(homeDir, '.claude')].filter(Boolean);
  for (const root of roots) {
    for (const name of CREDENTIAL_FILENAMES) {
      const candidate = path.join(root, name);
      if (await exists(candidate)) return candidate;
    }
  }
  return null;
}

/**
 * Create `<runDir>/<who>/claude-home/`, write the allowlist, place AT MOST one
 * credential, then assert the recursive listing is exactly what we put there.
 *
 * @returns {Promise<{ dir: string, auth: object, listing: string[] }>}
 */
export async function createSterileConfigDir({ parentDir, env = process.env, homeDir = os.homedir() }) {
  const dir = path.join(parentDir, 'claude-home');
  await mkdir(dir, { recursive: true });

  const settings = builderSettings();
  assertAllowlistHermetic(settings);
  await writeFile(path.join(dir, 'settings.json'), `${JSON.stringify(settings, null, 2)}\n`, 'utf8');

  let auth;
  const credential = await findCliCredential(env, homeDir);
  if (credential) {
    await copyFile(credential, path.join(dir, path.basename(credential)));
    auth = { method: 'cli-credentials', copiedFrom: credential, copiedAs: path.basename(credential) };
  } else if (env.ANTHROPIC_API_KEY) {
    auth = { method: 'api-key-env', copiedFrom: null, copiedAs: null };
  } else {
    throw new PreconditionError('no credential for the sterile session', [
      'looked for a CLI credentials file in CLAUDE_CONFIG_DIR and ~/.claude, and for ANTHROPIC_API_KEY',
    ]);
  }

  const listing = await listRecursive(dir);
  const expected = new Set(['settings.json', ...(auth.copiedAs ? [auth.copiedAs] : [])]);
  const unexpected = listing.filter((entry) => !expected.has(entry));
  if (unexpected.length > 0) {
    throw new PreconditionError(
      'the sterile config dir is not sterile — memory, agents, skills, plugins or MCP config leaked in',
      unexpected,
    );
  }

  return { dir, auth, listing };
}

/**
 * POST-RUN CREDENTIAL SCRUB — delete every sterile `claude-home/` in the run tree.
 *
 * R3.4 already keeps the credential's CONTENTS out of the evidence (only the path and
 * the method are recorded), but the copy itself sits in the run directory for the life
 * of the run, and the run root is a long-lived folder on a shared machine. Removing the
 * copies the moment the run ends — pass OR fail, which is why the orchestrator calls
 * this from both exits — leaves the evidence complete and the secret nowhere.
 *
 * The listing recorded in `run-manifest.json` is what proves the dir WAS sterile; it
 * survives the scrub because it is data, not the directory.
 *
 * @returns {Promise<{ credentialScrubbed: boolean, removed: string[], problems: string[] }>}
 */
export async function scrubCredentials(runDir) {
  const removed = [];
  const problems = [];

  const walk = async (dir) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);
      if (entry.name === 'claude-home') {
        try {
          await rm(full, { recursive: true, force: true });
          removed.push(full);
        } catch (err) {
          problems.push(`${full}: ${err.message}`);
        }
        continue;
      }
      await walk(full);
    }
  };

  await walk(runDir);
  return { credentialScrubbed: problems.length === 0, removed, problems };
}

/** R3.3 — the assertion is on the RECURSIVE listing: `claude-home/agents/**` fails it too. */
export async function listRecursive(dir, prefix = '') {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...(await listRecursive(path.join(dir, entry.name), rel)));
    } else {
      out.push(rel);
    }
  }
  return out.sort();
}

/* ─────────────────────────── R3.7 · environment ─────────────────────────── */

/**
 * An explicit allowlist, not a blocklist: a blocklist is a promise to remember every
 * future `CLAUDE_*` variable, and it only takes one to reopen the context channel.
 */
export function scrubEnvironment({ env = process.env, configDir, useApiKey = false }) {
  const child = {};
  for (const name of ENV_ALLOWLIST) {
    if (env[name] !== undefined) child[name] = env[name];
  }
  child.CLAUDE_CONFIG_DIR = configDir;
  if (useApiKey && env.ANTHROPIC_API_KEY) child.ANTHROPIC_API_KEY = env.ANTHROPIC_API_KEY;

  const dropped = Object.keys(env)
    .filter((name) => ENV_SCRUB_PREFIXES.some((prefix) => name.startsWith(prefix)))
    .filter((name) => child[name] === undefined);

  return { env: child, dropped: dropped.sort() };
}

/**
 * R3.7 — a machine-level managed-settings file cannot be isolated by any env var. A
 * run where one exists is still VALID; the evidence simply says so, which is the
 * honest position: hiding it would make the run look more sterile than it was.
 */
export async function detectManagedPolicy() {
  const found = [];
  for (const candidate of MANAGED_POLICY_PATHS) {
    if (await exists(candidate)) found.push(candidate);
  }
  return found;
}

/** Convenience for the orchestrator: is `file` present and non-empty? */
export async function isNonEmptyFile(file) {
  try {
    const info = await stat(file);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}
