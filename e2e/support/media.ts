import type { Locator, Page } from '@playwright/test'
import { expect } from '@playwright/test'

import { readDocument } from './canvas.ts'
import type { StoredStroke } from './canvas.ts'

/**
 * E2E vocabulary for the two batch-2 features: the pen layer and image uploads.
 *
 * Split out of `canvas.ts` to keep both files readable — this one owns everything
 * that needs real pointer paths or real image bytes.
 */

/* ------------------------------------------------------------------------- */
/* The pen layer                                                              */
/* ------------------------------------------------------------------------- */

export type PenMode = 'draw' | 'erase'

export function penLayer(page: Page): Locator {
  return page.getByTestId('pen-layer')
}

export function strokes(page: Page): Locator {
  return page.getByTestId('pen-stroke')
}

export function strokeById(page: Page, id: string): Locator {
  return page.locator(`[data-testid="pen-stroke"][data-stroke-id="${id}"]`)
}

/**
 * Pick up the pen (or the eraser) and confirm the overlay is now listening.
 *
 * Idempotent on purpose: the toolbar buttons TOGGLE, so asking for the mode you
 * are already in would put the pen down again. The tool is global state that
 * survives a page switch, and a test that draws on two pages hits exactly that.
 */
export async function usePen(page: Page, mode: PenMode): Promise<void> {
  const active = await penLayer(page).getAttribute('data-pen-mode')
  if (active !== mode) {
    await page.getByTestId(mode === 'erase' ? 'pen-eraser' : 'pen-toggle').click()
  }
  await expect(penLayer(page)).toHaveAttribute('data-pen-mode', mode)
}

export async function putPenAway(page: Page): Promise<void> {
  const active = await penLayer(page).getAttribute('data-pen-mode')
  if (active === 'draw') await page.getByTestId('pen-toggle').click()
  if (active === 'erase') await page.getByTestId('pen-eraser').click()
  await expect(penLayer(page)).toHaveAttribute('data-pen-mode', 'off')
}

interface PagePlacement {
  readonly left: number
  readonly top: number
  readonly scale: number
}

/** Where the virtual page sits on screen, and how much it is zoomed. */
async function pagePlacement(page: Page): Promise<PagePlacement> {
  const target = page.getByTestId('canvas-page')
  const box = await target.boundingBox()
  if (!box) throw new Error('The canvas page has no bounding box')

  const scale = Number(await target.getAttribute('data-page-scale'))
  return { left: box.x, top: box.y, scale: scale || 1 }
}

/** Page coordinates → screen coordinates, through the page's live placement. */
async function clientPointer(
  page: Page,
): Promise<(point: { x: number; y: number }) => { x: number; y: number }> {
  const { left, top, scale } = await pagePlacement(page)
  const viewport = page.viewportSize()

  return (point) => {
    const client = { x: left + point.x * scale, y: top + point.y * scale }

    // A mouse move outside the window lands nowhere and the test fails later, in a
    // place that says nothing about why. Say it here instead.
    if (viewport && (client.y > viewport.height || client.x > viewport.width)) {
      throw new Error(
        `Page point (${String(point.x)}, ${String(point.y)}) is off-screen at ` +
          `(${String(Math.round(client.x))}, ${String(Math.round(client.y))}) — ` +
          `the window is ${String(viewport.width)}x${String(viewport.height)}. ` +
          'Draw somewhere the canvas viewport actually shows.',
      )
    }

    return client
  }
}

/**
 * Draw a stroke through PAGE coordinates, the way a hand would: press, a run of
 * discrete moves, release. Coordinates are converted through the page's live
 * placement and zoom, so the same call means the same mark at any window size.
 */
export async function drawStroke(
  page: Page,
  points: readonly { x: number; y: number }[],
  steps = 6,
): Promise<void> {
  const [first, ...rest] = points
  if (!first) throw new Error('A stroke needs at least one point')

  const toClient = await clientPointer(page)

  const start = toClient(first)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()

  for (const point of rest) {
    const target = toClient(point)
    await page.mouse.move(target.x, target.y, { steps })
  }

  await page.mouse.up()
}

/**
 * Rub out a stroke by clicking ON it.
 *
 * Deliberately a raw mouse click at one of the stroke's own stored points rather
 * than `locator.click()`: a scribble's bounding box is mostly empty, so clicking
 * its centre (or its corner) aims at a gap between the ink and hits the overlay
 * instead. Aiming at a recorded point is what a client does with their eyes.
 */
