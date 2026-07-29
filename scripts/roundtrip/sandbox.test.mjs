// @vitest-environment node
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { builtinsFor, pinnedVersions } from './builtin-manifest.mjs'
import {
  assertSessionPurity,
  assertNoBannedFlags,
  authFailureOf,
  buildArgv,
  runSession,
  SessionError,
} from './claude-session.mjs'
import { mockBuilderEvents } from './run.mjs'
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

/**
 * R4.6 — BASELINE STERILITY, not emptiness (amended 2026-07-29, docs/decisions.md).
 *
 * The old suite asserted `{ agents: [], skills: [] }` was pure and anything else was not,
 * which is exactly backwards for a CLI that ships built-ins inside the binary: the only
 * transcript that could ever pass it was one the harness wrote itself. Every fixture here
 * starts from the COMMITTED manifest, so these tests fail if a non-builtin appears — and
 * they also fail if someone quietly empties the manifest.
 */
/** What `run.mjs`'s mock builder claims — the newest measured entry, by `.at(-1)`. */
const MOCK_VERSION = pinnedVersions().at(-1)

describe('R4.6 — the committed manifest, across EVERY measured CLI version', () => {
  const VERSIONS = pinnedVersions()

  it('covers both versions the harness has measured, oldest first', () => {
    // Order is load-bearing: run.mjs's mock builder claims `.at(-1)`, so the newest entry
    // must be last or `--mock-builder` stops exercising the CLI the operator actually has.
    expect(VERSIONS).toEqual(['2.1.190', '2.1.220'])
  })

  it.each([
    ['2.1.190', 5, 14, 27],
    ['2.1.220', 5, 16, 43],
  ])('%s is a measured baseline, not an empty stub', (version, agents, skills, commands) => {
    const baseline = builtinsFor(version)
    expect(baseline.agents).toHaveLength(agents)
    expect(baseline.skills).toHaveLength(skills)
    expect(baseline.slash_commands).toHaveLength(commands)
    expect(baseline.agents).toContain('statusline-setup')
    expect(baseline.output_style).toBe('default')
    expect(baseline.memoryField).toBe('memory_paths')
  })

  it('2.1.220 is a pure SUPERSET of 2.1.190 — the delta reviewed by name, nothing removed', () => {
    const older = builtinsFor('2.1.190')
    const newer = builtinsFor('2.1.220')
    const added = (field) => newer[field].filter((name) => !older[field].includes(name))
    const removed = (field) => older[field].filter((name) => !newer[field].includes(name))

    for (const field of ['agents', 'skills', 'slash_commands']) expect(removed(field)).toEqual([])
    expect(added('agents')).toEqual([])
    expect(added('skills')).toEqual(['dataviz', 'doctor'])
    expect(added('slash_commands')).toEqual([
      'dataviz',
      'doctor',
      'agents',
      'color',
      'effort',
      'fast',
      'mcp',
      'model',
      '__remote-workflow',
      'workflow-launch-exec',
      'rename',
      'ultrareview',
      'recap',
      'design',
      'design-consent',
      'design-revoke',
    ])
  })

  it('every entry carries all three sets as arrays of unique, non-empty names', () => {
    for (const version of VERSIONS) {
      const baseline = builtinsFor(version)
      for (const field of ['agents', 'skills', 'slash_commands']) {
        expect(Array.isArray(baseline[field])).toBe(true)
        expect(baseline[field].length).toBeGreaterThan(0)
        expect(baseline[field].every((name) => typeof name === 'string' && name !== '')).toBe(true)
        expect(new Set(baseline[field]).size).toBe(baseline[field].length)
      }
    }
  })

  it('an unmeasured version still has NO entry — block-on-unknown has something to block', () => {
    expect(builtinsFor('2.1.221')).toBeNull()
    expect(builtinsFor('2.1.189')).toBeNull()
    expect(builtinsFor('')).toBeNull()
  })
})

