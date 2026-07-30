import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import {
  addBlock,
  attachPageScreenshot,
  idOfType,
  moveBlockTo,
  openCanvas,
  readBlock,
  readDocument,
  redoOnce,
  reloadCanvas,
  seedBlocks,
  undoOnce,
  waitForAutosave,
} from './support/canvas.ts'
import { expectedPageHeight, renderOrFail, waitForRenderBridge } from './support/exportPng.ts'
import {
  drawStroke,
  lowestStrokePoint,
  pageHeight,
  putPenAway,
  readStrokes,
  scribbleAt,
  scrollCanvasTo,
  strokes,
  usePen,
} from './support/media.ts'

/**
 * PAGE LENGTH — "add more to the bottom of the page, then crop it back" (F2, Cam's
 * gap #1).
 *
 * The proof this suite has to deliver is that the empty room is REAL, not cosmetic:
 * before this feature the pen overlay was exactly as tall as the content-derived
 * page and clamped every sample to it, so there was literally nowhere to draw below
 * the last block. So the load-bearing test adds space, DRAWS in the new room, and
 * then presses Trim — and the mark has to still be on white paper afterwards.
 */

const STEP = 400
const EMPTY_PAGE_HEIGHT = 1600

const addSpace = 'page-space-add'
const trimSpace = 'page-space-trim'

/**
 * Bring a PAGE coordinate roughly into the middle of the canvas viewport.
 *
 * Derived from the page's own live placement rather than from a hard-coded scroll
 * offset, because the toolbar wraps at some widths and the visible band moves with
 * it — and a mouse move outside the visible canvas lands nowhere at all.
 */
async function scrollToPageY(page: Page, y: number): Promise<void> {
  const scale = Number(await page.getByTestId('canvas-page').getAttribute('data-page-scale')) || 1
  const viewport = await page.getByTestId('canvas-viewport').boundingBox()
  const target = Math.round(y * scale - (viewport?.height ?? 0) / 2)
  if (target > 0) await scrollCanvasTo(page, target)
}

/** Scroll all the way down, so the page's bottom edge (and its grab bar) is on screen. */
async function scrollToPageBottom(page: Page): Promise<void> {
  await scrollCanvasTo(page, (await pageHeight(page)) * 2)
}

