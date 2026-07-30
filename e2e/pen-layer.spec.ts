import { expect, test } from '@playwright/test'

import {
  addBlock,
  attachPageScreenshot,
  blockById,
  blockOfType,
  blocks,
  dragBy,
  editBlockText,
  idOfType,
  openCanvas,
  readBlock,
  readDocument,
  seedBlocks,
  redoOnce,
  reloadCanvas,
  undoOnce,
  waitForAutosave,
} from './support/canvas.ts'
import {
  addPage,
  switchToPage,
} from './support/site.ts'
import {
  drawStroke,
  eraseStroke,
  lowestStrokePoint,
  pageHeight,
  penLayer,
  putPenAway,
  readStrokes,
  readStrokesOfPage,
  scribbleAt,
  scrollCanvasTo,
  strokeById,
  strokes,
  usePen,
} from './support/media.ts'

const HOME_MARK = scribbleAt(200, 300)
const MENU_MARK = scribbleAt(300, 480)

test.describe('pen layer', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
  })

  test('draws a freehand stroke that lands in the document as page coordinates', async ({
    page,
  }) => {
    // Drawing is a long chain of real pointer events; WebKit in particular is slow
    // at them, and this test also waits out a debounced autosave.
    test.slow()

    await usePen(page, 'draw')
    await drawStroke(page, HOME_MARK)

    await expect(strokes(page)).toHaveCount(1)

    const [stroke] = await readStrokes(page)
    expect(stroke).toBeDefined()
    if (!stroke) return

    // Thinned on commit: far fewer points than the pointer emitted, but still a
    // recognisable path across the same part of the page.
    expect(stroke.points.length).toBeGreaterThanOrEqual(2)
    expect(stroke.points.length).toBeLessThan(40)
    expect(stroke.color).toMatch(/^#[0-9a-f]{6}$/)
    expect(stroke.width).toBeGreaterThan(0)

    const xs = stroke.points.map((point) => point.x)
    const ys = stroke.points.map((point) => point.y)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(190)
    expect(Math.max(...xs)).toBeLessThanOrEqual(395)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(290)

    // One decimal at most — the payload cap the export contract asks for.
    for (const point of stroke.points) {
      expect(point.x).toBe(Number(point.x.toFixed(1)))
      expect(point.y).toBe(Number(point.y.toFixed(1)))
    }

    await attachPageScreenshot(page, 'pen-stroke-drawn')
  })

  test('keeps each page\'s marks on its own page, through a reload', async ({ page }) => {
    test.slow()

    await usePen(page, 'draw')
    await drawStroke(page, HOME_MARK)
    const homeId = (await readDocument(page)).currentPageId

    const menuId = await addPage(page, 'Menu')
    await expect(strokes(page)).toHaveCount(0)

    await usePen(page, 'draw')
    await drawStroke(page, MENU_MARK)
    await expect(strokes(page)).toHaveCount(1)

    expect(await readStrokesOfPage(page, homeId)).toHaveLength(1)
    expect(await readStrokesOfPage(page, menuId)).toHaveLength(1)

    await waitForAutosave(page)
    await reloadCanvas(page)

    // Back on the homepage after a reload, with its own single mark.
    expect((await readDocument(page)).currentPageId).toBe(homeId)
    await expect(strokes(page)).toHaveCount(1)
    expect(await readStrokesOfPage(page, homeId)).toHaveLength(1)
    expect(await readStrokesOfPage(page, menuId)).toHaveLength(1)

    await switchToPage(page, 'Menu')
    await expect(strokes(page)).toHaveCount(1)
    const [menuStroke] = await readStrokes(page)
    expect(menuStroke?.points[0]?.y).toBeGreaterThan(400)
  })

  test('the eraser rubs out exactly the mark that was clicked', async ({ page }) => {
    test.slow()

    await usePen(page, 'draw')
    await drawStroke(page, scribbleAt(150, 200))
    await drawStroke(page, scribbleAt(150, 520))
    await expect(strokes(page)).toHaveCount(2)

    const before = await readStrokes(page)
    const survivor = before[1]?.id ?? ''

    await usePen(page, 'erase')
    await eraseStroke(page, before[0]!)

    await expect(strokes(page)).toHaveCount(1)
    await expect(strokeById(page, survivor)).toHaveCount(1)
    expect((await readStrokes(page)).map((stroke) => stroke.id)).toEqual([survivor])
  })

  test('a whole stroke is exactly one undo step', async ({ page }) => {
    test.slow()

    await usePen(page, 'draw')
    await drawStroke(page, scribbleAt(200, 250))
    await drawStroke(page, scribbleAt(200, 560))
    await expect(strokes(page)).toHaveCount(2)

    // One press of undo takes back one whole mark, not one sample of it.
    await undoOnce(page)
    await expect(strokes(page)).toHaveCount(1)
    expect(await readStrokes(page)).toHaveLength(1)

    await undoOnce(page)
    await expect(strokes(page)).toHaveCount(0)

    await redoOnce(page)
    await expect(strokes(page)).toHaveCount(1)
  })

  test('an erase is one undo step too', async ({ page }) => {
    test.slow()

    await usePen(page, 'draw')
    await drawStroke(page, scribbleAt(220, 320))
    const mark = (await readStrokes(page))[0]

    await usePen(page, 'erase')
    await eraseStroke(page, mark!)
    await expect(strokes(page)).toHaveCount(0)

    await undoOnce(page)
    await expect(strokes(page)).toHaveCount(1)
    expect((await readStrokes(page))[0]?.id).toBe(mark?.id)
  })

  test('with the pen out, the page stops responding to block edits', async ({ page }) => {
    test.slow()

    await addBlock(page, 'heading')
    const headingId = await idOfType(page, 'heading')
    const heading = blockById(page, headingId)
    const before = await readBlock(page, headingId)

    await usePen(page, 'draw')

    // A drag that starts on the block draws a line over it instead of moving it.
    await dragBy(page, heading, 80, 40)

    expect(await readBlock(page, headingId)).toMatchObject({ x: before.x, y: before.y })
    await expect(strokes(page)).toHaveCount(1)
    expect((await readDocument(page)).selectedBlockId).toBeNull()
  })

  test('putting the pen away hands the blocks back, untouched', async ({ page }) => {
    test.slow()

    await addBlock(page, 'heading')
    const headingId = await idOfType(page, 'heading')
    const heading = blockById(page, headingId)
    const before = await readBlock(page, headingId)

    await usePen(page, 'draw')
    await drawStroke(page, scribbleAt(700, 520))
    await putPenAway(page)

    // Everything a block could do, it can still do.
    await dragBy(page, heading, 80, 40)
    expect(await readBlock(page, headingId)).toMatchObject({
      x: before.x + 80,
      y: before.y + 40,
    })

    await editBlockText(page, heading, 'Welcome to BOSS')
    expect((await readBlock(page, headingId)).text).toBe('Welcome to BOSS')

    // And the mark is still there, painted over the block.
    await expect(strokes(page)).toHaveCount(1)
    await expect(penLayer(page)).toHaveAttribute('data-pen-mode', 'off')
  })

  test('the layer is transparent to pointers when the pen is away', async ({ page }) => {
    await addBlock(page, 'button')

    const events = await penLayer(page).evaluate((layer) => {
      const style = window.getComputedStyle(layer)
      return { pointerEvents: style.pointerEvents, zIndex: Number(style.zIndex) }
    })

    expect(events.pointerEvents).toBe('none')
    // Strokes always paint above every block (export contract §2.9).
    expect(events.zIndex).toBeGreaterThan(1000)

    // A click aimed at the page still reaches the block underneath the overlay.
    await blockOfType(page, 'button').click()
    expect((await readDocument(page)).selectedBlockId).not.toBeNull()
  })

  test('offers four equal colours and two widths', async ({ page }) => {
    test.slow()

    await usePen(page, 'draw')
    // The pen starts in INK, not red: its first job is to draw the site, not to mark it up
    // (`DEFAULT_PEN_COLOR`). Red is still one click away and means nothing special.
    await expect(page.getByTestId('pen-color-ink')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('pen-color-red')).toHaveAttribute('aria-pressed', 'false')

    await page.getByTestId('pen-color-red').click()
    await page.getByTestId('pen-width-bold').click()
    await drawStroke(page, scribbleAt(160, 240))

    await page.getByTestId('pen-color-green').click()
    await page.getByTestId('pen-width-fine').click()
    await drawStroke(page, scribbleAt(160, 560))

    const drawn = await readStrokes(page)
    expect(drawn).toHaveLength(2)
    expect(drawn[0]?.color).toBe('#d92d20')
    expect(drawn[1]?.color).toBe('#15803d')
    expect(drawn[0]?.width).toBeGreaterThan(drawn[1]?.width ?? 0)

    // The colour is on the mark itself, not just in the store.
    await expect(strokeById(page, drawn[1]?.id ?? '')).toHaveAttribute(
      'data-stroke-color',
      '#15803d',
    )

    await attachPageScreenshot(page, 'pen-colours-and-widths')
  })

  /**
   * REGRESSION (review MEDIUM-1): the page's height used to be computed from the
   * BLOCKS alone. A mark drawn below the lowest block therefore fell off the bottom
   * of the white sheet the moment that block was deleted — still painted (the
   * overlay does not clip), but hanging in the grey below the page, and off the
   * exported PNG entirely. `pageHeightForContent` counts pen points as content.
   */
  test('a mark below the blocks keeps the page open after the block is deleted', async ({
    page,
  }) => {
    test.slow()

    // Stack bands until the page is taller than its empty minimum.
    await seedBlocks(page, 'section', 7)
    const tallEnough = await pageHeight(page)
    expect(tallEnough).toBeGreaterThan(1600)

    // Scroll down and draw a mark below every block.
    await scrollCanvasTo(page, 900)
    await usePen(page, 'draw')
    await drawStroke(page, scribbleAt(200, 1560))
    await expect(strokes(page)).toHaveCount(1)
    await putPenAway(page)

    const markBottom = await lowestStrokePoint(page)
    expect(markBottom).toBeGreaterThan(1400)
    expect(await pageHeight(page)).toBeGreaterThan(markBottom)

    // Delete the bands that were holding the page open.
    const blockIds = (await readDocument(page)).blocks.map((block) => block.id)
    await page.evaluate((ids) => {
      const store = (globalThis as { __blueprintStore?: { getState: () => { deleteBlock: (id: string) => void } } })
        .__blueprintStore
      if (!store) throw new Error('The store test bridge is missing from this build')
      for (const id of ids) store.getState().deleteBlock(id)
    }, blockIds)
    await expect(blocks(page)).toHaveCount(0)

    // The mark still has a sheet under it…
    const heightAfter = await pageHeight(page)
    expect(heightAfter).toBeGreaterThan(markBottom)
    expect(await lowestStrokePoint(page)).toBe(markBottom)

    // …and it is really on the white page, not painted over the grey below it.
    const sheet = await page.getByTestId('canvas-page').boundingBox()
    const ink = await strokes(page).first().boundingBox()
    expect(sheet).not.toBeNull()
    expect(ink).not.toBeNull()
    expect(ink!.y + ink!.height).toBeLessThanOrEqual(sheet!.y + sheet!.height)

    await attachPageScreenshot(page, 'pen-mark-holds-page-open')
  })

  test('marks are part of the design, so "start over" clears them', async ({ page }) => {
    test.slow()

    await usePen(page, 'draw')
    await drawStroke(page, scribbleAt(240, 260))
    await putPenAway(page)

    await expect(page.getByTestId('toolbar-start-over')).toBeEnabled()
    await page.getByTestId('toolbar-start-over').click()
    await page.getByTestId('start-over-confirmed').click()

    await expect(strokes(page)).toHaveCount(0)
  })
})
