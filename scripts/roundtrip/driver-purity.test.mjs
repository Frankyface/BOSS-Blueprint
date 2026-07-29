// @vitest-environment node
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { BANNED_ALLOW_RE } from './thresholds.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')
const DRIVER_DIR = path.join(REPO_ROOT, 'e2e', 'roundtrip')

async function driverSources() {
  const entries = await readdir(DRIVER_DIR, { withFileTypes: true })
  const files = entries.filter((e) => e.isFile() && e.name.endsWith('.ts')).map((e) => path.join(DRIVER_DIR, e.name))
  return Promise.all(files.map(async (file) => ({ file, text: await readFile(file, 'utf8') })))
}

/**
 * R2.2 — "UI-only, mechanically enforced". The ban has to be a TEST, because the
 * temptation to reach into app state is strongest exactly when a UI affordance is
 * awkward, which is precisely the moment the round trip is telling you something.
 *
 * Grepped across the whole driver directory, not just `client.spec.ts` — a helper module
 * would otherwise be an obvious hiding place.
 */
describe('R2.2 — the driver is UI-only', () => {
  it.each(['page.evaluate(', 'evaluateHandle(', '__blueprintStore', 'addInitScript('])(
    'contains no %s anywhere in e2e/roundtrip/',
    async (banned) => {
      for (const { file, text } of await driverSources()) {
        expect(text.includes(banned), `${path.basename(file)} uses ${banned}`).toBe(false)
      }
    },
  )

  it('does not import e2e/support/, whose helpers use the store bridge', async () => {
    for (const { file, text } of await driverSources()) {
      expect(/from '\.\.\/support\//.test(text), `${path.basename(file)} imports e2e/support`).toBe(false)
    }
  })

  it('still reads values back — getAttribute and inputValue are not state injection', async () => {
    const sources = await driverSources()
    expect(sources.some(({ text }) => text.includes('getAttribute('))).toBe(true)
  })
})

describe('R2.1 — the round-trip Playwright config', () => {
  it('sets retries to 0 UNCONDITIONALLY', async () => {
    const text = await readFile(path.join(REPO_ROOT, 'playwright.roundtrip.config.ts'), 'utf8')
    expect(text).toMatch(/retries:\s*0\b/)
    // The exact regression this guards: `retries: isCi ? 2 : 0` coming back.
    expect(text).not.toMatch(/retries:\s*[^,\n]*\?/)
  })

  it('is chromium-only at 1440x900 with deviceScaleFactor 1, trace and video on', async () => {
    const text = await readFile(path.join(REPO_ROOT, 'playwright.roundtrip.config.ts'), 'utf8')
    expect(text).toContain('width: 1440, height: 900')
    expect(text).toMatch(/deviceScaleFactor:\s*1/)
    expect(text).toMatch(/trace:\s*'on'/)
    expect(text).toMatch(/video:\s*'on'/)
    expect(text).not.toContain('firefox')
    expect(text).not.toContain('webkit')
  })

  it('keeps the round trip out of the tri-engine suite', async () => {
    const text = await readFile(path.join(REPO_ROOT, 'playwright.config.ts'), 'utf8')
    expect(text).toMatch(/testIgnore:\s*\['roundtrip\/\*\*'\]/)
  })
})

/**
 * Ruling 5's other half. `npx` fetches from the npm registry on a cold cache, so the
 * harness must not depend on it either — SEG-5 serves with the committed
 * `static-server.mjs`. The ONE allowed use is the orchestrator invoking the repo's own
 * already-installed Playwright for SEG-1, which is a local binary, not a fetch.
 */
describe('ruling 5 — no npx in the harness, with one named exception', () => {
  const ALLOWED = new Set(['run.mjs'])

  it('SHELLS OUT to npx nowhere except the SEG-1 Playwright invocation', async () => {
    // Matches a CHILD-PROCESS INVOCATION, not a mention: `thresholds.mjs` lists npx in the
    // deny list and several modules explain the ruling in prose, and both must keep saying
    // so. What must not exist is the harness actually shelling out to it.
    const invocation = /\b(exec|execFile|execSync|spawn|spawnSync)\w*\s*\(\s*[\s\S]{0,120}?['"]npx(\.cmd)?['"]/
    const entries = await readdir(HERE, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.mjs') || entry.name.endsWith('.test.mjs')) continue
      const text = await readFile(path.join(HERE, entry.name), 'utf8')
      if (invocation.test(text)) {
        expect(ALLOWED.has(entry.name), `${entry.name} shells out to npx`).toBe(true)
      }
    }
  })

  it('serves SEG-5 with the committed dependency-free server', async () => {
    const text = await readFile(path.join(HERE, 'capture.mjs'), 'utf8')
    expect(text).toContain("from './static-server.mjs'")
    const server = await readFile(path.join(HERE, 'static-server.mjs'), 'utf8')
    expect(server).toContain("from 'node:http'")
    // Zero third-party imports: everything it needs is a node: builtin or a threshold.
    const imports = [...server.matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1])
    for (const specifier of imports) {
      expect(specifier.startsWith('node:') || specifier.startsWith('.'), `${specifier} is a dependency`).toBe(true)
    }
  })

  it('generates no allow entry matching the banned bash prefixes', async () => {
    const text = await readFile(path.join(HERE, 'thresholds.mjs'), 'utf8')
    for (const match of text.matchAll(/'(Bash\([^']+)'/g)) {
      if (BANNED_ALLOW_RE.test(match[1])) {
        // Only the DENY list may name them.
        const context = text.slice(Math.max(0, match.index - 400), match.index)
        expect(context, `${match[1]} appears outside BUILDER_DENY`).toMatch(/BUILDER_DENY|DENIED_BASH_PREFIXES/)
      }
    }
  })
})
