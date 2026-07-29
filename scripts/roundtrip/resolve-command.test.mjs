// @vitest-environment node
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  CommandResolutionError,
  findOnPath,
  pathExtensions,
  resolveExecutable,
  shimTarget,
  splitPathList,
} from './lib/resolve-command.mjs'

/**
 * R4.3a — THE WINDOWS SPAWN FIX, tested against fixture PATH layouts.
 *
 * Live-run attempt 1 spent 29 ms getting to `spawn claude ENOENT`, and both obvious
 * repairs are wrong: the bare `claude` on PATH is an `sh` shim CreateProcess will not
 * run, and `claude.cmd` is what Node refuses to spawn without a shell (CVE-2024-27980).
 * The one thing every case below asserts is that the resolver hands back something
 * `spawn(..., { shell: false })` can actually execute — never a `.cmd`, never a `.bat`.
 *
 * The layouts are real directories, so these tests exercise the real `stat`/`readFile`
 * path. `platform` is passed explicitly, which keeps the Windows cases meaningful on the
 * ubuntu CI runner as well as here.
 */

const temps = []
async function tempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bp-resolve-'))
  temps.push(dir)
  return dir
}
afterEach(async () => {
  while (temps.length > 0) await rm(temps.pop(), { recursive: true, force: true })
})

const WIN = { platform: 'win32' }
const PATHEXT = '.COM;.EXE;.BAT;.CMD'
const winEnv = (...dirs) => ({ PATH: dirs.join(';'), PATHEXT })

