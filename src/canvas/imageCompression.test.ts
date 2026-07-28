import { describe, expect, it, vi } from 'vitest'

import { JPEG_MIME, JPEG_QUALITY, MAX_IMAGE_LONG_EDGE_PX, PNG_MIME } from './imageAssets.ts'
import { compressImage, ImageIngestError } from './imageCompression.ts'
import type { EncodeRequest, ImagePorts, UploadFile } from './imageCompression.ts'

/**
 * The browser's decode/encode is a PORT, so the whole ingest algorithm is testable
 * here: what gets asked of the canvas, in what order, and what happens when it says
 * no. The real `<img>`/`<canvas>` adapter is exercised in `e2e/image-upload.spec.ts`
 * against browser-generated photos.
 */

const ONE_MB = 1024 * 1024

/**
 * A structural stand-in for a `File`: the ingest algorithm only ever reads its
 * name, type and size and hands the blob straight to the decode port, so a real
 * multi-megabyte blob would buy nothing but a slow test.
 */
function uploadFile(overrides: Partial<{ name: string; type: string; size: number }> = {}): UploadFile {
  const facts = { name: 'photo.jpg', type: 'image/jpeg', size: 3 * ONE_MB, ...overrides }
  return { ...new Blob([]), ...facts }
}

interface FakePorts extends ImagePorts {
  readonly requests: EncodeRequest[]
  readonly released: unknown[]
}

function fakePorts(
  options: { width?: number; height?: number; sizeByType?: Record<string, number> } = {},
): FakePorts {
  const { width = 3000, height = 2000, sizeByType = {} } = options
  const requests: EncodeRequest[] = []
  const released: unknown[] = []

  return {
    requests,
    released,
    decode: () => Promise.resolve({ width, height, source: 'decoded' }),
    encode: (request) => {
      requests.push(request)
      const length = sizeByType[request.mimeType] ?? 100
      return Promise.resolve(`data:${request.mimeType};base64,${'A'.repeat(length)}`)
    },
    release: (image) => {
      released.push(image.source)
    },
  }
}

describe('compressImage', () => {
  it('refuses a file that fails validation, before any decoding happens', async () => {
    const ports = fakePorts()
    const decode = vi.spyOn(ports, 'decode')

    await expect(compressImage(uploadFile({ type: 'application/pdf' }), ports)).rejects.toThrow(
      ImageIngestError,
    )
    expect(decode).not.toHaveBeenCalled()
  })

  it('downscales the long edge to the budget', async () => {
    const result = await compressImage(uploadFile(), fakePorts({ width: 4000, height: 3000 }))

    expect(result.width).toBe(MAX_IMAGE_LONG_EDGE_PX)
    expect(result.height).toBe(1200)
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(MAX_IMAGE_LONG_EDGE_PX)
  })

  it('leaves an already-small image at its own size', async () => {
    const result = await compressImage(uploadFile(), fakePorts({ width: 800, height: 600 }))

    expect(result).toMatchObject({ width: 800, height: 600 })
  })

  it('re-encodes a JPEG as a JPEG, at the chosen quality, onto white', async () => {
    const ports = fakePorts()

    const result = await compressImage(uploadFile(), ports)

    expect(result.mimeType).toBe(JPEG_MIME)
    expect(ports.requests).toHaveLength(1)
    expect(ports.requests[0]).toMatchObject({ mimeType: JPEG_MIME, quality: JPEG_QUALITY })
    // JPEG has no transparency: a background is painted first so a transparent
    // source never comes out on black.
    expect(ports.requests[0]?.background).not.toBeNull()
  })

  it('keeps a PNG source as PNG when the PNG comes out smaller', async () => {
    const ports = fakePorts({ sizeByType: { [PNG_MIME]: 50, [JPEG_MIME]: 400 } })

    const result = await compressImage(uploadFile({ name: 'logo.png', type: PNG_MIME }), ports)

    expect(result.mimeType).toBe(PNG_MIME)
    expect(result.dataUrl.startsWith(`data:${PNG_MIME}`)).toBe(true)
    expect(ports.requests.map((request) => request.mimeType)).toEqual([JPEG_MIME, PNG_MIME])
  })

  it('converts a PNG photo to JPEG when that is the smaller of the two', async () => {
    const ports = fakePorts({ sizeByType: { [PNG_MIME]: 900, [JPEG_MIME]: 120 } })

    const result = await compressImage(uploadFile({ name: 'snap.png', type: PNG_MIME }), ports)

    expect(result.mimeType).toBe(JPEG_MIME)
  })

  it('encodes a PNG without a background, so transparency survives', async () => {
    const ports = fakePorts({ sizeByType: { [PNG_MIME]: 10, [JPEG_MIME]: 900 } })

    await compressImage(uploadFile({ name: 'logo.png', type: PNG_MIME }), ports)

    expect(ports.requests.find((request) => request.mimeType === PNG_MIME)?.background).toBeNull()
  })

  it('never re-encodes a WEBP twice — one JPEG pass and done', async () => {
    const ports = fakePorts()

    await compressImage(uploadFile({ name: 'hero.webp', type: 'image/webp' }), ports)

    expect(ports.requests).toHaveLength(1)
  })

  it('reports the size of what it produced and of what it was given', async () => {
    const ports = fakePorts({ sizeByType: { [JPEG_MIME]: 400 } })

    const result = await compressImage(uploadFile({ size: 5 * ONE_MB }), ports)

    expect(result.bytes).toBe(300)
    expect(result.source).toEqual({ width: 3000, height: 2000, bytes: 5 * ONE_MB })
  })

  it('carries the original filename out verbatim — nothing else can recover it', async () => {
    const result = await compressImage(uploadFile({ name: 'golden hour patio.jpg' }), fakePorts())

    expect(result.originalFilename).toBe('golden hour patio.jpg')
  })

  it('does not tidy up an awkward filename — it is metadata, not a path', async () => {
    const awkward = '  Café “front” (2024)_v2 FINAL.jpg  '

    const result = await compressImage(uploadFile({ name: awkward }), fakePorts())

    expect(result.originalFilename).toBe(awkward)
  })

  it('turns a decode failure into something a client can read', async () => {
    const ports: ImagePorts = {
      ...fakePorts(),
      decode: () => Promise.reject(new Error('SyntaxError: bad JPEG marker')),
    }

    await expect(compressImage(uploadFile({ name: 'broken.jpg' }), ports)).rejects.toThrow(
      /couldn't open "broken.jpg"/,
    )
  })

  it('treats an image that decoded to nothing as a broken file', async () => {
    await expect(compressImage(uploadFile(), fakePorts({ width: 0, height: 0 }))).rejects.toThrow(
      ImageIngestError,
    )
  })

  it('frees the decoded image even when encoding blows up', async () => {
    const ports = fakePorts()
    const failing: FakePorts = {
      ...ports,
      encode: () => Promise.reject(new Error('canvas is tainted')),
    }

    await expect(compressImage(uploadFile(), failing)).rejects.toThrow('canvas is tainted')
    expect(failing.released).toEqual(['decoded'])
  })

  it('frees the decoded image on the happy path too', async () => {
    const ports = fakePorts()

    await compressImage(uploadFile(), ports)

    expect(ports.released).toEqual(['decoded'])
  })
})