export async function eraseStroke(page: Page, stroke: StoredStroke): Promise<void> {
  const target = stroke.points[0]
  if (!target) throw new Error('That stroke has no points to aim at')

  const toClient = await clientPointer(page)
  const client = toClient(target)
  await page.mouse.click(client.x, client.y)
}

/** A quick diagonal scribble, for tests that only care that a mark exists. */
export function scribbleAt(x: number, y: number): { x: number; y: number }[] {
  return [
    { x, y },
    { x: x + 60, y: y + 40 },
    { x: x + 120, y },
    { x: x + 180, y: y + 40 },
  ]
}

export async function readStrokes(page: Page): Promise<StoredStroke[]> {
  const document = await readDocument(page)
  return document.pages.find((entry) => entry.id === document.currentPageId)?.penStrokes ?? []
}

export async function readStrokesOfPage(page: Page, pageId: string): Promise<StoredStroke[]> {
  const document = await readDocument(page)
  return document.pages.find((entry) => entry.id === pageId)?.penStrokes ?? []
}

/* ------------------------------------------------------------------------- */
/* Image uploads                                                              */
/* ------------------------------------------------------------------------- */

export interface FilePayload {
  name: string
  mimeType: string
  buffer: Buffer
}

/**
 * Build a REAL photo, in the browser under test, and hand the bytes back to Node.
 *
 * The alternative is committing binary fixtures, which this repo deliberately does
 * not do: a canvas-drawn JPEG is generated fresh by whichever engine is running,
 * so the decode path is exercised against that engine's own encoder rather than
 * against a file that happened to please Chromium once.
 */
export async function makePhotoFixture(
  page: Page,
  options: { name: string; width: number; height: number; type?: 'image/jpeg' | 'image/png' },
): Promise<FilePayload> {
  const type = options.type ?? 'image/jpeg'

  const dataUrl = await page.evaluate(
    ({ width, height, mimeType }) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no 2d canvas in this browser')

      // A gradient plus shapes: compressible, but not a flat colour that every
      // encoder collapses to a few bytes.
      const gradient = context.createLinearGradient(0, 0, width, height)
      gradient.addColorStop(0, '#f5a623')
      gradient.addColorStop(0.5, '#2f6df6')
      gradient.addColorStop(1, '#0b1220')
      context.fillStyle = gradient
      context.fillRect(0, 0, width, height)

      context.fillStyle = 'rgba(255,255,255,0.65)'
      for (let index = 0; index < 24; index += 1) {
        context.fillRect((index * width) / 24, (index * height) / 48, width / 40, height / 3)
      }

      return canvas.toDataURL(mimeType, 0.92)
    },
    { width: options.width, height: options.height, mimeType: type },
  )

  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
  return { name: options.name, mimeType: type, buffer: Buffer.from(base64, 'base64') }
}

/** Bytes that are not an image at all, for the reject path. */
export function notAnImage(name = 'price-list.txt'): FilePayload {
  return { name, mimeType: 'text/plain', buffer: Buffer.from('Soup of the day: minestrone') }
}

/** A file that is nominally a photo but far too big to work with. */
export function absurdlyLargePhoto(megabytes: number): FilePayload {
  return {
    name: 'raw-scan.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.alloc(megabytes * 1024 * 1024, 7),
  }
}

/** Hand a file to one image slot the way the file picker does. */
export async function uploadInto(block: Locator, file: FilePayload): Promise<void> {
  await block.getByTestId('image-file-input').setInputFiles(file)
}

export function photoIn(block: Locator): Locator {
  return block.getByTestId('image-slot-photo')
}

export interface PhotoSize {
  width: number
  height: number
}

/** Decode a stored data URL in the browser and report its real pixel size. */
export async function measureStoredPhoto(page: Page, dataUrl: string): Promise<PhotoSize> {
  return page.evaluate(
    (source) =>
      new Promise<PhotoSize>((resolve, reject) => {
        const image = new Image()
        image.onload = () => {
          resolve({ width: image.naturalWidth, height: image.naturalHeight })
        }
        image.onerror = () => {
          reject(new Error('the stored image data would not decode'))
        }
        image.src = source
      }),
    dataUrl,
  )
}
