// @vitest-environment node
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { buildGreenPackage } from './selftest/build-fixture.mjs'

const exec = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')
const SPEC = path.join(REPO_ROOT, 'docs', 'export-format.md')
const GATE = path.join(HERE, 'gate.mjs')

let workDir
let fixtureZip

beforeAll(async () => {
  workDir = await mkdtemp(path.join(os.tmpdir(), 'bp-gate-contract-'))
  fixtureZip = (await buildGreenPackage(SPEC, workDir)).outPath
}, 120_000)

afterAll(async () => {
  if (workDir) await rm(workDir, { recursive: true, force: true })
})

/** @returns {Promise<{ code: number, stdout: string }>} */
async function runGate(args) {
  try {
    const { stdout } = await exec('node', [GATE, ...args], { cwd: REPO_ROOT, maxBuffer: 32 * 1024 * 1024 })
    return { code: 0, stdout }
  } catch (err) {
    return { code: err.code ?? 1, stdout: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

/**
 * The feature file's "Dependency contract on gate.mjs" — asserted, not assumed.
 * Stage 4 consumes this gate and adds protocol §2 step 4 to it; if one of these
 * assertions ever goes red, the fix belongs in the gate, not in a shim here.
 */
describe('the gate.mjs dependency contract', () => {
  it('accepts the documented CLI', async () => {
    const { stdout } = await runGate(['--help'])
    for (const flag of ['--package', '--scenario', '--out', '--no-manifest']) expect(stdout).toContain(flag)
  }, 60_000)

  it('exits 0 on a clean package', async () => {
    const { code } = await runGate(['--package', fixtureZip, '--no-manifest', '--quiet'])
    expect(code).toBe(0)
  }, 120_000)

  it('exits 2 on a harness/infra error (unreadable zip)', async () => {
    const { code } = await runGate(['--package', path.join(workDir, 'does-not-exist.zip'), '--no-manifest'])
    expect(code).toBe(2)
  }, 60_000)

  it('exits 2 on a usage error', async () => {
    const { code } = await runGate(['--no-manifest'])
    expect(code).toBe(2)
  }, 60_000)

  it('writes <out>/gate-report.json in the contract shape', async () => {
    const outDir = path.join(workDir, 'out')
    await runGate(['--package', fixtureZip, '--no-manifest', '--quiet', '--out', outDir])
    const report = JSON.parse(await readFile(path.join(outDir, 'gate-report.json'), 'utf8'))
    expect(report).toMatchObject({ ok: true, failures: [] })
    expect(Array.isArray(report.steps)).toBe(true)
    for (const step of report.steps) {
      expect(step).toMatchObject({ id: expect.any(String), ok: expect.any(Boolean), detail: expect.any(String) })
    }
    expect(report.steps.map((s) => s.id)).toContain('M04')
  }, 120_000)

  it('reports step 4 as SKIP with --no-manifest and WARNs without a scenario', async () => {
    const skipped = await runGate(['--package', fixtureZip, '--no-manifest'])
    expect(skipped.stdout).toMatch(/SKIP\s+M04/)
    const warned = await runGate(['--package', fixtureZip])
    expect(warned.stdout).toMatch(/WARN\s+M04/)
    expect(warned.code).toBe(0) // a WARN never changes the exit code
  }, 180_000)

  it('runs the Stage 4 manifest diff when --scenario is passed, and FAILS a mismatched one', async () => {
    // The §7.1 fixture is a bakery, not a landscaper: every page, block and setting
    // disagrees with Scenario A, so M04 must go red and take the exit code with it.
    const { code, stdout } = await runGate([
      '--package',
      fixtureZip,
      '--scenario',
      path.join(HERE, 'scenarios', 'scenario-A.json'),
      '--quiet',
    ])
    expect(code).toBe(1)
    expect(stdout).toMatch(/FAIL\s+M04/)
  }, 120_000)
})
