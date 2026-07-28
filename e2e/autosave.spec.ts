import { expect, test } from '@playwright/test'

import {
  RECOVERY_KEY,
  STORAGE_KEY,
  addBlock,
  attachPageScreenshot,
  blockById,
  blockOfType,
  blocks,
  domShapeOf,
  dragBy,
  editBlockText,
  idOfType,
  openCanvas,
  readDocument,
  readDomBlocks,
  readStoredDesign,
  reloadCanvas,
  waitForAutosave,
  writeStoredDesign,
} from './support/canvas.ts'

/** The six block types the palette offers (src/constants/blockTypes.ts). */
const BLOCK_TYPE_COUNT = 6

/** Matches BLUEPRINT_SCHEMA_VERSION in src/canvas/blueprintFile.ts. */
const SCHEMA_VERSION = 2

/**
 * Build a small page the way a client would, leaving it mid-edit.
 *
 * ALL SIX block types on purpose: the stage-1 definition of done asks for "one of
 * each block type … reload … identical", and an earlier version of this helper
 * placed only four, so two types had no committed regression test at all.
 */
async function buildPage(page: import('@playwright/test').Page): Promise<void> {
  await addBlock(page, 'nav-bar')
  await addBlock(page, 'section')
  await addBlock(page, 'heading')
  const headingId = await idOfType(page, 'heading')
  await editBlockText(page, blockById(page, headingId), 'BOSS Solutions')
  await dragBy(page, blockById(page, headingId), 40, 24)
  await addBlock(page, 'text')
  await editBlockText(page, blockOfType(page, 'text'), 'We build small business websites.')
  await addBlock(page, 'image')
  await addBlock(page, 'button')
  await editBlockText(page, blockOfType(page, 'button'), 'Book a call')
}

test.describe('autosave', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
  })

  test('saves the design and restores it exactly after a reload', async ({ page }) => {
    await buildPage(page)
    await waitForAutosave(page)

    const before = await readDocument(page)
    const domBefore = await readDomBlocks(page)
    // One of every block type reached the page before the reload.
    expect(new Set(before.blocks.map((block) => block.type)).size).toBe(BLOCK_TYPE_COUNT)
    await attachPageScreenshot(page, 'autosave-before-reload')

    await reloadCanvas(page)

    const after = await readDocument(page)
    expect(after.blocks).toEqual(before.blocks)
    expect(await readDomBlocks(page)).toEqual(domBefore)
    expect(await readDomBlocks(page)).toEqual(domShapeOf(after))
    await attachPageScreenshot(page, 'autosave-after-reload')
  })

  test('comes back deselected, not editing, and with an empty history', async ({ page }) => {
    await addBlock(page, 'heading')
    await waitForAutosave(page)
    // The block is selected right now — that must NOT survive the reload.
    expect((await readDocument(page)).selectedBlockId).not.toBeNull()

    await reloadCanvas(page)

    const restored = await readDocument(page)
    expect(restored.selectedBlockId).toBeNull()
    expect(restored.editingBlockId).toBeNull()
    await expect(page.getByTestId('toolbar-undo')).toBeDisabled()
    await expect(page.getByTestId('toolbar-redo')).toBeDisabled()
  })

  test('writes a payload carrying the schema version', async ({ page }) => {
    await addBlock(page, 'heading')
    await waitForAutosave(page)

    const raw = await readStoredDesign(page)
    expect(raw).not.toBeNull()
    const payload = JSON.parse(raw ?? '{}') as {
      schemaVersion?: unknown
      pages?: { blocks?: unknown[] }[]
    }
    expect(payload.schemaVersion).toBe(SCHEMA_VERSION)
    expect(payload.pages).toHaveLength(1)
    expect(payload.pages?.[0]?.blocks).toHaveLength(1)
  })

  test('does not persist the selection', async ({ page }) => {
    await addBlock(page, 'heading')
    await waitForAutosave(page)
    const saved = await readStoredDesign(page)

    // Selection is not part of the document, so no amount of clicking may change
    // what is on disk — and the payload must carry no selection field at all.
    await page.getByTestId('canvas-viewport').click({ position: { x: 8, y: 8 } })
    await blockOfType(page, 'heading').click()
    await page.waitForTimeout(1500)

    expect(await readStoredDesign(page)).toBe(saved)
    const payload = JSON.parse(saved ?? '{}') as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual(['pages', 'schemaVersion', 'siteSettings'])
  })
})

