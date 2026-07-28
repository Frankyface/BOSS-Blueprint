import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  addBlock,
  attachPageScreenshot,
  blockById,
  blockOfType,
  blocks,
  domShapeOf,
  dragBy,
  dragHandle,
  editBlockText,
  idOfType,
  openCanvas,
  readDocument,
  readDomBlocks,
  redoOnce,
  seedBlocks,
  undoOnce,
} from './support/canvas.ts'
import type { StoredDocument } from './support/canvas.ts'

/** Matches HISTORY_LIMIT in src/store/history.ts. */
const HISTORY_LIMIT = 50

const undoButton = (page: Page) => page.getByTestId('toolbar-undo')
const redoButton = (page: Page) => page.getByTestId('toolbar-redo')

/**
 * Assert the DOM and the store agree, and that both match the recorded snapshot.
 * Two independent sources: an undo that only rewinds the store, or only the DOM,
 * fails here.
 */
async function expectDocument(page: Page, expected: StoredDocument): Promise<void> {
  await expect(blocks(page)).toHaveCount(expected.blocks.length)
  expect(await readDocument(page)).toMatchObject({ blocks: expected.blocks })
  expect(await readDomBlocks(page)).toEqual(domShapeOf(expected))
}

test.describe('undo / redo', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
  })

  test('both buttons are disabled on a fresh canvas', async ({ page }) => {
    await expect(undoButton(page)).toBeDisabled()
    await expect(redoButton(page)).toBeDisabled()
  })

  test('a 10-edit session rewinds and replays, asserting the page at every step', async ({
    page,
  }) => {
    const snapshots: StoredDocument[] = [await readDocument(page)]
    const record = async () => {
      snapshots.push(await readDocument(page))
    }

    // 1. Section band
    await addBlock(page, 'section')
    await record()

    // 2. Heading
    await addBlock(page, 'heading')
    const headingId = await idOfType(page, 'heading')
    await record()

    // 3. Type a headline (one undo step, not one per character)
    await editBlockText(page, blockById(page, headingId), 'Welcome to BOSS')
    await record()

    // 4. Paragraph
    await addBlock(page, 'text')
    const textId = await idOfType(page, 'text')
    await record()

    // 5. Drag the heading (a multi-step gesture that commits once)
    await dragBy(page, blockById(page, headingId), 40, 24, 20)
    await record()

    // 6. Resize the heading
    await blockById(page, headingId).click()
    await dragHandle(page, blockById(page, headingId), 'se', 40, 8)
    await record()

    // 7. Button
    await addBlock(page, 'button')
    const buttonId = await idOfType(page, 'button')
    await record()

    // 8. Re-order: bring the section band forward
    await blockOfType(page, 'section').click()
    await page.getByTestId('toolbar-bring-forward').click()
    await record()

    // 9. Delete the paragraph
    await blockById(page, textId).click()
    await page.getByTestId('toolbar-delete').click()
    await record()

    // 10. Label the button
    await editBlockText(page, blockById(page, buttonId), 'Book a call')
    await record()

    expect(snapshots).toHaveLength(11)
    await attachPageScreenshot(page, 'undo-redo-before')
    const finished = snapshots[snapshots.length - 1]!

    // Rewind the lot, checking the whole page after every single undo.
    for (let index = snapshots.length - 2; index >= 0; index -= 1) {
      await undoOnce(page)
      await expectDocument(page, snapshots[index]!)
    }

    await expect(blocks(page)).toHaveCount(0)
    await expect(undoButton(page)).toBeDisabled()
    await expect(redoButton(page)).toBeEnabled()

    // Replay the lot, checking the whole page after every single redo.
    for (let index = 1; index < snapshots.length; index += 1) {
      await redoOnce(page)
      await expectDocument(page, snapshots[index]!)
    }

    await expect(redoButton(page)).toBeDisabled()
    await expectDocument(page, finished)
    await attachPageScreenshot(page, 'undo-redo-after')
  })

  test('Ctrl+Z undoes and both Ctrl+Y and Ctrl+Shift+Z redo', async ({ page }) => {
    await addBlock(page, 'heading')
    await addBlock(page, 'button')
    await expect(blocks(page)).toHaveCount(2)

    await page.keyboard.press('Control+z')
    await expect(blocks(page)).toHaveCount(1)

    await page.keyboard.press('Control+y')
    await expect(blocks(page)).toHaveCount(2)

    await page.keyboard.press('Control+z')
    await expect(blocks(page)).toHaveCount(1)

    await page.keyboard.press('Control+Shift+z')
    await expect(blocks(page)).toHaveCount(2)
  })

  test('a committed text edit is a single undo step', async ({ page }) => {
    await addBlock(page, 'heading')
    const id = await idOfType(page, 'heading')
    const heading = blockById(page, id)

    await editBlockText(page, heading, 'A fairly long headline')
    await expect(heading).toContainText('A fairly long headline')

    await page.keyboard.press('Control+z')

    // One press takes the whole edit back and leaves the block itself in place.
    await expect(blocks(page)).toHaveCount(1)
    expect((await readDocument(page)).blocks[0]?.text).toBe('')
    await expect(undoButton(page)).toBeEnabled()
  })

  test('typing inside the editor keeps its own undo, and does not rewind the page', async ({
    page,
  }) => {
    await addBlock(page, 'heading')
    await addBlock(page, 'button')
    await blockOfType(page, 'heading').dblclick()

    const editor = page.getByTestId('block-text-editor')
    await expect(editor).toBeVisible()
    await editor.press('Control+z')

    // The shortcut belonged to the text field: both blocks are still on the page.
    await expect(blocks(page)).toHaveCount(2)
    await expect(editor).toBeVisible()
  })

  test('a whole drag gesture is one undo step', async ({ page }) => {
    await addBlock(page, 'heading')
    const id = await idOfType(page, 'heading')
    const before = await readDocument(page)

    // 20 pointermoves; the store is written once, on release.
    await dragBy(page, blockById(page, id), 80, 48, 20)
    expect((await readDocument(page)).blocks[0]?.x).toBe((before.blocks[0]?.x ?? 0) + 80)

    await undoOnce(page)

    expect(await readDocument(page)).toMatchObject({ blocks: before.blocks })
    await expect(undoButton(page)).toBeEnabled()
  })

  test('actions that changed nothing never become undo steps', async ({ page }) => {
    await addBlock(page, 'heading')
    const document = await readDocument(page)

    // The only block is already both frontmost and backmost: both are no-ops.
    await page.getByTestId('toolbar-send-backward').click()
    await page.getByTestId('toolbar-bring-forward').click()
    // Selecting and deselecting is UI state, not document state.
    await page.getByTestId('canvas-viewport').click({ position: { x: 8, y: 8 } })
    await blockOfType(page, 'heading').click()

    expect(await readDocument(page)).toMatchObject({ blocks: document.blocks })

    // A single undo therefore goes straight back past the add, to the empty page.
    await undoOnce(page)

    await expect(blocks(page)).toHaveCount(0)
    await expect(undoButton(page)).toBeDisabled()
  })

  test('a new action after undoing clears the redo stack', async ({ page }) => {
    await addBlock(page, 'heading')
    await addBlock(page, 'button')

    await undoOnce(page)
    await expect(redoButton(page)).toBeEnabled()

    await addBlock(page, 'image')

    await expect(redoButton(page)).toBeDisabled()
    const types = (await readDocument(page)).blocks.map((block) => block.type)
    expect(types).toEqual(['heading', 'image'])
  })

  test('history holds at least 50 steps', async ({ page }) => {
    const total = HISTORY_LIMIT + 5
    await seedBlocks(page, 'heading', total)
    await expect(blocks(page)).toHaveCount(total)

    for (let step = 0; step < HISTORY_LIMIT; step += 1) {
      await page.keyboard.press('Control+z')
    }

    // 55 adds, 50 undone: the 5 oldest survive, and there is nothing left to undo.
    await expect(blocks(page)).toHaveCount(total - HISTORY_LIMIT)
    await expect(undoButton(page)).toBeDisabled()
  })
})
