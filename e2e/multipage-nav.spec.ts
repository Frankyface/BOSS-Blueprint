import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  addBlock,
  addPage,
  attachPageScreenshot,
  blockById,
  blockOfType,
  blocks,
  deleteCurrentPage,
  duplicateCurrentPage,
  editBlockText,
  idOfType,
  inspectBlock,
  linkToNothing,
  linkToPage,
  linkToUrl,
  openCanvas,
  openPanel,
  pageNames,
  pageTab,
  pageTabs,
  readAllBlocks,
  readDocument,
  readNavMap,
  reloadCanvas,
  renamePage,
  switchToPage,
  waitForAutosave,
} from './support/canvas.ts'

/** Matches NAV_ITEMS_UI_MAX in src/canvas/navItems.ts. */
const NAV_ITEMS_UI_MAX = 7

/** Add a nav bar to the current page and give it `count` menu items. */
async function addNavBarWithItems(page: Page, labels: readonly string[]): Promise<string> {
  await addBlock(page, 'nav-bar')
  const navId = await idOfType(page, 'nav-bar')
  await inspectBlock(page, blockById(page, navId))

  for (const [index, label] of labels.entries()) {
    await page.getByTestId('nav-add-item').click()
    await page.getByTestId(`nav-item-${String(index)}-label`).fill(label)
    await page.getByTestId(`nav-item-${String(index)}-label`).press('Enter')
  }

  return navId
}

/**
 * These flows are click-heavy — a page rename is four interactions, wiring one nav
 * item is three — and WebKit runs them five to ten times slower than Chromium. The
 * headroom is granted up front rather than after the first flaky CI run.
 */
