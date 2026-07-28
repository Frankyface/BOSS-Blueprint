import { describe, expect, it } from 'vitest'

import { documentOf, documentOfPages, testBlock, testPage } from '../test/documents.ts'

import {
  BLUEPRINT_SCHEMA_VERSION,
  MIGRATED_PAGE_NAME,
  parseBlueprint,
  serialiseDocument,
} from './blueprintFile.ts'
import { emptyDocument } from './document.ts'
import { emptySiteSettings } from './siteSettings.ts'
import type { Block, SiteSettings } from './types.ts'

/** Serialise a hand-built payload so the corrupt cases read as real files. */
function payload(value: unknown): string {
  return JSON.stringify(value)
}

/** A schema-1 file: a bare `{ blocks }` canvas with no pages and no settings. */
function legacyPayload(...blocks: unknown[]): string {
  return payload({ schemaVersion: 1, blocks })
}

function currentPayload(pages: unknown, siteSettings: unknown = emptySiteSettings()): string {
  return payload({ schemaVersion: BLUEPRINT_SCHEMA_VERSION, pages, siteSettings })
}

const settings = (overrides: Partial<SiteSettings> = {}): SiteSettings => ({
  ...emptySiteSettings(),
  ...overrides,
})

describe('serialiseDocument', () => {
  it('stamps the schema version onto every payload', () => {
    const parsed: unknown = JSON.parse(serialiseDocument(documentOf(testBlock())))

    expect(parsed).toMatchObject({ schemaVersion: BLUEPRINT_SCHEMA_VERSION })
  })

  it('writes pages and site settings, and nothing else', () => {
    const parsed = JSON.parse(serialiseDocument(emptyDocument())) as Record<string, unknown>

    expect(Object.keys(parsed).sort()).toEqual(['pages', 'schemaVersion', 'siteSettings'])
  })

  it('serialises a fresh document back to a single Home page', () => {
    const result = parseBlueprint(serialiseDocument(emptyDocument()))

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.document.pages).toHaveLength(1)
    expect(result.document.pages[0]).toMatchObject({ name: MIGRATED_PAGE_NAME, blocks: [] })
  })
})

describe('round trip', () => {
  it('restores a multi-page document deep-equal', () => {
    const original = documentOfPages(
      testPage('page-home', 'Home', [
        testBlock({ id: 'a', type: 'section', text: '' }),
        testBlock({
          id: 'b',
          type: 'nav-bar',
          items: [
            { id: 'nav-1', label: 'Home', link: { kind: 'page', pageId: 'page-home' } },
            { id: 'nav-2', label: 'Shop', link: { kind: 'external', url: 'https://boss.test' } },
          ],
        }),
      ]),
      testPage('page-menu', 'Menu', [
        testBlock({ id: 'c', type: 'text', copyMode: 'generate', generateDescription: 'Our story' }),
        testBlock({ id: 'd', type: 'button', link: { kind: 'page', pageId: 'page-home' } }),
      ]),
    )
    const snapshot = structuredClone(original)

    const result = parseBlueprint(serialiseDocument(original))

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.document).toEqual(snapshot)
    expect(result.migratedFrom).toBeNull()
    // Parsing must produce fresh objects, never alias the input.
    expect(result.document.pages).not.toBe(original.pages)
  })

  it('carries every site setting through unchanged', () => {
    const original = {
      ...documentOf(),
      siteSettings: settings({
        businessName: "Martina's Trattoria",
        tagline: 'Slow food, fast smiles',
        about: 'A family trattoria in Guelph.',
        vibe: 'warm',
        styleNotes: 'Lots of white space',
        colors: ['#2f6f4f', '#f7f1e3'],
      }),
    }

    const result = parseBlueprint(serialiseDocument(original))

    expect(result).toMatchObject({ status: 'ok', document: { siteSettings: original.siteSettings } })
  })

  it('carries the template flag through, and only ever as `true`', () => {
    const original = documentOf(
      testBlock({ id: 'seeded', fromTemplate: true }),
      testBlock({ id: 'edited' }),
    )

    const result = parseBlueprint(serialiseDocument(original))

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    const [seeded, edited] = result.document.pages[0]?.blocks ?? []
    expect(seeded?.fromTemplate).toBe(true)
    // Absent, not `false`: one shape per state, so a reload cannot change the block.
    expect(edited && 'fromTemplate' in edited).toBe(false)
  })

  it('normalises an explicit `fromTemplate: false` to no flag at all', () => {
    const raw = currentPayload([
      { id: 'page-home', name: 'Home', blocks: [{ ...testBlock(), fromTemplate: false }] },
    ])

    const result = parseBlueprint(raw)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.document.pages[0]?.blocks[0]).toEqual(testBlock())
  })

  it('survives a second trip through the format unchanged', () => {
    const original = documentOf(testBlock(), testBlock({ id: 'block-2', type: 'button' }))

    const once = parseBlueprint(serialiseDocument(original))
    expect(once.status).toBe('ok')
    if (once.status !== 'ok') return

    const twice = parseBlueprint(serialiseDocument(once.document))

    expect(twice).toEqual(once)
  })
})

