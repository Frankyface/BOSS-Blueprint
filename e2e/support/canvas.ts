import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

/**
 * Shared E2E vocabulary for the block canvas.
 *
 * Assertions read from two independent sources on purpose: the DOM (what the client
 * sees) and the store JSON exposed on `window.__blueprintStore` by the test build
 * (what gets exported). If those two ever disagree, a test fails.
 */

export type BlockTypeId = 'section' | 'heading' | 'text' | 'image' | 'button' | 'nav-bar'

export interface StoredBlock {
  id: string
  type: BlockTypeId
  x: number
  y: number
  width: number
  height: number
  text: string
}

export interface StoredDocument {
  blocks: StoredBlock[]
  selectedBlockId: string | null
  editingBlockId: string | null
}

/** Shape of the seam installed by src/store/testBridge.ts. */
interface BlueprintTestBridge {
  getState: () => StoredDocument & {
    addBlock: (type: BlockTypeId) => string
    resetCanvas: () => void
  }
}

type BridgeHost = { __blueprintStore?: BlueprintTestBridge }

export async function openCanvas(page: Page): Promise<void> {
  const response = await page.goto('./')
  expect(response?.status()).toBe(200)
  await expect(page.getByTestId('canvas-page')).toBeVisible()

  // The seam must exist in the build under test — everything else depends on it.
  // (It is the zustand hook itself, so a function carrying `getState`.)
  await expect
    .poll(() => page.evaluate(() => typeof (globalThis as BridgeHost).__blueprintStore?.getState))
    .toBe('function')
}

export function blocks(page: Page): Locator {
  return page.getByTestId('canvas-block')
}

export function blockOfType(page: Page, type: BlockTypeId): Locator {
  return page.locator(`[data-testid="canvas-block"][data-block-type="${type}"]`)
}

export function blockById(page: Page, id: string): Locator {
  return page.locator(`[data-testid="canvas-block"][data-block-id="${id}"]`)
}

export async function addBlock(page: Page, type: BlockTypeId): Promise<void> {
  await page.getByTestId(`palette-${type}`).click()
}

export async function readDocument(page: Page): Promise<StoredDocument> {
  return page.evaluate(() => {
    const store = (globalThis as BridgeHost).__blueprintStore
    if (!store) throw new Error('The store test bridge is missing from this build')
    const state = store.getState()
    return {
      blocks: state.blocks,
      selectedBlockId: state.selectedBlockId,
      editingBlockId: state.editingBlockId,
    }
  })
}

/** Seed blocks straight through the store — used by the perf probe. */
export async function seedBlocks(page: Page, type: BlockTypeId, count: number): Promise<void> {
  await page.evaluate(
    ({ blockType, total }) => {
      const store = (globalThis as BridgeHost).__blueprintStore
      if (!store) throw new Error('The store test bridge is missing from this build')
      for (let index = 0; index < total; index += 1) {
        store.getState().addBlock(blockType)
      }
    },
    { blockType: type, total: count },
  )
}

export async function readBlock(page: Page, id: string): Promise<StoredBlock> {
  const document = await readDocument(page)
  const found = document.blocks.find((block) => block.id === id)
  if (!found) throw new Error(`No block ${id} in the store`)
  return found
}

/** Id of the first block of that type on the page. */
export async function idOfType(page: Page, type: BlockTypeId): Promise<string> {
  const document = await readDocument(page)
  const first = document.blocks.find((block) => block.type === type)
  if (!first) throw new Error(`No ${type} block on the page`)
  return first.id
}

export async function pageScale(page: Page): Promise<number> {
  const raw = await page.getByTestId('canvas-page').getAttribute('data-page-scale')
  return Number(raw)
}

/**
 * Attach a PNG of the virtual page to the test report as evidence.
 * Deliberately NOT `toHaveScreenshot`: pixel baselines are per-OS, and this suite
 * runs on Windows locally and Ubuntu in CI. Structural assertions (data-z, DOM
 * order, geometry attributes) carry the correctness load instead.
 */
export async function attachPageScreenshot(page: Page, name: string): Promise<void> {
  const screenshot = await page.getByTestId('canvas-page').screenshot()
  await test.info().attach(`${name}.png`, { body: screenshot, contentType: 'image/png' })
}

const DEFAULT_DRAG_STEPS = 10

/** Press in the middle of `target`, move by (deltaX, deltaY) CSS px, release. */
export async function dragBy(
  page: Page,
  target: Locator,
  deltaX: number,
  deltaY: number,
  steps: number = DEFAULT_DRAG_STEPS,
): Promise<void> {
  const box = await target.boundingBox()
  if (!box) throw new Error('Cannot drag an element with no bounding box')

  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX + deltaX, startY + deltaY, { steps })
  await page.mouse.up()
}

/** Drag one of the eight resize grips of the currently selected block. */
export async function dragHandle(
  page: Page,
  block: Locator,
  handle: string,
  deltaX: number,
  deltaY: number,
): Promise<void> {
  await dragBy(page, block.locator(`[data-handle="${handle}"]`), deltaX, deltaY)
}

/** Assert the DOM data attributes and the store agree about one block's geometry. */
export async function expectGeometry(
  page: Page,
  id: string,
  expected: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const element = blockById(page, id)
  await expect(element).toHaveAttribute('data-x', String(expected.x))
  await expect(element).toHaveAttribute('data-y', String(expected.y))
  await expect(element).toHaveAttribute('data-width', String(expected.width))
  await expect(element).toHaveAttribute('data-height', String(expected.height))

  expect(await readBlock(page, id)).toMatchObject(expected)
}
