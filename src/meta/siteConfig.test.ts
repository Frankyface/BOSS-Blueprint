import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  BASE_PATH,
  DEPLOYED_BASE_URL,
  DEPLOYED_ORIGIN,
  PREVIEW_BASE_URL,
} from '../../site.config.ts'

/**
 * From `process.cwd()`, not `import.meta.url`: under this suite's environment
 * `import.meta.url` is not a `file:` URL, so `fileURLToPath` throws at collection
 * time — which presents as "no tests" rather than a failure, the most misleading
 * outcome available. Vitest runs from the repo root.
 */
const CNAME_PATH = join(process.cwd(), 'public', 'CNAME')

/**
 * THE WHITE-SCREEN GUARD.
 *
 * On 2026-07-31 the app moved to `sketch.bossolutions.pro`. DNS was right, the
 * Let's Encrypt certificate was right, GitHub returned `200 OK` — and the page was
 * blank, because `BASE_PATH` still said `/BOSS-Blueprint/` while a custom domain
 * serves from the ROOT. Every asset 404'd behind a padlock and a 200: nothing red,
 * nothing logged, the site simply empty.
 *
 * Neither suite caught it, and the reason is the interesting part. The unit tests and
 * the E2E tests both run against a preview server whose URL is ALSO derived from
 * `BASE_PATH` — so the app and its tests agreed with each other, in the wrong place,
 * all the way to production. Self-consistency is not correctness.
 *
 * FIRST ATTEMPT AT THIS GUARD WAS VACUOUS, and it is worth recording why. Once
 * `DEPLOYED_BASE_URL` became `${DEPLOYED_ORIGIN}${BASE_PATH}`, asserting that it ends
 * with `BASE_PATH` is true by construction — it passed with the original bug pasted
 * back in. A derived value cannot testify about the thing it is derived from.
 *
 * So the load-bearing assertion below ties the config to a fact OUTSIDE it:
 * `public/CNAME` exists if and only if GitHub Pages serves this repo at a domain
 * root, and that is exactly when `BASE_PATH` must be `/`. That one is not
 * tautological — it fails on the real bug.
 */
describe('site.config — the base path matches how the host actually serves', () => {
  it('serves from the root whenever a custom domain is configured', () => {
    // THE ONE THAT WOULD HAVE CAUGHT IT. `public/CNAME` means Pages serves this repo
    // at the apex of that domain, so any repo-name prefix is a 404 factory. Without a
    // CNAME the app is a project site under `/<repo>/` and the prefix is required.
    const hasCustomDomain = existsSync(CNAME_PATH)

    if (hasCustomDomain) {
      const domain = readFileSync(CNAME_PATH, 'utf8').trim()
      expect(domain).not.toHaveLength(0)
      expect(BASE_PATH).toBe('/')
      // The address we hand clients must be the domain we actually claim.
      expect(DEPLOYED_ORIGIN).toBe(`https://${domain}`)
    } else {
      expect(BASE_PATH).not.toBe('/')
    }
  })

  it('keeps the origin free of any path, so joining it cannot double a slash', () => {
    expect(DEPLOYED_ORIGIN).toMatch(/^https:\/\/[^/]+$/)
  })

  it('starts and ends the base path with a slash, as Vite and Pages both require', () => {
    expect(BASE_PATH.startsWith('/')).toBe(true)
    expect(BASE_PATH.endsWith('/')).toBe(true)
  })

  it('builds both targets from the same base path', () => {
    // Weak on its own — both are derived — but it pins the SHAPE, so a future edit
    // that writes either URL out in full trips here instead of silently un-deriving.
    expect(DEPLOYED_BASE_URL).toBe(`${DEPLOYED_ORIGIN}${BASE_PATH}`)
    expect(PREVIEW_BASE_URL.endsWith(BASE_PATH)).toBe(true)
  })
})
