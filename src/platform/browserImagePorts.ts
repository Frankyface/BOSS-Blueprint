import type { DecodedImage, EncodeRequest, ImagePorts } from '../canvas/imageCompression.ts'

/**
 * The browser half of image ingest: `<img>` to decode, `<canvas>` to resize and
 * re-encode. Everything that decides anything lives in
 * `src/canvas/imageCompression.ts`; this file is the adapter it is handed.
 *
 * `HTMLImageElement` + `URL.createObjectURL` rather than `createImageBitmap`:
 * both would work in current Chromium and Firefox, but the img/canvas pair is the
 * path every engine — WebKit included — has supported for a decade, and this code
 * runs once per upload on a file the client is already waiting for. No cleverness
 * worth a Safari-only failure.
 *
 * There is no jsdom implementation of either API, so this module is deliberately
 * thin and is proven by `e2e/image-upload.spec.ts` across all three engines
 * instead. See the coverage note in `vite.config.ts`.
 */

function decodeWithImageElement(file: Blob): Promise<DecodedImage> {
  return new Promise<DecodedImage>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()

    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight, source: image })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('The browser could not decode that image file.'))
    }

    image.src = url
  })
}

function drawToCanvas(request: EncodeRequest): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = request.size.width
  canvas.height = request.size.height

  const context = canvas.getContext('2d')
  if (!context) throw new Error('This browser cannot resize images (no 2D canvas).')

  if (request.background !== null) {
    context.fillStyle = request.background
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  // Best-quality downscale where the engine offers a choice; harmless where it doesn't.
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(request.image.source as CanvasImageSource, 0, 0, canvas.width, canvas.height)

  return canvas
}

export const browserImagePorts: ImagePorts = {
  decode: decodeWithImageElement,

  encode: (request) => Promise.resolve(drawToCanvas(request).toDataURL(request.mimeType, request.quality)),

  release: (image) => {
    // The object URL is the only thing to free; the element itself is garbage.
    if (image.source instanceof HTMLImageElement) URL.revokeObjectURL(image.source.src)
  },
}
