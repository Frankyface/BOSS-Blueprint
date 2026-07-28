import { expect, test } from '@playwright/test'

import {
  addBlock,
  attachPageScreenshot,
  blockById,
  blockOfType,
  editBlockText,
  fillPanelField,
  idOfType,
  inspectBlock,
  openCanvas,
  readDocument,
  reloadCanvas,
  waitForAutosave,
} from './support/canvas.ts'

const DESCRIPTION = 'Warm welcome for our family bakery, mention Main Street since 1998'
const LENGTH_HINT = '~2 sentences'

test.describe('copy blocks', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
  })

  test('a fresh copy block is the client\'s own words', async ({ page }) => {
    await addBlock(page, 'heading')
    const id = await idOfType(page, 'heading')
    await inspectBlock(page, blockById(page, id))

    await expect(page.getByTestId('copy-mode-real')).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByTestId('copy-mode-generate')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByTestId('copy-description')).toBeHidden()
    expect((await readDocument(page)).blocks[0]?.copyMode).toBe('real')
  })

  test('switching to "write it for me" renders visibly differently', async ({ page }) => {
    await addBlock(page, 'text')
    const id = await idOfType(page, 'text')
    const block = blockById(page, id)
    await editBlockText(page, block, 'Some words I started typing')

    await inspectBlock(page, block)
    await page.getByTestId('copy-mode-generate').click()

    await expect(block).toHaveAttribute('data-copy-mode', 'generate')
    // The block's face is now the description placeholder, not the copy.
    await expect(block.getByTestId('generate-face')).toBeVisible()

    await fillPanelField(page, 'copy-description', DESCRIPTION)
    await fillPanelField(page, 'copy-length-hint', LENGTH_HINT)

    await expect(block).toContainText(DESCRIPTION)
    // Italic + dashed is what makes it read as a note rather than as copy.
    const style = await block.getByTestId('generate-face').evaluate((element) => {
      const face = window.getComputedStyle(element)
      const text = window.getComputedStyle(element.firstElementChild ?? element)
      return { border: face.borderTopStyle, fontStyle: text.fontStyle }
    })
    expect(style.border).toBe('dashed')
    expect(style.fontStyle).toBe('italic')

    await attachPageScreenshot(page, 'generate-copy-block')
  })

  test('switching modes never throws away what was typed on either side', async ({ page }) => {
    await addBlock(page, 'heading')
    const id = await idOfType(page, 'heading')
    const block = blockById(page, id)
    await editBlockText(page, block, 'My own headline')

    await inspectBlock(page, block)
    await page.getByTestId('copy-mode-generate').click()
    await fillPanelField(page, 'copy-description', DESCRIPTION)

    // Back to "my words": the headline is exactly as it was.
    await page.getByTestId('copy-mode-real').click()
    await expect(block).toContainText('My own headline')
    expect((await readDocument(page)).blocks[0]).toMatchObject({
      copyMode: 'real',
      text: 'My own headline',
      generateDescription: DESCRIPTION,
    })

    // And forward again: the description is still there.
    await page.getByTestId('copy-mode-generate').click()
    await expect(page.getByTestId('copy-description')).toHaveValue(DESCRIPTION)
  })

  test('a design mixes both modes and survives a reload', async ({ page }) => {
    test.slow()

    await addBlock(page, 'heading')
    const headingId = await idOfType(page, 'heading')
    await editBlockText(page, blockById(page, headingId), 'Fresh bread every morning')

    await addBlock(page, 'text')
    const textId = await idOfType(page, 'text')
    await inspectBlock(page, blockById(page, textId))
    await page.getByTestId('copy-mode-generate').click()
    await fillPanelField(page, 'copy-description', DESCRIPTION)
    await fillPanelField(page, 'copy-length-hint', LENGTH_HINT)

    const before = await readDocument(page)
    expect(before.blocks.map((block) => block.copyMode)).toEqual(['real', 'generate'])

    await waitForAutosave(page)
    await reloadCanvas(page)

    const after = await readDocument(page)
    expect(after.blocks).toEqual(before.blocks)
    expect(after.blocks[1]).toMatchObject({
      copyMode: 'generate',
      generateDescription: DESCRIPTION,
      lengthHint: LENGTH_HINT,
    })

    // Both faces are still telling the truth after the reload.
    await expect(blockOfType(page, 'heading')).toContainText('Fresh bread every morning')
    await expect(blockById(page, textId).getByTestId('generate-face')).toBeVisible()
  })

  test('a mode change is one undo step, and the description is another', async ({ page }) => {
    await addBlock(page, 'text')
    const id = await idOfType(page, 'text')
    await inspectBlock(page, blockById(page, id))

    await page.getByTestId('copy-mode-generate').click()
    await fillPanelField(page, 'copy-description', DESCRIPTION)

    await page.getByTestId('toolbar-undo').click()
    expect((await readDocument(page)).blocks[0]).toMatchObject({
      copyMode: 'generate',
      generateDescription: '',
    })

    await page.getByTestId('toolbar-undo').click()
    expect((await readDocument(page)).blocks[0]?.copyMode).toBe('real')
  })

  test('blocks that carry no copy offer no copy controls', async ({ page }) => {
    await addBlock(page, 'image')
    const id = await idOfType(page, 'image')

    await inspectBlock(page, blockById(page, id))

    await expect(page.getByTestId('copy-mode-editor')).toBeHidden()
    await expect(page.getByTestId('block-inspector')).toHaveAttribute('data-block-type', 'image')
  })
})
