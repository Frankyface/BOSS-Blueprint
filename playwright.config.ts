import { defineConfig, devices } from '@playwright/test'

import { PREVIEW_BASE_URL } from './site.config.ts'

const isCi = Boolean(process.env.CI)
const SERVER_START_TIMEOUT_MS = 120_000
const CI_RETRIES = 2
const CI_WORKERS = 1

/**
 * Desktop-first, and wide enough that the 1200px page renders at 1:1 fit-to-window
 * zoom — so a scripted 40px mouse drag is exactly 40 page pixels and coordinate
 * assertions read straight off the store. Narrow-viewport zoom has its own test.
 *
 * The width must clear the page plus BOTH side columns plus the canvas margins:
 * 1200 + 240 (palette) + 304 (details panel) + 64 = 1808. It was 1600 before Stage
 * 2 added the details panel, at which point every drag in the suite silently became
 * a 0.83-scale drag and the coordinate assertions started failing.
 */
const VIEWPORT = { width: 1920, height: 1000 }

/**
 * E2E always runs against the *production* build served by `vite preview`, at the
 * same base path the deploy uses (`BASE_PATH`, now `/` for the custom domain), so
 * every run also proves the built asset URLs resolve.
 * Build first (`npm run e2e` does `npm run build && playwright test`).
 */
export default defineConfig({
  testDir: './e2e',
  /**
   * The round trip runs from `playwright.roundtrip.config.ts` and NOWHERE else
   * (`feature-roundtrip-harness.md` R2.1). Dragged in here it would run three times and
   * inherit `retries: 2` in CI — both fatal to the protocol's determinism and its flake
   * policy, and it would spend a builder budget per engine.
   */
  testIgnore: ['roundtrip/**'],
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? CI_RETRIES : 0,
  // Local runs use Playwright's default worker count; CI stays serial for stability.
  ...(isCi ? { workers: CI_WORKERS } : {}),
  reporter: isCi ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: PREVIEW_BASE_URL,
    trace: 'on-first-retry',
    viewport: VIEWPORT,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: VIEWPORT } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: VIEWPORT } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: VIEWPORT } },
  ],
  webServer: {
    command: 'npm run preview',
    url: PREVIEW_BASE_URL,
    // Never attach to a pre-existing preview server: a stale one serving an old
    // dist/ would let E2E pass against a build that no longer exists (review MEDIUM-1).
    reuseExistingServer: false,
    timeout: SERVER_START_TIMEOUT_MS,
  },
})
