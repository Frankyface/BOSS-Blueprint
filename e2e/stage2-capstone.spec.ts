import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import {
  addBlock,
  attachPageScreenshot,
  blockById,
  blocks,
  dismissStartSurfaces,
  domShapeOf,
  editBlockText,
  openCanvas,
  readDocument,
  readDomBlocks,
  reloadCanvas,
  waitForAutosave,
} from './support/canvas.ts'
import type { StoredDocument } from './support/canvas.ts'
import { designOf, downloadDesign, openDesignFile } from './support/designFile.ts'
import {
  drawStroke,
  makePhotoFixture,
  photoIn,
  putPenAway,
  scribbleAt,
  uploadInto,
  usePen,
} from './support/media.ts'
import { fillPanelField, inspectBlock, openPanel, switchToPage } from './support/site.ts'

/**
 * THE STAGE 2 CAPSTONE — everything the stage built, in one design, twice
 * round-tripped.
 *
 * Each feature has its own spec proving its own rules. What none of them can prove
 * is the thing the stage's Definition of Done actually promises: that a REAL
 * design, using every element the tool offers at once, survives the two journeys a
 * client makes without losing a single field —
 *
 *   · come back tomorrow          → reload, restored from browser storage
 *   · carry it to another machine → download, start over, open the file
 *
 * "Survives" is deep equality on the whole document, checked against BOTH the
 * store and the DOM, not a spot check of a few fields. The design is built the way
 * a client builds one: start from a template, then add, type, upload, wire and
 * annotate on top of it.
 */

const BUSINESS = 'The Copper Pot'
const TAGLINE = 'Slow food, fast smiles'
const REAL_HEADLINE = 'Tacos on Main Street since 2009'
const GENERATE_BRIEF = 'Warm welcome for our family taqueria — mention the comal and Main Street'
const LENGTH_HINT = '2 sentences'
const MENU_LABELS = 'Home, Menu, Visit Us'
const PHOTO_DESCRIPTION = 'My mother at the comal'
/** The restaurant template's own three pages, in its own order. */
const TEMPLATE_PAGES = ['Home', 'Menu', 'Visit Us'] as const
const ALL_BLOCK_TYPES = ['section', 'heading', 'text', 'image', 'button', 'nav-bar'] as const
/** Clear of the template's own hero, and inside the visible canvas at 1920x1000. */
const SCRIBBLE_ORIGIN = { x: 240, y: 300 }

/** Everything on the site, page by page — the shape both round trips are judged on. */
async function fullDesign(page: Page): Promise<ReturnType<typeof designOf>> {
  return designOf(await readDocument(page))
}

/**
 * Add a block and hand back ITS id.
 *
 * `idOfType` would answer with the template's own heading — the design under test
 * deliberately holds two of nearly everything, one seeded and one placed by hand.
 * A new block is always the selected one, which is how the store reports it.
 */
async function addAndTakeId(page: Page, type: (typeof ALL_BLOCK_TYPES)[number]): Promise<string> {
  await addBlock(page, type)
  const id = (await readDocument(page)).selectedBlockId
  if (!id) throw new Error(`Adding a ${type} block did not select it`)
  return id
}

/** Put the canvas back at the top, so page coordinates are on screen again. */
async function scrollCanvasToTop(page: Page): Promise<void> {
  await page.getByTestId('canvas-viewport').evaluate((viewport) => {
    viewport.scrollTop = 0
  })
  await expect
    .poll(() => page.getByTestId('canvas-viewport').evaluate((viewport) => viewport.scrollTop))
    .toBe(0)
}

/** The blocks the client placed by hand, as opposed to the template's own. */
interface PlacedBlocks {
  readonly heading: string
  readonly text: string
  readonly image: string
  readonly navBar: string
}

