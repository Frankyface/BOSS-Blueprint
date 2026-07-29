/**
 * R4.3 / R4.5 / R4.6 — spawning a sterile `claude -p` session and capturing its
 * stream-json transcript. Shared by the builder (SEG-3) and the evaluator (SEG-6).
 *
 * Three things this module refuses to do, each of which would quietly invalidate the
 * measurement:
 *   - pass `--dangerously-skip-permissions` (or any banned flag) — asserted on the
 *     ASSEMBLED argv, so a future edit that adds one fails before the spawn
 *   - pin a model version id — aliases only (`performance.md`); the id the session
 *     resolved is read back off the init event and recorded
 *   - accept a session carrying anything beyond the CLI's own built-ins — R4.6 is the
 *     assertion that actually proves "zero context"; the config-dir mechanics in
 *     `sandbox.mjs` are merely how it is achieved
 *
 * R4.6 fires ON THE STREAMING INIT EVENT, not on the finished transcript. Asserting
 * afterwards was free only while auth was dead: with a working credential every impure
 * attempt would spend a full builder budget (§9: ≈ $10-25, 25-45 min) and only THEN
 * abort as PRECONDITION. The child is killed the moment the init fails the predicate.
 */

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import path from 'node:path';
import { StringDecoder } from 'node:string_decoder';

import { BUILTIN_SET_FIELDS, builtinsFor, pinnedVersions } from './builtin-manifest.mjs';
import { BANNED_FLAGS, BANNED_PERMISSION_MODES, MAX_TURNS } from './thresholds.mjs';

export class SessionError extends Error {
  constructor(message, detail = []) {
    super(message);
    this.name = 'SessionError';
    this.detail = detail;
  }
}

/**
 * R4.3 — the argv, built in one place so R4.5 has exactly one thing to assert against.
 * The prompt goes to STDIN, not argv: byte-identical either way, but Windows quoting
 * of an em-dash-bearing multi-line string is a plumbing hazard with no upside.
 */
export function buildArgv({ model, maxTurns = MAX_TURNS, extra = [] }) {
  return ['-p', '--output-format', 'stream-json', '--verbose', '--max-turns', String(maxTurns), '--model', model, ...extra];
}

/** R4.5 — assert the assembled argv and settings carry no bypass. Unit-tested on a mutated argv. */
export function assertNoBannedFlags(argv, settings = {}) {
  const offenders = argv.filter((arg) => BANNED_FLAGS.some((flag) => arg === flag || arg.startsWith(`${flag}=`)));
  if (offenders.length > 0) {
    throw new SessionError('the assembled argv carries a banned flag', offenders);
  }
  const mode = settings?.permissions?.defaultMode ?? settings?.permissionMode ?? null;
  if (mode !== null && BANNED_PERMISSION_MODES.includes(mode)) {
    throw new SessionError('the settings object defaults to a permission mode that defeats the allowlist', [mode]);
  }
}

/* ─────────────────────── R4.6 · baseline sterility ─────────────────────── */

/** Every memory path an init event mentions, whatever field the CLI put it in. */
function memoryPathsOf(init) {
  const out = [];
  const paths = init.memory_paths;
  if (paths !== null && typeof paths === 'object') {
    for (const value of Object.values(paths)) {
      if (typeof value === 'string' && value !== '') out.push(value);
      else if (Array.isArray(value)) out.push(...value.filter((entry) => typeof entry === 'string'));
    }
  }
  // The pre-2.1.190 spellings, kept as also-checked-if-present: a CLI that goes back to
  // one of them must not make this half of R4.6 pass vacuously (the MEDIUM-6 class).
  for (const key of ['project_memory', 'memory_files', 'claude_md_files']) {
    if (Array.isArray(init[key])) out.push(...init[key].filter((entry) => typeof entry === 'string'));
  }
  return out;
}

/** True when `child` is `parent` or sits underneath it. Pure path arithmetic, no fs. */
function isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function setDiff(actual, expected) {
  const actualList = Array.isArray(actual) ? actual : [];
  const expectedSet = new Set(expected);
  const actualSet = new Set(actualList);
  return {
    extra: actualList.filter((entry) => !expectedSet.has(entry)),
    missing: [...expectedSet].filter((entry) => !actualSet.has(entry)),
  };
}