/** The layout npm actually installs on Windows: two shims, one real image beneath. */
async function npmShimLayout(root) {
  const exe = path.join(root, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe')
  await mkdir(path.dirname(exe), { recursive: true })
  await writeFile(exe, 'MZ-not-really', 'utf8')
  await writeFile(
    path.join(root, 'claude.cmd'),
    ['@ECHO off', 'SETLOCAL', 'CALL :find_dp0', '"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*'].join('\r\n'),
    'utf8',
  )
  await writeFile(
    path.join(root, 'claude'),
    ['#!/bin/sh', 'basedir=$(dirname "$0")', 'exec "$basedir/node_modules/@anthropic-ai/claude-code/bin/claude.exe"   "$@"'].join('\n'),
    'utf8',
  )
  return exe
}

describe('PATH and PATHEXT parsing', () => {
  it('splits on ; for Windows and : everywhere else', () => {
    expect(splitPathList('C:\\a;C:\\b', 'win32')).toEqual(['C:\\a', 'C:\\b'])
    expect(splitPathList('/usr/bin:/bin', 'linux')).toEqual(['/usr/bin', '/bin'])
    expect(splitPathList('', 'win32')).toEqual([])
    expect(splitPathList(undefined, 'linux')).toEqual([])
  })

  it('lower-cases PATHEXT, de-duplicates it, and falls back when it is unset', () => {
    expect(pathExtensions({ PATHEXT: '.COM;.EXE;.EXE;.CMD' }, 'win32')).toEqual(['.com', '.exe', '.cmd'])
    expect(pathExtensions({}, 'win32')).toEqual(['.com', '.exe', '.bat', '.cmd'])
    // PATHEXT is meaningless off Windows: the name on PATH is the whole name.
    expect(pathExtensions({ PATHEXT }, 'linux')).toEqual([''])
  })
})

describe('resolving the npm shim layout (the machine the live run died on)', () => {
  it('follows the .cmd shim to the real .exe and never returns the shim', async () => {
    const root = await tempDir()
    const exe = await npmShimLayout(root)

    const resolved = await resolveExecutable('claude', { env: winEnv(root), ...WIN })

    expect(resolved.path).toBe(exe)
    expect(resolved.via).toBe('shim')
    expect(resolved.shim).toBe(path.join(root, 'claude.cmd'))
    expect(resolved.path.toLowerCase().endsWith('.cmd')).toBe(false)
  })

  it('lists both shims as candidates, so a failure says what it saw', async () => {
    const root = await tempDir()
    await npmShimLayout(root)
    const hits = await findOnPath('claude', { env: winEnv(root), ...WIN })
    expect(hits.map((hit) => path.basename(hit.file))).toEqual(['claude.cmd', 'claude'])
  })

  it('reads the sh shim too, for an install that ships only that one', async () => {
    const root = await tempDir()
    const exe = await npmShimLayout(root)
    await rm(path.join(root, 'claude.cmd'))

    const resolved = await resolveExecutable('claude', { env: winEnv(root), ...WIN })
    expect(resolved.path).toBe(exe)
    expect(resolved.via).toBe('shim')
  })
})

describe('preferring a directly spawnable image', () => {
  it('takes claude.exe over the claude.cmd sitting beside it', async () => {
    const root = await tempDir()
    await npmShimLayout(root)
    const exe = path.join(root, 'claude.exe')
    await writeFile(exe, 'MZ-not-really', 'utf8')

    const resolved = await resolveExecutable('claude', { env: winEnv(root), ...WIN })
    expect(resolved.path).toBe(exe)
    expect(resolved.via).toBe('path')
    expect(resolved.shim).toBeNull()
  })

  it('walks PATH in order and skips directories that hold nothing', async () => {
    const empty = await tempDir()
    const missing = path.join(empty, 'does-not-exist')
    const root = await tempDir()
    const exe = path.join(root, 'claude.exe')
    await writeFile(exe, 'MZ-not-really', 'utf8')

    const resolved = await resolveExecutable('claude', { env: winEnv(missing, empty, root), ...WIN })
    expect(resolved.path).toBe(exe)
  })

  it('takes the FIRST PATH entry that has one', async () => {
    const first = await tempDir()
    const second = await tempDir()
    await writeFile(path.join(first, 'claude.exe'), 'MZ-not-really', 'utf8')
    await writeFile(path.join(second, 'claude.exe'), 'MZ-not-really', 'utf8')

    const resolved = await resolveExecutable('claude', { env: winEnv(first, second), ...WIN })
    expect(resolved.path).toBe(path.join(first, 'claude.exe'))
  })
})

describe('when it cannot resolve anything spawnable', () => {
  it('throws naming every candidate, rather than handing back a .cmd', async () => {
    const root = await tempDir()
    // A shim whose target was uninstalled — the shape a half-removed CLI leaves behind.
    await writeFile(path.join(root, 'claude.cmd'), '"%dp0%\\node_modules\\gone\\claude.exe" %*', 'utf8')

    await expect(resolveExecutable('claude', { env: winEnv(root), ...WIN })).rejects.toThrow(CommandResolutionError)
    const error = await resolveExecutable('claude', { env: winEnv(root), ...WIN }).catch((err) => err)
    expect(error.detail).toContain(path.join(root, 'claude.cmd'))
    // The one repair the harness will NOT make (R3.5's own reasoning, applied to spawn).
    expect(error.detail.join(' ')).toContain('shell: true')
  })

  it('says so plainly when the CLI is not installed at all', async () => {
    const root = await tempDir()
    const error = await resolveExecutable('claude', { env: winEnv(root), ...WIN }).catch((err) => err)
    expect(error).toBeInstanceOf(CommandResolutionError)
    expect(error.message).toContain('on PATH at all')
  })
})

describe('shimTarget', () => {
  it('expands %dp0% and $basedir against the shim\'s own directory', async () => {
    const root = await tempDir()
    const exe = await npmShimLayout(root)
    expect(await shimTarget(path.join(root, 'claude.cmd'))).toBe(exe)
    expect(await shimTarget(path.join(root, 'claude'))).toBe(exe)
  })

  it('returns null for a file that names no reachable .exe', async () => {
    const root = await tempDir()
    const plain = path.join(root, 'notes.txt')
    await writeFile(plain, 'nothing to see', 'utf8')
    expect(await shimTarget(plain)).toBeNull()
    expect(await shimTarget(path.join(root, 'absent.cmd'))).toBeNull()
  })
})

describe('off Windows', () => {
  // A POSIX PATH is `:`-separated, and a Windows temp path contains a drive colon — so
  // this layout can only be built where the harness would actually meet it.
  it.skipIf(process.platform === 'win32')('takes the executable bit as the answer', async () => {
    const root = await tempDir()
    const file = path.join(root, 'claude')
    await writeFile(file, '#!/bin/sh\nexit 0\n', 'utf8')
    await chmod(file, 0o755)

    const resolved = await resolveExecutable('claude', { env: { PATH: root }, platform: 'linux' })
    expect(resolved).toMatchObject({ path: file, via: 'path', shim: null })
  })

  it.skipIf(process.platform === 'win32')('rejects a non-executable file of the right name', async () => {
    const root = await tempDir()
    await writeFile(path.join(root, 'claude'), 'not executable', 'utf8')
    await chmod(path.join(root, 'claude'), 0o644)

    await expect(resolveExecutable('claude', { env: { PATH: root }, platform: 'linux' })).rejects.toThrow(
      /no executable "claude" on PATH/,
    )
  })
})