test.describe('pages', () => {
  test.beforeEach(async ({ page }) => {
    test.slow()
    await openCanvas(page)
  })

  test('starts as a single page called Home', async ({ page }) => {
    await expect(pageTabs(page)).toHaveCount(1)
    await expect(pageTab(page, 'Home')).toHaveAttribute('data-current', 'true')
    await expect(page.getByTestId('page-delete')).toBeDisabled()
  })

  test('adds, renames, duplicates, reorders and deletes pages', async ({ page }) => {
    await addPage(page, 'Menu')
    await addPage(page, 'Contact')
    expect(await pageNames(page)).toEqual(['Home', 'Menu', 'Contact'])

    // Rename applies to the page you are on.
    await renamePage(page, 'Get in touch')
    expect(await pageNames(page)).toEqual(['Home', 'Menu', 'Get in touch'])

    // Duplicate lands directly after the original and becomes current.
    await switchToPage(page, 'Menu')
    await duplicateCurrentPage(page)
    expect(await pageNames(page)).toEqual(['Home', 'Menu', 'Menu copy', 'Get in touch'])
    await expect(pageTab(page, 'Menu copy')).toHaveAttribute('data-current', 'true')

    // Reorder with the buttons, in both directions.
    await page.getByTestId('page-move-right').click()
    expect(await pageNames(page)).toEqual(['Home', 'Menu', 'Get in touch', 'Menu copy'])
    await page.getByTestId('page-move-left').click()
    expect(await pageNames(page)).toEqual(['Home', 'Menu', 'Menu copy', 'Get in touch'])

    await deleteCurrentPage(page)
    expect(await pageNames(page)).toEqual(['Home', 'Menu', 'Get in touch'])
    await attachPageScreenshot(page, 'pages-after-edits')
  })

  test('refuses to delete the last page, and asks before deleting any page', async ({ page }) => {
    await addPage(page, 'Menu')

    // Backing out of the confirmation changes nothing.
    await page.getByTestId('page-delete').click()
    await page.getByTestId('page-delete-cancel').click()
    expect(await pageNames(page)).toEqual(['Home', 'Menu'])

    await deleteCurrentPage(page)
    expect(await pageNames(page)).toEqual(['Home'])
    await expect(page.getByTestId('page-delete')).toBeDisabled()
  })

  test('each page keeps its own blocks, and switching swaps the canvas', async ({ page }) => {
    await addBlock(page, 'heading')
    await editBlockText(page, blockOfType(page, 'heading'), 'Welcome to BOSS')

    await addPage(page, 'Menu')
    await expect(blocks(page)).toHaveCount(0)
    await addBlock(page, 'button')
    await addBlock(page, 'image')
    await expect(blocks(page)).toHaveCount(2)

    await switchToPage(page, 'Home')
    await expect(blocks(page)).toHaveCount(1)
    await expect(blockOfType(page, 'heading')).toContainText('Welcome to BOSS')

    await switchToPage(page, 'Menu')
    await expect(blocks(page)).toHaveCount(2)

    // The store agrees with the DOM about which blocks live where.
    const document = await readDocument(page)
    expect(document.pages.map((entry) => entry.blocks.length)).toEqual([1, 2])
  })

  test('switching pages is not an undo step, but adding one is', async ({ page }) => {
    await addPage(page, 'Menu')
    await switchToPage(page, 'Home')
    await switchToPage(page, 'Menu')

    // One undo takes the page back — the two switches recorded nothing.
    await page.getByTestId('toolbar-undo').click()

    expect(await pageNames(page)).toEqual(['Home'])
    await expect(page.getByTestId('toolbar-undo')).toBeDisabled()
  })

  test('page operations are undoable and redoable', async ({ page }) => {
    await addPage(page, 'Menu')
    await renamePage(page, 'Our food')
    await duplicateCurrentPage(page)
    expect(await pageNames(page)).toEqual(['Home', 'Our food', 'Our food copy'])

    await page.getByTestId('toolbar-undo').click()
    expect(await pageNames(page)).toEqual(['Home', 'Our food'])
    await page.getByTestId('toolbar-undo').click()
    expect(await pageNames(page)).toEqual(['Home', 'Menu'])
    await page.getByTestId('toolbar-undo').click()
    expect(await pageNames(page)).toEqual(['Home'])

    await page.getByTestId('toolbar-redo').click()
    await page.getByTestId('toolbar-redo').click()
    await page.getByTestId('toolbar-redo').click()
    expect(await pageNames(page)).toEqual(['Home', 'Our food', 'Our food copy'])
  })

  test('a deleted page comes back with undo', async ({ page }) => {
    await addPage(page, 'Menu')
    await addBlock(page, 'heading')
    await deleteCurrentPage(page)
    expect(await pageNames(page)).toEqual(['Home'])

    await page.getByTestId('toolbar-undo').click()

    expect(await pageNames(page)).toEqual(['Home', 'Menu'])
    await switchToPage(page, 'Menu')
    await expect(blocks(page)).toHaveCount(1)
  })
})

