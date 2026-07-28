import { describe, expect, it } from 'vitest'

import {
  ACCEPTED_IMAGE_TYPES,
  dataUrlByteSize,
  isImageDataUrl,
  isImageFit,
  MAX_IMAGE_LONG_EDGE_PX,
  MAX_UPLOAD_BYTES,
  scaledSize,
  validateImageFile,
} from './imageAssets.ts'

const ONE_MB = 1024 * 1024

function file(overrides: Partial<{ name: string; type: string; size: number }> = {}) {
  return { name: 'storefront.jpg', type: 'image/jpeg', size: 2 * ONE_MB, ...overrides }
}

describe('validateImageFile', () => {
  it.each(ACCEPTED_IMAGE_TYPES)('accepts %s', (type) => {
    expect(validateImageFile(file({ type })).ok).toBe(true)
  })

  it('refuses a file that is not an image at all, and says so in plain words', () => {
    const result = validateImageFile(file({ name: 'menu.pdf', type: 'application/pdf' }))

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toContain('menu.pdf')
    expect(result.ok === false && result.message).toMatch(/JPG, PNG or WEBP/)
  })

  it('refuses an SVG — it is an image to a browser, but it is a script vector', () => {
    expect(validateImageFile(file({ name: 'logo.svg', type: 'image/svg+xml' })).ok).toBe(false)
  })

  it('refuses a file with no MIME type at all', () => {
    expect(validateImageFile(file({ type: '' })).ok).toBe(false)
  })

  it('accepts a big-but-plausible phone photo', () => {
    expect(validateImageFile(file({ size: MAX_UPLOAD_BYTES - 1 })).ok).toBe(true)
  })

  it('refuses an absurd file and names both sizes', () => {
    const result = validateImageFile(file({ size: MAX_UPLOAD_BYTES + 1 }))

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.message).toContain('20.0MB')
  })

  it('refuses an empty file', () => {
    expect(validateImageFile(file({ size: 0 })).ok).toBe(false)
  })
})

describe('scaledSize', () => {
  it('shrinks a landscape photo to the long-edge budget, keeping its shape', () => {
    expect(scaledSize(3000, 2000, MAX_IMAGE_LONG_EDGE_PX)).toEqual({ width: 1600, height: 1067 })
  })

  it('shrinks a portrait photo by its height', () => {
    expect(scaledSize(2000, 4000, MAX_IMAGE_LONG_EDGE_PX)).toEqual({ width: 800, height: 1600 })
  })

  it('never enlarges a small logo', () => {
    expect(scaledSize(400, 120, MAX_IMAGE_LONG_EDGE_PX)).toEqual({ width: 400, height: 120 })
  })

  it('leaves an image that is exactly at the budget alone', () => {
    expect(scaledSize(1600, 900, MAX_IMAGE_LONG_EDGE_PX)).toEqual({ width: 1600, height: 900 })
  })

  it('never rounds a very wide banner down to zero pixels tall', () => {
    expect(scaledSize(16_000, 20, MAX_IMAGE_LONG_EDGE_PX)).toEqual({ width: 1600, height: 2 })
  })

  it('has nothing to scale when there is nothing there', () => {
    expect(scaledSize(0, 0, MAX_IMAGE_LONG_EDGE_PX)).toEqual({ width: 0, height: 0 })
  })
})

describe('dataUrlByteSize', () => {
  it('reports the decoded size of the payload, not the string length', () => {
    // "AAAA" is 3 bytes of base64 with no padding.
    expect(dataUrlByteSize('data:image/jpeg;base64,AAAA')).toBe(3)
    expect(dataUrlByteSize('data:image/jpeg;base64,AAA=')).toBe(2)
    expect(dataUrlByteSize('data:image/jpeg;base64,AA==')).toBe(1)
  })

  it('reports nothing for a string that is not a data URL', () => {
    expect(dataUrlByteSize('https://example.com/photo.jpg')).toBe(0)
  })
})

describe('isImageDataUrl', () => {
  it.each(['image/jpeg', 'image/png', 'image/webp'])('accepts a base64 %s URL', (type) => {
    expect(isImageDataUrl(`data:${type};base64,AAAA`)).toBe(true)
  })

  it.each([
    ['an SVG data URL', 'data:image/svg+xml;base64,AAAA'],
    ['an HTML data URL', 'data:text/html;base64,AAAA'],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a remote URL', 'https://example.com/photo.jpg'],
    ['a non-base64 payload', 'data:image/png,%3Csvg%3E'],
    ['an empty payload', 'data:image/png;base64,'],
    ['a number', 42],
  ])('refuses %s', (_case, value) => {
    expect(isImageDataUrl(value)).toBe(false)
  })
})

describe('isImageFit', () => {
  it('accepts only the two the export schema names', () => {
    expect(isImageFit('cover')).toBe(true)
    expect(isImageFit('contain')).toBe(true)
    expect(isImageFit('fill')).toBe(false)
    expect(isImageFit(undefined)).toBe(false)
  })
})
