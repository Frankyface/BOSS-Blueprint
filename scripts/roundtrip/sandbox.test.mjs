// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { assertSessionPurity, assertNoBannedFlags, buildArgv, SessionError } from './claude-session.mjs'
import {
  assertAllowlistHermetic,
  assertNoAncestorContext,
  builderSettings,
  createSterileConfigDir,
  listRecursive,
  PreconditionError,
  runDirName,
  runsRoot,
  scrubCredentials,
  scrubEnvironment,
} from './sandbox.mjs'
import { BANNED_ALLOW_RE, MAX_TURNS } from './thresholds.mjs'

const temps = []
async function tempDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bp-sandbox-'))
  temps.push(dir)
  return dir
}
afterEach(async () => {
  while (temps.length > 0) await rm(temps.pop(), { recursive: true, force: true })
})

describe('R3.5 — the builder allowlist is hermetic', () => {
  it('contains no npx or npm entry (ruling 5)', () => {
    for (const entry of builderSettings().permissions.allow) {
      expect(BANNED_ALLOW_RE.test(entry), `allow entry "${entry}" reopens the network`).toBe(false)
    }
  })

  it('rejects a settings object that reintroduces the hole', () => {
    // The exact convenience edit ruling 5 exists to prevent.
    const mutated = { permissions: { allow: ['Read', 'Bash(npx serve*)'], deny: [] } }
    expect(() => assertAllowlistHermetic(mutated)).toThrow(PreconditionError)
  })

  it('denies the network tools outright', () => {
    const { deny } = builderSettings().permissions
    for (const entry of ['WebFetch', 'WebSearch', 'Bash(curl *)', 'Bash(npx *)', 'Bash(npm *)']) {
      expect(deny).toContain(entry)
    }
  })
})

describe('R4.3 / R4.5 — the assembled argv', () => {
  it('uses a model ALIAS and the pinned max-turns', () => {
    const argv = buildArgv({ model: 'opus' })
    expect(argv).toContain('--max-turns')
    expect(argv[argv.indexOf('--max-turns') + 1]).toBe(String(MAX_TURNS))
    expect(argv[argv.indexOf('--model') + 1]).toBe('opus')
    // performance.md: never a pinned version id.
    expect(argv.join(' ')).not.toMatch(/claude-[a-z]+-\d/)
  })

  it('accepts a clean argv', () => {
    expect(() => assertNoBannedFlags(buildArgv({ model: 'opus' }), builderSettings())).not.toThrow()
  })

  it('rejects a MUTATED argv carrying --dangerously-skip-permissions', () => {
    const mutated = [...buildArgv({ model: 'opus' }), '--dangerously-skip-permissions']
    expect(() => assertNoBannedFlags(mutated)).toThrow(SessionError)
  })

  it('rejects settings that default to a bypass permission mode', () => {
    expect(() =>
      assertNoBannedFlags(buildArgv({ model: 'opus' }), { permissions: { defaultMode: 'bypassPermissions' } }),
    ).toThrow(SessionError)
  })
})

describe('R4.6 — session purity', () => {
  const init = (extra) => [{ type: 'system', subtype: 'init', model: 'resolved-id', mcp_servers: [], ...extra }]

  it('accepts an empty session and reports the resolved model id', () => {
    const purity = assertSessionPurity(init({}))
    expect(purity.ok).toBe(true)
    expect(purity.model).toBe('resolved-id')
  })

  it.each([
    ['mcp_servers', [{ name: 'supabase' }]],
    ['plugins', ['marketing']],
    ['agents', ['Explore']],
    ['skills', ['pdf']],
    ['project_memory', ['CLAUDE.md']],
  ])('rejects a session that loaded %s', (key, value) => {
    expect(assertSessionPurity(init({ [key]: value })).ok).toBe(false)
  })

  it('rejects a transcript with no init event at all', () => {
    expect(assertSessionPurity([]).ok).toBe(false)
  })
})

describe('R3.2 — the ancestor assertion', () => {
  it('aborts when any ancestor holds a context file, naming the path', async () => {
    const root = await tempDir()
    const deep = path.join(root, 'a', 'b', 'sandbox')
    await mkdir(deep, { recursive: true })
    await writeFile(path.join(root, 'a', 'CLAUDE.md'), '# leak\n', 'utf8')
    await expect(assertNoAncestorContext(deep)).rejects.toThrow(PreconditionError)
  })
})

