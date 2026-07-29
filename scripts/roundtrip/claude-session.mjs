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
 *   - accept a session that loaded MCP servers, plugins, skills, agents or project
 *     memory — R4.6 is the assertion that actually proves "zero context"; the
 *     config-dir mechanics in `sandbox.mjs` are merely how it is achieved
 */

import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { once } from 'node:events';

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

/**
 * R4.6 — parse the `system`/`init` event and prove the session is empty.
 * @param {object[]} events
 * @returns {{ ok: boolean, problems: string[], model: string|null, init: object|null }}
 */
export function assertSessionPurity(events) {
  const init = events.find((e) => e?.type === 'system' && e?.subtype === 'init') ?? null;
  if (init === null) {
    return { ok: false, problems: ['no system/init event in the transcript'], model: null, init: null };
  }
  const problems = [];
  const nonEmpty = (value) => Array.isArray(value) && value.length > 0;
  if (nonEmpty(init.mcp_servers)) {
    problems.push(`session loaded ${init.mcp_servers.length} MCP server(s): ${init.mcp_servers.map((s) => s?.name ?? '?').join(', ')}`);
  }
  for (const key of ['plugins', 'skills', 'agents', 'slash_commands', 'output_style']) {
    if (nonEmpty(init[key])) problems.push(`session loaded ${init[key].length} ${key}`);
  }
  for (const key of ['project_memory', 'memory_files', 'claude_md_files']) {
    if (nonEmpty(init[key])) problems.push(`session loaded project memory: ${init[key].join(', ')}`);
  }
  return { ok: problems.length === 0, problems, model: init.model ?? null, init };
}

/**
 * Spawn one session. stdout is streamed to `transcriptPath` line by line as it arrives,
 * so a run killed by the segment hard stop still leaves the partial transcript behind —
 * an unreadable transcript makes an INFRA failure indistinguishable from a product one.
 *
 * @returns {Promise<{ code: number|null, timedOut: boolean, stderr: string, elapsedMs: number }>}
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
}) {
  assertNoBannedFlags(argv, settings);

  const started = Date.now();
  const child = spawnFn(command, argv, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
  const out = createWriteStream(transcriptPath, { encoding: 'utf8' });
  child.stdout.pipe(out);

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

  return { code, timedOut, stderr, elapsedMs: Date.now() - started };
}
