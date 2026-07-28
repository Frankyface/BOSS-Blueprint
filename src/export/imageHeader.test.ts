import { describe, expect, it } from 'vitest'

import {
  syntheticJpegDataUrl,
  syntheticPngDataUrl,
  syntheticWebpDataUrl,
} from '../test/exportFixtures.ts'

import { MIME_EXTENSIONS, decodeBase64, imageFacts, imageSize, parseImageDataUrl } from './imageHeader.ts'

/** `docs/export-format.md` §4.6 — the manifest numbers come from these bytes. */

describe('base64 decoding', () => {
  it('round-trips every padding case', () => {
    for (const text of ['a', 'ab', 'abc', 'abcd', 'hello world']) {
      const encoded = Buffer.from(text, 'utf8').toString('base64')
      expect(Buffer.from(decodeBase64(encoded)).toString('utf8')).toBe(text)
    }
  })

  it('decodes to the exact byte length the manifest reports', () => {
    const bytes = Buffer.alloc(214_733)
    expect(decodeBase64(bytes.toString('base64')).length).toBe(214_733)
  })
})

describe('data URL parsing', () => {
  it('accepts the three contract MIME types only', () => {
    expect(parseImageDataUrl(syntheticPngDataUrl(2, 2))?.mimeType).toBe('image/png')
    expect(parseImageDataUrl(syntheticJpegDataUrl(2, 2, 32))?.mimeType).toBe('image/jpeg')
    expect(parseImageDataUrl(syntheticWebpDataUrl(2, 2))?.mimeType).toBe('image/webp')
    expect(parseImageDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBeNull()
    expect(parseImageDataUrl('data:text/html;base64,PGI+')).toBeNull()
    expect(parseImageDataUrl('not a data url')).toBeNull()
  })
})

describe('§4.6 MIME → extension', () => {
  it('is the one mapping asset.path is built from', () => {
    expect(MIME_EXTENSIONS).toEqual({
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    })
  })
})

describe('header-parsed dimensions', () => {
  it('reads PNG IHDR', () => {
    expect(imageFacts(syntheticPngDataUrl(1600, 900))).toMatchObject({ width: 1600, height: 900 })
  })

  it('reads the first JPEG start-of-frame marker', () => {
    expect(imageFacts(syntheticJpegDataUrl(1600, 1200, 4096))).toMatchObject({
      width: 1600,
      height: 1200,
      bytes: 4096,
    })
  })

  it('reads a lossy WebP VP8 chunk', () => {
    expect(imageFacts(syntheticWebpDataUrl(640, 480))).toMatchObject({ width: 640, height: 480 })
  })

  it('reads a lossless WebP VP8L chunk', () => {
    const buffer = Buffer.alloc(64)
    buffer.write('RIFF', 0, 'ascii')
    buffer.write('WEBP', 8, 'ascii')
    buffer.write('VP8L', 12, 'ascii')
    buffer.writeUInt8(0x2f, 20)
    // 14-bit (width - 1) then 14-bit (height - 1), packed little-endian.
    buffer.writeUInt32LE(((300 - 1) & 0x3fff) | (((200 - 1) & 0x3fff) << 14), 21)
    expect(imageSize('image/webp', new Uint8Array(buffer))).toEqual({ width: 300, height: 200 })
  })

  it('reads an extended WebP VP8X chunk', () => {
    const buffer = Buffer.alloc(64)
    buffer.write('RIFF', 0, 'ascii')
    buffer.write('WEBP', 8, 'ascii')
    buffer.write('VP8X', 12, 'ascii')
    buffer.writeUIntLE(1024 - 1, 24, 3)
    buffer.writeUIntLE(768 - 1, 27, 3)
    expect(imageSize('image/webp', new Uint8Array(buffer))).toEqual({ width: 1024, height: 768 })
  })

  it('returns null rather than a default size for truncated or unreadable bytes', () => {
    expect(imageSize('image/png', new Uint8Array([0x89, 0x50]))).toBeNull()
    expect(imageSize('image/jpeg', new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull()
    expect(imageSize('image/webp', new Uint8Array(40))).toBeNull()
    expect(imageFacts('data:image/png;base64,AAAA')).toBeNull()
  })
})
