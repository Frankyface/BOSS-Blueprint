import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  addBlock,
  attachPageScreenshot,
  blockById,
  blocks,
  dragBy,
  editBlockText,
  openCanvas,
  readAllBlocks,
  readDocument,
  reloadCanvas,
  waitForAutosave,
} from './support/canvas.ts'
import { switchToPage } from './support/site.ts'

/**
 * STARTER TEMPLATES, in a real browser.
 *
 * The unit spec (`src/templates/starterTemplates.test.ts`) proves the 138 fixture
 * blocks are schema-valid, on-grid, in-bounds and correctly wired. What only a
 * browser can prove is the rest of the promise: that choosing one puts a real
 * multi-page design on the canvas, that everything on it is as editable as a block
 * the client placed by hand, that the miniature on the picker card is drawn from
 * that same data, and that the template flag clears exactly when the contract says
 * it does.
 */

/** id, card title, page names, and a block whose words are worth rewriting. */
const TEMPLATES = [
  {
    id: 'restaurant',
    title: 'Restaurant or café',
    pages: ['Home', 'Menu', 'Visit Us'],
    editable: 'rest-home-hero-title',
  },
  {
    id: 'trades',
    title: 'Trades & services',
    pages: ['Home', 'Services', 'Get a Quote'],
    editable: 'trade-home-hero-title',
  },
  {
    id: 'portfolio',
    title: 'Portfolio',
    pages: ['Work', 'About', 'Contact'],
    editable: 'port-work-title',
  },
  {
    id: 'shop',
    title: 'Shop',
    pages: ['Home', 'Shop', 'Find Us'],
    editable: 'shop-home-hero-title',
  },
] as const

const MIN_BLOCKS_PER_PAGE = 5
const MAX_BLOCKS_PER_PAGE = 12

async function chooseTemplate(page: Page, id: string): Promise<void> {
  await page.getByTestId(`template-card-${id}`).click()
  await expect(page.getByTestId('template-picker')).toBeHidden()
}

