import { readFile } from 'node:fs/promises'

import type { Page } from '@playwright/test'

import type { StoredDocument } from './canvas.ts'

/**
 * E2E vocabulary for the `.blueprint` FILE — downloading one, and handing one back
 * to the app.
 *
 * Lifted out of `design-file.spec.ts` when the Stage 2 capstone spec needed the
 * same three moves (`e2e/stage2-capstone.spec.ts`): two copies of "click download
 * and read the bytes" would be two places to fix when the control moves.
 */

export interface DownloadedDesign {
  readonly fileName: string
  readonly contents: string
}

export async function downloadDesign(page: Page): Promise<DownloadedDesign> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('design-download').click(),
  ])

  const path = await download.path()
  return { fileName: download.suggestedFilename(), contents: await readFile(path, 'utf8') }
}

/** Hand a file to the header's Open control, exactly as the file picker does. */
export async function openDesignFile(page: Page, name: string, contents: string): Promise<void> {
  await page.getByTestId('design-file-input').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(contents, 'utf8'),
  })
}

/**
 * THE DESIGN ITSELF — the parts a `.blueprint` carries.
 *
 * The current page and the selection are editor state, not design state: they are
 * deliberately absent from the file, so a round-trip comparison that included them
 * would fail for the wrong reason.
 */
export const designOf = (document: StoredDocument) => ({
  pages: document.pages,
  siteSettings: document.siteSettings,
})
