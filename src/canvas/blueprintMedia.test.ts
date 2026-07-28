import { describe, expect, it } from 'vitest'

import { documentOfPages, testBlock, testPage, testStroke } from '../test/documents.ts'

import { BLUEPRINT_SCHEMA_VERSION, parseBlueprint, serialiseDocument } from './blueprintFile.ts'
import { emptySiteSettings } from './siteSettings.ts'

/**
 * THE ADDITIVE-FIELD CONTRACT.
 *
 * The pen layer and image uploads both grew the document AFTER schema v2 shipped,
 * and neither bumped the version. That is only safe if a v2 payload written before
 * them still reads back as exactly the design it described — which is what these
 * tests hold. They also hold the other half: a malformed new field is still
 * corruption, so the defaults can never be used to launder a broken file.
 */

function payload(pages: unknown): string {
  return JSON.stringify({
    schemaVersion: BLUEPRINT_SCHEMA_VERSION,
    siteSettings: emptySiteSettings(),
    pages,
  })
}

const PHOTO = 'data:image/jpeg;base64,AAAA'

describe('pen strokes through the file format', () => {
  it('round-trips a page of strokes deep-equal', () => {
    const original = documentOfPages(
      testPage('page-home', 'Home', [testBlock()], [
        testStroke({ id: 'stroke-1' }),
        testStroke({
          id: 'stroke-2',
          color: '#15803d',
          width: 12,
          points: [
            { x: 0, y: 0 },
            { x: 12.5, y: 900.1 },
            { x: 1200, y: 1600 },
          ],
        }),
      ]),
    )

    const result = parseBlueprint(serialiseDocument(original))

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.document).toEqual(original)
  })

  it('reads a v2 page written BEFORE the pen layer as a page with no marks', () => {
    const result = parseBlueprint(
      payload([{ id: 'page-home', name: 'Home', blocks: [] }]),
    )

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.document.pages[0]?.penStrokes).toEqual([])
    // Critically NOT a migration: nothing was upgraded, the field simply defaulted.
    expect(result.migratedFrom).toBeNull()
  })

  it('reads a migrated schema-1 canvas as a page with no marks', () => {
    const result = parseBlueprint(JSON.stringify({ schemaVersion: 1, blocks: [] }))

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.document.pages[0]?.penStrokes).toEqual([])
    expect(result.migratedFrom).toBe(1)
  })

  it('still writes schema version 2 — an additive field is not a new schema', () => {
    const document = documentOfPages(testPage('page-home', 'Home', [], [testStroke()]))
    const parsed = JSON.parse(serialiseDocument(document)) as { schemaVersion: number }

    expect(parsed.schemaVersion).toBe(2)
  })

  it('refuses a payload whose strokes are malformed', () => {
    const result = parseBlueprint(
      payload([
        { id: 'page-home', name: 'Home', blocks: [], penStrokes: [{ id: 'a', points: [] }] },
      ]),
    )

    expect(result.status).toBe('corrupt')
  })

  it('refuses two strokes sharing an id ACROSS pages, as the export numbers them site-wide', () => {
    const result = parseBlueprint(
      payload([
        { id: 'page-home', name: 'Home', blocks: [], penStrokes: [testStroke({ id: 'same' })] },
        { id: 'page-menu', name: 'Menu', blocks: [], penStrokes: [testStroke({ id: 'same' })] },
      ]),
    )

    expect(result.status).toBe('corrupt')
    if (result.status !== 'corrupt') return
    expect(result.reason).toMatch(/pen stroke ids/)
  })
})

describe('image slots through the file format', () => {
  it('round-trips an uploaded photo, its filename, fit and description', () => {
    const original = documentOfPages(
      testPage('page-home', 'Home', [
        testBlock({
          id: 'img-1',
          type: 'image',
          imageData: PHOTO,
          originalFilename: 'golden hour patio.jpg',
          fit: 'contain',
          description: 'Our dining room at golden hour',
        }),
      ]),
    )

    const result = parseBlueprint(serialiseDocument(original))

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.document).toEqual(original)
  })

  it('keeps an awkward filename byte-for-byte', () => {
    const awkward = '  Café “front” (2024)_v2 FINAL.jpg  '
    const original = documentOfPages(
      testPage('page-home', 'Home', [
        testBlock({ id: 'img-1', type: 'image', imageData: PHOTO, originalFilename: awkward }),
      ]),
    )

    const result = parseBlueprint(serialiseDocument(original))

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.document.pages[0]?.blocks[0]?.originalFilename).toBe(awkward)
  })

  it('defaults an image block written before uploads existed', () => {
    const result = parseBlueprint(
      payload([
        {
          id: 'page-home',
          name: 'Home',
          blocks: [{ id: 'img-1', type: 'image', x: 0, y: 0, width: 400, height: 280, text: '' }],
        },
      ]),
    )

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.document.pages[0]?.blocks[0]).toMatchObject({
      imageData: '',
      originalFilename: '',
      fit: 'cover',
      description: '',
    })
  })

  it('keeps an empty slot that carries only a description', () => {
    const original = documentOfPages(
      testPage('page-home', 'Home', [
        testBlock({ id: 'img-1', type: 'image', description: 'Photo of our storefront' }),
      ]),
    )

    const result = parseBlueprint(serialiseDocument(original))

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.document.pages[0]?.blocks[0]).toMatchObject({
      imageData: '',
      description: 'Photo of our storefront',
    })
  })

  it.each([
    ['an SVG data URL', 'data:image/svg+xml;base64,PHN2Zz4='],
    ['an HTML data URL', 'data:text/html;base64,PGgxPmhpPC9oMT4='],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a remote URL', 'https://example.com/photo.jpg'],
  ])('refuses %s in an imported file — an <img> src is an injection vector', (_case, value) => {
    const result = parseBlueprint(
      payload([
        {
          id: 'page-home',
          name: 'Home',
          blocks: [
            {
              id: 'img-1',
              type: 'image',
              x: 0,
              y: 0,
              width: 400,
              height: 280,
              text: '',
              imageData: value,
            },
          ],
        },
      ]),
    )

    expect(result.status).toBe('corrupt')
  })

  it('refuses a fit it does not recognise, rather than silently changing the crop', () => {
    const result = parseBlueprint(
      payload([
        {
          id: 'page-home',
          name: 'Home',
          blocks: [
            {
              id: 'img-1',
              type: 'image',
              x: 0,
              y: 0,
              width: 400,
              height: 280,
              text: '',
              fit: 'stretch',
            },
          ],
        },
      ]),
    )

    expect(result.status).toBe('corrupt')
  })

  it('refuses a filename that is not text', () => {
    const result = parseBlueprint(
      payload([
        {
          id: 'page-home',
          name: 'Home',
          blocks: [
            {
              id: 'img-1',
              type: 'image',
              x: 0,
              y: 0,
              width: 400,
              height: 280,
              text: '',
              originalFilename: 42,
            },
          ],
        },
      ]),
    )

    expect(result.status).toBe('corrupt')
  })

  it('drops image fields from a block that is not an image slot', () => {
    const result = parseBlueprint(
      payload([
        {
          id: 'page-home',
          name: 'Home',
          blocks: [
            {
              id: 'head-1',
              type: 'heading',
              x: 0,
              y: 0,
              width: 400,
              height: 72,
              text: 'Hi',
              imageData: PHOTO,
              originalFilename: 'sneaky.jpg',
            },
          ],
        },
      ]),
    )

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    const block = result.document.pages[0]?.blocks[0]
    expect(block?.imageData).toBeUndefined()
    expect(block?.originalFilename).toBeUndefined()
  })
})