describe.each(pinnedVersions())('R4.6 — baseline sterility (CLI %s)', (VERSION) => {
  const BASELINE = builtinsFor(VERSION)
  const CLAUDE_HOME = path.join('C:', 'runs', 'r1', 'builder', 'claude-home')

  const init = (extra = {}) => [
    {
      type: 'system',
      subtype: 'init',
      model: 'resolved-id',
      claude_code_version: VERSION,
      mcp_servers: [],
      plugins: [],
      agents: [...BASELINE.agents],
      skills: [...BASELINE.skills],
      slash_commands: [...BASELINE.slash_commands],
      output_style: BASELINE.output_style,
      memory_paths: { auto: path.join(CLAUDE_HOME, 'projects', 'p', 'memory') },
      ...extra,
    },
  ]
  const check = (extra) => assertSessionPurity(init(extra), { configDir: CLAUDE_HOME })

  it('accepts a session carrying EXACTLY the built-ins, and reports the resolved model', () => {
    const purity = check({})
    expect(purity.problems).toEqual([])
    expect(purity.ok).toBe(true)
    expect(purity.model).toBe('resolved-id')
    expect(purity.version).toBe(VERSION)
  })

  it('order does not matter — it is a SET comparison', () => {
    expect(check({ skills: [...BASELINE.skills].reverse() }).ok).toBe(true)
  })

  it.each([
    ['skills', [...BASELINE.skills, 'pdf']],
    ['agents', [...BASELINE.agents, 'claude-ads:audit-meta']],
    ['slash_commands', [...BASELINE.slash_commands, 'sync-docs']],
  ])('rejects ONE extra %s as a leak, and names it', (key, value) => {
    const purity = check({ [key]: value })
    expect(purity.ok).toBe(false)
    expect(purity.kind).toBe('leak')
    expect(purity.problems.join(' ')).toContain(value.at(-1))
  })

  it.each([
    ['mcp_servers', [{ name: 'supabase' }]],
    ['plugins', ['marketing']],
  ])('rejects any %s at all — those are pure config', (key, value) => {
    const purity = check({ [key]: value })
    expect(purity.ok).toBe(false)
    expect(purity.kind).toBe('leak')
  })

  it('a MISSING builtin is a version mismatch, not a leak', () => {
    const purity = check({ skills: BASELINE.skills.filter((s) => s !== 'schedule') })
    expect(purity.ok).toBe(false)
    expect(purity.kind).toBe('version-mismatch')
    expect(purity.problems.join(' ')).toContain('schedule')
  })

  it('an unpinned CLI version aborts loudly instead of passing', () => {
    const purity = check({ claude_code_version: '2.9.999' })
    expect(purity.ok).toBe(false)
    expect(purity.kind).toBe('version-mismatch')
    expect(purity.problems.join(' ')).toContain('2.9.999')
  })

  it('rejects an output style the baseline does not name', () => {
    expect(check({ output_style: 'explanatory' }).ok).toBe(false)
  })

  describe('the memory half (finding 2 — it was checking fields this CLI never emits)', () => {
    it('reads memory_paths, the field this version actually emits', () => {
      const purity = check({ memory_paths: { auto: 'C:/Users/Cam/.claude/projects/x/memory' } })
      expect(purity.ok).toBe(false)
      expect(purity.problems.join(' ')).toContain('outside')
    })

    it('still checks the OLD field names when a CLI emits them', () => {
      expect(check({ project_memory: ['C:/repo/CLAUDE.md'] }).ok).toBe(false)
      expect(check({ memory_files: ['C:/repo/CLAUDE.md'] }).ok).toBe(false)
      expect(check({ claude_md_files: ['C:/repo/CLAUDE.md'] }).ok).toBe(false)
    })

    it('cannot pass VACUOUSLY: an init with no memory field at all is a mismatch', () => {
      const [event] = init()
      delete event.memory_paths
      const purity = assertSessionPurity([event], { configDir: CLAUDE_HOME })
      expect(purity.ok).toBe(false)
      expect(purity.problems.join(' ')).toContain('memory_paths')
    })
  })

  it('rejects a transcript with no init event at all', () => {
    expect(assertSessionPurity([]).ok).toBe(false)
    expect(assertSessionPurity([]).kind).toBe('no-init')
  })
})

/**
 * The mask that hid the defect: `--mock-builder` emitted `{ agents: [], skills: [] }`, so
 * the ONLY transcript R4.6 had ever judged was one written to satisfy it. These two tests
 * run the real predicate over the real emitter.
 *
 * The mock claims the NEWEST measured version (`run.mjs` reads `.at(-1)`), so it tracks the
 * CLI an operator actually has rather than the oldest entry the manifest still remembers.
 */
describe('the mock builder emits a REALISTIC init', () => {
  const CLAUDE_HOME = path.join('C:', 'runs', 'r1', 'builder', 'claude-home')

  it('passes the same predicate a live session must pass', () => {
    const purity = assertSessionPurity(mockBuilderEvents({ claudeHome: CLAUDE_HOME }), { configDir: CLAUDE_HOME })
    expect(purity.problems).toEqual([])
    expect(purity.ok).toBe(true)
    expect(purity.version).toBe(MOCK_VERSION)
  })

  it('ABORTS when a non-builtin skill is planted in it', () => {
    const events = mockBuilderEvents({
      claudeHome: CLAUDE_HOME,
      extra: { skills: [...builtinsFor(MOCK_VERSION).skills, 'supabase'] },
    })
    const purity = assertSessionPurity(events, { configDir: CLAUDE_HOME })
    expect(purity.ok).toBe(false)
    expect(purity.kind).toBe('leak')
    expect(purity.problems.join(' ')).toContain('supabase')
  })
})

