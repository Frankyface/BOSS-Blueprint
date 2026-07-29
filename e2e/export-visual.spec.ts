import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { Browser, BrowserType, Page, TestInfo } from '@playwright/test'
import { chromium, expect, firefox, test, webkit } from '@playwright/test'

import { openCanvas } from './support/canvas.ts'
import {
  exportFixturePages,
  expectedPageHeight,
  makePhotoDataUrl,
  PAGE_WIDTH,
  renderOrFail,
  seedDesign,
  waitForRenderBridge,
} from './support/exportPng.ts'

/**
 * VISUAL REGRESSION ON THE EXPORTED ARTIFACT — day-one, binding
 * (`docs/decisions.md` 2026-07-27, debate #1).
 *
 * The screenshot is taken of the DECODED PNG loaded back into a blank page, not
 * of the live editor: that is what makes this a test of the export path rather
 * than of the canvas. Two axes, because either alone has a blind spot:
 *
 *  1. PER ENGINE, against its own committed baseline — Chromium, Firefox and
 *     WebKit legitimately differ on font hinting and anti-aliasing, so one shared
 *     baseline would either be too loose to catch anything or permanently red.
 *     Playwright suffixes the file with the project and platform for us; a
 *     missing baseline fails loudly rather than passing silently.
 *  2. CROSS ENGINE, which no per-engine baseline can give: the three engines
 *     agree on the exact dimensions, and their ink ratios sit inside a named
 *     band of each other. This is the assertion that catches "WebKit rendered
 *     half the page" on the very first run.
 */

test.slow(({ browserName }) => browserName === 'webkit')

/** Room for anti-aliasing drift inside one engine, not for a missing block. */
const MAX_DIFF_PIXEL_RATIO = 0.02

/**
 * Cross-engine ink band, as a fraction of the median.
 *
 * MEASURED, not guessed: on the content-rich fixture pages the three engines
 * land within ~1.5% of each other (home 0.2812 / 0.2794 / 0.2772, gallery 0.0731
 * / 0.0719 / 0.0718). The band is set an order of magnitude wider so hinting
 * changes never flake it, and still an order of magnitude tighter than any real
 * "half the page is missing" failure.
 */
const INK_TOLERANCE = 0.25

/**
 * Sparse pages are excluded from the ink band on purpose: when a page is almost
 * all paper, nearly all of its ink is anti-aliased glyph edges, and the engines
 * legitimately differ by a third there (clip-control measured 0.0047 / 0.0036 /
 * 0.0036). Below this floor the blank gate is the check that matters.
 */
const INK_BAND_FLOOR = 0.01

/** The pages the cross-engine comparison uses — the ones with real content on them. */
const COMPARED_PAGES = ['page-home', 'page-gallery'] as const

async function seedAndOpen(page: Page): Promise<void> {
  await openCanvas(page)
  await waitForRenderBridge(page)
  await seedDesign(page, exportFixturePages(await makePhotoDataUrl(page)))
}

/** Put the exported bytes back on screen, at natural size, on a blank white page. */
async function showExportedPng(page: Page, base64: string, size: { width: number; height: number }) {
  await page.setContent(
    `<body style="margin:0;background:#fff">` +
      `<img id="exported" width="${String(size.width)}" height="${String(size.height)}" ` +
      `style="display:block" src="data:image/png;base64,${base64}">` +
      `</body>`,
  )

  const image = page.locator('#exported')
  await expect(image).toBeVisible()
  return image
}

/** Where Playwright keeps this spec's baselines, and how it names them. */
const SNAPSHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), 'export-visual.spec.ts-snapshots')

const baselineFileFor = (name: string, browserName: string): string =>
  join(SNAPSHOT_DIR, `${name}-${browserName}-${process.platform}.png`)

/**
 * SKIP, LOUDLY, WHEN THIS DEVELOPER'S PLATFORM HAS NO BASELINE YET — BUT NEVER
 * IN CI.
 *
 * A per-engine baseline is a screenshot of one operating system's font
 * rasterisation, so `win32` bytes can never stand in for `linux` bytes: the
 * files can only be produced on the platform that will be compared against
 * them. `win32` and `linux` are both committed. A third platform (a contributor
 * on macOS) has none, and Playwright's default `updateSnapshots: 'missing'`
 * would write one and FAIL that run — turning "your OS is not baselined yet"
 * into what looks like a visual regression.
 *
 * So off CI the comparison is skipped, with an annotation and a warning loud
 * enough that it cannot rot unnoticed.
 *
 * IN CI IT IS A HARD FAILURE, on purpose. CI runs ubuntu and ubuntu baselines
 * exist, so the only ways to reach this branch there are a deleted baseline or a
 * new engine added without one — and both must go red rather than quietly
 * skipping the regression check that is the whole point of the spec.
 *
 * PRODUCING BASELINES for a new platform is a one-click job: run the
 * `update-visual-baselines` workflow (`.github/workflows/deploy.yml`) on a
 * runner of that platform, download its artifact, commit the files. That job
 * passes `--update-snapshots=all`, which is exactly the case this gate must NOT
 * skip — otherwise the job that exists to create baselines could never create
 * them.
 *
 * A baseline that EXISTS and does not match is a hard failure everywhere.
 */
