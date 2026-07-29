import { expect, test } from '@playwright/test'

import { openCanvas, readBlock, readPage } from './support/canvas.ts'
import {
  CLIP_PROBE,
  exportFixturePages,
  expectedPageHeight,
  luma,
  makePhotoDataUrl,
  OVERFLOW_BLOCK,
  PAGE_WIDTH,
  pngBuffer,
  readIhdr,
  renderOrFail,
  samplePixels,
  seedDesign,
  waitForRenderBridge,
} from './support/exportPng.ts'

/**
 * THE CLIP RULE (§4.3, V25): the exported rectangle is `[0, 1200) × [0, height)`
 * and the PNG is that rectangle pixel for pixel. A block dragged past the right
 * edge renders its on-page part and is cut at column 1199 — not shrunk, not
 * nudged left, and the render never widens to accommodate it.
 *
 * Proved against a CONTROL page that is identical minus the overflowing block:
 * "column 1199 is dark" only means something next to "on the control page the
 * same pixel is paper".
 */

test.slow(({ browserName }) => browserName === 'webkit')

/** The overflowing block is a nav bar: `--boss-ink`, #0b1220, luma ≈ 17. */
const INK_MAX_LUMA = 90
const PAPER_MIN_LUMA = 240

test.beforeEach(async ({ page }) => {
  await openCanvas(page)
  await waitForRenderBridge(page)
  await seedDesign(page, exportFixturePages(await makePhotoDataUrl(page)))
})

test('the PNG stays exactly 1200 wide when a block runs past the edge', async ({ page }) => {
  const clipped = await renderOrFail(page, 'page-clip')
  const control = await renderOrFail(page, 'page-clip-control')

  expect(clipped.width).toBe(PAGE_WIDTH)
  expect(readIhdr(pngBuffer(clipped)).width).toBe(PAGE_WIDTH)

  // The overflowing block must not change the page's height either.
  expect(clipped.height).toBe(control.height)
  expect(clipped.height).toBe(expectedPageHeight(await readPage(page, 'page-clip')))
})

test('the block paints out to column 1199 and is cut there', async ({ page }) => {
  const clipped = await renderOrFail(page, 'page-clip')
  const control = await renderOrFail(page, 'page-clip-control')

  // Each column is sampled down the bar's height, not at one row — see CLIP_PROBE.
  const columns = [
    { label: 'inside the overflow (x=1150)', x: CLIP_PROBE.insideX },
    { label: 'the last on-page column (x=1199)', x: CLIP_PROBE.lastColumnX },
  ]
  const probes = columns.flatMap(({ x }) => CLIP_PROBE.ys.map((y) => ({ x, y })))

  const clippedPixels = await samplePixels(page, clipped.base64, probes)
  const controlPixels = await samplePixels(page, control.base64, probes)

  expect(clippedPixels).toHaveLength(probes.length)
  expect(controlPixels).toHaveLength(probes.length)

  columns.forEach(({ label }, column) => {
    const start = column * CLIP_PROBE.ys.length
    const lumas = clippedPixels
      .slice(start, start + CLIP_PROBE.ys.length)
      .map((pixel) => luma(pixel))

    // THE DARKEST ROW is the bar's fill; a white label can only lighten a row.
    expect(Math.min(...lumas), `${label} should be block ink, rows read ${lumas.map((value) => value.toFixed(1)).join(', ')}`).toBeLessThan(INK_MAX_LUMA)
  })

  // The control page is the same page minus the block: every one of those exact
  // pixels must be paper, which is what makes "it is dark there" mean anything.
  for (const [index, pixel] of controlPixels.entries()) {
    expect(pixel, `control probe ${String(index)}`).toBeDefined()
    expect(luma(pixel), `control probe ${String(index)} should be paper`).toBeGreaterThan(PAPER_MIN_LUMA)
  }
})

test('the document keeps the TRUE frame — the clip loses no geometry', async ({ page }) => {
  // The picture is cut; the machine-readable truth is not. `site.json`'s
  // generator (a sibling Stage 3 feature) reads this same document, V25 WARNs on
  // it, and [N13] narrates it in the brief.
  await page.getByTestId('page-tab').filter({ hasText: 'Clip' }).first().click()
  const block = await readBlock(page, 'block-overflow')

  expect(block.x).toBe(OVERFLOW_BLOCK.x)
  expect(block.width).toBe(OVERFLOW_BLOCK.width)
  expect(block.x + block.width).toBeGreaterThan(PAGE_WIDTH)
})

test('a clipped page is still a perfectly sane export — never a blocked one', async ({ page }) => {
  const clipped = await renderOrFail(page, 'page-clip')

  // Cam's ruling: clipping is a WARN, never a BLOCK. A block hanging 20px past
  // the edge is a normal sketching accident, and refusing the submission over it
  // would be hostile.
  expect(clipped.attempts).toBe(1)
  expect(clipped.inkRatio).toBeGreaterThan(0)
})