/**
 * Finding 3 of the live-run entry: purity used to be asserted AFTER the session returned.
 * That was free only because auth died in 4.3 s; with a live credential every impure
 * attempt would spend a full Opus builder budget (§9: ≈ $10-25, 25-45 min) and only then
 * abort. This spawns a REAL child that emits a leaking init and then would sit for a
 * minute — the assertion has to cut it short.
 */
describe('R4.6 fires on the STREAMING init, before the budget is spent', () => {
  const CLAUDE_HOME = path.join('C:', 'runs', 'r1', 'builder', 'claude-home')
  const LINGER_MS = 60_000

  async function fakeClaude(init) {
    const dir = await tempDir()
    const script = path.join(dir, 'fake-claude.mjs')
    await writeFile(
      script,
      [
        `process.stdout.write(JSON.stringify(${JSON.stringify(init)}) + '\\n')`,
        // What a real builder does next: work, for a long time, expensively.
        `setTimeout(() => { process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', result: 'BUILD COMPLETE' }) + '\\n') }, ${String(LINGER_MS)})`,
      ].join('\n'),
      'utf8',
    )
    return { dir, script, transcriptPath: path.join(dir, 'transcript.jsonl') }
  }

  const leaking = () => {
    const [event] = mockBuilderEvents({ claudeHome: CLAUDE_HOME })
    return { ...event, skills: [...event.skills, 'supabase'] }
  }

  it('kills the child instead of waiting for the session to finish', async () => {
    const { dir, script, transcriptPath } = await fakeClaude(leaking())
    const started = Date.now()

    await expect(
      runSession({
        argv: [script],
        prompt: '',
        cwd: dir,
        env: process.env,
        transcriptPath,
        timeoutMs: LINGER_MS * 2,
        command: process.execPath,
        onInit: (init) => {
          const purity = assertSessionPurity([init], { configDir: CLAUDE_HOME })
          if (!purity.ok) throw new PreconditionError('the builder session was not sterile', purity.problems)
        },
      }),
    ).rejects.toThrow(/was not sterile/)

    expect(Date.now() - started).toBeLessThan(LINGER_MS / 2)
    // The evidence of the impure session outlives the abort.
    expect(await readFile(transcriptPath, 'utf8')).toContain('supabase')
  })

  it('lets a sterile init through and runs the session to completion', async () => {
    const [clean] = mockBuilderEvents({ claudeHome: CLAUDE_HOME })
    const { dir, script, transcriptPath } = await fakeClaude(clean)
    // Same script shape, but a short linger: this one is allowed to finish.
    await writeFile(script, `process.stdout.write(JSON.stringify(${JSON.stringify(clean)}) + '\\n')`, 'utf8')

    const result = await runSession({
      argv: [script],
      prompt: '',
      cwd: dir,
      env: process.env,
      transcriptPath,
      timeoutMs: LINGER_MS,
      command: process.execPath,
      onInit: (init) => {
        const purity = assertSessionPurity([init], { configDir: CLAUDE_HOME })
        if (!purity.ok) throw new PreconditionError('not sterile', purity.problems)
      },
    })

    expect(result.code).toBe(0)
    expect(result.init?.claude_code_version).toBe(MOCK_VERSION)
  })
})

/**
 * Surfaced BY the R4.6 amendment. While purity aborted first, a dead credential never got
 * far enough to be scored; now that a sterile session passes, the 401 reaches SEG-4 as an
 * empty sandbox, which reads exactly like a builder that ignored the brief — "FAIL — H3
 * incomplete build", written to `verdict.txt` and visible to `ship-gate.mjs`. Measured on
 * this machine before the guard landed (`C:\bp-runs\2026-07-29T11-49-45-751Z_B_ff69834`).
 */
describe('a session that could not authenticate is INFRA, never a product FAIL', () => {
  const result = (text) => [{ type: 'result', subtype: 'success', is_error: true, result: text }]

  it.each([
    'Failed to authenticate. API Error: 401 OAuth access token has expired. Re-authenticate to continue.',
    'Not logged in · Please run /login',
    'Invalid API key · Please run /login',
  ])('recognises %s', (text) => {
    expect(authFailureOf(result(text))).toBe(text)
  })

  it('does NOT claim a real build was an auth failure', () => {
    expect(authFailureOf(result('Built the site from the brief.\n\nBUILD COMPLETE'))).toBeNull()
    expect(authFailureOf([])).toBeNull()
    // A builder that ran and did the job badly is a PRODUCT verdict, and stays one.
    expect(authFailureOf(result('I could not find the hero image, so I left the slot empty.'))).toBeNull()
  })

  it('reads the LAST result event, not the first', () => {
    const events = [...result('BUILD COMPLETE'), ...result('Failed to authenticate. API Error: 401')]
    expect(authFailureOf(events)).toContain('401')
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
