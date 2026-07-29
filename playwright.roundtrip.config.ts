import path from 'node:path'

import { defineConfig, devices } from '@playwright/test'

import { DEPLOYED_BASE_URL, PREVIEW_BASE_URL } from './site.config.ts'

/**
 * SEG-1 — the scripted fake client. A SEPARATE config from `playwright.config.ts` on
 * purpose (`feature-roundtrip-harness.md` R2.1): the round trip must never be dragged
 * into the tri-engine suite, where it would run three times and inherit `retries: 2`
 * in CI — both fatal to the protocol's determinism and its flake policy.
 *
 * `retries: 0` UNCONDITIONALLY. A flaky client run is a real UX-bug signal, not noise
 * to retry away (protocol §8.4, R10.3), and `roundtrip.config.test.mjs` asserts the
 * literal so a well-meaning `isCi ? 2 : 0` cannot come back.
 */
const VIEWPORT = { width: 1440, height: 900 }

const target = process.env.ROUNDTRIP_TARGET === 'deployed' ? 'deployed' : 'preview'
const baseURL = target === 'deployed' ? DEPLOYED_BASE_URL : PREVIEW_BASE_URL
const runDir = process.env.ROUNDTRIP_RUN_DIR ?? path.resolve('.roundtrip-dryrun')
const SERVER_START_TIMEOUT_MS = 180_000

export default defineConfig({
  testDir: './e2e/roundtrip',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 15 * 60 * 1000,
  reporter: [['list']],
  outputDir: path.join(runDir, 'client', 'artifacts'),
  use: {
    baseURL,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    trace: 'on',
    video: 'on',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: VIEWPORT, deviceScaleFactor: 1 } }],
  ...(target === 'preview' && !process.env.ROUNDTRIP_NO_SERVER
    ? {
        webServer: {
          command: 'npm run preview',
          url: PREVIEW_BASE_URL,
          // The round trip runs against the PRODUCTION bundle: no test seams, so the
          // driver could not reach into app state even if it wanted to (R2.2 Notes).
          reuseExistingServer: false,
          timeout: SERVER_START_TIMEOUT_MS,
        },
      }
    : {}),
})
