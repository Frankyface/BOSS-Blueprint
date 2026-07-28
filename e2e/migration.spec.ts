import { expect, test } from '@playwright/test'

import {
  addBlock,
  addPage,
  blockById,
  blockOfType,
  blocks,
  editBlockText,
  idOfType,
  inspectBlock,
  linkToPage,
  openCanvas,
  pageNames,
  pageTab,
  readDocument,
  readStoredDesign,
  reloadCanvas,
  STORAGE_KEY,
  waitForAutosave,
  writeStoredDesign,
} from './support/canvas.ts'

/**
 * A design saved by the schema-1 build: one flat `{ blocks }` canvas, no pages and
 * no site settings. It must be MIGRATED on read, not quarantined — a client who
 * sketched a page before this release has to find it here afterwards.
 */
const LEGACY_DESIGN = JSON.stringify({
  schemaVersion: 1,
  blocks: [
    { id: 'legacy-nav', type: 'nav-bar', x: 0, y: 0, width: 1200, height: 72, text: 'Home, Menu' },
    { id: 'legacy-section', type: 'section', x: 0, y: 72, width: 1200, height: 240, text: '' },
    {
      id: 'legacy-heading',
      type: 'heading',
      x: 80,
      y: 120,
      width: 640,
      height: 72,
      text: 'BOSS Solutions',
    },
    {
      id: 'legacy-button',
      type: 'button',
      x: 80,
      y: 760,
      width: 200,
      height: 56,
      text: 'Book a call',
    },
  ],
})

test.describe('opening a design saved by the previous schema', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
    await writeStoredDesign(page, STORAGE_KEY, LEGACY_DESIGN)
    await reloadCanvas(page)
  })

  test('migrates it into a single Home page instead of quarantining it', async ({ page }) => {
    // The tell-tale of a quarantine: the recovery notice and an empty canvas.
    await expect(page.getByTestId('storage-notice')).toBeHidden()

    expect(await pageNames(page)).toEqual(['Home'])
    await expect(pageTab(page, 'Home')).toHaveAttribute('data-current', 'true')
    await expect(blocks(page)).toHaveCount(4)

    const document = await readDocument(page)
    expect(document.blocks.map((block) => block.id)).toEqual([
      'legacy-nav',
      'legacy-section',
      'legacy-heading',
      'legacy-button',
    ])
    expect(document.siteSettings).toMatchObject({ businessName: '', vibe: null, colors: [] })
  })

  test('gives the migrated blocks their Stage 2 fields', async ({ page }) => {
    const document = await readDocument(page)
    const byId = (id: string) => document.blocks.find((block) => block.id === id)

    // Copy blocks default to the client's own words.
    expect(byId('legacy-heading')).toMatchObject({
      copyMode: 'real',
      generateDescription: '',
      lengthHint: '',
    })

    // A button is explicitly unlinked rather than left undefined.
    expect(byId('legacy-button')?.link).toEqual({ kind: 'none' })

    // The nav bar's comma-separated labels become structured items.
    expect(byId('legacy-nav')?.items?.map((item) => item.label)).toEqual(['Home', 'Menu'])
    expect(byId('legacy-nav')?.items?.every((item) => item.link.kind === 'none')).toBe(true)
    await expect(blockOfType(page, 'nav-bar').getByTestId('nav-item')).toHaveCount(2)
  })

  test('the migrated design is fully editable, and re-saves as the new schema', async ({
    page,
  }) => {
    test.slow()

    // Everything Stage 2 added works on the migrated design.
    await addPage(page, 'Menu')
    await addBlock(page, 'text')
    await editBlockText(page, blockOfType(page, 'text'), 'Antipasti, pasta, dolci.')

    await pageTab(page, 'Home').click()
    const buttonId = await idOfType(page, 'button')
    await inspectBlock(page, blockById(page, buttonId))
    await linkToPage(page, 'button', 'Menu')

    await waitForAutosave(page)

    const raw = await readStoredDesign(page)
    const payload = JSON.parse(raw ?? '{}') as { schemaVersion?: number; pages?: unknown[] }
    expect(payload.schemaVersion).toBe(2)
    expect(payload.pages).toHaveLength(2)

    // And the migration does not happen twice.
    await reloadCanvas(page)
    expect(await pageNames(page)).toEqual(['Home', 'Menu'])
    const document = await readDocument(page)
    expect(document.blocks.find((block) => block.id === buttonId)?.link).toEqual({
      kind: 'page',
      pageId: 'page-menu',
    })
  })

  test('history starts clean, so a migrated design cannot be undone away', async ({ page }) => {
    await expect(page.getByTestId('toolbar-undo')).toBeDisabled()
    await expect(page.getByTestId('toolbar-redo')).toBeDisabled()
  })
})

test.describe('a payload from a schema we have never heard of', () => {
  test('is still quarantined rather than guessed at', async ({ page }) => {
    await openCanvas(page)
    const future = JSON.stringify({ schemaVersion: 99, pages: [] })
    await writeStoredDesign(page, STORAGE_KEY, future)

    await reloadCanvas(page)

    await expect(page.getByTestId('storage-notice')).toHaveAttribute(
      'data-notice-kind',
      'recovered',
    )
    await expect(blocks(page)).toHaveCount(0)
    expect(await pageNames(page)).toEqual(['Home'])
  })
})