function skipWithoutBaseline(testInfo: TestInfo, name: string, browserName: string): void {
  const isUpdatingRun =
    testInfo.config.updateSnapshots === 'all' || testInfo.config.updateSnapshots === 'changed'
  if (isUpdatingRun || existsSync(baselineFileFor(name, browserName))) return

  // In CI a missing baseline is a real defect, not an unbaselined workstation.
  if (process.env.CI) return

  const missing = `${name}-${browserName}-${process.platform}.png`
  const detail =
    `No ${process.platform} baseline for ${missing}. Visual comparison SKIPPED — ` +
    'run the update-visual-baselines workflow and commit its artifact.'

  testInfo.annotations.push({ type: 'missing-visual-baseline', description: detail })
  // GitHub Actions workflow command: puts the skip in the run summary, not just the log.
  console.warn(`::warning title=Missing visual baseline::${detail}`)

  test.skip(true, detail)
}

test.describe('per-engine visual baselines', () => {
  test('the home page export matches this engine’s baseline', async ({ page, browserName }, testInfo) => {
    skipWithoutBaseline(testInfo, 'export-home', browserName)
    await seedAndOpen(page)
    const result = await renderOrFail(page, 'page-home')

    const image = await showExportedPng(page, result.base64, result)
    await expect(image).toHaveScreenshot('export-home.png', {
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
    })
  })

  test('the gallery page export matches this engine’s baseline', async ({ page, browserName }, testInfo) => {
    skipWithoutBaseline(testInfo, 'export-gallery', browserName)
    await seedAndOpen(page)
    const result = await renderOrFail(page, 'page-gallery')

    const image = await showExportedPng(page, result.base64, result)
    await expect(image).toHaveScreenshot('export-gallery.png', {
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
    })
  })
})

interface EngineReading {
  engine: string
  pageId: string
  width: number
  height: number
  inkRatio: number
}

async function readEngine(
  type: BrowserType,
  name: string,
  baseURL: string,
): Promise<EngineReading[]> {
  let browser: Browser | null = null

  try {
    browser = await type.launch()
    const context = await browser.newContext({ baseURL, viewport: { width: 1920, height: 1000 } })
    const page = await context.newPage()
    await seedAndOpen(page)

    const readings: EngineReading[] = []
    for (const pageId of COMPARED_PAGES) {
      const result = await renderOrFail(page, pageId)
      readings.push({ engine: name, pageId, width: result.width, height: result.height, inkRatio: result.inkRatio })
    }

    await context.close()
    return readings
  } finally {
    await browser?.close()
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

test.describe('cross-engine agreement', () => {
  // Drives all three engines itself, so it must run exactly once rather than
  // once per project. Chromium is simply the cheapest host for it.
  test.skip(({ browserName }) => browserName !== 'chromium', 'runs once; it launches all three engines')
  test.setTimeout(300_000)

  test('chromium, firefox and webkit agree on size, and on how much ink is there', async ({
    baseURL,
  }, testInfo) => {
    expect(baseURL, 'the E2E config must supply a baseURL').toBeTruthy()

    // SEQUENTIALLY, not `Promise.all`. This test already runs alongside the rest
    // of the suite's workers; launching three more browsers at once was a
    // self-inflicted load spike, and under contention Playwright's 30s default
    // test timeout is what breaks first (reproduced at `--workers=14`, where
    // pre-existing autosave and pen-layer specs time out too). One extra browser
    // at a time costs a few seconds and removes the spike.
    const readings: EngineReading[] = []
    for (const [type, name] of [
      [chromium, 'chromium'],
      [firefox, 'firefox'],
      [webkit, 'webkit'],
    ] as const) {
      readings.push(...(await readEngine(type, name, baseURL ?? '')))
    }

    await testInfo.attach('export-ink.json', {
      body: JSON.stringify(readings, null, 2),
      contentType: 'application/json',
    })

    const fixture = exportFixturePages('')

    for (const pageId of COMPARED_PAGES) {
      const forPage = readings.filter((reading) => reading.pageId === pageId)
      expect(forPage, `${pageId} readings`).toHaveLength(3)

      const seeded = fixture.find((candidate) => candidate.id === pageId)
      expect(seeded).toBeDefined()
      if (!seeded) continue

      // DIMENSIONAL IDENTITY: not "close", identical, and equal to §4.2's answer.
      for (const reading of forPage) {
        expect(reading.width, `${pageId} width in ${reading.engine}`).toBe(PAGE_WIDTH)
        expect(reading.height, `${pageId} height in ${reading.engine}`).toBe(expectedPageHeight(seeded))
      }

      const ratios = forPage.map((reading) => reading.inkRatio)
      const middle = median(ratios)
      expect(middle, `${pageId} should be busy enough to compare`).toBeGreaterThan(INK_BAND_FLOOR)

      for (const reading of forPage) {
        const drift = Math.abs(reading.inkRatio - middle) / middle
        expect(
          drift,
          `${reading.engine} ink on ${pageId} is ${reading.inkRatio.toFixed(4)} against a median of ${middle.toFixed(4)}`,
        ).toBeLessThan(INK_TOLERANCE)
      }
    }
  })
})
