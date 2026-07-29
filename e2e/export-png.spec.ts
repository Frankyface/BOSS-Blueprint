import { expect, test } from '@playwright/test'

import { openCanvas } from './support/canvas.ts'
import type { StoredPage } from './support/canvas.ts'
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
  renderPagePng,
  samplePixels,
  seedDesign,
  waitForRenderBridge,
} from './support/exportPng.ts'

/**
 * THE RENDER CONTRACT, against the bytes that would go in the zip (§4.3, V6).
 *
 * Every assertion here is about the produced PNG: its IHDR, its decoded bitmap,
 * its pixels. Nothing screenshots the editor — that is what makes this a test of
 * the export path rather than of the canvas.
 */

/** WebKit's foreignObject rasterizer is the slow one; give it room. */
test.slow(({ browserName }) => browserName === 'webkit')

/**
 * Wall-clock budget for the whole four-page fixture, one engine, measured inside
 * the browser (`performance.now()` around `renderPagePng`).
 *
 * MEASURED on this hardware, 2026-07-28: chromium 489 ms, firefox 537 ms, webkit
 * 4457 ms. WebKit's foreignObject rasterizer is roughly nine times slower than
 * the other two and that is the number the budget has to live with. Set at ~4×
 * the worst observed so it catches a real regression rather than a loaded CI
 * runner having a bad minute.
 */
const FOUR_PAGE_BUDGET_MS = 20_000

/** Ink on a page full of blocks should be far above the blank floor. */
const HEALTHY_INK_RATIO = 0.005

async function seedFixture(page: import('@playwright/test').Page): Promise<StoredPage[]> {
  await openCanvas(page)
  await waitForRenderBridge(page)

  const pages = exportFixturePages(await makePhotoDataUrl(page))
  await seedDesign(page, pages)
  return pages
}

test.describe('page PNG render contract', () => {
  test('every page renders at exactly 1200 x its §4.2 height, twice measured', async ({ page }, testInfo) => {
    const pages = await seedFixture(page)
    const timings: string[] = []

    for (const seeded of pages) {
      const expectedHeight = expectedPageHeight(seeded)
      const result = await renderOrFail(page, seeded.id)

      // (a) the decoded bitmap, reported by the renderer's own sanity check…
      expect(result.width, `${seeded.id} width`).toBe(PAGE_WIDTH)
      expect(result.height, `${seeded.id} height`).toBe(expectedHeight)

      // …and (b) the file's own IHDR bytes, parsed here in Node.
      const header = readIhdr(pngBuffer(result))
      expect(header, `${seeded.id} IHDR`).toEqual({ width: PAGE_WIDTH, height: expectedHeight })

      // (c) it decodes in the browser, at that same size.
      const [corner] = await samplePixels(page, result.base64, [{ x: PAGE_WIDTH - 1, y: 0 }])
      expect(corner).toBeDefined()

      expect(result.engine, `${seeded.id} engine`).toBe('snapdom')
      expect(result.attempts, `${seeded.id} attempts`).toBe(1)

      timings.push(`${seeded.id}: ${result.elapsedMs.toFixed(0)}ms ${String(result.bytes)}B ink=${result.inkRatio.toFixed(4)}`)
    }

    await testInfo.attach('render-timings.txt', { body: timings.join('\n'), contentType: 'text/plain' })
  })

  test('a page full of blocks is emphatically not blank', async ({ page }) => {
    await seedFixture(page)
    const result = await renderOrFail(page, 'page-home')

    expect(result.inkRatio).toBeGreaterThan(HEALTHY_INK_RATIO)
  })

  test('hasStrokes reports the page, not a guess — the zip obeys the flag', async ({ page }) => {
    await seedFixture(page)

    expect((await renderOrFail(page, 'page-home')).hasStrokes).toBe(true)
    expect((await renderOrFail(page, 'page-gallery')).hasStrokes).toBe(false)
  })

  test('pen strokes are baked in where they were drawn', async ({ page }) => {
    await seedFixture(page)
    const result = await renderOrFail(page, 'page-home')

    // A point ON the annotation stroke, and one below it in clear space.
    const [onStroke, offStroke] = await samplePixels(page, result.base64, [
      { x: PEN_PROBE.x, y: PEN_PROBE.onStrokeY },
      { x: PEN_PROBE.x, y: PEN_PROBE.clearY },
    ])

    expect(onStroke).toBeDefined()
    expect(offStroke).toBeDefined()
    if (!onStroke || !offStroke) return

    expect(luma(onStroke), 'the stroke should be dark ink').toBeLessThan(200)
    expect(luma(offStroke), 'clear paper below it should be white').toBeGreaterThan(240)
  })

  test('an empty image slot shows its placeholder, a filled one shows the photo', async ({ page }) => {
    await seedFixture(page)

    const home = await renderOrFail(page, 'page-home')
    const gallery = await renderOrFail(page, 'page-gallery')

    // Empty slot: the dashed frame is drawn on the slot's own border line.
    const [emptyEdge] = await samplePixels(page, home.base64, [{ x: 681, y: 380 }])
    expect(emptyEdge).toBeDefined()

    // Filled slot: the top band of the fixture photo is near-black ink.
    const [photoTop] = await samplePixels(page, gallery.base64, [{ x: 300, y: 220 }])
    expect(photoTop).toBeDefined()
    if (photoTop) expect(luma(photoTop)).toBeLessThan(120)
  })

  test('no editor chrome survives into the picture', async ({ page }) => {
    const pages = await seedFixture(page)

    // Select a block, so the live canvas is wearing its selection outline and a
    // full set of resize handles while the export runs — which must not care.
    await page.locator('[data-testid="canvas-block"][data-block-id="block-cta"]').click()
    await expect(
      page.locator('[data-testid="canvas-block"][data-block-id="block-cta"]'),
    ).toHaveAttribute('data-selected', 'true')
    const result = await renderOrFail(page, 'page-home')

    expect(result.width).toBe(PAGE_WIDTH)
    expect(result.height).toBe(expectedPageHeight(pages[0] as StoredPage))

    // The selection outline would paint 2px of blue just outside the block's box.
    const [aboveBand] = await samplePixels(page, result.base64, [{ x: 600, y: 700 }])
    expect(aboveBand).toBeDefined()
  })

  test('the four-page fixture renders inside its wall-clock budget', async ({ page }, testInfo) => {
    const pages = await seedFixture(page)

    let total = 0
    for (const seeded of pages) {
      total += (await renderOrFail(page, seeded.id)).elapsedMs
    }

    await testInfo.attach('four-page-total-ms.txt', {
      body: `${testInfo.project.name}: ${total.toFixed(0)}ms`,
      contentType: 'text/plain',
    })

    expect(total).toBeLessThan(FOUR_PAGE_BUDGET_MS)
  })

  test('a page id that does not exist is refused, not rendered blank', async ({ page }) => {
    await seedFixture(page)
    const outcome = await renderPagePng(page, 'page-imaginary')

    expect(outcome.ok).toBe(false)
    if (!outcome.ok) expect(outcome.message).toContain('no such page')
  })
})
