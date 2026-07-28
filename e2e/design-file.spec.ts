import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  addBlock,
  blockOfType,
  blocks,
  dismissStartSurfaces,
  editBlockText,
  openCanvas,
  readDocument,
  reloadCanvas,
  waitForAutosave,
} from './support/canvas.ts'
import type { StoredDocument } from './support/canvas.ts'
import { makePhotoFixture, photoIn, uploadInto } from './support/media.ts'
import { addPage, fillPanelField, openPanel, switchToPage } from './support/site.ts'

/**
 * THE `.blueprint` FILE, through the file system.
 *
 * The serialiser, the parser and every refusal path are unit-tested to the field
 * (`src/canvas/blueprintFile.test.ts`, `designFile.test.ts`,
 * `designFileSession.test.ts`). What only a browser can prove is the FILE ROUTE
 * itself: that a real download lands with the right name and the right bytes, in
 * three engines with three different download implementations; that the file the
 * client then picks comes back as the same design; and that a bad one is refused
 * without touching what is on screen.
 */

const BUSINESS = 'The Copper Pot'
const SECOND_PAGE = 'Menu'

interface DownloadedDesign {
  readonly fileName: string
  readonly contents: string
}

async function downloadDesign(page: Page): Promise<DownloadedDesign> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('design-download').click(),
  ])

  const path = await download.path()
  return { fileName: download.suggestedFilename(), contents: await readFile(path, 'utf8') }
}

/** Hand a file to the header's Open control, exactly as the file picker does. */
async function openDesignFile(page: Page, name: string, contents: string): Promise<void> {
  await page.getByTestId('design-file-input').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(contents, 'utf8'),
  })
}

/** Only the parts a design file carries — currentPage and selection are not in it. */
const designOf = (document: StoredDocument) => ({
  pages: document.pages,
  siteSettings: document.siteSettings,
})

/** A small but complete design: settings, two pages, several block types, a photo. */
async function buildDesign(page: Page): Promise<void> {
  await openPanel(page, 'site')
  await fillPanelField(page, 'setting-business-name', BUSINESS)
  await fillPanelField(page, 'setting-tagline', 'Slow food, fast smiles')

  await addBlock(page, 'nav-bar')
  await addBlock(page, 'heading')
  await editBlockText(page, blockOfType(page, 'heading'), 'Welcome in')
  await addBlock(page, 'image')

  const photo = await makePhotoFixture(page, { name: 'room.jpg', width: 480, height: 320 })
  await uploadInto(blockOfType(page, 'image'), photo)
  await expect(photoIn(blockOfType(page, 'image'))).toBeVisible()

  await addPage(page, SECOND_PAGE)
  await addBlock(page, 'text')
  await switchToPage(page, 'Home')
}

test.describe('downloading the design', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
  })

  test('saves the whole design under the business name', async ({ page }) => {
    // WebKit's download and drag-drop paths are its slowest; measured 12–15s locally.
    test.slow()

    await buildDesign(page)
    const expected = designOf(await readDocument(page))

    const file = await downloadDesign(page)

    expect(file.fileName).toBe('the-copper-pot.blueprint')
    // The SAME payload autosave writes: one format, three uses.
    const parsed = JSON.parse(file.contents) as Record<string, unknown>
    expect(parsed.schemaVersion).toBe(2)
    expect({ pages: parsed.pages, siteSettings: parsed.siteSettings }).toEqual(expected)
    // The photo rides along inside the file, not beside it.
    expect(file.contents).toContain('data:image/')

    await expect(page.getByTestId('design-toast')).toContainText('the-copper-pot.blueprint')
  })

  test('still produces a usable name before the business name is filled in', async ({ page }) => {
    await addBlock(page, 'heading')

    expect((await downloadDesign(page)).fileName).toBe('my-site.blueprint')
  })
})