test.describe('recovering from a bad saved design', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
  })

  test('corrupt JSON starts a fresh page and keeps the file under the recovery key', async ({
    page,
  }) => {
    const corrupt = '{ this is not a blueprint at all'
    await writeStoredDesign(page, STORAGE_KEY, corrupt)

    await reloadCanvas(page)

    await expect(blocks(page)).toHaveCount(0)
    const notice = page.getByTestId('storage-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toHaveAttribute('data-notice-kind', 'recovered')

    // The bad payload was preserved, not overwritten.
    const recovered = await page.evaluate((key) => window.localStorage.getItem(key), RECOVERY_KEY)
    expect(recovered).toBe(corrupt)
    expect(await readStoredDesign(page)).toBeNull()
    await attachPageScreenshot(page, 'autosave-recovery')
  })

  test('an unknown schema version is quarantined the same way', async ({ page }) => {
    const future = JSON.stringify({ schemaVersion: SCHEMA_VERSION + 99, pages: [] })
    await writeStoredDesign(page, STORAGE_KEY, future)

    await reloadCanvas(page)

    await expect(blocks(page)).toHaveCount(0)
    await expect(page.getByTestId('storage-notice')).toHaveAttribute(
      'data-notice-kind',
      'recovered',
    )
    const recovered = await page.evaluate((key) => window.localStorage.getItem(key), RECOVERY_KEY)
    expect(recovered).toBe(future)
  })

  test('the warning is non-blocking: the client can keep working and dismiss it', async ({
    page,
  }) => {
    await writeStoredDesign(page, STORAGE_KEY, '{ broken')
    await reloadCanvas(page)
    await expect(page.getByTestId('storage-notice')).toBeVisible()

    // The canvas is fully usable while the notice is up.
    await addBlock(page, 'heading')
    await expect(blocks(page)).toHaveCount(1)

    await page.getByTestId('storage-notice-dismiss').click()
    await expect(page.getByTestId('storage-notice')).toBeHidden()

    // ...and the fresh work saves over the freed slot.
    await waitForAutosave(page)
    expect(await readStoredDesign(page)).not.toBeNull()
  })
})

test.describe('start over', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
  })

  test('asks first, then clears the page, the history and the saved design', async ({ page }) => {
    await buildPage(page)
    await waitForAutosave(page)
    expect(await readStoredDesign(page)).not.toBeNull()

    await page.getByTestId('toolbar-start-over').click()
    await expect(page.getByTestId('start-over-confirm')).toBeVisible()
    // Nothing has happened yet.
    expect((await readDocument(page)).blocks.length).toBeGreaterThan(0)

    await page.getByTestId('start-over-confirmed').click()

    await expect(blocks(page)).toHaveCount(0)
    await expect(page.getByTestId('toolbar-undo')).toBeDisabled()
    await expect(page.getByTestId('toolbar-redo')).toBeDisabled()
    await expect
      .poll(() => readStoredDesign(page))
      .toBeNull()

    // And it stays cleared through a reload.
    await reloadCanvas(page)
    await expect(blocks(page)).toHaveCount(0)
  })

  test('backing out of the confirmation changes nothing', async ({ page }) => {
    await addBlock(page, 'heading')
    await waitForAutosave(page)
    const before = await readDocument(page)

    await page.getByTestId('toolbar-start-over').click()
    await page.getByTestId('start-over-cancel').click()

    await expect(page.getByTestId('start-over-confirm')).toBeHidden()
    expect(await readDocument(page)).toMatchObject({ blocks: before.blocks })
    expect(await readStoredDesign(page)).not.toBeNull()
  })

  test('is disabled while there is nothing to clear', async ({ page }) => {
    await expect(page.getByTestId('toolbar-start-over')).toBeDisabled()
  })
})
