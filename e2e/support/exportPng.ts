import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

import type { StoredBlock, StoredPage, StoredStroke } from './canvas.ts'

/**
 * E2E vocabulary for the page PNG renderer.
 *
 * The renderer is reached through `window.__blueprintRenderPagePng`, the seam
 * `src/export/png/pngTestBridge.ts` installs in `--mode test` builds only — the
 * submit flow that will eventually call it is a later Stage 3 feature, and this
 * suite is not allowed to wait for it. What comes back is the PNG the packager
 * would zip, base64-encoded, so every assertion below is about the artifact's
 * own bytes rather than about a screenshot of the editor.
 *
 * Shapes and formulas are RESTATED here rather than imported: the E2E project
 * compiles under `tsconfig.e2e.json`, whose `include` is `e2e/**` only. That is
 * deliberate — an independent restatement of §4.2's height cannot be broken by
 * the same mistake as the implementation.
 */

/* ------------------------------------------------------------------------- */
/* The render seam                                                            */
/* ------------------------------------------------------------------------- */

export interface RenderSuccess {
  ok: true
  width: number
  height: number
  engine: 'snapdom' | 'html-to-image'
  attempts: number
  inkRatio: number
  hasStrokes: boolean
  bytes: number
  base64: string
  elapsedMs: number
}

export interface RenderFailure {
  ok: false
  finding: string
  failure: string
  clientMessage: string
  message: string
}

export type RenderOutcome = RenderSuccess | RenderFailure

interface RenderHost {
  __blueprintRenderPagePng?: (pageId: string) => Promise<RenderOutcome>
  __blueprintStore?: {
    getState: () => {
      currentPageId: string
      pages: StoredPage[]
      replaceDocument: (document: { siteSettings: unknown; pages: StoredPage[] }) => void
    }
  }
}

/** The renderer seam takes a beat to appear; three engines in parallel take longer. */
const SEAM_TIMEOUT_MS = 15_000

export async function waitForRenderBridge(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => typeof (globalThis as RenderHost).__blueprintRenderPagePng), {
      timeout: SEAM_TIMEOUT_MS,
    })
    .toBe('function')
}

export async function renderPagePng(page: Page, pageId: string): Promise<RenderOutcome> {
  return page.evaluate(async (id) => {
    const render = (globalThis as RenderHost).__blueprintRenderPagePng
    if (!render) throw new Error('The PNG render seam is missing from this build')
    return render(id)
  }, pageId)
}

/** Renders and fails the test with the engine's own words if the ladder gave up. */
export async function renderOrFail(page: Page, pageId: string): Promise<RenderSuccess> {
  const outcome = await renderPagePng(page, pageId)
  if (!outcome.ok) throw new Error(`Render of "${pageId}" failed: ${outcome.message}`)
  return outcome
}

export async function seedDesign(page: Page, pages: StoredPage[]): Promise<void> {
  await page.evaluate((seeded) => {
    const store = (globalThis as RenderHost).__blueprintStore
    if (!store) throw new Error('The store test bridge is missing from this build')

    store.getState().replaceDocument({
      siteSettings: {
        businessName: 'Bluebird Bakery',
        tagline: 'Bread worth the walk',
        about: '',
        vibe: 'warm',
        styleNotes: '',
        colors: [],
      },
      pages: seeded,
    })
  }, pages)
}

/* ------------------------------------------------------------------------- */
/* Independent restatements of the binding formulas                           */
/* ------------------------------------------------------------------------- */

export const PAGE_WIDTH = 1200

const GRID = 8
const MIN_PAGE_HEIGHT = 1600
const MAX_PAGE_HEIGHT = 8000
const BOTTOM_PADDING = 160

