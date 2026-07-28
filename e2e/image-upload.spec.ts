import { expect, test } from '@playwright/test'

import {
  addBlock,
  attachPageScreenshot,
  blockById,
  idOfType,
  openCanvas,
  readBlock,
  reloadCanvas,
  undoOnce,
  waitForAutosave,
} from './support/canvas.ts'
import {
  fillPanelField,
  inspectBlock,
} from './support/site.ts'
import {
  absurdlyLargePhoto,
  makePhotoFixture,
  measureStoredPhoto,
  notAnImage,
  photoIn,
  uploadInto,
} from './support/media.ts'

/** The long edge every stored upload is compressed down to. */
const MAX_LONG_EDGE = 1600

const FIXTURE_NAME = 'golden hour patio.jpg'
const DESCRIPTION = 'Our dining room at golden hour'

test.describe('image upload', () => {
  test.beforeEach(async ({ page }) => {
    await openCanvas(page)
  })

  test('uploads a big photo, shrinks it, and shows it in the slot', async ({ page }) => {
    // Generating, decoding and re-encoding a 3000x2000 photo is real work in every
    // engine, and WebKit is the slowest of the three at it.
    test.slow()

    await addBlock(page, 'image')
    const id = await idOfType(page, 'image')
    const slot = blockById(page, id)

    await expect(slot.getByTestId('image-slot')).toHaveAttribute('data-has-image', 'false')

    const fixture = await makePhotoFixture(page, {
      name: FIXTURE_NAME,
      width: 3000,
      height: 2000,
    })
    await uploadInto(slot, fixture)

    await expect(photoIn(slot)).toBeVisible()
    await expect(slot.getByTestId('image-slot')).toHaveAttribute('data-has-image', 'true')

    const stored = await readBlock(page, id)
    expect(stored.imageData?.startsWith('data:image/')).toBe(true)
    expect(stored.originalFilename).toBe(FIXTURE_NAME)
    expect(stored.fit).toBe('cover')

    // COMPRESSION, measured rather than assumed: the stored pixels really are
    // smaller than the 3000x2000 the client chose.
    const size = await measureStoredPhoto(page, stored.imageData ?? '')
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(MAX_LONG_EDGE)
    expect(size.width).toBe(MAX_LONG_EDGE)
    expect(size.height).toBe(1067)

    // …and the bytes shrank with them.
    expect((stored.imageData ?? '').length).toBeLessThan(fixture.buffer.byteLength * 1.4)

    await attachPageScreenshot(page, 'image-uploaded')
  })

  test('keeps the photo, its filename and its framing through a reload', async ({ page }) => {
    test.slow()

    await addBlock(page, 'image')
    const id = await idOfType(page, 'image')
    const slot = blockById(page, id)

    const fixture = await makePhotoFixture(page, { name: FIXTURE_NAME, width: 1200, height: 900 })
    await uploadInto(slot, fixture)
    await expect(photoIn(slot)).toBeVisible()

    const before = await readBlock(page, id)
    await waitForAutosave(page)
    await reloadCanvas(page)

    const after = await readBlock(page, id)
    expect(after.imageData).toBe(before.imageData)
    expect(after.originalFilename).toBe(FIXTURE_NAME)
    await expect(photoIn(blockById(page, id))).toBeVisible()
  })

  test('switches how the photo fills its frame', async ({ page }) => {
    test.slow()

    await addBlock(page, 'image')
    const id = await idOfType(page, 'image')
    const slot = blockById(page, id)

    await uploadInto(slot, await makePhotoFixture(page, { name: 'wide.jpg', width: 1600, height: 400 }))
    await expect(photoIn(slot)).toBeVisible()

    await inspectBlock(page, slot)
    await expect(page.getByTestId('image-fit-cover')).toHaveAttribute('aria-pressed', 'true')

    const fitStyle = () => photoIn(slot).evaluate((image) => window.getComputedStyle(image).objectFit)
    expect(await fitStyle()).toBe('cover')

    await page.getByTestId('image-fit-contain').click()

    await expect(page.getByTestId('image-fit-contain')).toHaveAttribute('aria-pressed', 'true')
    expect(await fitStyle()).toBe('contain')
    expect((await readBlock(page, id)).fit).toBe('contain')

    await waitForAutosave(page)
    await reloadCanvas(page)
    expect((await readBlock(page, id)).fit).toBe('contain')
  })

  test('an upload is one undo step', async ({ page }) => {
    test.slow()

    await addBlock(page, 'image')
    const id = await idOfType(page, 'image')
    const slot = blockById(page, id)

    await uploadInto(slot, await makePhotoFixture(page, { name: 'a.jpg', width: 800, height: 600 }))
    await expect(photoIn(slot)).toBeVisible()

    await undoOnce(page)

    await expect(photoIn(blockById(page, id))).toBeHidden()
    expect((await readBlock(page, id)).imageData).toBe('')
  })

  test('refuses a file that is not an image, and says so without losing the slot', async ({
    page,
  }) => {
    await addBlock(page, 'image')
    const id = await idOfType(page, 'image')
    const slot = blockById(page, id)

    await uploadInto(slot, notAnImage())

    const toast = page.getByTestId('design-toast')
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('price-list.txt')
    await expect(toast).toContainText(/JPG, PNG or WEBP/)

    expect((await readBlock(page, id)).imageData).toBe('')
    await expect(photoIn(slot)).toBeHidden()

    await attachPageScreenshot(page, 'image-rejected')
  })

  test('refuses an absurdly large file before trying to decode it', async ({ page }) => {
    test.slow()

    await addBlock(page, 'image')
    const id = await idOfType(page, 'image')

    await uploadInto(blockById(page, id), absurdlyLargePhoto(21))

    const toast = page.getByTestId('design-toast')
    await expect(toast).toBeVisible()
    await expect(toast).toContainText('too big')
    expect((await readBlock(page, id)).imageData).toBe('')
  })

  test('an empty slot with a description is a "source an image" instruction', async ({ page }) => {
    test.slow()

    await addBlock(page, 'image')
    const id = await idOfType(page, 'image')
    const slot = blockById(page, id)
    await inspectBlock(page, slot)

    // The panel says what an empty slot means, in words a client can act on.
    await expect(page.getByTestId('image-slot-explainer')).toContainText(/describe what should go/i)
    await expect(page.getByTestId('image-description')).toHaveAttribute(
      'placeholder',
      /golden hour/i,
    )

    await fillPanelField(page, 'image-description', DESCRIPTION)

    expect((await readBlock(page, id))).toMatchObject({
      imageData: '',
      description: DESCRIPTION,
    })
    // The instruction is legible on the page itself, not only in the panel.
    await expect(slot.getByTestId('image-slot-caption')).toHaveText(DESCRIPTION)

    await waitForAutosave(page)
    await reloadCanvas(page)
    expect((await readBlock(page, id)).description).toBe(DESCRIPTION)
  })

  test('removing a photo keeps what the client said about it', async ({ page }) => {
    test.slow()

    await addBlock(page, 'image')
    const id = await idOfType(page, 'image')
    const slot = blockById(page, id)

    await uploadInto(slot, await makePhotoFixture(page, { name: 'a.jpg', width: 900, height: 900 }))
    await expect(photoIn(slot)).toBeVisible()

    await inspectBlock(page, slot)
    await fillPanelField(page, 'image-description', DESCRIPTION)
    await page.getByTestId('image-remove').click()

    await expect(photoIn(blockById(page, id))).toBeHidden()
    expect(await readBlock(page, id)).toMatchObject({
      imageData: '',
      originalFilename: '',
      description: DESCRIPTION,
    })
  })

  test('a double-click on the slot opens the picker', async ({ page }) => {
    await addBlock(page, 'image')
    const id = await idOfType(page, 'image')

    // The picker is a native dialog, so what is observable is the file chooser
    // event the browser fires for it.
    const chooser = page.waitForEvent('filechooser')
    await blockById(page, id).dblclick()

    expect(await chooser).toBeTruthy()
  })
})
