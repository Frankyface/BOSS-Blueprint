import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import { addBlock, attachPageScreenshot, openCanvas } from './support/canvas.ts'
import type { BlockTypeId } from './support/canvas.ts'

/**
 * REGRESSION: the app shell must be pinned to the window, so the canvas viewport
 * is the only thing that scrolls (review HIGH-1).
 *
 * `.app-shell { min-height: 100% }` let the shell grow past the window: the
 * 1600px-tall scaled page made the body taller than the viewport, the DOCUMENT
 * became the scroller, and one wheel gesture carried the header, the palette and
 * the canvas toolbar off the top of the screen — falsifying this project's own
 * decision that the toolbar "is always in the same place for the client".
 *
 * Measured at a real laptop size rather than the suite's roomy 1920x1000, because
 * the shorter the window the sooner the old layout broke.
 */
const LAPTOP_VIEWPORT = { width: 1366, height: 768 }

/** Six blocks — the arrangement the reviewer reproduced the failure with. */
const REPRO_BLOCKS: readonly BlockTypeId[] = [
  'nav-bar',
  'section',
  'heading',
  'text',
  'image',
  'button',
]

const WHEEL_DISTANCE_PX = 600

/** Fully inside the window: nothing clipped off the top, bottom or sides. */
async function expectWithinViewport(target: Locator, name: string): Promise<void> {
  const box = await target.boundingBox()
  expect(box, `${name} should be laid out`).not.toBeNull()
  if (!box) return

  expect(box.y, `${name} top is above the window`).toBeGreaterThanOrEqual(0)
  expect(box.x, `${name} left is outside the window`).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height, `${name} bottom is below the window`).toBeLessThanOrEqual(
    LAPTOP_VIEWPORT.height,
  )
  expect(box.x + box.width, `${name} right is outside the window`).toBeLessThanOrEqual(
    LAPTOP_VIEWPORT.width,
  )
}

function documentScrollTop(page: Page): Promise<number> {
  return page.evaluate(() => document.scrollingElement?.scrollTop ?? -1)
}

/** True when the document has no room to scroll at all. */
function documentIsUnscrollable(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.scrollingElement
    if (!root) return false
    // 1px of tolerance for sub-pixel rounding of the scaled page.
    return root.scrollHeight - root.clientHeight <= 1
  })
}

test.describe('app layout', () => {
  test.use({ viewport: LAPTOP_VIEWPORT })

  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
  })

  test('the canvas viewport is the only scroller, even on an empty page', async ({ page }) => {
    // The page is 1600px tall before a single block is placed, so this holds from
    // the very first paint — nothing about it depends on how much content there is.
    expect(await documentIsUnscrollable(page)).toBe(true)
    expect(await documentScrollTop(page)).toBe(0)
  })

  test('scrolling a tall page never carries the chrome off screen', async ({ page }) => {
    for (const type of REPRO_BLOCKS) {
      await addBlock(page, type)
    }

    const viewport = page.getByTestId('canvas-viewport')
    await viewport.hover()
    await page.mouse.wheel(0, WHEEL_DISTANCE_PX)

    // The wheel actually moved something — without this the test would pass
    // vacuously on a layout where nothing scrolls at all.
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

    // ...and what moved was the canvas, not the document.
    expect(await documentScrollTop(page)).toBe(0)
    expect(await documentIsUnscrollable(page)).toBe(true)

    await expectWithinViewport(page.getByTestId('app-header'), 'the header')
    await expectWithinViewport(page.getByTestId('block-palette'), 'the block palette')
    await expectWithinViewport(page.getByTestId('canvas-toolbar'), 'the canvas toolbar')

    // The toolbar is still usable, not merely present in the DOM.
    await expect(page.getByTestId('canvas-toolbar-status')).toBeVisible()
    await expect(page.getByTestId('palette-heading')).toBeVisible()

    await attachPageScreenshot(page, 'scrolled-canvas')
  })

  /**
   * THE CHROME AT A NARROW DESKTOP (UX audit MINOR/M6).
   *
   * At 1024x768 the page strip's action group was 485px wide inside a 480px strip
   * because it refused to shrink, so "Delete page" ran under the details panel and
   * was painted over by it. Both action groups now shrink and wrap.
   *
   * 1024 is the Stage 4 desktop-guard threshold: below it the app says so out
   * loud, above it every control must be reachable with a mouse.
   */
  test.describe('narrow desktop windows', () => {
    const NARROW_SIZES = [
      { width: 1280, height: 800 },
      { width: 1100, height: 800 },
      { width: 1024, height: 768 },
    ] as const

    /** Every control in the chrome, by the test id a client would reach for. */
    const CHROME_CONTROLS = [
      'toolbar-undo',
      'toolbar-redo',
      'toolbar-send-backward',
      'toolbar-bring-forward',
      'toolbar-delete',
      'toolbar-start-over',
      'page-add',
      'page-rename',
      'page-duplicate',
      'page-move-left',
      'page-move-right',
      'page-delete',
    ] as const

    for (const size of NARROW_SIZES) {
      test(`every toolbar control is reachable at ${String(size.width)}x${String(size.height)}`, async ({
        page,
      }) => {
        await page.setViewportSize(size)
        await addBlock(page, 'heading')

        const panelBox = await page.getByTestId('side-panel').boundingBox()
        expect(panelBox).not.toBeNull()

        for (const testId of CHROME_CONTROLS) {
          const control = page.getByTestId(testId)
          await expect(control, `${testId} should be on screen`).toBeVisible()

          const box = await control.boundingBox()
          expect(box, `${testId} should be laid out`).not.toBeNull()
          if (!box || !panelBox) continue

          // Wholly inside the window…
          expect(box.x, `${testId} starts off the left of the window`).toBeGreaterThanOrEqual(0)
          expect(box.x + box.width, `${testId} runs off the right`).toBeLessThanOrEqual(size.width)
          expect(box.y + box.height, `${testId} runs off the bottom`).toBeLessThanOrEqual(
            size.height,
          )
          // …and clear of the details panel, which paints over anything that runs
          // under it.
          expect(box.x + box.width, `${testId} runs under the details panel`).toBeLessThanOrEqual(
            panelBox.x + 1,
          )
        }

        // Reachable is more than "laid out": Playwright's click does a hit test.
        await page.getByTestId('toolbar-send-backward').click()
        await page.getByTestId('page-add').click()
        await expect(page.getByTestId('page-add-name')).toBeVisible()
      })
    }
  })

  test('the chrome stays put through repeated scrolling in both directions', async ({ page }) => {
    for (const type of REPRO_BLOCKS) {
      await addBlock(page, type)
    }

    const viewport = page.getByTestId('canvas-viewport')
    const toolbarBefore = await page.getByTestId('canvas-toolbar').boundingBox()
    await viewport.hover()

    for (let gesture = 0; gesture < 3; gesture += 1) {
      await page.mouse.wheel(0, WHEEL_DISTANCE_PX)
    }
    await page.mouse.wheel(0, -WHEEL_DISTANCE_PX)

    expect(await documentScrollTop(page)).toBe(0)

    // The toolbar has not shifted by a single pixel through any of it.
    const toolbarAfter = await page.getByTestId('canvas-toolbar').boundingBox()
    expect(toolbarAfter?.y).toBeCloseTo(toolbarBefore?.y ?? -1, 0)
  })
})
