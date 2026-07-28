import { defineConfig, devices } from '@playwright/test'

import { PREVIEW_BASE_URL } from './site.config.ts'

const isCi = Boolean(process.env.CI)
const SERVER_START_TIMEOUT_MS = 120_000
const CI_RETRIES = 2
const CI_WORKERS = 1

/**
 * E2E always runs against the *production* build served by `vite preview`,
 * so every run also proves the `/BOSS-Blueprint/` base path is correct.
 * Build first (`npm run e2e` does `npm run build && playwright test`).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? CI_RETRIES : 0,
  // Local runs use Playwright's default worker count; CI stays serial for stability.
  ...(isCi ? { workers: CI_WORKERS } : {}),
  reporter: isCi ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: PREVIEW_BASE_URL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: 'npm run preview',
    url: PREVIEW_BASE_URL,
    reuseExistingServer: !isCi,
    timeout: SERVER_START_TIMEOUT_MS,
  },
})
