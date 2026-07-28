import { expect, test } from '@playwright/test'

const APP_TITLE = 'BOSS Blueprint'
const EXPECTED_BLOCK_LABELS = ['Section', 'Heading', 'Text', 'Image', 'Button', 'Nav bar']
const HTTP_ERROR_THRESHOLD = 400

test.describe('app shell', () => {
  test('renders the header, canvas and the six-entry block palette', async ({ page }) => {
    const response = await page.goto('./')

    expect(response?.status()).toBe(200)
    await expect(page).toHaveTitle(APP_TITLE)
    await expect(page.getByRole('heading', { level: 1, name: APP_TITLE })).toBeVisible()
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
    await expect(page.getByRole('heading', { level: 1, name: APP_TITLE })).toBeVisible()

    expect(failedRequests).toEqual([])
  })
})