/**
 * R4.6 — BASELINE STERILITY (amended 2026-07-29, docs/decisions.md).
 *
 * Not "these arrays are empty" — Claude Code ships built-in agents, skills and commands
 * inside the binary and no `CLAUDE_CONFIG_DIR` can remove them, so the old predicate was
 * unsatisfiable and had only ever been "passed" by a mock transcript the harness wrote
 * itself. What is asserted instead:
 *
 *   - zero MCP servers and zero plugins — those are pure config, so any is a leak
 *   - agents / skills / slash_commands EQUAL, as sets, the committed manifest entry for
 *     the version the session reported: an EXTRA entry is a leak and is named; a MISSING
 *     one means this is not the pinned CLI, which is a version mismatch, not a leak
 *   - the reported version has a manifest entry at all
 *   - every memory path the CLI lists resolves INSIDE this run's own claude-home
 *
 * @param {object[]} events transcript events, or just `[init]` from the stream
 * @param {{ configDir?: string|null, manifest?: object }} options
 * @returns {{ ok: boolean, kind: string|null, problems: string[], model: string|null,
 *             version: string|null, init: object|null }}
 */
export function assertSessionPurity(events, { configDir = null, manifest = undefined } = {}) {
  const init = events.find((e) => e?.type === 'system' && e?.subtype === 'init') ?? null;
  if (init === null) {
    return { ok: false, kind: 'no-init', problems: ['no system/init event in the transcript'], model: null, version: null, init: null };
  }

  const version = typeof init.claude_code_version === 'string' ? init.claude_code_version : null;
  const baseline = builtinsFor(version, manifest);
  const model = init.model ?? null;
  const problems = [];
  let kind = null;
  const leak = (message) => {
    problems.push(message);
    kind = 'leak';
  };
  const mismatch = (message) => {
    problems.push(message);
    if (kind === null) kind = 'version-mismatch';
  };

  if (baseline === null) {
    return {
      ok: false,
      kind: 'version-mismatch',
      problems: [
        `the session reports Claude Code ${version ?? '(no version in the init event)'}, which has no builtin-manifest entry`,
        `manifest covers: ${pinnedVersions(manifest).join(', ') || '(nothing)'}`,
        're-capture the baseline for this version and record it in docs/decisions.md before running',
      ],
      model,
      version,
      init,
    };
  }

  const servers = Array.isArray(init.mcp_servers) ? init.mcp_servers : [];
  if (servers.length > 0) {
    leak(`session loaded ${String(servers.length)} MCP server(s): ${servers.map((s) => s?.name ?? '?').join(', ')}`);
  }
  const plugins = Array.isArray(init.plugins) ? init.plugins : [];
  if (plugins.length > 0) {
    leak(`session loaded ${String(plugins.length)} plugin(s): ${plugins.map((p) => p?.name ?? p).join(', ')}`);
  }

  for (const field of BUILTIN_SET_FIELDS) {
    const { extra, missing } = setDiff(init[field], baseline[field] ?? []);
    if (extra.length > 0) leak(`non-builtin ${field} leaked in: ${extra.join(', ')}`);
    if (missing.length > 0) {
      mismatch(`builtin ${field} missing for ${version}: ${missing.join(', ')} — this is not the pinned CLI baseline`);
    }
  }

  if (typeof baseline.output_style === 'string' && init.output_style !== undefined && init.output_style !== baseline.output_style) {
    leak(`session loaded output style "${String(init.output_style)}" (baseline: "${baseline.output_style}")`);
  }

  // Vacuity guard: the manifest names the field this version emits, so a CLI that stops
  // emitting it fails loudly instead of passing the memory half of R4.6 by omission.
  const memoryField = baseline.memoryField ?? null;
  if (memoryField !== null && init[memoryField] === undefined) {
    mismatch(`the pinned CLI emits "${memoryField}" on init; this session emitted none — the memory check cannot run`);
  }
  const memory = memoryPathsOf(init);
  for (const entry of memory) {
    if (configDir === null || !isInside(configDir, entry)) {
      leak(`memory path resolves outside this run's claude-home: ${entry}`);
    }
  }

  return { ok: problems.length === 0, kind, problems, model, version, init };
}

