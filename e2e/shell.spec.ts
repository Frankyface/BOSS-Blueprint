import { expect, test } from '@playwright/test'

import { seedTourDismissed } from './support/chrome.ts'

/**
 * The `<h1>` is the product name; the `<title>` leads with what the product is
 * for, because a tab and a search result have to say that to a stranger
 * (`src/meta/headTags.ts`, asserted in full by `e2e/launch-polish.spec.ts`).
 */
const APP_NAME = 'BOSS Blueprint'
const PAGE_TITLE = 'Sketch your website — BOSS Blueprint'
/** Palette order, Section last since UX audit P2 (`src/constants/blockTypes.ts`). */
const EXPECTED_BLOCK_LABELS = ['Heading', 'Text', 'Image', 'Button', 'Nav bar', 'Section']
const HTTP_ERROR_THRESHOLD = 400

test.describe('app shell', () => {
  // This spec navigates by hand rather than through `openCanvas`, so it seeds the
  // "tour already seen" flag itself — the shell is what is under test here, not
  // the first-run chrome over it (`e2e/onboarding-tour.spec.ts` owns that).
  test.beforeEach(async ({ page }) => {
    await seedTourDismissed(page)
  })

  test('renders the header, canvas and the six-entry block palette', async ({ page }) => {
    const response = await page.goto('./')

    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle(PAGE_TITLE)
    await expect(page.getByRole('heading', { level: 1, name: APP_NAME })).toBeVisible()
    await expect(page.getByRole('main', { name: 'Page canvas' })).toBeVisible()

    const palette = page.getByRole('complementary', { name: 'Block palette' })
    await expect(palette).toBeVisible()

    const paletteButtons = palette.getByRole('button')
    await expect(paletteButtons).toHaveCount(EXPECTED_BLOCK_LABELS.length)

    for (const [index, label] of EXPECTED_BLOCK_LABELS.entries()) {
      await expect(palette.getByText(label, { exact: true })).toBeVisible()
      await expect(paletteButtons.nth(index)).toBeEnabled()
    }
  })

  test('loads every asset from the /BOSS-Blueprint/ base path', async ({ page }) => {
    const failedRequests: string[] = []
    page.on('response', (response) => {
      if (response.status() >= HTTP_ERROR_THRESHOLD) {
        failedRequests.push(`${response.status()} ${response.url()}`)
      }
    })

    await page.goto('./')
    await expect(page.getByRole('heading', { level: 1, name: APP_NAME })).toBeVisible()

    expect(failedRequests).toEqual([])
  })
})