/**
 * BUILD THE DESIGN, using every element type the stage ships.
 *
 * Deliberately additive over the restaurant template rather than instead of it:
 * a template start is the normal way in, and the resulting design carries both
 * seeded blocks (`fromTemplate`) and the client's own — which is exactly the mix
 * the export has to describe.
 */
async function buildCapstoneDesign(page: Page): Promise<PlacedBlocks> {
  await page.getByTestId('template-card-restaurant').click()
  await expect(page.getByTestId('template-picker')).toBeHidden()

  const document = await readDocument(page)
  expect(document.pages.map((entry) => entry.name)).toEqual([...TEMPLATE_PAGES])

  // 1. THE BRIEF — including a colour typed the way a person says it.
  await openPanel(page, 'site')
  await fillPanelField(page, 'setting-business-name', BUSINESS)
  await fillPanelField(page, 'setting-tagline', TAGLINE)
  await fillPanelField(page, 'setting-about', 'A family taqueria in Guelph, open six nights.')
  await page.getByTestId('setting-vibe').selectOption('warm')
  await fillPanelField(page, 'site-color-0', 'dark green')

  // 2. ONE OF EVERY BLOCK KIND, placed by hand on top of the template — and each
  //    one is finished before the next lands, because a free-floating block
  //    cascades over the last one and would then be the thing a double-click hits.
  await addAndTakeId(page, 'section')

  // 3. A REAL copy block: the client's own words.
  const heading = await addAndTakeId(page, 'heading')
  await editBlockText(page, blockById(page, heading), REAL_HEADLINE)

  // 4. A GENERATE-LATER copy block, with the brief Claude will write from.
  const text = await addAndTakeId(page, 'text')
  await inspectBlock(page, blockById(page, text))
  await page.getByTestId('copy-mode-generate').click()
  await fillPanelField(page, 'copy-description', GENERATE_BRIEF)
  await fillPanelField(page, 'copy-length-hint', LENGTH_HINT)

  // 5. A REAL PHOTO, through the real ingest path.
  const image = await addAndTakeId(page, 'image')
  const photo = await makePhotoFixture(page, { name: 'comal.jpg', width: 640, height: 420 })
  await uploadInto(blockById(page, image), photo)
  await expect(photoIn(blockById(page, image))).toBeVisible()
  await inspectBlock(page, blockById(page, image))
  await fillPanelField(page, 'image-description', PHOTO_DESCRIPTION)

  await addAndTakeId(page, 'button')

  // 6. A MENU WIRED TO EVERY PAGE — typed, so the labels wire themselves up.
  const navBar = await addAndTakeId(page, 'nav-bar')
  await editBlockText(page, blockById(page, navBar), MENU_LABELS)

  // 7. A PEN ANNOTATION — the client circling something for the designer.
  //    Editing the nav bar scrolled the canvas down to reach it.
  await scrollCanvasToTop(page)
  await usePen(page, 'draw')
  await drawStroke(page, scribbleAt(SCRIBBLE_ORIGIN.x, SCRIBBLE_ORIGIN.y))
  await putPenAway(page)

  await attachPageScreenshot(page, 'capstone-home')
  return { heading, text, image, navBar }
}