/* ─────────────────── a session that never got to work ─────────────────── */

/**
 * The phrases the CLI uses when it could not authenticate at all. Deliberately narrow:
 * a builder that ran and did the job badly is a PRODUCT verdict, and only a session that
 * never started is an environment one.
 */
export const AUTH_FAILURE_PATTERNS = Object.freeze([
  /failed to authenticate/i,
  /oauth access token has expired/i,
  /\bnot logged in\b/i,
  /invalid api key/i,
  /please run \/login/i,
]);

/**
 * A dead credential produces an empty sandbox, and an empty sandbox reads exactly like a
 * builder that ignored the brief: H3 "incomplete build", scored, written to `verdict.txt`.
 * That is the harness reporting an environment failure as a product FAIL — the thing R4.4
 * and R7.4 already refuse elsewhere. Surfaced by the R4.6 amendment: until purity stopped
 * aborting first, nothing ever got far enough to be mis-scored.
 *
 * @returns {string|null} the terminal result text, when it names an auth failure.
 */
export function authFailureOf(events) {
  let text = '';
  for (const event of events) {
    if (event?.type === 'result' && typeof event.result === 'string') text = event.result;
  }
  if (text.trim() === '') return null;
  return AUTH_FAILURE_PATTERNS.some((pattern) => pattern.test(text)) ? text.trim() : null;
}

/* ───────────────────────────── the session ───────────────────────────── */

/**
 * Spawn one session. stdout is streamed to `transcriptPath` line by line as it arrives,
 * so a run killed by the segment hard stop still leaves the partial transcript behind —
 * an unreadable transcript makes an INFRA failure indistinguishable from a product one.
 *
 * `onInit` is called with the init event the moment it lands, BEFORE any builder budget
 * is spent. If it throws, the child is killed and the error is re-thrown once the
 * transcript has been flushed — the evidence of the impure session survives the abort.
 *
 * @returns {Promise<{ code, timedOut, stderr, elapsedMs, init }>}
 */
export async function runSession({
  argv,
  prompt,
  cwd,
  env,
  transcriptPath,
  timeoutMs,
  command = 'claude',
  settings = {},
  spawnFn = spawn,
  onInit = null,
}) {
  assertNoBannedFlags(argv, settings);

  const started = Date.now();
  const child = spawnFn(command, argv, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
  const out = createWriteStream(transcriptPath, { encoding: 'utf8' });
  child.stdout.pipe(out);

  // A second reader on the same stream: `pipe` keeps writing every byte to the
  // transcript while this one watches for the init line. Nothing is consumed twice
  // and nothing is buffered beyond the current partial line.
  let init = null;
  let initError = null;
  const decoder = new StringDecoder('utf8');
  let pending = '';
  child.stdout.on('data', (chunk) => {
    if (init !== null || onInit === null) return;
    pending += decoder.write(chunk);
    let newline = pending.indexOf('\n');
    while (newline !== -1) {
      const line = pending.slice(0, newline).trim();
      pending = pending.slice(newline + 1);
      let event = null;
      if (line !== '') {
        try {
          event = JSON.parse(line);
        } catch {
          event = null;
        }
      }
      if (event?.type === 'system' && event?.subtype === 'init') {
        init = event;
        try {
          onInit(event);
        } catch (err) {
          initError = err;
          child.kill('SIGKILL');
        }
        return;
      }
      newline = pending.indexOf('\n');
    }
  });

  let stderr = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  child.stdin.end(prompt, 'utf8');

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutMs);

  const [code] = await once(child, 'close');
  clearTimeout(timer);
  await new Promise((resolve) => out.end(resolve));

  if (initError !== null) throw initError;
  return { code, timedOut, stderr, elapsedMs: Date.now() - started, init };
}