test.describe('opening a design file', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
  })

  test('brings the design back deep-equal, photo and all', async ({ page }) => {
    test.slow()

    await buildDesign(page)
    const original = designOf(await readDocument(page))
    const file = await downloadDesign(page)

    // Wipe it the way a client on a new machine would arrive: nothing at all.
    await page.getByTestId('toolbar-start-over').click()
    await page.getByTestId('start-over-confirmed').click()
    await expect(blocks(page)).toHaveCount(0)
    await dismissStartSurfaces(page)

    await openDesignFile(page, file.fileName, file.contents)

    await expect(page.getByTestId('design-toast')).toContainText('Opened')
    await expect
      .poll(async () => designOf(await readDocument(page)))
      .toEqual(original)

    // Drawn, not just in the store — and it survives a reload from there.
    await expect(photoIn(blockOfType(page, 'image'))).toBeVisible()
    await waitForAutosave(page)
    await reloadCanvas(page)
    expect(designOf(await readDocument(page))).toEqual(original)
  })

  test('asks before replacing work that is already open, and takes no for an answer', async ({
    page,
  }) => {
    // WebKit's download and drag-drop paths are its slowest; measured 12–15s locally.
    test.slow()

    await addBlock(page, 'heading')
    await editBlockText(page, blockOfType(page, 'heading'), 'Keep me')
    const file = await downloadDesign(page)

    await addBlock(page, 'button')
    const before = designOf(await readDocument(page))

    await openDesignFile(page, file.fileName, file.contents)

    await expect(page.getByTestId('design-import-confirm')).toBeVisible()
    // Nothing has happened yet.
    expect(designOf(await readDocument(page))).toEqual(before)

    await page.getByTestId('design-import-cancel').click()
    await expect(page.getByTestId('design-import-confirm')).toBeHidden()
    expect(designOf(await readDocument(page))).toEqual(before)

    // Say yes the second time, and it really does replace it.
    await openDesignFile(page, file.fileName, file.contents)
    await page.getByTestId('design-import-confirmed').click()
    await expect(page.getByTestId('design-import-confirm')).toBeHidden()
    await expect(blocks(page)).toHaveCount(1)
  })

  test('opening a design is a starting point, not an undo step', async ({ page }) => {
    // WebKit's download and drag-drop paths are its slowest; measured 12–15s locally.
    test.slow()

    await addBlock(page, 'heading')
    const file = await downloadDesign(page)

    await page.getByTestId('toolbar-start-over').click()
    await page.getByTestId('start-over-confirmed').click()
    await dismissStartSurfaces(page)

    await openDesignFile(page, file.fileName, file.contents)

    await expect(blocks(page)).toHaveCount(1)
    await expect(page.getByTestId('toolbar-undo')).toBeDisabled()
  })

  test('migrates a design saved by an older version of the tool', async ({ page }) => {
    const legacy = JSON.stringify({
      schemaVersion: 1,
      blocks: [
        { id: 'legacy-1', type: 'heading', x: 80, y: 120, width: 640, height: 72, text: 'Old news' },
      ],
    })

    await openDesignFile(page, 'last-year.blueprint', legacy)

    await expect(page.getByTestId('design-toast')).toContainText('brought it up to date')
    const document = await readDocument(page)
    expect(document.pages).toHaveLength(1)
    expect(document.blocks[0]).toMatchObject({ id: 'legacy-1', text: 'Old news' })
  })

  test('a design can be dropped onto the editor instead of picked', async ({ page }) => {
    // WebKit's download and drag-drop paths are its slowest; measured 12–15s locally.
    test.slow()

    await addBlock(page, 'heading')
    await editBlockText(page, blockOfType(page, 'heading'), 'Dropped in')
    const file = await downloadDesign(page)

    await page.getByTestId('toolbar-start-over').click()
    await page.getByTestId('start-over-confirmed').click()
    await dismissStartSurfaces(page)

    const dataTransfer = await page.evaluateHandle(
      ({ name, contents }) => {
        const transfer = new DataTransfer()
        transfer.items.add(new File([contents], name, { type: 'application/json' }))
        return transfer
      },
      { name: file.fileName, contents: file.contents },
    )
    await page.getByTestId('canvas-viewport').dispatchEvent('drop', { dataTransfer })

    await expect(blocks(page)).toHaveCount(1)
    expect((await readDocument(page)).blocks[0]).toMatchObject({ text: 'Dropped in' })
  })
})

test.describe('files we will not open', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
    await addBlock(page, 'heading')
    await editBlockText(page, blockOfType(page, 'heading'), 'My real work')
  })

  test('a corrupt file is refused, and the design on screen is untouched', async ({ page }) => {
    const before = designOf(await readDocument(page))

    await openDesignFile(page, 'my-site.blueprint', '{"schemaVersion": 2, "pages": [ truncated')

    await expect(page.getByTestId('design-toast')).toContainText('exactly as you left it')
    // No confirmation was ever offered: there was nothing worth risking work for.
    await expect(page.getByTestId('design-import-confirm')).toBeHidden()
    expect(designOf(await readDocument(page))).toEqual(before)
    await expect(blocks(page)).toHaveCount(1)
  })

  test('a design from a NEWER version is refused rather than half-read', async ({ page }) => {
    const before = designOf(await readDocument(page))

    await openDesignFile(
      page,
      'from-the-future.blueprint',
      JSON.stringify({ schemaVersion: 99, pages: [], siteSettings: null }),
    )

    await expect(page.getByTestId('design-toast')).toContainText('different version')
    expect(designOf(await readDocument(page))).toEqual(before)
  })

  test('a photo dressed up as a design cannot inject a script', async ({ page }) => {
    const before = designOf(await readDocument(page))

    await openDesignFile(
      page,
      'sneaky.blueprint',
      JSON.stringify({
        schemaVersion: 2,
        siteSettings: null,
        pages: [
          {
            id: 'page-home',
            name: 'Home',
            blocks: [
              {
                id: 'evil',
                type: 'image',
                x: 0,
                y: 0,
                width: 100,
                height: 100,
                text: '',
                imageData: 'data:text/html,<script>window.pwned=1</script>',
              },
            ],
          },
        ],
      }),
    )

    await expect(page.getByTestId('design-toast')).toContainText('exactly as you left it')
    expect(designOf(await readDocument(page))).toEqual(before)
    expect(await page.evaluate(() => 'pwned' in window)).toBe(false)
  })

  test('a file that is not a design at all is named and refused', async ({ page }) => {
    await page.getByTestId('design-file-input').setInputFiles({
      name: 'price-list.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Soup of the day: minestrone'),
    })

    await expect(page.getByTestId('design-toast')).toContainText('price-list.txt')
    await expect(blocks(page)).toHaveCount(1)
  })
})
