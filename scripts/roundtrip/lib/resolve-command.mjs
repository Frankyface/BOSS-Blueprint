/**
 * R4.3a — RESOLVING THE `claude` EXECUTABLE, without a shell.
 *
 * Live-run attempt 1 died at SEG-3 in 29 ms with `spawn claude ENOENT`, and the obvious
 * repair is a trap:
 *   - `spawn('claude')` — ENOENT. The bare name on Windows is an `sh` shim with no
 *     extension; `CreateProcess` will not run it and Node does not consult PATHEXT.
 *   - `spawn('claude.cmd')` — EINVAL. Node refuses to spawn a `.cmd`/`.bat` without a
 *     shell (post CVE-2024-27980), and `shell: true` is exactly what that CVE is about:
 *     the harness would be handing a command line to `cmd.exe` for re-parsing.
 *
 * So: probe PATH × PATHEXT ourselves, and hand `spawn` an ABSOLUTE path to a real image
 * with `shell: false`. When the only hit is an npm shim, the shim's own last line names
 * the executable it delegates to (`"%dp0%\node_modules\...\claude.exe"`), and following
 * that is both deterministic and testable — it is reading a file, not spawning one.
 *
 * Nothing here executes anything. Resolution failure is a clear INFRA error naming every
 * candidate it found, because "the CLI is not installed" and "the CLI is installed as a
 * shim we cannot follow" need different fixes from the operator.
 */

import { constants } from 'node:fs';
import { access, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export class CommandResolutionError extends Error {
  constructor(message, detail = []) {
    super(message);
    this.name = 'CommandResolutionError';
    this.detail = detail;
  }
}

/** Windows images `CreateProcess` can run directly. Everything else needs an interpreter. */
export const DIRECTLY_SPAWNABLE_EXTENSIONS = Object.freeze(['.exe', '.com']);

/** Shims we are willing to READ (never to spawn) in order to find the real image. */
export const SHIM_EXTENSIONS = Object.freeze(['.cmd', '.bat', '']);

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD';

/** `%dp0%`, `%~dp0`, `$basedir` — the three ways npm's two shims spell "my own directory". */
const SHIM_BASEDIR_RE = /%~?dp0%?|\$basedir/gi;
/** The delegation target: the last quoted-or-bare path ending in `.exe` the shim mentions. */
const SHIM_TARGET_RE = /"([^"\n]+\.exe)"|(\S+\.exe)/gi;

/** PATH is `;`-separated on Windows and `:`-separated everywhere else. Nothing else differs. */
export function splitPathList(value, platform = process.platform) {
  return (value ?? '')
    .split(platform === 'win32' ? ';' : ':')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}

/** PATHEXT, lower-cased and de-duplicated, with the platform default when unset. */
export function pathExtensions(env = process.env, platform = process.platform) {
  if (platform !== 'win32') return [''];
  const raw = env.PATHEXT ?? env.Pathext ?? env.pathext ?? DEFAULT_PATHEXT;
  const exts = splitPathList(raw, 'win32').map((ext) => ext.toLowerCase());
  return [...new Set(exts)];
}

async function isFile(candidate) {
  try {
    const info = await stat(candidate);
    return info.isFile();
  } catch {
    return false;
  }
}

async function isExecutableFile(candidate) {
  if (!(await isFile(candidate))) return false;
  try {
    await access(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every file on PATH that could plausibly BE `name`, in PATH order then PATHEXT order.
 * @returns {Promise<{ file: string, ext: string }[]>}
 */
export async function findOnPath(name, { env = process.env, platform = process.platform } = {}) {
  const dirs = splitPathList(env.PATH ?? env.Path ?? env.path, platform);
  const exts = platform === 'win32' ? [...pathExtensions(env, platform), ''] : [''];
  const found = [];
  for (const dir of dirs) {
    for (const ext of exts) {
      const file = path.join(dir, `${name}${ext}`);
      if (found.some((hit) => hit.file === file)) continue;
      if (await isFile(file)) found.push({ file, ext });
    }
  }
  return found;
}

/**
 * Read an npm-style shim and return the absolute `.exe` it delegates to, or null.
 * The shim is READ, never run — following it is the only way to reach a spawnable
 * image when the installer put nothing else on PATH.
 */
export async function shimTarget(shimFile) {
  let text;
  try {
    text = await readFile(shimFile, 'utf8');
  } catch {
    return null;
  }
  const dir = path.dirname(shimFile);
  const candidates = [];
  for (const match of text.matchAll(SHIM_TARGET_RE)) {
    const raw = match[1] ?? match[2];
    if (raw === undefined) continue;
    // `path.resolve` collapses the doubled separator `%dp0%` + `\` leaves behind.
    // A function replacement, so a `$` in the install path is not read as `$&`.
    const expanded = raw.replace(SHIM_BASEDIR_RE, () => dir).replace(/[\\/]/g, path.sep);
    candidates.push(path.resolve(dir, expanded));
  }
  for (const candidate of candidates) {
    if (await isFile(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve `name` to an absolute path that `spawn(..., { shell: false })` can run.
 *
 * @returns {Promise<{ path: string, via: 'path'|'shim', shim: string|null, candidates: string[] }>}
 * @throws {CommandResolutionError} when nothing on PATH resolves to a spawnable image.
 */
export async function resolveExecutable(name, { env = process.env, platform = process.platform } = {}) {
  const hits = await findOnPath(name, { env, platform });
  const candidates = hits.map((hit) => hit.file);

  if (platform !== 'win32') {
    for (const hit of hits) {
      if (await isExecutableFile(hit.file)) return { path: hit.file, via: 'path', shim: null, candidates };
    }
    throw new CommandResolutionError(`no executable "${name}" on PATH`, candidates);
  }

  const direct = hits.find((hit) => DIRECTLY_SPAWNABLE_EXTENSIONS.includes(hit.ext));
  if (direct) return { path: direct.file, via: 'path', shim: null, candidates };

  for (const hit of hits) {
    if (!SHIM_EXTENSIONS.includes(hit.ext)) continue;
    const target = await shimTarget(hit.file);
    if (target !== null) return { path: target, via: 'shim', shim: hit.file, candidates };
  }

  throw new CommandResolutionError(
    candidates.length === 0
      ? `no "${name}" on PATH at all — is the CLI installed for this user?`
      : `"${name}" resolves only to shims Node cannot spawn without a shell, and none names an .exe`,
    [
      ...candidates,
      '',
      'The harness will not fall back to shell: true (CVE-2024-27980).',
      `Put a directly spawnable ${name}.exe on PATH and rerun.`,
    ],
  );
}