/** Every promise the built design has to keep, asserted against the store. */
function expectCompleteDesign(document: StoredDocument, placed: PlacedBlocks): void {
  const pages = document.pages
  expect(pages.map((entry) => entry.name)).toEqual([...TEMPLATE_PAGES])

  const home = pages[0]
  expect(home).toBeDefined()
  if (!home) return

  const byId = (id: string) => home.blocks.find((block) => block.id === id)

  // Every block kind is present on the home page.
  for (const type of ALL_BLOCK_TYPES) {
    expect(home.blocks.some((block) => block.type === type), `${type} is on the page`).toBe(true)
  }

  // The client's own words, and the words Claude is asked to write.
  expect(byId(placed.heading)).toMatchObject({ text: REAL_HEADLINE, copyMode: 'real' })
  expect(byId(placed.text)).toMatchObject({
    copyMode: 'generate',
    generateDescription: GENERATE_BRIEF,
    lengthHint: LENGTH_HINT,
  })

  // The photo, as bytes in the document rather than a path to somewhere.
  const image = byId(placed.image)
  expect(image?.imageData ?? '').toMatch(/^data:image\//)
  expect(image?.description).toBe(PHOTO_DESCRIPTION)
  expect(image?.originalFilename).toBe('comal.jpg')

  // A menu that reaches every page of the site — the client's hand-typed one.
  const navBar = byId(placed.navBar)
  expect(navBar?.text).toBe(MENU_LABELS)
  const wiredTo = (navBar?.items ?? []).map((item) =>
    item.link.kind === 'page' ? item.link.pageId : null,
  )
  expect(wiredTo).toEqual(pages.map((entry) => entry.id))

  // The annotation.
  expect(home.penStrokes.length).toBeGreaterThanOrEqual(1)
  expect(home.penStrokes[0]?.points.length).toBeGreaterThan(1)

  // The brief, colour and all.
  expect(document.siteSettings).toMatchObject({
    businessName: BUSINESS,
    tagline: TAGLINE,
    vibe: 'warm',
    colors: ['#006400'],
  })
}

test.describe('Stage 2 capstone', () => {
  // Six features in one flow, with a real upload and a real download: WebKit runs
  // this five to ten times slower than Chromium, and the headroom is granted up
  // front rather than after the first flaky CI run.
  test.slow()

  test('a design using every element survives a reload and a file round trip', async ({ page }) => {
    await openCanvas(page, { keepStart: true })
    const placed = await buildCapstoneDesign(page)

    const original = await fullDesign(page)
    expectCompleteDesign(await readDocument(page), placed)
    const homeDom = await readDomBlocks(page)
    expect(homeDom).toEqual(domShapeOf(await readDocument(page)))

    /* ---- JOURNEY 1: come back tomorrow ---------------------------------- */
    await waitForAutosave(page)
    await reloadCanvas(page)

    expect(await fullDesign(page)).toEqual(original)
    expectCompleteDesign(await readDocument(page), placed)
    // The DOM agrees with the store, block for block, pixel for pixel.
    expect(await readDomBlocks(page)).toEqual(homeDom)
    await expect(photoIn(blockById(page, placed.image))).toBeVisible()
    await expect(page.getByTestId('pen-stroke')).toHaveCount(1)

    /* ---- JOURNEY 2: carry it to another machine -------------------------- */
    const file = await downloadDesign(page)
    expect(file.fileName).toBe('the-copper-pot.blueprint')

    // Start over is the emptiest a client's browser can be.
    await page.getByTestId('toolbar-start-over').click()
    await page.getByTestId('start-over-confirmed').click()
    await expect(blocks(page)).toHaveCount(0)
    await dismissStartSurfaces(page)
    expect((await readDocument(page)).pages).toHaveLength(1)

    await openDesignFile(page, file.fileName, file.contents)
    await expect(page.getByTestId('design-toast')).toContainText('Opened')

    await expect.poll(async () => fullDesign(page)).toEqual(original)
    expectCompleteDesign(await readDocument(page), placed)
    expect(await readDomBlocks(page)).toEqual(homeDom)
    await expect(photoIn(blockById(page, placed.image))).toBeVisible()
    await expect(page.getByTestId('pen-stroke')).toHaveCount(1)

    // …and the other two pages came back whole as well.
    for (const name of TEMPLATE_PAGES.slice(1)) {
      await switchToPage(page, name)
      const current = await readDocument(page)
      expect(current.blocks.length).toBeGreaterThan(0)
      expect(await readDomBlocks(page)).toEqual(domShapeOf(current))
    }

    await switchToPage(page, 'Home')
    await attachPageScreenshot(page, 'capstone-after-round-trip')
  })
})