test.describe('the starting-point picker', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page, { keepStart: true })
  })

  test('greets a first visit with four templates, a blank start, and live miniatures', async ({
    page,
  }) => {
    await expect(page.getByTestId('template-picker')).toBeVisible()

    for (const template of TEMPLATES) {
      const card = page.getByTestId(`template-card-${template.id}`)
      await expect(card).toBeVisible()
      await expect(card).toContainText(template.title)
      // The miniature is rendered FROM the fixture, so it cannot show a design
      // the client will not get. Proving it has real blocks in it proves that.
      const thumbnail = card.getByTestId('template-thumbnail')
      await expect(thumbnail).toBeVisible()
      expect(await thumbnail.locator('[data-block-type]').count()).toBeGreaterThanOrEqual(
        MIN_BLOCKS_PER_PAGE,
      )
      expect(await thumbnail.locator('[data-block-type="nav-bar"]').count()).toBe(1)
    }

    await expect(page.getByTestId('template-card-blank')).toBeVisible()
    await expect(page.getByTestId('blank-start-coach')).toBeHidden()

    await test.info().attach('template-picker.png', {
      body: await page.getByTestId('template-picker').screenshot(),
      contentType: 'image/png',
    })
  })

  for (const template of TEMPLATES) {
    test(`the ${template.id} template lands a wired multi-page design`, async ({ page }) => {
      await chooseTemplate(page, template.id)

      const document = await readDocument(page)
      expect(document.pages.map((entry) => entry.name)).toEqual([...template.pages])
      // You land on the template's own home page, whatever it is called.
      expect(document.currentPageId).toBe(document.pages[0]?.id)

      const pageIds = new Set(document.pages.map((entry) => entry.id))
      for (const entry of document.pages) {
        expect(entry.blocks.length).toBeGreaterThanOrEqual(MIN_BLOCKS_PER_PAGE)
        expect(entry.blocks.length).toBeLessThanOrEqual(MAX_BLOCKS_PER_PAGE)

        // Nav pre-wired: one menu per page, every item pointing at a real page.
        const navs = entry.blocks.filter((block) => block.type === 'nav-bar')
        expect(navs).toHaveLength(1)
        const items = navs[0]?.items ?? []
        expect(items).toHaveLength(document.pages.length)
        for (const item of items) {
          expect(item.link.kind).toBe('page')
          expect(item.link.kind === 'page' && pageIds.has(item.link.pageId)).toBe(true)
        }

        // Every button that points at a page points at one that exists.
        for (const block of entry.blocks) {
          if (block.link?.kind === 'page') expect(pageIds.has(block.link.pageId)).toBe(true)
        }
      }

      // The business name is the one field a template must NOT answer for them.
      expect(document.siteSettings.businessName).toBe('')

      // The page really is drawn, not just in the store.
      await expect(blocks(page)).toHaveCount(document.pages[0]?.blocks.length ?? 0)
      await attachPageScreenshot(page, `template-${template.id}`)
    })
  }

  test('every page of a template is one click away, and its blocks are drawn', async ({ page }) => {
    await chooseTemplate(page, 'restaurant')

    const document = await readDocument(page)
    for (const entry of document.pages) {
      await switchToPage(page, entry.name)
      await expect(page.getByTestId('canvas-page')).toHaveAttribute('data-page-id', entry.id)
      await expect(blocks(page)).toHaveCount(entry.blocks.length)
    }
  })

  test('a template is just pre-placed state: every block is editable and deletable', async ({
    page,
  }) => {
    await chooseTemplate(page, 'restaurant')

    // Retype the hero title the way a client does — double-click, type, Enter.
    await editBlockText(page, blockById(page, 'rest-home-hero-title'), 'The Copper Pot')
    expect((await readDocument(page)).blocks.find((b) => b.id === 'rest-home-hero-title')).toMatchObject(
      { text: 'The Copper Pot' },
    )

    // Drag one, and delete another.
    const before = (await readDocument(page)).blocks.length
    await blockById(page, 'rest-home-hero-cta').click()
    await page.getByTestId('toolbar-delete').click()

    const after = await readDocument(page)
    expect(after.blocks).toHaveLength(before - 1)
    expect(after.blocks.some((block) => block.id === 'rest-home-hero-cta')).toBe(false)

    // And a hand-added block joins it as an equal.
    await addBlock(page, 'button')
    expect((await readDocument(page)).blocks).toHaveLength(before)
  })

  test('editing a block\'s words makes it the client\'s; moving it does not', async ({ page }) => {
    await chooseTemplate(page, 'restaurant')

    const seeded = await readAllBlocks(page)
    // Bands never carry the flag — a section has no content to edit, so it could
    // never clear (export-format §2.6 v2.3).
    expect(seeded.filter((b) => b.type !== 'section').every((b) => b.fromTemplate === true)).toBe(true)
    expect(seeded.some((b) => b.type === 'section')).toBe(true)
    expect(seeded.filter((b) => b.type === 'section').every((b) => b.fromTemplate === undefined)).toBe(
      true,
    )

    await editBlockText(page, blockById(page, 'rest-home-hero-title'), 'The Copper Pot')

    const edited = await readDocument(page)
    const title = edited.blocks.find((block) => block.id === 'rest-home-hero-title')
    expect(title?.fromTemplate).toBeUndefined()
    // Its neighbours are untouched, and still ours.
    expect(edited.blocks.find((block) => block.id === 'rest-home-about-title')?.fromTemplate).toBe(
      true,
    )

    // Moving is a placement decision, not a rewrite: the words are still ours.
    const wasAt = edited.blocks.find((block) => block.id === 'rest-home-about-title')?.x
    await dragBy(page, blockById(page, 'rest-home-about-title'), 40, 0)

    const moved = await readDocument(page)
    const about = moved.blocks.find((block) => block.id === 'rest-home-about-title')
    expect(about?.fromTemplate).toBe(true)
    expect(about?.x).toBe((wasAt ?? 0) + 40)
  })

  test('the flag survives the round trip through storage', async ({ page }) => {
    await chooseTemplate(page, 'restaurant')
    await editBlockText(page, blockById(page, 'rest-home-hero-title'), 'The Copper Pot')
    await waitForAutosave(page)

    await reloadCanvas(page)

    const restored = await readDocument(page)
    expect(restored.blocks.find((block) => block.id === 'rest-home-hero-title')?.fromTemplate)
      .toBeUndefined()
    expect(restored.blocks.find((block) => block.id === 'rest-home-about-title')?.fromTemplate)
      .toBe(true)
  })
})

