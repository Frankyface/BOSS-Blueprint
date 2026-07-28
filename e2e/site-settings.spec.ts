import { expect, test } from '@playwright/test'

import {
  addBlock,
  attachPageScreenshot,
  openCanvas,
  readDocument,
  reloadCanvas,
  waitForAutosave,
} from './support/canvas.ts'
import {
  fillPanelField,
  openPanel,
} from './support/site.ts'

const BUSINESS = "Martina's Trattoria"
const TAGLINE = 'Slow food, fast smiles'
const ABOUT = 'A family-run trattoria in Guelph, open for dinner six nights a week.'
const STYLE_NOTES = 'Like our Instagram — lots of white space and big food photos.'

test.describe('site settings', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
    await openPanel(page, 'site')
  })

  test('captures every field and keeps them through a reload', async ({ page }) => {
    test.slow()

    await fillPanelField(page, 'setting-business-name', BUSINESS)
    await fillPanelField(page, 'setting-tagline', TAGLINE)
    await fillPanelField(page, 'setting-about', ABOUT)
    await page.getByTestId('setting-vibe').selectOption('warm')
    await fillPanelField(page, 'setting-style-notes', STYLE_NOTES)
    await fillPanelField(page, 'site-color-0', '#2F6F4F')
    await fillPanelField(page, 'site-color-1', '#f7f1e3')

    const expected = {
      businessName: BUSINESS,
      tagline: TAGLINE,
      about: ABOUT,
      vibe: 'warm',
      styleNotes: STYLE_NOTES,
      // Stored lower-case, so two spellings never read as two colours.
      colors: ['#2f6f4f', '#f7f1e3'],
    }
    expect((await readDocument(page)).siteSettings).toEqual(expected)
    await attachPageScreenshot(page, 'site-settings')

    await waitForAutosave(page)
    await reloadCanvas(page)

    expect((await readDocument(page)).siteSettings).toEqual(expected)
    await openPanel(page, 'site')
    await expect(page.getByTestId('setting-business-name')).toHaveValue(BUSINESS)
    await expect(page.getByTestId('setting-about')).toHaveValue(ABOUT)
    await expect(page.getByTestId('setting-vibe')).toHaveValue('warm')
    await expect(page.getByTestId('site-color-0')).toHaveValue('#2f6f4f')
  })

  test('the vibe list is exactly the five the export schema allows', async ({ page }) => {
    const values = await page
      .getByTestId('setting-vibe')
      .locator('option')
      .evaluateAll((options) => options.map((option) => (option as HTMLOptionElement).value))

    expect(values).toEqual(['', 'modern', 'classic', 'playful', 'bold', 'warm'])
  })

  test('everything except the business name is skippable, with no nagging', async ({ page }) => {
    // Leave the whole panel blank and go on working: nothing complains.
    await addBlock(page, 'heading')
    await openPanel(page, 'site')

    await expect(page.getByTestId('site-settings')).toBeVisible()
    await expect(page.locator('[role="alert"]')).toHaveCount(0)
    expect((await readDocument(page)).siteSettings).toMatchObject({
      businessName: '',
      vibe: null,
      colors: [],
    })

    // Filling only the optional fields is fine too.
    await fillPanelField(page, 'setting-tagline', TAGLINE)
    await expect(page.locator('[role="alert"]')).toHaveCount(0)
  })

  test('refuses a colour that is not a hex value, and says why', async ({ page }) => {
    await fillPanelField(page, 'site-color-0', 'sage green')

    await expect(page.getByTestId('site-color-0-error')).toBeVisible()
    expect((await readDocument(page)).siteSettings.colors).toEqual([])

    await fillPanelField(page, 'site-color-0', '#2f6f4f')
    await expect(page.getByTestId('site-color-0-error')).toBeHidden()
    expect((await readDocument(page)).siteSettings.colors).toEqual(['#2f6f4f'])
  })

  test('offers three colour slots and no more, and clearing one removes it', async ({ page }) => {
    await fillPanelField(page, 'site-color-0', '#111111')
    await fillPanelField(page, 'site-color-1', '#222222')
    await fillPanelField(page, 'site-color-2', '#333333')

    await expect(page.getByTestId('site-color-3')).toBeHidden()
    expect((await readDocument(page)).siteSettings.colors).toEqual([
      '#111111',
      '#222222',
      '#333333',
    ])

    await fillPanelField(page, 'site-color-0', '')
    expect((await readDocument(page)).siteSettings.colors).toEqual(['#222222', '#333333'])
  })

  test('a settings change is an undo step, one per field', async ({ page }) => {
    await fillPanelField(page, 'setting-business-name', BUSINESS)
    await fillPanelField(page, 'setting-tagline', TAGLINE)

    await page.getByTestId('toolbar-undo').click()
    expect((await readDocument(page)).siteSettings).toMatchObject({
      businessName: BUSINESS,
      tagline: '',
    })

    await page.getByTestId('toolbar-undo').click()
    expect((await readDocument(page)).siteSettings.businessName).toBe('')

    await page.getByTestId('toolbar-redo').click()
    expect((await readDocument(page)).siteSettings.businessName).toBe(BUSINESS)
  })

  test('settings alone are enough to make "start over" meaningful', async ({ page }) => {
    await expect(page.getByTestId('toolbar-start-over')).toBeDisabled()

    await fillPanelField(page, 'setting-business-name', BUSINESS)

    await expect(page.getByTestId('toolbar-start-over')).toBeEnabled()
    await page.getByTestId('toolbar-start-over').click()
    await page.getByTestId('start-over-confirmed').click()

    expect((await readDocument(page)).siteSettings.businessName).toBe('')
  })
})