/** `docs/export-format.md` §4.2, restated from the spec rather than imported. */
export function expectedPageHeight(page: StoredPage): number {
  const blockBottom = page.blocks.reduce((low, block) => Math.max(low, block.y + block.height), 0)
  const strokeBottom = page.penStrokes.reduce(
    (low, stroke) => stroke.points.reduce((inner, point) => Math.max(inner, point.y), low),
    0,
  )

  const desired = Math.ceil((Math.max(blockBottom, strokeBottom) + BOTTOM_PADDING) / GRID) * GRID
  return Math.min(MAX_PAGE_HEIGHT, Math.max(MIN_PAGE_HEIGHT, desired))
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** The PNG's own IHDR bytes, parsed in Node — the read that owes nothing to a browser. */
export function readIhdr(bytes: Buffer): { width: number; height: number } {
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('not a PNG')
  if (bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('first chunk is not IHDR')

  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

export function pngBuffer(result: RenderSuccess): Buffer {
  return Buffer.from(result.base64, 'base64')
}

/* ------------------------------------------------------------------------- */
/* Pixel sampling of the produced artifact                                    */
/* ------------------------------------------------------------------------- */

export interface SampledPixel {
  r: number
  g: number
  b: number
  a: number
}

/**
 * Draw the EXPORTED PNG into a canvas in the browser and read single pixels back.
 *
 * The point of sampling the artifact rather than the live DOM is that this is the
 * file the builder will open: if the clip rule broke, these coordinates are where
 * it shows.
 */
export async function samplePixels(
  page: Page,
  base64: string,
  points: readonly { x: number; y: number }[],
): Promise<SampledPixel[]> {
  return page.evaluate(
    ({ data, coordinates }) =>
      new Promise<SampledPixel[]>((resolve, reject) => {
        const image = new Image()
        image.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = image.naturalWidth
          canvas.height = image.naturalHeight
          const context = canvas.getContext('2d', { willReadFrequently: true })
          if (!context) {
            reject(new Error('no 2d canvas'))
            return
          }
          context.drawImage(image, 0, 0)

          resolve(
            coordinates.map((point) => {
              const pixel = context.getImageData(point.x, point.y, 1, 1).data
              return { r: pixel[0] ?? 0, g: pixel[1] ?? 0, b: pixel[2] ?? 0, a: pixel[3] ?? 0 }
            }),
          )
        }
        image.onerror = () => {
          reject(new Error('the exported PNG did not decode'))
        }
        image.src = `data:image/png;base64,${data}`
      }),
    { data: base64, coordinates: [...points] },
  )
}

/** Perceived lightness, 0 (black) to 255 (white). */
export function luma(pixel: SampledPixel): number {
  return 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b
}

/* ------------------------------------------------------------------------- */
/* The committed fixture design                                               */
/* ------------------------------------------------------------------------- */

/**
 * A flat-colour "photo", drawn in the browser under test and handed back as a
 * `data:` URI — the same shape Stage 2's ingest stores (§4.3's same-origin
 * constraint, satisfied with no conversion step). Flat rectangles rather than a
 * gradient so the bytes are stable enough for a visual baseline.
 */
export async function makePhotoDataUrl(page: Page, width = 320, height = 240): Promise<string> {
  return page.evaluate(
    ({ w, h }) => {
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const context = canvas.getContext('2d')
      if (!context) throw new Error('no 2d canvas in this browser')

      const bands = ['#0b1220', '#2f6df6', '#f4b23e', '#ffffff']
      bands.forEach((colour, index) => {
        context.fillStyle = colour
        context.fillRect(0, (index * h) / bands.length, w, h / bands.length)
      })

      return canvas.toDataURL('image/png')
    },
    { w: width, h: height },
  )
}

function block(overrides: Partial<StoredBlock> & Pick<StoredBlock, 'id' | 'type'>): StoredBlock {
  return {
    x: 0,
    y: 0,
    width: 400,
    height: 120,
    text: '',
    ...overrides,
  }
}

function stroke(id: string, points: { x: number; y: number }[], colour = '#c0392b'): StoredStroke {
  return { id, points, color: colour, width: 6 }
}

/**
 * A point the annotation stroke definitely paints, and clear paper below it.
 *
 * The stroke is deliberately a STRAIGHT horizontal run: perfect-freehand applies
 * streamline and smoothing, so a scribble's rendered outline does not pass
 * through its own recorded points and a pixel probe aimed at one would miss the
 * ink it is looking for. On a straight line the smoothed path is the line.
 */
export const PEN_PROBE = { x: 300, onStrokeY: 760, clearY: 900 } as const

/** Where the clip fixture's overflowing nav bar sits — sampled by the clip spec. */
export const OVERFLOW_BLOCK = { x: 1000, y: 400, width: 400, height: 80 } as const

/** A y inside the overflowing block, and two x's the clip rule is asserted at. */
export const CLIP_PROBE = {
  y: OVERFLOW_BLOCK.y + OVERFLOW_BLOCK.height / 2,
  insideX: 1150,
  lastColumnX: PAGE_WIDTH - 1,
} as const

/**
 * FOUR PAGES, chosen to exercise every branch the render contract has:
 * structured blocks, an empty image slot's dashed placeholder, a filled slot's
 * uploaded photo, pen strokes, and a block hanging past the right page edge —
 * plus a control page identical to the last one minus that block.
 */
export function exportFixturePages(photoDataUrl: string): StoredPage[] {
  return [
    {
      id: 'page-home',
      name: 'Home',
      blocks: [
        block({ id: 'block-band', type: 'section', x: 0, y: 0, width: 1200, height: 320, text: 'Hero' }),
        block({
          id: 'block-nav',
          type: 'nav-bar',
          x: 0,
          y: 0,
          width: 1200,
          height: 64,
          text: 'Home, Menu, Contact',
        }),
        block({
          id: 'block-heading',
          type: 'heading',
          x: 80,
          y: 120,
          width: 640,
          height: 72,
          text: 'Bread worth the walk',
          copyMode: 'real',
        }),
        block({
          id: 'block-copy',
          type: 'text',
          x: 80,
          y: 360,
          width: 520,
          height: 160,
          text: 'Sourdough, rye and a very good cinnamon bun.\nOpen from six, most days.',
          copyMode: 'real',
        }),
        block({
          id: 'block-slot-empty',
          type: 'image',
          x: 680,
          y: 360,
          width: 440,
          height: 300,
          text: '',
          description: 'The shopfront at first light',
        }),
        block({
          id: 'block-cta',
          type: 'button',
          x: 80,
          y: 560,
          width: 240,
          height: 64,
          text: 'See the menu',
          link: { kind: 'none' },
        }),
      ],
      penStrokes: [
        stroke('stroke-annotation', [
          { x: 120, y: PEN_PROBE.onStrokeY },
          { x: 200, y: PEN_PROBE.onStrokeY },
          { x: 280, y: PEN_PROBE.onStrokeY },
          { x: 360, y: PEN_PROBE.onStrokeY },
          { x: 440, y: PEN_PROBE.onStrokeY },
        ]),
        stroke(
          'stroke-slot',
          [
            { x: 760, y: 440 },
            { x: 900, y: 520 },
            { x: 1040, y: 440 },
          ],
          '#16202f',
        ),
      ],
    },
    {
      id: 'page-gallery',
      name: 'Gallery',
      blocks: [
        block({
          id: 'block-gallery-heading',
          type: 'heading',
          x: 80,
          y: 80,
          width: 640,
          height: 72,
          text: 'What comes out of the oven',
          copyMode: 'real',
        }),
        block({
          id: 'block-photo',
          type: 'image',
          x: 80,
          y: 200,
          width: 480,
          height: 360,
          text: '',
          imageData: photoDataUrl,
          originalFilename: 'counter.png',
          fit: 'cover',
          description: 'The counter at opening time',
        }),
      ],
      penStrokes: [],
    },
    {
      id: 'page-clip',
      name: 'Clip',
      blocks: [
        block({
          id: 'block-clip-heading',
          type: 'heading',
          x: 80,
          y: 80,
          width: 640,
          height: 72,
          text: 'This one runs off the edge',
          copyMode: 'real',
        }),
        // Dragged past the right edge: `clampPosition` only keeps a 24px sliver
        // on the page, so this is reachable by hand. A nav bar because its fill
        // is nearly black — a pixel sample can tell it from paper without doubt.
        block({
          id: 'block-overflow',
          type: 'nav-bar',
          ...OVERFLOW_BLOCK,
          text: 'Home, Menu, Contact, Hours, Directions',
        }),
      ],
      penStrokes: [],
    },
    {
      id: 'page-clip-control',
      name: 'Clip control',
      blocks: [
        block({
          id: 'block-control-heading',
          type: 'heading',
          x: 80,
          y: 80,
          width: 640,
          height: 72,
          text: 'This one runs off the edge',
          copyMode: 'real',
        }),
      ],
      penStrokes: [],
    },
  ]
}