test.describe('linking', () => {
  test.beforeEach(async ({ page }) => {
    test.slow()
    await openCanvas(page)
  })

  test('a button links to a page, an address, or nothing — and shows it', async ({ page }) => {
    await addPage(page, 'Menu')
    await switchToPage(page, 'Home')
    await addBlock(page, 'button')
    const buttonId = await idOfType(page, 'button')
    const button = blockById(page, buttonId)

    await expect(button).toHaveAttribute('data-linked', 'false')

    await inspectBlock(page, button)
    await linkToPage(page, 'button', 'Menu')

    await expect(button).toHaveAttribute('data-linked', 'true')
    await expect(button.getByTestId('link-mark')).toBeVisible()
    expect((await readDocument(page)).blocks[0]?.link).toEqual({
      kind: 'page',
      pageId: 'page-menu',
    })

    await linkToUrl(page, 'button', 'https://bossolutions.pro')
    expect((await readDocument(page)).blocks[0]?.link).toEqual({
      kind: 'external',
      url: 'https://bossolutions.pro',
    })

    await linkToNothing(page, 'button')
    await expect(button).toHaveAttribute('data-linked', 'false')
    expect((await readDocument(page)).blocks[0]?.link).toEqual({ kind: 'none' })
  })

  test('a half-typed web address is refused rather than stored', async ({ page }) => {
    await addBlock(page, 'button')
    const buttonId = await idOfType(page, 'button')
    await inspectBlock(page, blockById(page, buttonId))

    await linkToUrl(page, 'button', 'bossolutions.pro')

    await expect(page.getByTestId('button-link-error')).toBeVisible()
    expect((await readDocument(page)).blocks[0]?.link).toEqual({ kind: 'none' })

    // Fixing it commits.
    await linkToUrl(page, 'button', 'https://bossolutions.pro')
    await expect(page.getByTestId('button-link-error')).toBeHidden()
    expect((await readDocument(page)).blocks[0]?.link).toMatchObject({ kind: 'external' })
  })

  test('nav-bar items are structured, wired one by one, and capped in the UI', async ({ page }) => {
    await addPage(page, 'Menu')
    await switchToPage(page, 'Home')
    const navId = await addNavBarWithItems(page, ['Home', 'Menu'])

    await page.getByTestId('nav-item-0-link-target').selectOption({ label: 'Home' })
    await page.getByTestId('nav-item-1-link-target').selectOption({ label: 'Menu' })

    const bar = blockById(page, navId)
    await expect(bar).toHaveAttribute('data-linked', 'true')
    await expect(bar.getByTestId('nav-item')).toHaveCount(2)
    await expect(bar.getByTestId('nav-item').first()).toHaveAttribute('data-link-kind', 'page')

    const stored = (await readDocument(page)).blocks.find((block) => block.id === navId)
    expect(stored?.items?.map((item) => item.label)).toEqual(['Home', 'Menu'])
    expect(stored?.items?.map((item) => item.link.kind)).toEqual(['page', 'page'])

    // Removing an item takes its wiring with it.
    await page.getByTestId('nav-item-0-remove').click()
    await expect(bar.getByTestId('nav-item')).toHaveCount(1)

    // The UI stops offering more items at the documented cap.
    for (let index = 1; index < NAV_ITEMS_UI_MAX; index += 1) {
      await page.getByTestId('nav-add-item').click()
    }
    await expect(page.getByTestId('nav-item-row')).toHaveCount(NAV_ITEMS_UI_MAX)
    await expect(page.getByTestId('nav-add-item')).toBeDisabled()
  })

  test('typing a menu straight into the block keeps the items in step', async ({ page }) => {
    await addBlock(page, 'nav-bar')
    const navId = await idOfType(page, 'nav-bar')

    await editBlockText(page, blockById(page, navId), 'Home, Menu, Contact')

    await expect(blockById(page, navId).getByTestId('nav-item')).toHaveCount(3)
    const stored = (await readDocument(page)).blocks[0]
    expect(stored?.items?.map((item) => item.label)).toEqual(['Home', 'Menu', 'Contact'])
  })
})

