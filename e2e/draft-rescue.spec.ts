import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  addBlock,
  blockById,
  blockOfType,
  idOfType,
  openCanvas,
  readBlock,
  readDocument,
  reloadCanvas,
} from './support/canvas.ts'
import { inspectBlock, openPanel } from './support/site.ts'

/**
 * REGRESSION: what the client is still typing must survive closing the tab
 * (review HIGH-3).
 *
 * Every text field in the editor keeps a local draft and commits once, on Enter or
 * blur — that is what makes a typed sentence one undo step. The hole it left: a
 * field that never lost focus had never reached the store, so the autosave flush on
 * `pagehide` wrote a design that did not contain what was visibly on the screen.
 * `installFlushOnHide` now blurs the focused field first.
 *
 * Every test here types WITHOUT blurring, tabbing, or pressing Enter, then fires
 * the real `pagehide` event the browser fires when a tab closes. There is one per
 * surface because each is a different component reaching the same hook — and the
 * two textareas ("about", "style notes") do not even commit on Enter, so they were
 * the most exposed of all.
 */

/** Type into a field and LEAVE IT FOCUSED — the whole point of these tests. */
async function typeWithoutCommitting(page: Page, testId: string, value: string): Promise<void> {
  const field = page.getByTestId(testId)
  await field.fill(value)
  await expect(field).toBeFocused()
}

/** Exactly what the browser fires as the tab goes away. */
async function closeTheTab(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.dispatchEvent(new Event('pagehide'))
  })
}

test.describe('drafts survive the tab closing', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
  })

  test('the site "about" textarea — the field that never commits on Enter', async ({ page }) => {
    test.slow()

    const about = 'A family-run trattoria in Guelph, open for dinner six nights a week.'
    await openPanel(page, 'site')
    await typeWithoutCommitting(page, 'setting-about', about)

    // Nothing has been committed: this is the state the client is in mid-sentence.
    expect((await readDocument(page)).siteSettings.about).toBe('')

    await closeTheTab(page)
    await reloadCanvas(page)

    expect((await readDocument(page)).siteSettings.about).toBe(about)
    await openPanel(page, 'site')
    await expect(page.getByTestId('setting-about')).toHaveValue(about)
  })

  /**
   * Only ONE field can be focused, so only one draft is ever open: filling the
   * business name and then moving to the notes BLURS the name, which commits it
   * the ordinary way. The test used to claim both were "abandoned together" and
   * quietly proved something weaker (review follow-up), so it now asserts the two
   * halves separately — the committed one before the tab closes, the open one
   * after — and the name says what it does.
   */
  test('the style notes left open after the business name was committed by blur', async ({
    page,
  }) => {
    test.slow()

    const name = "Martina's Trattoria"
    const notes = 'Like our Instagram — lots of white space and big food photos.'

    await openPanel(page, 'site')
    await page.getByTestId('setting-business-name').fill(name)
    await typeWithoutCommitting(page, 'setting-style-notes', notes)

    // Moving to the notes blurred the name, so THAT one is already in the store…
    const beforeClose = (await readDocument(page)).siteSettings
    expect(beforeClose.businessName).toBe(name)
    // …and the notes are the open draft this whole spec is about.
    expect(beforeClose.styleNotes).toBe('')

    await closeTheTab(page)
    await reloadCanvas(page)

    expect((await readDocument(page)).siteSettings).toMatchObject({
      businessName: name,
      styleNotes: notes,
    })
  })

  test('a preferred colour typed into an open slot', async ({ page }) => {
    test.slow()

    await openPanel(page, 'site')
    await typeWithoutCommitting(page, 'site-color-0', '#2f6f4f')

    await closeTheTab(page)
    await reloadCanvas(page)

    expect((await readDocument(page)).siteSettings.colors).toEqual(['#2f6f4f'])
  })

  test('a "write it for me" description on a copy block', async ({ page }) => {
    test.slow()

    const description = 'Warm welcome for our family bakery — mention Main Street since 1998'

    await addBlock(page, 'heading')
    const id = await idOfType(page, 'heading')
    await inspectBlock(page, blockById(page, id))
    await page.getByTestId('copy-mode-generate').click()

    await typeWithoutCommitting(page, 'copy-description', description)

    await closeTheTab(page)
    await reloadCanvas(page)

    expect((await readBlock(page, id)).generateDescription).toBe(description)
  })

  test('a web address half-typed into a button link', async ({ page }) => {
    test.slow()

    await addBlock(page, 'button')
    const id = await idOfType(page, 'button')
    await inspectBlock(page, blockById(page, id))

    await page.getByTestId('button-link-target').selectOption('external')
    await typeWithoutCommitting(page, 'button-link-url', 'https://martinas.test')

    await closeTheTab(page)
    await reloadCanvas(page)

    expect((await readBlock(page, id)).link).toEqual({
      kind: 'external',
      url: 'https://martinas.test',
    })
  })

  test('a photo description on an image slot', async ({ page }) => {
    test.slow()

    const description = 'Our dining room at golden hour'

    await addBlock(page, 'image')
    const id = await idOfType(page, 'image')
    await inspectBlock(page, blockById(page, id))

    await typeWithoutCommitting(page, 'image-description', description)

    await closeTheTab(page)
    await reloadCanvas(page)

    expect((await readBlock(page, id)).description).toBe(description)
  })

  test('a block being typed into on the page itself', async ({ page }) => {
    test.slow()

    const headline = 'Slow food, fast smiles'

    await addBlock(page, 'heading')
    const id = await idOfType(page, 'heading')
    await blockById(page, id).dblclick()

    const editor = page.getByTestId('block-text-editor')
    await expect(editor).toBeVisible()
    await editor.fill(headline)
    await expect(editor).toBeFocused()

    // Still uncommitted — the inline editor commits on Enter or blur, and the
    // client has done neither.
    expect((await readBlock(page, id)).text).toBe('')

    await closeTheTab(page)
    await reloadCanvas(page)

    expect((await readBlock(page, id)).text).toBe(headline)
    await expect(blockOfType(page, 'heading')).toContainText(headline)
  })
})
