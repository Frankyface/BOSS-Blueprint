import type { ImageFit, Size } from './types.ts'

/**
 * IMAGE INGEST RULES — what we accept, how big it may be, and what it becomes.
 *
 * Pure and DOM-free on purpose: this is the boundary a client's file crosses, and
 * a boundary you cannot unit-test is a boundary you do not have. The actual
 * decode/encode work is `imageCompression.ts` (orchestration, also pure — it takes
 * ports) and `src/platform/browserImagePorts.ts` (the browser adapter).
 */

/** The three raster formats the export contract names (§4.6 MIME → extension). */
export const ACCEPTED_IMAGE_TYPES: readonly string[] = ['image/jpeg', 'image/png', 'image/webp']

/** What the file picker offers. Extensions too — some systems report no MIME type. */
export const IMAGE_ACCEPT_ATTRIBUTE = 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp'

const BYTES_PER_MB = 1024 * 1024

/**
 * Anything past this is a mistake, not a photo: a modern phone snap is 2–8MB, and
 * we still have to decode it in the client's tab before it can be compressed.
 */
export const MAX_UPLOAD_BYTES = 20 * BYTES_PER_MB

/** Compression target: the long edge of the stored image, per the feature spec. */
export const MAX_IMAGE_LONG_EDGE_PX = 1600

/** JPEG re-encode quality — the usual "can't see the difference at 100%" setting. */
export const JPEG_QUALITY = 0.8

export const JPEG_MIME = 'image/jpeg'
export const PNG_MIME = 'image/png'

export const DEFAULT_IMAGE_FIT: ImageFit = 'cover'

export const IMAGE_FITS: readonly ImageFit[] = ['cover', 'contain']

/** Only these three types, base64 only — an imported `.blueprint` is untrusted input. */
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/

export type ImageFileCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string }

export interface ImageFileFacts {
  readonly name: string
  readonly type: string
  readonly size: number
}

function describeMegabytes(bytes: number): string {
  return `${(bytes / BYTES_PER_MB).toFixed(1)}MB`
}

/**
 * Is this something we can put in a slot?
 *
 * The messages are written for a client, not a developer: they name the file, say
 * what went wrong in plain words, and say what to do instead.
 */
export function validateImageFile(file: ImageFileFacts): ImageFileCheck {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
    return {
      ok: false,
      message: `"${file.name}" isn't an image we can use. Please pick a JPG, PNG or WEBP photo.`,
    }
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      message:
        `"${file.name}" is ${describeMegabytes(file.size)}, which is too big to work with ` +
        `(the limit is ${describeMegabytes(MAX_UPLOAD_BYTES)}). Try a smaller version of it.`,
    }
  }

  if (file.size <= 0) {
    return { ok: false, message: `"${file.name}" is empty — there's no picture in that file.` }
  }

  return { ok: true }
}

/**
 * Downscale so the LONG edge fits `maxLongEdge`, keeping the aspect ratio and
 * never enlarging: a 900px logo stays 900px rather than being blown up to 1600.
 * Rounded to whole pixels, and never to zero.
 */
export function scaledSize(width: number, height: number, maxLongEdge: number): Size {
  const longEdge = Math.max(width, height)
  if (longEdge <= 0) return { width: 0, height: 0 }
  if (longEdge <= maxLongEdge) return { width: Math.round(width), height: Math.round(height) }

  const ratio = maxLongEdge / longEdge
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  }
}

/** Roughly how many bytes a base64 data URL's payload decodes to. */
export function dataUrlByteSize(dataUrl: string): number {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) return 0

  const payload = dataUrl.slice(commaIndex + 1)
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding)
}

/**
 * Guard for stored image data. Deliberately strict: an imported `.blueprint` file
 * comes from outside, and a `data:text/html` or `data:image/svg+xml` URL rendered
 * into an `<img>` is an injection vector. Raster MIME types only, base64 only.
 */
export function isImageDataUrl(value: unknown): value is string {
  return typeof value === 'string' && IMAGE_DATA_URL.test(value)
}

export function isImageFit(value: unknown): value is ImageFit {
  return value === 'cover' || value === 'contain'
}
