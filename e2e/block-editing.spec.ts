import { expect, test } from '@playwright/test'

import {
  addBlock,
  attachPageScreenshot,
  blockById,
  blockOfType,
  blocks,
  dragBy,
  dragHandle,
  expectGeometry,
  idOfType,
  openCanvas,
  readDocument,
} from './support/canvas.ts'

/** Defaults recorded in feature-block-canvas.md — the arithmetic below depends on them. */
const HEADING_DEFAULT = { x: 80, y: 120, width: 640, height: 72 }
const HEADING_MIN = { width: 96, height: 40 }

test.describe('block editing', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
  })

  test('click selects a block and empty canvas deselects', async ({ page }) => {
    await addBlock(page, 'heading')
    const heading = blockOfType(page, 'heading')

    await expect(heading).toHaveAttribute('data-selected', 'true')
    await expect(heading.getByTestId('resize-handle')).toHaveCount(8)
    await expect(page.getByTestId('canvas-toolbar-status')).toHaveText('Heading selected')

    await page.getByTestId('canvas-viewport').click({ position: { x: 8, y: 8 } })

    await expect(heading).toHaveAttribute('data-selected', 'false')
    await expect(heading.getByTestId('resize-handle')).toHaveCount(0)
    expect((await readDocument(page)).selectedBlockId).toBeNull()

    await heading.click()
    await expect(heading).toHaveAttribute('data-selected', 'true')
  })

  test('drag moves a block to a known 8px-snapped position', async ({ page }) => {
    await addBlock(page, 'heading')
    const id = await idOfType(page, 'heading')
    const heading = blockById(page, id)

    await expectGeometry(page, id, HEADING_DEFAULT)
    const before = await heading.boundingBox()

    // 37 and 21 are deliberately off-grid: the snap must round them to 40 and 24.
    await dragBy(page, heading, 37, 21)

    await expectGeometry(page, id, {
      ...HEADING_DEFAULT,
      x: HEADING_DEFAULT.x + 40,
      y: HEADING_DEFAULT.y + 24,
    })

    const after = await heading.boundingBox()
    expect(after!.x - before!.x).toBeCloseTo(40, 0)
    expect(after!.y - before!.y).toBeCloseTo(24, 0)
  })

  test('a block cannot be dragged fully off the page', async ({ page }) => {
    await addBlock(page, 'button')
    const id = await idOfType(page, 'button')

    // Big enough to overshoot both clamps, small enough that the cursor stays in
    // the window (mouse coordinates outside the viewport are not portable).
    await dragBy(page, blockById(page, id), -400, -900)

    const block = (await readDocument(page)).blocks.find((candidate) => candidate.id === id)!
    expect(block.x + block.width).toBeGreaterThanOrEqual(24)
    expect(block.y).toBe(0)
  })

  test('the south-east handle resizes the block', async ({ page }) => {
    await addBlock(page, 'heading')
    const id = await idOfType(page, 'heading')
    const heading = blockById(page, id)

    await dragHandle(page, heading, 'se', 40, 40)

    await expectGeometry(page, id, {
      ...HEADING_DEFAULT,
      width: HEADING_DEFAULT.width + 40,
      height: HEADING_DEFAULT.height + 40,
    })

    const box = await heading.boundingBox()
    expect(box!.width).toBeCloseTo(HEADING_DEFAULT.width + 40, 0)
    expect(box!.height).toBeCloseTo(HEADING_DEFAULT.height + 40, 0)
  })

  test('the north-west handle resizes from the opposite corner', async ({ page }) => {
    await addBlock(page, 'heading')
    const id = await idOfType(page, 'heading')

    await dragHandle(page, blockById(page, id), 'nw', -40, -40)

    await expectGeometry(page, id, {
      x: HEADING_DEFAULT.x - 40,
      y: HEADING_DEFAULT.y - 40,
      width: HEADING_DEFAULT.width + 40,
      height: HEADING_DEFAULT.height + 40,
    })
  })

  test('resizing stops at the minimum size for the type', async ({ page }) => {
    await addBlock(page, 'heading')
    const id = await idOfType(page, 'heading')

    await dragHandle(page, blockById(page, id), 'se', -600, -300)

    await expectGeometry(page, id, {
      x: HEADING_DEFAULT.x,
      y: HEADING_DEFAULT.y,
      width: HEADING_MIN.width,
      height: HEADING_MIN.height,
    })
  })

  test('double-click edits a heading and the committed text renders on the block', async ({
    page,
  }) => {
    await addBlock(page, 'heading')
    const id = await idOfType(page, 'heading')
    const heading = blockById(page, id)

    await heading.dblclick()
    const editor = page.getByTestId('block-text-editor')
    await expect(editor).toBeVisible()

    await editor.fill('Welcome to BOSS')
    await editor.press('Enter')

    await expect(editor).toHaveCount(0)
    await expect(heading).toContainText('Welcome to BOSS')
    expect((await readDocument(page)).blocks.find((block) => block.id === id)?.text).toBe(
      'Welcome to BOSS',
    )
  })

  test('inline editing works for every text-bearing type', async ({ page }) => {
    const cases = [
      { type: 'text' as const, value: 'Two lines of client copy.' },
      { type: 'button' as const, value: 'Book a call' },
      { type: 'nav-bar' as const, value: 'Home, Pricing' },
    ]

    for (const { type, value } of cases) {
      await addBlock(page, type)
      const block = blockOfType(page, type)

      await block.dblclick()
      const editor = page.getByTestId('block-text-editor')
      await editor.fill(value)
      await editor.press('Enter')

      await expect(editor).toHaveCount(0)
      await expect(block).toContainText(type === 'nav-bar' ? 'Pricing' : value)
    }

    await expect(blockOfType(page, 'nav-bar').getByTestId('nav-item')).toHaveCount(2)
  })

  test('Escape abandons an edit and leaves the placeholder', async ({ page }) => {
    await addBlock(page, 'heading')
    const heading = blockOfType(page, 'heading')

    await heading.dblclick()
    const editor = page.getByTestId('block-text-editor')
    await editor.fill('Never mind')
    await editor.press('Escape')

    await expect(editor).toHaveCount(0)
    await expect(heading).toContainText('Your headline here')
  })

  test('clicking away commits the edit', async ({ page }) => {
    await addBlock(page, 'heading')
    const heading = blockOfType(page, 'heading')

    await heading.dblclick()
    await page.getByTestId('block-text-editor').fill('Committed by click-away')
    await page.getByTestId('canvas-viewport').click({ position: { x: 8, y: 8 } })

    await expect(page.getByTestId('block-text-editor')).toHaveCount(0)
    await expect(heading).toContainText('Committed by click-away')
  })

  test('bring forward and send backward change the paint order of overlapping blocks', async ({
    page,
  }) => {
    await addBlock(page, 'heading')
    await addBlock(page, 'heading')

    const document = await readDocument(page)
    const [back, front] = document.blocks
    expect(back && front).toBeTruthy()

    // The cascade guarantees these two overlap.
    expect(front!.x).toBeLessThan(back!.x + back!.width)
    expect(front!.y).toBeLessThan(back!.y + back!.height)

    await expect(blockById(page, back!.id)).toHaveAttribute('data-z', '1')
    await expect(blockById(page, front!.id)).toHaveAttribute('data-z', '2')
    await attachPageScreenshot(page, 'z-order-before')

    // Click the strip of the back block the front one does not cover.
    await blockById(page, back!.id).click({ position: { x: 200, y: 8 } })
    await page.getByTestId('toolbar-bring-forward').click()

    await expect(blockById(page, back!.id)).toHaveAttribute('data-z', '2')
    await expect(blockById(page, front!.id)).toHaveAttribute('data-z', '1')
    expect((await readDocument(page)).blocks.map((block) => block.id)).toEqual([
      front!.id,
      back!.id,
    ])
    await attachPageScreenshot(page, 'z-order-after-bring-forward')

    await page.getByTestId('toolbar-send-backward').click()

    await expect(blockById(page, back!.id)).toHaveAttribute('data-z', '1')
    expect((await readDocument(page)).blocks.map((block) => block.id)).toEqual([
      back!.id,
      front!.id,
    ])
  })

  test('the Delete key removes the selected block', async ({ page }) => {
    await addBlock(page, 'heading')
    await addBlock(page, 'button')
    await expect(blocks(page)).toHaveCount(2)

    await blockOfType(page, 'heading').click()
    await page.keyboard.press('Delete')

    await expect(blockOfType(page, 'heading')).toHaveCount(0)
    await expect(blocks(page)).toHaveCount(1)
    expect((await readDocument(page)).selectedBlockId).toBeNull()
  })

  test('the toolbar Delete button removes the selected block', async ({ page }) => {
    await addBlock(page, 'image')
    await expect(blocks(page)).toHaveCount(1)

    await page.getByTestId('toolbar-delete').click()

    await expect(blocks(page)).toHaveCount(0)
    expect((await readDocument(page)).blocks).toEqual([])
  })

  test('a full editing session survives end to end', async ({ page }) => {
    await addBlock(page, 'nav-bar')
    await addBlock(page, 'section')
    await addBlock(page, 'heading')

    const headingId = await idOfType(page, 'heading')
    const heading = blockById(page, headingId)

    await dragBy(page, heading, 40, 160)
    await dragHandle(page, heading, 'se', 80, 0)
    await heading.dblclick()
    await page.getByTestId('block-text-editor').fill('BOSS Solutions')
    await page.getByTestId('block-text-editor').press('Enter')

    await expectGeometry(page, headingId, {
      x: HEADING_DEFAULT.x + 40,
      y: HEADING_DEFAULT.y + 160,
      width: HEADING_DEFAULT.width + 80,
      height: HEADING_DEFAULT.height,
    })
    await expect(heading).toContainText('BOSS Solutions')
    await expect(blocks(page)).toHaveCount(3)

    await attachPageScreenshot(page, 'edited-page')
  })
})