test.describe('deleting a linked-to page', () => {
  test.beforeEach(async ({ page }) => {
    test.slow()
    await openCanvas(page)
  })

  test('reverts every link to it, says so, and the nav map agrees', async ({ page }) => {
    await addPage(page, 'Menu')
    await addPage(page, 'Contact')
    await switchToPage(page, 'Home')

    // A button and a nav item, both pointing at Contact.
    await addBlock(page, 'button')
    const buttonId = await idOfType(page, 'button')
    await editBlockText(page, blockById(page, buttonId), 'Get in touch')
    await inspectBlock(page, blockById(page, buttonId))
    await linkToPage(page, 'button', 'Contact')

    const navId = await addNavBarWithItems(page, ['Menu', 'Contact'])
    await page.getByTestId('nav-item-0-link-target').selectOption({ label: 'Menu' })
    await page.getByTestId('nav-item-1-link-target').selectOption({ label: 'Contact' })

    // Nav bars are added to the BACK of the page, so the menu is narrated first.
    await openPanel(page, 'map')
    expect(await readNavMap(page)).toEqual([
      'Home: Menu -> Menu',
      'Home: Contact -> Contact',
      'Home: Get in touch -> Contact',
    ])

    await switchToPage(page, 'Contact')
    await deleteCurrentPage(page)

    // Non-blocking notice, naming what happened.
    const toast = page.getByTestId('design-toast')
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('2 links')
    await expect(toast).toContainText('Contact')

    // Both links are back to "none" — in the store and on the page.
    await switchToPage(page, 'Home')
    const home = (await readDocument(page)).blocks
    expect(home.find((block) => block.id === buttonId)?.link).toEqual({ kind: 'none' })
    expect(
      home.find((block) => block.id === navId)?.items?.map((item) => item.link.kind),
    ).toEqual(['page', 'none'])
    await expect(blockById(page, buttonId)).toHaveAttribute('data-linked', 'false')

    // And the nav map says so too.
    await openPanel(page, 'map')
    expect(await readNavMap(page)).toEqual([
      'Home: Menu -> Menu',
      'Home: Contact -> Not linked yet',
      'Home: Get in touch -> Not linked yet',
    ])

    // The notice can be dismissed and does not block anything.
    await page.getByTestId('design-toast-dismiss').click()
    await expect(toast).toBeHidden()
  })

  test('leaves links to other pages and external addresses alone', async ({ page }) => {
    await addPage(page, 'Menu')
    await addPage(page, 'Contact')
    await switchToPage(page, 'Home')

    await addBlock(page, 'button')
    const keepId = await idOfType(page, 'button')
    await inspectBlock(page, blockById(page, keepId))
    await linkToPage(page, 'button', 'Menu')

    await switchToPage(page, 'Menu')
    await addBlock(page, 'button')
    const externalId = await idOfType(page, 'button')
    await inspectBlock(page, blockById(page, externalId))
    await linkToUrl(page, 'button', 'https://instagram.test/boss')

    await switchToPage(page, 'Contact')
    await deleteCurrentPage(page)

    const all = await readAllBlocks(page)
    expect(all.find((block) => block.id === keepId)?.link).toEqual({
      kind: 'page',
      pageId: 'page-menu',
    })
    expect(all.find((block) => block.id === externalId)?.link).toEqual({
      kind: 'external',
      url: 'https://instagram.test/boss',
    })
  })
})

test.describe('a three-page site end to end', () => {
  test('builds, wires, survives a reload, and reads back as one nav map', async ({ page }) => {
    test.slow()

    await openCanvas(page)

    await addBlock(page, 'heading')
    await editBlockText(page, blockOfType(page, 'heading'), "Martina's Trattoria")
    await addNavBarWithItems(page, ['Home', 'Menu', 'Contact'])

    await addPage(page, 'Menu')
    await addBlock(page, 'text')
    await editBlockText(page, blockOfType(page, 'text'), 'Antipasti, pasta, dolci.')

    await addPage(page, 'Contact')
    await addBlock(page, 'button')
    await editBlockText(page, blockOfType(page, 'button'), 'Call us')

    // Wire the Home nav now that all three pages exist.
    await switchToPage(page, 'Home')
    const navId = await idOfType(page, 'nav-bar')
    await inspectBlock(page, blockById(page, navId))
    await linkToPage(page, 'nav-item-0', 'Home')
    await linkToPage(page, 'nav-item-1', 'Menu')
    await linkToPage(page, 'nav-item-2', 'Contact')

    await openPanel(page, 'map')
    const mapBefore = await readNavMap(page)
    expect(mapBefore).toEqual([
      'Home: Home -> Home',
      'Home: Menu -> Menu',
      'Home: Contact -> Contact',
      'Contact: Call us -> Not linked yet',
    ])
    await attachPageScreenshot(page, 'three-page-site')

    await waitForAutosave(page)
    await reloadCanvas(page)

    expect(await pageNames(page)).toEqual(['Home', 'Menu', 'Contact'])
    await openPanel(page, 'map')
    expect(await readNavMap(page)).toEqual(mapBefore)

    // Blocks came back on the right pages.
    const document = await readDocument(page)
    expect(document.pages.map((entry) => entry.blocks.length)).toEqual([2, 1, 1])
  })
})
