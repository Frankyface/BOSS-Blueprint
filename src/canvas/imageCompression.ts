import {
  dataUrlByteSize,
  JPEG_MIME,
  JPEG_QUALITY,
  MAX_IMAGE_LONG_EDGE_PX,
  PNG_MIME,
  scaledSize,
  validateImageFile,
} from './imageAssets.ts'
import type { ImageFileFacts } from './imageAssets.ts'
import type { Size } from './types.ts'

/**
 * CLIENT-SIDE COMPRESSION, as an algorithm rather than as browser code.
 *
 * A 12MP phone photo is ~6MB. Stored raw it would blow the ~5MB localStorage
 * budget on its own and make the Stage 3 package unemailable, so every upload is
 * decoded, downscaled to a 1600px long edge and re-encoded before it ever reaches
 * the document.
 *
 * The DECISIONS live here and the BROWSER APIs live behind `ImagePorts`
 * (`src/platform/browserImagePorts.ts` implements them with `<img>` + `<canvas>`).
 * That split is what makes "did we really downscale it?", "did we keep the PNG?"
 * and "what happens when a file will not decode?" answerable in jsdom, where
 * neither of those APIs exists. The real decode path is covered end-to-end in
 * `e2e/image-upload.spec.ts` against browser-generated fixture photos.
 */

export interface DecodedImage {
  readonly width: number
  readonly height: number
  /** Opaque handle the encoder understands (an `ImageBitmap`, an `HTMLImageElement`…). */
  readonly source: unknown
}

export interface EncodeRequest {
  readonly image: DecodedImage
  readonly size: Size
  readonly mimeType: string
  readonly quality: number
  /** JPEG cannot store transparency, so it is painted onto white first. */
  readonly background: string | null
}

export interface ImagePorts {
  readonly decode: (file: Blob) => Promise<DecodedImage>
  readonly encode: (request: EncodeRequest) => Promise<string>
  /** Frees whatever `decode` allocated. */
  readonly release: (image: DecodedImage) => void
}

export interface CompressedImage {
  readonly dataUrl: string
  readonly width: number
  readonly height: number
  readonly mimeType: string
  readonly bytes: number
  /**
   * The client's own file name, verbatim. Carried out of ingest because this is
   * the LAST place it exists: the compressed data URL has no memory of it, and
   * the export manifest requires it (§2.3/§4.6).
   */
  readonly originalFilename: string
  /** What the client handed us, for the "we shrank it" evidence in tests and logs. */
  readonly source: { readonly width: number; readonly height: number; readonly bytes: number }
}

/** White, so a transparent PNG re-encoded as JPEG does not come out on black. */
const JPEG_BACKGROUND = '#ffffff'

export class ImageIngestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageIngestError'
  }
}

function friendlyDecodeFailure(name: string): string {
  return `We couldn't open "${name}". The file may be damaged — try another photo.`
}

export type UploadFile = Blob & ImageFileFacts

/**
 * Validate → decode → downscale → re-encode.
 *
 * PNG sources are encoded BOTH ways and the smaller wins: screenshots, logos and
 * flat graphics compress far better as PNG than as JPEG, while a photo someone
 * saved as PNG is often ten times bigger than it needs to be.
 *
 * EVERYTHING ELSE COMES OUT AS JPEG — including WEBP, which is re-encoded rather
 * than kept. That is deliberate: WEBP *encoding* is the newest of the three in
 * Safari, and a silently failed or unsupported encode would be far worse than a
 * marginally larger JPEG. The cost is that a WEBP upload loses WEBP's size
 * advantage; the benefit is one output path that every engine has had for years.
 */
export async function compressImage(file: UploadFile, ports: ImagePorts): Promise<CompressedImage> {
  const check = validateImageFile(file)
  if (!check.ok) throw new ImageIngestError(check.message)

  let decoded: DecodedImage
  try {
    decoded = await ports.decode(file)
  } catch {
    throw new ImageIngestError(friendlyDecodeFailure(file.name))
  }

  try {
    if (decoded.width <= 0 || decoded.height <= 0) {
      throw new ImageIngestError(friendlyDecodeFailure(file.name))
    }

    const size = scaledSize(decoded.width, decoded.height, MAX_IMAGE_LONG_EDGE_PX)

    const jpeg = await ports.encode({
      image: decoded,
      size,
      mimeType: JPEG_MIME,
      quality: JPEG_QUALITY,
      background: JPEG_BACKGROUND,
    })

    let dataUrl = jpeg
    let mimeType: string = JPEG_MIME

    if (file.type === PNG_MIME) {
      const png = await ports.encode({
        image: decoded,
        size,
        mimeType: PNG_MIME,
        quality: 1,
        background: null,
      })

      if (png.length < jpeg.length) {
        dataUrl = png
        mimeType = PNG_MIME
      }
    }

    if (dataUrl.length === 0) throw new ImageIngestError(friendlyDecodeFailure(file.name))

    return {
      dataUrl,
      width: size.width,
      height: size.height,
      mimeType,
      bytes: dataUrlByteSize(dataUrl),
      originalFilename: file.name,
      source: { width: decoded.width, height: decoded.height, bytes: file.size },
    }
  } finally {
    ports.release(decoded)
  }
}