describe('R3.3 / R3.4 — the sterile config dir', () => {
  it('holds settings.json plus at most one credential, and records the method', async () => {
    const parent = await tempDir()
    const fakeHome = await tempDir()
    await writeFile(path.join(fakeHome, '.credentials.json'), '{"secret":"never-logged"}', 'utf8')

    const { dir, auth, listing } = await createSterileConfigDir({
      parentDir: parent,
      env: { CLAUDE_CONFIG_DIR: fakeHome },
      homeDir: fakeHome,
    })

    expect(auth.method).toBe('cli-credentials')
    expect(listing).toEqual(['.credentials.json', 'settings.json'])
    // R3.4 — the PATH is recorded, the CONTENTS never are.
    expect(JSON.stringify(auth)).not.toContain('never-logged')
    expect(JSON.parse(await readFile(path.join(dir, 'settings.json'), 'utf8'))).toEqual(builderSettings())
  })

  it('falls back to api-key-env and copies nothing', async () => {
    const parent = await tempDir()
    const emptyHome = await tempDir()
    const { auth, listing } = await createSterileConfigDir({
      parentDir: parent,
      env: { CLAUDE_CONFIG_DIR: emptyHome, ANTHROPIC_API_KEY: 'sk-not-real' },
      homeDir: emptyHome,
    })
    expect(auth).toEqual({ method: 'api-key-env', copiedFrom: null, copiedAs: null })
    expect(listing).toEqual(['settings.json'])
  })

  it('aborts as PRECONDITION when there is no credential at all', async () => {
    const parent = await tempDir()
    const emptyHome = await tempDir()
    await expect(
      createSterileConfigDir({ parentDir: parent, env: { CLAUDE_CONFIG_DIR: emptyHome }, homeDir: emptyHome }),
    ).rejects.toThrow(/no credential for the sterile session/)
  })

  it('asserts the RECURSIVE listing, so a nested agents/ dir fails it too', async () => {
    const dir = await tempDir()
    await mkdir(path.join(dir, 'agents'), { recursive: true })
    await writeFile(path.join(dir, 'agents', 'planner.md'), 'x', 'utf8')
    expect(await listRecursive(dir)).toEqual(['agents/planner.md'])
  })
})

describe('R3.7 — the environment scrub', () => {
  it('is an allowlist: every other CLAUDE_/ANTHROPIC_ variable is dropped', () => {
    const { env, dropped } = scrubEnvironment({
      env: {
        PATH: '/bin',
        USERPROFILE: 'C:/Users/Cam',
        CLAUDE_CODE_ENTRYPOINT: 'cli',
        ANTHROPIC_MODEL: 'something',
        ANTHROPIC_API_KEY: 'sk-not-real',
        SOME_OTHER: 'kept-out',
      },
      configDir: 'C:/run/claude-home',
    })
    expect(env.CLAUDE_CONFIG_DIR).toBe('C:/run/claude-home')
    expect(env.PATH).toBe('/bin')
    expect(env.CLAUDE_CODE_ENTRYPOINT).toBeUndefined()
    expect(env.ANTHROPIC_MODEL).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
    expect(env.SOME_OTHER).toBeUndefined()
    expect(dropped).toEqual(['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'CLAUDE_CODE_ENTRYPOINT'])
  })

  it('re-adds the api key only when that is the chosen auth method', () => {
    const { env } = scrubEnvironment({
      env: { PATH: '/bin', ANTHROPIC_API_KEY: 'sk-not-real' },
      configDir: 'C:/run/claude-home',
      useApiKey: true,
    })
    expect(env.ANTHROPIC_API_KEY).toBe('sk-not-real')
  })
})

describe('R3.1 — the run root lives outside the repo', () => {
  it('defaults under LOCALAPPDATA and honours the override', () => {
    expect(runsRoot({ LOCALAPPDATA: 'C:/Users/Cam/AppData/Local' })).toBe(
      path.join('C:/Users/Cam/AppData/Local', 'boss-blueprint', 'roundtrip-runs'),
    )
    expect(runsRoot({ ROUNDTRIP_RUNS_DIR: 'D:/elsewhere' })).toBe(path.resolve('D:/elsewhere'))
  })

  it('names run directories per protocol §0', () => {
    const name = runDirName({ startedAt: new Date('2026-07-29T10:20:30.400Z'), scenarioId: 'A', gitSha: 'abcdef1234' })
    expect(name).toBe('2026-07-29T10-20-30-400Z_A_abcdef1')
  })
})

describe('post-run credential scrub (MEDIUM-5)', () => {
  it('removes every sterile claude-home in the run tree and reports it', async () => {
    // The credential's CONTENTS never enter the evidence (R3.4), but the COPY sits in
    // the run directory for the life of the run, and the run root is a long-lived
    // folder. The scrub runs on both exits, so a failed run leaves no copy either.
    const runDir = await tempDir()
    for (const where of ['builder', path.join('eval', 'attempt-0'), path.join('eval', 'attempt-1')]) {
      await mkdir(path.join(runDir, where, 'claude-home'), { recursive: true })
      await writeFile(path.join(runDir, where, 'claude-home', '.credentials.json'), '{"token":"not-real"}', 'utf8')
      await writeFile(path.join(runDir, where, 'claude-home', 'settings.json'), '{}', 'utf8')
    }
    await mkdir(path.join(runDir, 'shots'), { recursive: true })
    await writeFile(path.join(runDir, 'shots', 'home.png'), 'not really a png', 'utf8')

    const result = await scrubCredentials(runDir)

    expect(result.credentialScrubbed).toBe(true)
    expect(result.removed).toHaveLength(3)
    expect(result.problems).toEqual([])
    const left = await listRecursive(runDir)
    expect(left.join('\n')).not.toContain('credentials')
    // The rest of the evidence is untouched — this is a scrub, not a cleanup.
    expect(left).toContain('shots/home.png')
  })

  it('is a no-op on a run that never created one', async () => {
    const result = await scrubCredentials(await tempDir())
    expect(result).toEqual({ credentialScrubbed: true, removed: [], problems: [] })
  })
})
