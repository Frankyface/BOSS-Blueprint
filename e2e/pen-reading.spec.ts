import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

import {
  addBlock,
  attachPageScreenshot,
  blockById,
  dragBy,
  idOfType,
  openCanvas,
  readBlock,
  readDocument,
} from './support/canvas.ts'
import { drawStroke, putPenAway, strokes, usePen } from './support/media.ts'

/**
 * "SHOW WHAT WE READ" — the one place the client can see that a drawn box became a
 * card before the agency opens the zip.
 *
 * Everything here is driven the way a client drives it: real pointer paths on the
 * real canvas, then a real tick box. The properties that matter are that the
 * reading APPEARS where the ink is, that it never gets between the pen and the
 * page, and that it leaves with the pen.
 */

const BOX = { x: 220, y: 300, w: 380, h: 240 }

/** A hand-traced rectangle whose last corner stops short of its first. */
function boxPath(): { x: number; y: number }[] {
  const { x, y, w, h } = BOX
  const gap = 24
  return [
    { x, y },
    { x: x + w / 2, y },
    { x: x + w, y },
    { x: x + w, y: y + h / 2 },
    { x: x + w, y: y + h },
    { x: x + w / 2, y: y + h },
    { x, y: y + h },
    { x, y: y + h / 2 },
    { x, y: y + gap },
  ]
}

/** Two squiggled lines inside the box — a client's stand-in for body copy. */
function lineInsideBox(row: number): { x: number; y: number }[] {
  const left = BOX.x + 40
  const top = BOX.y + 90 + row * 50
  return [
    { x: left, y: top },
    { x: left + 60, y: top + 12 },
    { x: left + 130, y: top - 10 },
    { x: left + 200, y: top + 10 },
    { x: left + 260, y: top },
  ]
}

function readingTags(page: Page): Locator {
  return page.getByTestId('ink-reading-tag')
}

function readingFrames(page: Page): Locator {
  return page.getByTestId('ink-reading-frame')
}

function cardFrame(page: Page): Locator {
  return page.locator('[data-testid="ink-reading-frame"][data-ink-kind="panel"]')
}

async function showReading(page: Page): Promise<void> {
  await page.getByTestId('pen-reading-toggle').check()
  await expect(page.getByTestId('pen-reading-summary')).toBeVisible()
}

async function drawACardWithCopyInIt(page: Page): Promise<void> {
  await usePen(page, 'draw')
  await drawStroke(page, boxPath())
  await drawStroke(page, lineInsideBox(0))
  await drawStroke(page, lineInsideBox(1))
  await expect(strokes(page)).toHaveCount(3)
}

test.describe('showing the client what we read', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
  })

  test('reads a hand-drawn box as a card, right where it was drawn', async ({ page }) => {
    test.slow()

    await drawACardWithCopyInIt(page)

    // Nothing is labelled until the client asks — the sketch is what they came to see.
    await expect(readingTags(page)).toHaveCount(0)

    await showReading(page)

    await expect(cardFrame(page)).toHaveCount(1)
    await expect(readingTags(page).first()).toHaveText(/^card\??$/)

    // The outline lands on the ink, not somewhere else on the page.
    const outline = await cardFrame(page).boundingBox()
    const ink = await strokes(page).first().boundingBox()
    expect(outline).not.toBeNull()
    expect(ink).not.toBeNull()
    expect(Math.abs(outline!.x - ink!.x)).toBeLessThan(12)
    expect(Math.abs(outline!.y - ink!.y)).toBeLessThan(12)
    expect(Math.abs(outline!.width - ink!.width)).toBeLessThan(24)

    // And the same reading, in a sentence, for anyone not looking at the page.
    await expect(page.getByTestId('pen-reading-summary')).toContainText('card')

    await attachPageScreenshot(page, 'ink-reading-card')
  })

  test('never gets between the pen and the page', async ({ page }) => {
    test.slow()

    await drawACardWithCopyInIt(page)
    await showReading(page)
    const labelled = await readingFrames(page).count()
    expect(labelled).toBeGreaterThan(0)

    // A stroke drawn straight across an outline still lands in the document.
    await drawStroke(page, [
      { x: BOX.x + 20, y: BOX.y + 20 },
      { x: BOX.x + 200, y: BOX.y + 120 },
      { x: BOX.x + 340, y: BOX.y + 200 },
    ])

    await expect(strokes(page)).toHaveCount(4)

    // …and the reading re-reads the page rather than going stale.
    await expect(readingFrames(page)).not.toHaveCount(0)
  })

  test('leaves with the pen, and hands the blocks back untouched', async ({ page }) => {
    test.slow()

    await addBlock(page, 'heading')
    const headingId = await idOfType(page, 'heading')
    const heading = blockById(page, headingId)
    const before = await readBlock(page, headingId)

    await drawACardWithCopyInIt(page)
    await showReading(page)
    await expect(readingTags(page)).not.toHaveCount(0)

    await putPenAway(page)

    // No control on screen could turn it off, so nothing is left painted.
    await expect(page.getByTestId('pen-reading-toggle')).toBeHidden()
    await expect(readingTags(page)).toHaveCount(0)

    // Blocks behave exactly as they did before any of this.
    await dragBy(page, heading, 80, 40)
    expect(await readBlock(page, headingId)).toMatchObject({
      x: before.x + 80,
      y: before.y + 40,
    })

    // The marks themselves survived: this feature only ever looked at them.
    await expect(strokes(page)).toHaveCount(3)
  })

  /**
   * REGRESSION: the toolbar WRAPS, so one extra line of copy in the pen group costs
   * a whole 33px row — which pushes the page down and takes that much off the
   * drawing area. Picking up the pen, or asking what we read, must not shrink the
   * thing you picked the pen up to draw on.
   */
  test('never costs the client a row of canvas', async ({ page }) => {
    test.slow()

    const toolbarHeight = async (): Promise<number> => {
      const box = await page.getByTestId('canvas-toolbar').boundingBox()
      expect(box).not.toBeNull()
      return box!.height
    }

    const away = await toolbarHeight()

    await drawACardWithCopyInIt(page)
    expect(await toolbarHeight()).toBe(away)

    await showReading(page)
    expect(await toolbarHeight()).toBe(away)
  })

  test('is a view, not a document — it never reaches the saved design', async ({ page }) => {
    test.slow()

    await drawACardWithCopyInIt(page)
    await showReading(page)

    const saved = JSON.stringify(await readDocument(page))
    expect(saved).not.toContain('showInkReading')
    expect(saved).not.toContain('ink-reading')
  })
})