describe('corrupt payloads', () => {
  it('rejects text that is not JSON', () => {
    expect(parseBlueprint('{not json at all')).toMatchObject({ status: 'corrupt' })
  })

  it('rejects JSON that is not a blueprint object', () => {
    expect(parseBlueprint('[]')).toMatchObject({ status: 'corrupt' })
    expect(parseBlueprint('"hello"')).toMatchObject({ status: 'corrupt' })
    expect(parseBlueprint('null')).toMatchObject({ status: 'corrupt' })
  })

  it('rejects a payload with no schema version', () => {
    expect(parseBlueprint(payload({ pages: [] }))).toMatchObject({ status: 'corrupt' })
  })

  it('rejects a payload whose pages are not a list', () => {
    expect(parseBlueprint(currentPayload({ first: testPage('a', 'A') }))).toMatchObject({
      status: 'corrupt',
    })
  })

  it('rejects a design with no pages at all', () => {
    expect(parseBlueprint(currentPayload([]))).toMatchObject({ status: 'corrupt' })
  })

  it.each([
    ['a missing id', { id: undefined }],
    ['an empty id', { id: '' }],
    ['a missing name', { name: undefined }],
    ['a blank name', { name: '   ' }],
    ['blocks that are not a list', { blocks: 'none' }],
  ])('rejects a page with %s', (_label, overrides) => {
    const raw = currentPayload([{ ...testPage('page-home', 'Home'), ...overrides }])

    expect(parseBlueprint(raw)).toMatchObject({ status: 'corrupt' })
  })

  it.each([['a string', 'yes'], ['a number', 1], ['an object', {}]])(
    'rejects a template flag that is %s rather than coercing it',
    (_label, fromTemplate) => {
      const raw = currentPayload([
        { id: 'page-home', name: 'Home', blocks: [{ ...testBlock(), fromTemplate }] },
      ])

      expect(parseBlueprint(raw)).toMatchObject({ status: 'corrupt' })
    },
  )

  it('rejects duplicate page ids', () => {
    const raw = currentPayload([testPage('same', 'Home'), testPage('same', 'Menu')])

    expect(parseBlueprint(raw)).toMatchObject({ status: 'corrupt' })
  })

  it('rejects a block id repeated ACROSS pages, not just within one', () => {
    const raw = currentPayload([
      testPage('page-home', 'Home', [testBlock({ id: 'same' })]),
      testPage('page-menu', 'Menu', [testBlock({ id: 'same' })]),
    ])

    expect(parseBlueprint(raw)).toMatchObject({ status: 'corrupt' })
  })

  it('rejects an unknown block type rather than rendering nothing for it', () => {
    const raw = currentPayload([
      { ...testPage('page-home', 'Home'), blocks: [{ ...testBlock(), type: 'carousel' }] },
    ])

    expect(parseBlueprint(raw)).toMatchObject({ status: 'corrupt' })
  })

  it.each([
    ['a missing id', { id: undefined }],
    ['an empty id', { id: '' }],
    ['a non-numeric position', { x: '80' }],
    ['a NaN position', { y: Number.NaN }],
    ['a zero width', { width: 0 }],
    ['a negative height', { height: -10 }],
    ['a non-string text', { text: 42 }],
    ['an unknown copy mode', { copyMode: 'maybe' }],
    ['a non-string description', { generateDescription: 7 }],
    ['a non-string length hint', { lengthHint: [] }],
  ])('rejects a block with %s', (_label, overrides) => {
    const raw = currentPayload([
      { ...testPage('page-home', 'Home'), blocks: [{ ...testBlock(), ...overrides }] },
    ])

    expect(parseBlueprint(raw)).toMatchObject({ status: 'corrupt' })
  })

  it.each([
    ['an unknown kind', { kind: 'popup' }],
    ['a page link with no target', { kind: 'page' }],
    ['an external link that is not a URL', { kind: 'external', url: 'boss.test' }],
    ['an external link on a non-web scheme', { kind: 'external', url: 'javascript:alert(1)' }],
    ['a link that is not an object', 'page-home'],
  ])('rejects a button with %s', (_label, link) => {
    const raw = currentPayload([
      {
        ...testPage('page-home', 'Home'),
        blocks: [{ ...testBlock({ id: 'b', type: 'button' }), link }],
      },
    ])

    expect(parseBlueprint(raw)).toMatchObject({ status: 'corrupt' })
  })

  it.each([
    ['no id', [{ label: 'Home', link: { kind: 'none' } }]],
    ['no label', [{ id: 'nav-1', link: { kind: 'none' } }]],
    ['a bad link', [{ id: 'nav-1', label: 'Home', link: { kind: 'nowhere' } }]],
    [
      'duplicate ids',
      [
        { id: 'nav-1', label: 'Home', link: { kind: 'none' } },
        { id: 'nav-1', label: 'Menu', link: { kind: 'none' } },
      ],
    ],
  ])('rejects nav items with %s', (_label, items) => {
    const raw = currentPayload([
      {
        ...testPage('page-home', 'Home'),
        blocks: [{ ...testBlock({ id: 'n', type: 'nav-bar', text: '' }), items }],
      },
    ])

    expect(parseBlueprint(raw)).toMatchObject({ status: 'corrupt' })
  })

  it('rejects a menu past the export schema maximum of 10 items', () => {
    const items = Array.from({ length: 11 }, (_, index) => ({
      id: `nav-${String(index)}`,
      label: `Item ${String(index)}`,
      link: { kind: 'none' },
    }))
    const raw = currentPayload([
      {
        ...testPage('page-home', 'Home'),
        blocks: [{ ...testBlock({ id: 'n', type: 'nav-bar', text: '' }), items }],
      },
    ])

    expect(parseBlueprint(raw)).toMatchObject({ status: 'corrupt' })
  })

  it.each([
    ['an unknown vibe', { vibe: 'spooky' }],
    ['a non-string business name', { businessName: 12 }],
    ['a colour that is not hex', { colors: ['sage green'] }],
    ['more colours than the export allows', { colors: ['#111111', '#222222', '#333333', '#444444'] }],
    ['colours that are not a list', { colors: '#111111' }],
  ])('rejects site settings with %s', (_label, overrides) => {
    const raw = currentPayload([testPage('page-home', 'Home')], {
      ...emptySiteSettings(),
      ...overrides,
    })

    expect(parseBlueprint(raw)).toMatchObject({ status: 'corrupt' })
  })

  it('always explains itself, so the notice can say something useful', () => {
    const result = parseBlueprint('{oops')

    expect(result.status).toBe('corrupt')
    if (result.status !== 'corrupt') return
    expect(result.reason.length).toBeGreaterThan(0)
  })
})

