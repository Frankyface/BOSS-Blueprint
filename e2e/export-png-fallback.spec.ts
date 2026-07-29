import { expect, test } from '@playwright/test'

import { dismissStartSurfaces } from './support/canvas.ts'
import {
  exportFixturePages,
  expectedPageHeight,
  luma,
  makePhotoDataUrl,
  PAGE_WIDTH,
  PEN_PROBE,
  pngBuffer,
  readIhdr,
  renderOrFail,
  samplePixels,
  seedDesign,
  waitForRenderBridge,
} from './support/exportPng.ts'

/**
 * THE FALLBACK PATH, FOR REAL.
 *
 * Stage 3's definition of done asks for the fallback engine to be exercised, and
 * unit stubs do not satisfy that: html-to-image serialises and rasterises the DOM
 * differently from snapdom, and the only way to learn that it disagrees about
 * something is to make it produce a whole page.
 *
 * `?export-engine=fallback` is honoured by the `--mode test` build only (the
 * query-reading code folds out of `npm run build`, exactly like the store seam),
 * and it does not stub anything: it reorders the ladder, so html-to-image runs as
 * the primary with snapdom behind it.
 */

test.slow(({ browserName }) => browserName === 'webkit')

const PAPER_MIN_LUMA = 240

test.beforeEach(async ({ page }) => {
  const response = await page.goto('./?export-engine=fallback')
  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('canvas-page')).toBeVisible()
  await waitForRenderBridge(page)
  await dismissStartSurfaces(page)
  await seedDesign(page, exportFixturePages(await makePhotoDataUrl(page)))
})

test('html-to-image produces a complete, correctly sized, non-blank page', async ({ page }) => {
  const pages = exportFixturePages('')

  for (const seeded of pages) {
    const result = await renderOrFail(page, seeded.id)

    expect(result.engine, `${seeded.id} engine`).toBe('html-to-image')
    expect(result.attempts, `${seeded.id} attempts`).toBe(1)
    expect(result.width).toBe(PAGE_WIDTH)
    expect(result.height).toBe(expectedPageHeight(seeded))
    expect(readIhdr(pngBuffer(result))).toEqual({ width: PAGE_WIDTH, height: expectedPageHeight(seeded) })
    expect(result.inkRatio).toBeGreaterThan(0)
  }
})

test('the fallback bakes the pen layer in too', async ({ page }) => {
  const result = await renderOrFail(page, 'page-home')

  const [onStroke, offStroke] = await samplePixels(page, result.base64, [
    { x: PEN_PROBE.x, y: PEN_PROBE.onStrokeY },
    { x: PEN_PROBE.x, y: PEN_PROBE.clearY },
  ])

  expect(onStroke).toBeDefined()
  expect(offStroke).toBeDefined()
  if (!onStroke || !offStroke) return

  expect(luma(onStroke)).toBeLessThan(200)
  expect(luma(offStroke)).toBeGreaterThan(PAPER_MIN_LUMA)
})

test('the fallback obeys the same clip rule', async ({ page }) => {
  const result = await renderOrFail(page, 'page-clip')

  expect(result.width).toBe(PAGE_WIDTH)
  expect(readIhdr(pngBuffer(result)).width).toBe(PAGE_WIDTH)
})