test.describe('starting blank', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page, { keepStart: true })
    await page.getByTestId('template-card-blank').click()
  })

  test('places nothing at all, and coaches instead', async ({ page }) => {
    await expect(page.getByTestId('template-picker')).toBeHidden()
    await expect(page.getByTestId('blank-start-coach')).toBeVisible()

    // ZERO blocks: nothing may reach the client's export that they did not choose.
    await expect(blocks(page)).toHaveCount(0)
    const document = await readDocument(page)
    expect(document.pages).toHaveLength(1)
    expect(document.pages[0]?.blocks).toHaveLength(0)
    expect(document.pages[0]?.penStrokes).toHaveLength(0)

    await test.info().attach('blank-start-coach.png', {
      body: await page.getByTestId('blank-start-coach').screenshot(),
      contentType: 'image/png',
    })
  })

  test('the coach card dismisses, and stays dismissed', async ({ page }) => {
    await page.getByTestId('blank-start-coach-dismiss').click()

    await expect(page.getByTestId('blank-start-coach')).toBeHidden()
    await expect(blocks(page)).toHaveCount(0)

    await addBlock(page, 'heading')
    await expect(page.getByTestId('blank-start-coach')).toBeHidden()
  })

  test('the first block retires the coaching by itself', async ({ page }) => {
    await addBlock(page, 'nav-bar')

    await expect(page.getByTestId('blank-start-coach')).toBeHidden()
    // And it does not come back when that block goes away again.
    await page.getByTestId('toolbar-delete').click()
    await expect(blocks(page)).toHaveCount(0)
    await expect(page.getByTestId('blank-start-coach')).toBeHidden()
  })

  test('one click goes back to the templates', async ({ page }) => {
    await page.getByTestId('blank-start-coach-templates').click()

    await expect(page.getByTestId('template-picker')).toBeVisible()

    await chooseTemplate(page, 'portfolio')
    expect((await readDocument(page)).pages.map((entry) => entry.name)).toEqual([
      'Work',
      'About',
      'Contact',
    ])
  })
})

test.describe('coming back to a design', () => {
  test('a saved design skips the picker entirely', async ({ page }) => {
    await openCanvas(page, { keepStart: true })
    await chooseTemplate(page, 'shop')
    await waitForAutosave(page)

    await reloadCanvas(page, { keepStart: true })

    await expect(page.getByTestId('template-picker')).toBeHidden()
    await expect(page.getByTestId('blank-start-coach')).toBeHidden()
    expect((await readDocument(page)).pages).toHaveLength(3)
  })

  test('"start over" is the way back to the picker', async ({ page }) => {
    await openCanvas(page, { keepStart: true })
    await chooseTemplate(page, 'shop')
    await waitForAutosave(page)

    await page.getByTestId('toolbar-start-over').click()
    await page.getByTestId('start-over-confirmed').click()

    await expect(page.getByTestId('template-picker')).toBeVisible()
    await expect(blocks(page)).toHaveCount(0)

    // And picking again from there really does start the new design.
    await chooseTemplate(page, 'trades')
    expect((await readDocument(page)).pages).toHaveLength(3)
  })
})
