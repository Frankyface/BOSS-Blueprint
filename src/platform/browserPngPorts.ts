import { snapdom } from '@zumer/snapdom'
import { toBlob as htmlToImageBlob } from 'html-to-image'

import { INK_SAMPLE_DIVISOR, PAGE_BACKGROUND, PNG_MIME } from '../export/png/constants.ts'
import { readPngHeader } from '../export/png/pngHeader.ts'
import { assessInk } from '../export/png/sanity.ts'
import type { InspectedPng, PngDimensions, PngEngineId } from '../export/png/types.ts'

/**
 * The browser half of the PNG export: the two capture libraries, the decode, and
 * the pixel sampling. Everything that DECIDES anything lives in
 * `src/export/png/` (the ladder, the sanity gate, the IHDR parser); this file is
 * the adapter those are handed, in the same shape as
 * `browserImagePorts.ts` — and for the same reason: jsdom implements none of
 * `<canvas>.getContext('2d')`, `URL.createObjectURL` or image decoding, so this
 * module is deliberately thin and is proven by `e2e/export-png.spec.ts` across
 * all three engines instead.
 *
 * BOTH ENGINES ARE MIT AND BOTH ARE HARD DEPENDENCIES (§4.3): the fallback is
 * not an optional extra, it is the mitigation debate #1 attached to this feature.
 */

/** Two frames: one to commit the layout, one to let it paint. */
const SETTLE_FRAMES = 2

/**
 * Awaits webfont readiness and a painted frame before a capture.
 *
 * `document.fonts` is absent in jsdom and in a few older engines; a missing font
 * API is not a reason to fail, it is a reason to skip the wait.
 */
export async function settleForCapture(): Promise<void> {
  try {
    await document.fonts.ready
  } catch {
    // A font API that throws is still not a render failure — carry on and paint.
  }

  for (let frame = 0; frame < SETTLE_FRAMES; frame += 1) {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve()
      })
    })
  }
}

/**
 * snapdom, the primary. `scale: 1` and `dpr: 1` together are §4.3's "no
 * devicePixelRatio multiplication" — without `dpr` it would silently render 2×
 * on a retina screen and every dimension check would fail. `cache: 'disabled'`
 * keeps the retry rung honest: a cached style map would make attempt two a
 * replay of attempt one rather than a fresh render.
 */
async function captureWithSnapdom(node: HTMLElement, expected: PngDimensions): Promise<Blob> {
  return snapdom.toBlob(node, {
    type: 'png',
    format: 'png',
    scale: 1,
    dpr: 1,
    width: expected.width,
    height: expected.height,
    backgroundColor: PAGE_BACKGROUND,
    // Every font in the constrained style vocabulary is a system font, so there
    // is nothing to inline and no reason to let the library go looking.
    embedFonts: false,
    cache: 'disabled',
  })
}

/** html-to-image, the API-comparable fallback. `pixelRatio: 1` is the same 1× rule. */
async function captureWithHtmlToImage(node: HTMLElement, expected: PngDimensions): Promise<Blob> {
  const blob = await htmlToImageBlob(node, {
    pixelRatio: 1,
    width: expected.width,
    height: expected.height,
    backgroundColor: PAGE_BACKGROUND,
    cacheBust: false,
    // No `@font-face` rules exist in this app; skipping the scan avoids a
    // stylesheet fetch that can only ever return nothing.
    skipFonts: true,
  })

  if (!blob) throw new Error('html-to-image returned no blob.')
  return blob
}

export async function captureWithEngine(
  engine: PngEngineId,
  node: HTMLElement,
  expected: PngDimensions,
): Promise<Blob> {
  const blob = engine === 'snapdom' ? await captureWithSnapdom(node, expected) : await captureWithHtmlToImage(node, expected)

  if (blob.type !== '' && blob.type !== PNG_MIME) {
    throw new Error(`${engine} produced a ${blob.type} blob, not ${PNG_MIME}.`)
  }

  return blob
}

/**
 * `<img>` + object URL rather than `createImageBitmap`, matching
 * `browserImagePorts.ts`: both work in current engines, but this pair is the one
 * every desktop engine — WebKit included — has supported for a decade, and a
 * Safari-only decode failure here would BLOCK a submission.
 */
function decodeBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()

    image.onload = () => {
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('The rendered page PNG did not decode.'))
    }

    image.src = url
  })
}

/**
 * Samples the decoded image downscaled by `INK_SAMPLE_DIVISOR`.
 *
 * The downscale is a SMOOTHED (box-filtered) one, not a nearest-neighbour point
 * sample: a 2px-wide glyph stem or a fine pen stroke can hide between the
 * columns of a point sample, and the whole job of this measurement is to notice
 * ink. Averaging turns that stem into a grey pixel, which still reads as ink and
 * can never read as white.
 */
function sampleImage(image: HTMLImageElement): Uint8ClampedArray {
  const width = Math.max(1, Math.ceil(image.naturalWidth / INK_SAMPLE_DIVISOR))
  const height = Math.max(1, Math.ceil(image.naturalHeight / INK_SAMPLE_DIVISOR))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('This browser cannot sample the export (no 2D canvas).')

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(image, 0, 0, width, height)

  return context.getImageData(0, 0, width, height).data
}

/** Decode + IHDR + pixels: the three independent reads V6 asks for. */
export async function inspectPngBlob(blob: Blob): Promise<InspectedPng> {
  const header = readPngHeader(new Uint8Array(await blob.arrayBuffer()))
  const image = await decodeBlob(blob)

  try {
    return {
      decoded: { width: image.naturalWidth, height: image.naturalHeight },
      header,
      ink: assessInk(sampleImage(image)),
    }
  } finally {
    URL.revokeObjectURL(image.src)
  }
}