test.describe('page length', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
  })

  test('adds a band of empty page and gives it straight back', async ({ page }) => {
    await expect(page.getByTestId(trimSpace)).toBeDisabled()
    await expect(page.getByTestId('page-space-hint')).toContainText(/nothing to trim/i)
    expect(await pageHeight(page)).toBe(EMPTY_PAGE_HEIGHT)

    await page.getByTestId(addSpace).click()
    expect(await pageHeight(page)).toBe(EMPTY_PAGE_HEIGHT + STEP)
    await expect(page.getByTestId(trimSpace)).toBeEnabled()

    await page.getByTestId(addSpace).click()
    expect(await pageHeight(page)).toBe(EMPTY_PAGE_HEIGHT + STEP * 2)

    // The sheet on screen really is that tall, not just the attribute.
    const sheet = await page.getByTestId('canvas-page').boundingBox()
    const scale = Number(await page.getByTestId('canvas-page').getAttribute('data-page-scale'))
    expect(sheet).not.toBeNull()
    expect(Math.round((sheet?.height ?? 0) / scale)).toBe(EMPTY_PAGE_HEIGHT + STEP * 2)

    await page.getByTestId(trimSpace).click()
    expect(await pageHeight(page)).toBe(EMPTY_PAGE_HEIGHT)
    await expect(page.getByTestId(trimSpace)).toBeDisabled()
  })

  test('each click is one undo step, and the space survives a reload', async ({ page }) => {
    test.slow()

    await page.getByTestId(addSpace).click()
    await page.getByTestId(addSpace).click()
    expect(await pageHeight(page)).toBe(EMPTY_PAGE_HEIGHT + STEP * 2)

    await undoOnce(page)
    expect(await pageHeight(page)).toBe(EMPTY_PAGE_HEIGHT + STEP)

    await redoOnce(page)
    expect(await pageHeight(page)).toBe(EMPTY_PAGE_HEIGHT + STEP * 2)

    await waitForAutosave(page)
    await reloadCanvas(page)

    expect(await pageHeight(page)).toBe(EMPTY_PAGE_HEIGHT + STEP * 2)
    expect((await readDocument(page)).pages[0]?.extraBottomPx).toBe(STEP * 2)
  })

  /**
   * GAP #1, END TO END. Before F2 the last block held the page open and the pen
   * layer was clamped to exactly that height, so this stroke had nowhere to land.
   */
  test('you can draw in the room you added, and trimming leaves the mark on the page', async ({
    page,
  }) => {
    test.slow()

    await addBlock(page, 'heading')
    const beforeSpace = await pageHeight(page)
    expect(beforeSpace).toBe(EMPTY_PAGE_HEIGHT)

    await page.getByTestId(addSpace).click()
    await page.getByTestId(addSpace).click()
    expect(await pageHeight(page)).toBe(EMPTY_PAGE_HEIGHT + STEP * 2)

    // Draw BELOW where the page used to end — the whole point of the feature.
    await scrollToPageY(page, 1760)
    await usePen(page, 'draw')
    await drawStroke(page, scribbleAt(200, 1740))
    await expect(strokes(page)).toHaveCount(1)
    await putPenAway(page)

    const markBottom = await lowestStrokePoint(page)
    expect(markBottom).toBeGreaterThan(beforeSpace)

    // Trim: the empty slack goes, the mark stays, and it still has paper under it.
    await page.getByTestId(trimSpace).click()

    const trimmed = await pageHeight(page)
    expect(trimmed).toBeGreaterThan(markBottom)
    expect(trimmed).toBeLessThan(EMPTY_PAGE_HEIGHT + STEP * 2)
    await expect(strokes(page)).toHaveCount(1)
    expect(await lowestStrokePoint(page)).toBe(markBottom)
    expect((await readDocument(page)).pages[0]?.extraBottomPx).toBeUndefined()

    const sheet = await page.getByTestId('canvas-page').boundingBox()
    const ink = await strokes(page).first().boundingBox()
    expect(sheet).not.toBeNull()
    expect(ink).not.toBeNull()
    expect(ink!.y + ink!.height).toBeLessThanOrEqual(sheet!.y + sheet!.height)

    await attachPageScreenshot(page, 'page-space-drawn-then-trimmed')
  })

  /**
   * The grab bar on the page's bottom edge does the same job for a mouse.
   *
   * Dragged UPWARDS on a page that already has room, which is the direction the
   * canvas viewport can actually accommodate: at the bottom of the scroll range the
   * page's own bottom edge sits about 32px above the end of the scroller, so a
   * scripted downward move would leave the window. It is the same `resolve` line
   * with the opposite sign, and what this test is really about is the gesture
   * wiring — capture, live preview, ONE commit on release.
   */
  test('the bottom-edge handle drags the page shorter in one undo step', async ({ page }) => {
    test.slow()

    await page.getByTestId(addSpace).click()
    await page.getByTestId(addSpace).click()
    expect(await pageHeight(page)).toBe(EMPTY_PAGE_HEIGHT + STEP * 2)

    await scrollToPageBottom(page)

    const handle = page.getByTestId('page-space-handle')
    await expect(handle).toBeVisible()
    const box = await handle.boundingBox()
    expect(box).not.toBeNull()
    if (!box) return

    const startX = box.x + box.width / 2
    const startY = box.y + box.height / 2
    const scale = Number(await page.getByTestId('canvas-page').getAttribute('data-page-scale')) || 1

    await page.mouse.move(startX, startY)
    await page.mouse.down()
    await page.mouse.move(startX, startY - 200 * scale, { steps: 8 })
    await page.mouse.up()

    const dragged = await pageHeight(page)
    expect(dragged).toBe(EMPTY_PAGE_HEIGHT + STEP * 2 - 200)
    // On the 8px grid, exactly as the export contract requires of `page.height`.
    expect(dragged % 8).toBe(0)

    // One drag, one undo step — the store is not written while the pointer is down.
    await undoOnce(page)
    expect(await pageHeight(page)).toBe(EMPTY_PAGE_HEIGHT + STEP * 2)
  })

  /**
   * D-UI, END TO END. `pageHeightForContent` clamps the page to MAX_PAGE_HEIGHT_PX
   * (8000) AFTER the request is added, so on a page whose content already fills the
   * sheet only PART of an "Add space" click lands. "Add space" used to stay enabled
   * past that point and the hint used to report the requested pixels the page never
   * grew by. Now the button greys out at the height cap and the hint reports only
   * what actually landed.
   */
  test('greys "Add space" out at the height cap and reports only the space that fit', async ({
    page,
  }) => {
    test.slow()

    await addBlock(page, 'heading')
    const id = await idOfType(page, 'heading')
    const { height } = await readBlock(page, id)

    // Park the heading near the bottom of the tallest page we allow, so its content
    // pushes the page to ~7960px — under one 400px "Add space" of headroom to the cap.
    const targetY = Math.floor((7800 - height) / 8) * 8
    await moveBlockTo(page, id, { x: 0, y: targetY })

    const contentOnly = await pageHeight(page)
    expect(contentOnly).toBeGreaterThan(8000 - STEP)
    expect(contentOnly).toBeLessThan(8000)
    await expect(page.getByTestId(addSpace)).toBeEnabled()

    await page.getByTestId(addSpace).click()

    // The page grew by only what fit before the 8000 cap — not the 400 requested.
    const capped = await pageHeight(page)
    expect(capped).toBe(8000)
    const landed = capped - contentOnly
    expect(landed).toBeGreaterThan(0)
    expect(landed).toBeLessThan(STEP)

    // "Add space" greys out at the cap, stating its reason on its own title (like Trim).
    await expect(page.getByTestId(addSpace)).toBeDisabled()
    expect(await page.getByTestId(addSpace).getAttribute('title')).toMatch(/as much empty space/i)

    // The hint reports the pixels that LANDED, never the 400 the page never grew by.
    const hint = page.getByTestId('page-space-hint')
    await expect(hint).toContainText(String(landed))
    await expect(hint).not.toContainText(String(STEP))

    // The request itself is still stored; the editor now agrees with the export that
    // only `landed` of it became real height.
    expect((await readDocument(page)).pages[0]?.extraBottomPx).toBe(STEP)

    await attachPageScreenshot(page, 'page-space-capped')
  })

  /**
   * THE DELIVERABLE GETS THE ROOM TOO. `expectedPageHeight` is an INDEPENDENT
   * restatement of §4.2 (see `support/exportPng.ts`), so this compares the PNG's own
   * IHDR against the spec rather than against the implementation that produced it.
   */
  test('the exported PNG is as tall as the page the client was looking at', async ({ page }) => {
    test.slow()

    await seedBlocks(page, 'section', 3)
    await page.getByTestId(addSpace).click()

    await waitForRenderBridge(page)
    const document = await readDocument(page)
    const stored = document.pages[0]
    expect(stored?.extraBottomPx).toBe(STEP)
    if (!stored) return

    const rendered = await renderOrFail(page, stored.id)

    expect(rendered.height).toBe(expectedPageHeight(stored))
    expect(rendered.height).toBe(await pageHeight(page))
    expect(rendered.width).toBe(1200)
  })

  test('a stroke drawn in the added room comes back after a reload', async ({ page }) => {
    test.slow()

    await page.getByTestId(addSpace).click()
    await page.getByTestId(addSpace).click()

    await scrollToPageY(page, 1820)
    await usePen(page, 'draw')
    await drawStroke(page, scribbleAt(240, 1800))
    await putPenAway(page)

    const before = await readStrokes(page)
    expect(before).toHaveLength(1)
    // The mark is now BOTH holding the page open on its own and sitting inside the
    // room the client added, so the height is the sum of the two.
    const heightBefore = await pageHeight(page)
    expect(heightBefore).toBeGreaterThan(EMPTY_PAGE_HEIGHT + STEP * 2)

    await waitForAutosave(page)
    await reloadCanvas(page)

    const after = await readStrokes(page)
    expect(after).toHaveLength(1)
    expect(after[0]?.points).toEqual(before[0]?.points)
    expect(await pageHeight(page)).toBe(heightBefore)
    expect((await readDocument(page)).pages[0]?.extraBottomPx).toBe(STEP * 2)
  })
})