describe('version mismatch', () => {
  it('reports a newer schema separately from corruption', () => {
    const future = BLUEPRINT_SCHEMA_VERSION + 1
    const raw = payload({ schemaVersion: future, pages: [] })

    const result = parseBlueprint(raw)

    expect(result.status).toBe('unsupported-version')
    if (result.status !== 'unsupported-version') return
    expect(result.version).toBe(future)
    expect(result.reason).toContain(String(future))
  })

  it('reports a version older than anything we can migrate the same way', () => {
    expect(parseBlueprint(payload({ schemaVersion: 0, blocks: [] }))).toMatchObject({
      status: 'unsupported-version',
      version: 0,
    })
  })
})

describe('migrating a schema-1 design', () => {
  it('reads it rather than quarantining it', () => {
    const result = parseBlueprint(legacyPayload({ ...testBlock(), copyMode: undefined }))

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.migratedFrom).toBe(1)
  })

  it('becomes exactly one page called Home, keeping every block', () => {
    const raw = legacyPayload(
      { id: 'a', type: 'section', x: 0, y: 0, width: 1200, height: 240, text: '' },
      { id: 'b', type: 'heading', x: 80, y: 120, width: 640, height: 72, text: 'Welcome' },
    )

    const result = parseBlueprint(raw)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.document.pages).toHaveLength(1)
    expect(result.document.pages[0]?.name).toBe(MIGRATED_PAGE_NAME)
    expect(result.document.pages[0]?.blocks.map((block: Block) => block.id)).toEqual(['a', 'b'])
  })

  it('starts the migrated design with empty site settings', () => {
    const result = parseBlueprint(legacyPayload())

    expect(result).toMatchObject({ status: 'ok', document: { siteSettings: emptySiteSettings() } })
  })

  it('defaults a copy block to the client\'s own words', () => {
    const raw = legacyPayload({
      id: 'h',
      type: 'heading',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      text: 'Hi',
    })

    const result = parseBlueprint(raw)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.document.pages[0]?.blocks[0]).toMatchObject({
      copyMode: 'real',
      generateDescription: '',
      lengthHint: '',
    })
  })

  it('leaves a migrated button unlinked rather than guessing', () => {
    const raw = legacyPayload({
      id: 'b',
      type: 'button',
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      text: 'Book',
    })

    const result = parseBlueprint(raw)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.document.pages[0]?.blocks[0]?.link).toEqual({ kind: 'none' })
  })

  it('turns a nav bar\'s comma-separated labels into structured items', () => {
    const raw = legacyPayload({
      id: 'n',
      type: 'nav-bar',
      x: 0,
      y: 0,
      width: 1200,
      height: 72,
      text: 'Home, About, Contact',
    })

    const result = parseBlueprint(raw)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    const items = result.document.pages[0]?.blocks[0]?.items ?? []
    expect(items.map((item) => item.label)).toEqual(['Home', 'About', 'Contact'])
    expect(items.every((item) => item.link.kind === 'none')).toBe(true)
    expect(result.document.pages[0]?.blocks[0]?.text).toBe('Home, About, Contact')
  })

  it('still refuses a schema-1 payload whose blocks are unreadable', () => {
    expect(parseBlueprint(payload({ schemaVersion: 1, blocks: 'lots' }))).toMatchObject({
      status: 'corrupt',
    })
    expect(parseBlueprint(legacyPayload({ id: 'a', type: 'ghost' }))).toMatchObject({
      status: 'corrupt',
    })
  })

  it('still refuses duplicate block ids in a schema-1 payload', () => {
    const block = { id: 'same', type: 'heading', x: 0, y: 0, width: 10, height: 10, text: '' }

    expect(parseBlueprint(legacyPayload(block, block))).toMatchObject({ status: 'corrupt' })
  })

  it('re-serialises as the current schema, so the migration happens once', () => {
    const result = parseBlueprint(legacyPayload())
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    const again = parseBlueprint(serialiseDocument(result.document))

    expect(again).toMatchObject({ status: 'ok', migratedFrom: null })
  })
})
