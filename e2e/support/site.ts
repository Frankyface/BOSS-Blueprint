import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { readDocument } from './canvas.ts'

/**
 * E2E vocabulary for the SITE around a page: the page strip, the details panel and
 * the nav map — the Stage 2 additions.
 *
 * Split out of `canvas.ts` when that file passed the 600-line ceiling for E2E
 * support files (`docs/decisions.md` 2026-07-28; review MEDIUM-2). The division is
 * the one the file already drew for itself with a section banner: `canvas.ts` is
 * one page and the blocks on it, this is everything above and beside it.
 */

export function pageTabs(page: Page): Locator {
  return page.getByTestId('page-tab')
}

export function pageTab(page: Page, name: string): Locator {
  return pageTabs(page).filter({ hasText: name })
}

export async function pageNames(page: Page): Promise<string[]> {
  return (await readDocument(page)).pages.map((entry) => entry.name)
}

/** Add a page the way a client does: click Add page, type a name, confirm. */
export async function addPage(page: Page, name: string): Promise<string> {
  await page.getByTestId('page-add').click()
  await page.getByTestId('page-add-name').fill(name)
  await page.getByTestId('page-add-confirm').click()
  await expect(page.getByTestId('page-add-form')).toBeHidden()
  return (await readDocument(page)).currentPageId
}

export async function switchToPage(page: Page, name: string): Promise<void> {
  await pageTab(page, name).click()
  await expect(pageTab(page, name)).toHaveAttribute('data-current', 'true')
}

export async function renamePage(page: Page, name: string): Promise<void> {
  await page.getByTestId('page-rename').click()
  await page.getByTestId('page-rename-name').fill(name)
  await page.getByTestId('page-rename-confirm').click()
  await expect(page.getByTestId('page-rename-form')).toBeHidden()
}

export async function duplicateCurrentPage(page: Page): Promise<void> {
  await page.getByTestId('page-duplicate').click()
}

/** Delete the current page through the two-step confirmation. */
export async function deleteCurrentPage(page: Page): Promise<void> {
  await page.getByTestId('page-delete').click()
  await expect(page.getByTestId('page-delete-confirm')).toBeVisible()
  await page.getByTestId('page-delete-confirmed').click()
  await expect(page.getByTestId('page-delete-confirm')).toBeHidden()
}

export type PanelTab = 'block' | 'site' | 'map'

export async function openPanel(page: Page, tab: PanelTab): Promise<void> {
  await page.getByTestId(`side-panel-tab-${tab}`).click()
  await expect(page.getByTestId('side-panel')).toHaveAttribute('data-tab', tab)
}

/** Select a block on the canvas and open the Block tab of the details panel. */
export async function inspectBlock(page: Page, target: Locator): Promise<void> {
  await target.click()
  await openPanel(page, 'block')
  await expect(page.getByTestId('block-inspector')).toBeVisible()
}

/** Point a link picker at a page by NAME, using the select's visible label. */
export async function linkToPage(page: Page, testId: string, pageName: string): Promise<void> {
  await page.getByTestId(`${testId}-link-target`).selectOption({ label: pageName })
}

export async function linkToNothing(page: Page, testId: string): Promise<void> {
  await page.getByTestId(`${testId}-link-target`).selectOption('none')
}

/** Pick "a web address" and commit a URL. Returns without asserting validity. */
export async function linkToUrl(page: Page, testId: string, url: string): Promise<void> {
  await page.getByTestId(`${testId}-link-target`).selectOption('external')
  const field = page.getByTestId(`${testId}-link-url`)
  await expect(field).toBeVisible()
  await field.fill(url)
  await field.press('Enter')
}

export function navMapEntries(page: Page): Locator {
  return page.getByTestId('nav-map-entry')
}

/** The nav map as flat "Label → Destination" strings, in page order. */
export async function readNavMap(page: Page): Promise<string[]> {
  return page.getByTestId('nav-map-page').evaluateAll((sections) =>
    sections.flatMap((section) => {
      const heading = section.querySelector('h3')?.textContent ?? ''
      const entries = Array.from(section.querySelectorAll('[data-testid="nav-map-entry"]'))
      return entries.map((entry) => {
        const label = entry.querySelector('.nav-map__label')?.textContent ?? ''
        const target = entry.querySelector('.nav-map__target')?.textContent ?? ''
        return `${heading}: ${label} -> ${target}`
      })
    }),
  )
}

/** Commit a value into a details-panel field the way a client does. */
export async function fillPanelField(page: Page, testId: string, value: string): Promise<void> {
  const field = page.getByTestId(testId)
  await field.fill(value)
  await field.blur()
}
