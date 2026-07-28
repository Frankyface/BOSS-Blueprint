import { expect, test } from '@playwright/test'

import {
  addBlock,
  attachPageScreenshot,
  blockOfType,
  blocks,
  idOfType,
  openCanvas,
  pageScale,
  readDocument,
  readStoreWriteCount,
  seedBlocks,
  startStoreWriteCounter,
} from './support/canvas.ts'
import type { BlockTypeId } from './support/canvas.ts'

const ALL_TYPES: readonly BlockTypeId[] = ['section', 'heading', 'text', 'image', 'button', 'nav-bar']
const DESIGN_WIDTH_PX = 1200
const PERF_BLOCK_COUNT = 30
/** 60 discrete pointermoves — enough that a per-move store write could not hide. */
const PERF_DRAG_STEPS = 60
const DRAG_DISTANCE_PX = 80

/** The fields every block carries, whatever its type. */
const BASE_BLOCK_KEYS = ['height', 'id', 'text', 'type', 'width', 'x', 'y']

test.describe('block canvas', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
  })

  test('shows an empty white virtual page at the 1200px design width', async ({ page }) => {
    const virtualPage = page.getByTestId('canvas-page')

    await expect(virtualPage).toHaveAttribute('data-page-width', String(DESIGN_WIDTH_PX))
    await expect(blocks(page)).toHaveCount(0)

    const box = await virtualPage.boundingBox()
    expect(box?.width).toBeCloseTo(DESIGN_WIDTH_PX, 0)
    expect(await pageScale(page)).toBe(1)
  })

  test('adds one of each of the six block types from the palette', async ({ page }) => {
    for (const type of ALL_TYPES) {
      await addBlock(page, type)
      await expect(blockOfType(page, type)).toHaveCount(1)
    }

    await expect(blocks(page)).toHaveCount(ALL_TYPES.length)

    const document = await readDocument(page)
    expect(document.blocks.map((block) => block.type).sort()).toEqual([...ALL_TYPES].sort())

    // Evidence, not a pixel baseline: cross-OS visual-regression baselines belong to
    // the Stage 3 export feature (the mitigation the canvas-engine decision mandates).
    await attachPageScreenshot(page, 'all-six-block-types')
  })

  test('renders each block type with its own readable placeholder', async ({ page }) => {
    for (const type of ALL_TYPES) {
      await addBlock(page, type)
    }

    await expect(blockOfType(page, 'section')).toContainText('Section band')
    await expect(blockOfType(page, 'heading')).toContainText('Your headline here')
    await expect(blockOfType(page, 'text')).toContainText('Describe this part of the page')
    await expect(blockOfType(page, 'image')).toContainText('Image')
    await expect(blockOfType(page, 'button')).toContainText('Get in touch')
    await expect(blockOfType(page, 'nav-bar').getByTestId('nav-item')).toHaveCount(4)
  })

  test('gives every new block a sensible default size on the page', async ({ page }) => {
    for (const type of ALL_TYPES) {
      await addBlock(page, type)
    }

    const document = await readDocument(page)
    for (const block of document.blocks) {
      expect(block.width).toBeGreaterThan(0)
      expect(block.height).toBeGreaterThan(0)
      expect(block.x).toBeGreaterThanOrEqual(0)
      expect(block.y).toBeGreaterThanOrEqual(0)
      expect(block.x + block.width).toBeLessThanOrEqual(DESIGN_WIDTH_PX)
    }
  })

  test('stacks each new full-width band below the last one', async ({ page }) => {
    await addBlock(page, 'nav-bar')
    await addBlock(page, 'section')
    await addBlock(page, 'section')

    const { blocks: stored } = await readDocument(page)
    const bands = stored
      .filter((block) => block.type === 'section' || block.type === 'nav-bar')
      .sort((a, b) => a.y - b.y)

    expect(bands).toHaveLength(3)
    for (let index = 1; index < bands.length; index += 1) {
      const previous = bands[index - 1]!
      const current = bands[index]!
      expect(current.y).toBe(previous.y + previous.height)
      expect(current.x).toBe(0)
      expect(current.width).toBe(DESIGN_WIDTH_PX)
    }
  })

  test('cascades repeated free-floating blocks so they never hide each other', async ({ page }) => {
    await addBlock(page, 'heading')
    await addBlock(page, 'heading')

    const headings = (await readDocument(page)).blocks.filter((block) => block.type === 'heading')
    expect(headings).toHaveLength(2)
    expect(headings[1]!.x).toBeGreaterThan(headings[0]!.x)
    expect(headings[1]!.y).toBeGreaterThan(headings[0]!.y)
  })

  test('keeps the document as serialisable JSON', async ({ page }) => {
    await addBlock(page, 'heading')
    await addBlock(page, 'image')

    const document = await readDocument(page)
    expect(JSON.parse(JSON.stringify(document))).toEqual(document)

    const [heading, image] = document.blocks
    // Every block carries the same identity and geometry...
    expect(Object.keys(heading ?? {})).toEqual(expect.arrayContaining(BASE_BLOCK_KEYS))
    // ...plus exactly the extra fields its own type owns, and no others.
    expect(Object.keys(heading ?? {}).sort()).toEqual(
      [...BASE_BLOCK_KEYS, 'copyMode', 'generateDescription', 'lengthHint'].sort(),
    )
    expect(Object.keys(image ?? {}).sort()).toEqual([...BASE_BLOCK_KEYS].sort())
  })

  test('shrinks the page to fit a narrow window (fit-to-window zoom)', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 })

    await expect.poll(() => pageScale(page)).toBeLessThan(1)

    const scale = await pageScale(page)
    const box = await page.getByTestId('canvas-page').boundingBox()
    expect(box?.width).toBeCloseTo(DESIGN_WIDTH_PX * scale, 0)
    expect(box!.width).toBeLessThanOrEqual(1024)
  })

  /**
   * The perf probe, as a DETERMINISTIC invariant rather than a stopwatch
   * (review MEDIUM-1).
   *
   * What actually keeps a 30-block canvas smooth is the gesture fast path: while
   * the pointer is down nothing is written to the store, so React never re-renders
   * mid-drag. That is a property, and a subscriber counting notifications either
   * sees zero of them or it doesn't. The old `elapsed < 4000ms` assertion mostly
   * measured Playwright's own IPC round-trips, which is why it is now recorded as
   * evidence in the report but no longer gates the test.
   */
  test(`writes to the store 0 times mid-drag and once on release with ${PERF_BLOCK_COUNT}+ blocks`, async ({
    page,
  }) => {
    await seedBlocks(page, 'button', PERF_BLOCK_COUNT)
    await expect(blocks(page)).toHaveCount(PERF_BLOCK_COUNT)

    await addBlock(page, 'heading')
    const headingId = await idOfType(page, 'heading')
    const heading = page.locator(`[data-block-id="${headingId}"]`)

    // Select first. `pointerdown` calls `selectBlock`, and re-selecting the block
    // that is already selected returns the identical state (so Zustand does not
    // notify) — without this the count would include one selection write and say
    // nothing about the gesture itself.
    await heading.click()

    const box = await heading.boundingBox()
    if (!box) throw new Error('The dragged block has no bounding box')
    const startX = box.x + box.width / 2
    const startY = box.y + box.height / 2

    await startStoreWriteCounter(page)

    const startedAt = Date.now()
    await page.mouse.move(startX, startY)
    await page.mouse.down()
    expect(await readStoreWriteCount(page)).toBe(0)

    for (let step = 1; step <= PERF_DRAG_STEPS; step += 1) {
      const progress = step / PERF_DRAG_STEPS
      await page.mouse.move(startX + DRAG_DISTANCE_PX * progress, startY + DRAG_DISTANCE_PX * progress)
    }

    // The whole gesture so far: 1 pointerdown + 60 pointermoves, 0 store writes.
    expect(await readStoreWriteCount(page)).toBe(0)

    await page.mouse.up()
    const elapsedMs = Date.now() - startedAt

    await expect.poll(() => readStoreWriteCount(page)).toBe(1)

    const moved = (await readDocument(page)).blocks.find((block) => block.id === headingId)
    expect(moved).toMatchObject({ x: 160, y: 200 })

    await test.info().attach('drag-perf.txt', {
      body:
        `${PERF_DRAG_STEPS}-step drag over ${PERF_BLOCK_COUNT + 1} blocks: ${elapsedMs}ms wall ` +
        `(includes Playwright IPC — recorded as evidence, not asserted).\n` +
        `Store writes: 0 during the gesture, 1 on release.`,
      contentType: 'text/plain',
    })
  })
})
