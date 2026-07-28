import { describe, expect, it } from 'vitest'

import { documentOf, testBlock } from '../test/documents.ts'

import { BLUEPRINT_SCHEMA_VERSION, serialiseDocument } from './blueprintFile.ts'
import {
  designFileName,
  designFileSlug,
  DESIGN_FILE_EXTENSION,
  FALLBACK_DESIGN_NAME,
  interpretDesignFile,
  isDesignFileName,
  MAX_DESIGN_FILE_BYTES,
  openedDesignMessage,
  overwritePrompt,
  rejectionForDesignFile,
} from './designFile.ts'

const file = (name: string, size = 1_000) => ({ name, size })

describe('designFileSlug', () => {
  it.each([
    ["Martina's Trattoria", 'martina-s-trattoria'],
    ['Ridgeway Plumbing & Heating', 'ridgeway-plumbing-heating'],
    ['  Spaced   Out  ', 'spaced-out'],
    ['Café Ubuntu', 'cafe-ubuntu'],
    ['ALL CAPS LTD.', 'all-caps-ltd'],
  ])('turns %o into %o', (businessName, expected) => {
    expect(designFileSlug(businessName)).toBe(expected)
  })

  it('falls back rather than producing a file with no name', () => {
    // Templates ship businessName EMPTY on purpose (decisions.md), so this is the
    // NORMAL case for anyone who downloads before filling the settings in.
    expect(designFileSlug('')).toBe(FALLBACK_DESIGN_NAME)
    expect(designFileSlug('   ')).toBe(FALLBACK_DESIGN_NAME)
    expect(designFileSlug('!!!')).toBe(FALLBACK_DESIGN_NAME)
  })

  it('caps a very long name, and never ends on a stray hyphen', () => {
    const slug = designFileSlug(`${'word '.repeat(40)}end`)

    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('designFileName', () => {
  it('names the file after the business, with the design extension', () => {
    expect(designFileName('The Copper Pot')).toBe(`the-copper-pot${DESIGN_FILE_EXTENSION}`)
    expect(designFileName('')).toBe(`${FALLBACK_DESIGN_NAME}${DESIGN_FILE_EXTENSION}`)
  })

  it('recognises its own output', () => {
    expect(isDesignFileName(designFileName('Anything'))).toBe(true)
    expect(isDesignFileName('holiday.JPG')).toBe(false)
    // Case is the client's file system's business, not ours.
    expect(isDesignFileName('DESIGN.BLUEPRINT')).toBe(true)
  })
})

describe('rejectionForDesignFile', () => {
  it('lets a plausible design file through', () => {
    expect(rejectionForDesignFile(file('my-site.blueprint'))).toBeNull()
  })

  it('refuses a file that is not a design, and names it', () => {
    const message = rejectionForDesignFile(file('holiday.jpg'))

    expect(message).toContain('holiday.jpg')
    expect(message).toContain(DESIGN_FILE_EXTENSION)
  })

  it('refuses a file too large to be a design before reading a byte of it', () => {
    const message = rejectionForDesignFile(file('huge.blueprint', MAX_DESIGN_FILE_BYTES + 1))

    expect(message).toContain('too big')
  })

  it('refuses an empty file', () => {
    expect(rejectionForDesignFile(file('empty.blueprint', 0))).toContain('empty')
  })
})

describe('interpretDesignFile', () => {
  it('accepts a real design and reports it needed no migration', () => {
    const document = documentOf(testBlock())

    const outcome = interpretDesignFile(serialiseDocument(document), 'my-site.blueprint')

    expect(outcome).toMatchObject({ status: 'ok', migratedFrom: null })
    if (outcome.status !== 'ok') return
    expect(outcome.document).toEqual(document)
  })

  it('migrates a schema-1 file on the way in, and says which version it came from', () => {
    const legacy = JSON.stringify({ schemaVersion: 1, blocks: [testBlock()] })

    const outcome = interpretDesignFile(legacy, 'old.blueprint')

    expect(outcome).toMatchObject({ status: 'ok', migratedFrom: 1 })
  })

  it.each([
    ['nonsense', 'not json at all {'],
    ['an empty object', '{}'],
    ['a design with no pages', JSON.stringify({ schemaVersion: BLUEPRINT_SCHEMA_VERSION, pages: [] })],
    [
      'a script smuggled into an image slot',
      JSON.stringify({
        schemaVersion: BLUEPRINT_SCHEMA_VERSION,
        siteSettings: null,
        pages: [
          {
            id: 'page-home',
            name: 'Home',
            blocks: [{ ...testBlock({ type: 'image' }), imageData: 'data:text/html,<script>' }],
          },
        ],
      }),
    ],
    [
      'a file from a future version',
      JSON.stringify({ schemaVersion: 99, pages: [], siteSettings: null }),
    ],
  ])('refuses %s, and says so in the client\'s words', (_label, raw) => {
    const outcome = interpretDesignFile(raw, 'suspect.blueprint')

    expect(outcome.status).toBe('rejected')
    if (outcome.status !== 'rejected') return
    expect(outcome.message).toContain('suspect.blueprint')
    // The one thing they most need to know: nothing of theirs was touched.
    expect(outcome.message).toContain('exactly as you left it')
  })
})

describe('the words the client reads', () => {
  it('confirms an ordinary open', () => {
    expect(openedDesignMessage('my-site.blueprint', null)).toBe('Opened “my-site.blueprint”.')
  })

  it('explains a migration instead of hiding it', () => {
    expect(openedDesignMessage('old.blueprint', 1)).toContain('brought it up to date')
  })

  it('names the file in the overwrite prompt, so the choice is concrete', () => {
    expect(overwritePrompt('my-site.blueprint')).toContain('my-site.blueprint')
  })
})
