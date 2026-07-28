import { describe, expect, it } from 'vitest'

import { canCarryTemplateFlag } from '../canvas/blockEdits.ts'
import { parseNavItems, normaliseBlockText } from '../canvas/blockText.ts'
import { parseBlueprint, serialiseDocument } from '../canvas/blueprintFile.ts'
import { GRID_SIZE_PX, MAX_PAGE_HEIGHT_PX, PAGE_WIDTH_PX } from '../canvas/constants.ts'
import { pageHeightForContent } from '../canvas/geometry.ts'
import type { BlockRect } from '../canvas/types.ts'
import { BLOCK_TYPES } from '../constants/blockTypes.ts'

import { documentFromTemplate, STARTER_TEMPLATES } from './index.ts'
import type { StarterTemplate, TemplateBlock } from './layout.ts'

/**
 * THE FIXTURE INVARIANTS — the port of `design-assets/templates/validate-fixtures.mjs`,
 * which validated this data before it landed. It is a test rather than a scratch
 * script for one reason: the fixtures are 138 hand-written blocks of geometry, and
 * a single off-grid `y` or a heading two words too long for its box is a defect
 * nobody would see until it was baked into a client's exported page PNG.
 *
 * Every check reports the offending block by id: violations are collected into an
 * array and compared against `[]`, so a failure names what is wrong rather than
 * just which invariant broke.
 */

const DEFINITION = new Map(BLOCK_TYPES.map((entry) => [entry.id, entry]))
const isBand = (block: TemplateBlock): boolean =>
  DEFINITION.get(block.type)?.placement === 'stacked'

/** Per-page block counts and totals, from the content draft's own counts table. */
const EXPECTED = {
  restaurant: { blocks: [12, 12, 11], total: 35, generate: 1, crossPageButtons: 3 },
  trades: { blocks: [12, 12, 12], total: 36, generate: 2, crossPageButtons: 4 },
  portfolio: { blocks: [12, 10, 11], total: 33, generate: 1, crossPageButtons: 3 },
  shop: { blocks: [11, 12, 11], total: 34, generate: 2, crossPageButtons: 3 },
} as const

/** The only overlaps the design intends: words laid over a full-band hero photo. */
const ALLOWED_OVERLAPS: ReadonlySet<string> = new Set([
  'rest-home-hero-photo|rest-home-hero-title',
  'rest-home-hero-photo|rest-home-hero-cta',
  'shop-home-hero-photo|shop-home-hero-title',
  'shop-home-hero-photo|shop-home-hero-cta',
])

/** Fields a fixture block may carry. Anything else is a field nobody implemented. */
const ALLOWED_KEYS: ReadonlySet<string> = new Set([
  'id',
  'type',
  'x',
  'y',
  'width',
  'height',
  'text',
  'fromTemplate',
  'copyMode',
  'generateDescription',
  'lengthHint',
  'fit',
  'description',
  'link',
  'items',
])

export const MIN_BLOCKS_PER_PAGE = 5
export const MAX_BLOCKS_PER_PAGE = 12

/**
 * Landed sketch typography (`src/components/BlockView.css`). `.block-content` is
 * `overflow: hidden`, so copy that does not fit is CLIPPED, not scrolled. Char
 * widths are the usual ~0.5em regular / ~0.55em bold approximation; deliberately
 * conservative, and backed up by a real render check in the E2E suite.
 */
const TYPE_METRICS = {
  text: { charWidth: 9, lineHeight: 27.9, padX: 16, padY: 16 },
  heading: { charWidth: 22, lineHeight: 46, padX: 16, padY: 8 },
  button: { charWidth: 9.9, padX: 32 },
  'nav-bar': { charWidth: 9.35, gap: 28, padX: 48 },
} as const

function wrappedLines(text: string, usableWidth: number, charWidth: number): number {
  const perLine = Math.max(1, Math.floor(usableWidth / charWidth))
  return text
    .split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / perLine)), 0)
}

const onGrid = (value: number): boolean =>
  Number.isInteger(value) && value % GRID_SIZE_PX === 0

function overlaps(a: BlockRect, b: BlockRect): boolean {
  return (
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  )
}

const everyBlock = (template: StarterTemplate): readonly TemplateBlock[] =>
  template.pages.flatMap((page) => page.blocks)

const pageIdsOf = (template: StarterTemplate): readonly string[] =>
  template.pages.map((page) => page.id)

describe('starter templates', () => {
  it('offers exactly the four drafted templates, in display order', () => {
    expect(STARTER_TEMPLATES.map((template) => template.id)).toEqual([
      'restaurant',
      'trades',
      'portfolio',
      'shop',
    ])
  })

  it('mints every block id once across all four templates', () => {
    const ids = STARTER_TEMPLATES.flatMap((template) =>
      everyBlock(template).map((block) => block.id),
    )

    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe.each(STARTER_TEMPLATES)('$id template', (template) => {
  const expected = EXPECTED[template.id]
  const pageIds = pageIdsOf(template)

  it('ships picker copy and an EMPTY business name', () => {
    // decisions.md 2026-07-28: the one required field must be a real client answer,
    // so no template may put a fake business name into the export.
    expect(template.siteSettings.businessName).toBe('')
    expect(template.pickerTitle.length).toBeGreaterThan(0)
    expect(template.pickerLine.length).toBeGreaterThan(0)
  })

  it('has three uniquely-identified pages with the drafted block counts', () => {
    expect(new Set(pageIds).size).toBe(pageIds.length)
    expect(template.pages.map((page) => page.blocks.length)).toEqual([...expected.blocks])
    expect(everyBlock(template).length).toBe(expected.total)

    for (const page of template.pages) {
      expect(page.name.length).toBeGreaterThan(0)
      expect(page.blocks.length).toBeGreaterThanOrEqual(MIN_BLOCKS_PER_PAGE)
      expect(page.blocks.length).toBeLessThanOrEqual(MAX_BLOCKS_PER_PAGE)
    }
  })

  /**
   * `docs/export-format.md` §2.6 (v2.3): producers set `fromTemplate` only on
   * content-bearing types. A flagged section band could never be cleared — a band
   * has no text, label or description to edit — so it would leave the submit-time
   * untouched-filler warning (V23) permanently on for every template start, no
   * matter how completely the client rewrote the design.
   */
  it('flags every content block, and never a section band', () => {
    const wrong = everyBlock(template)
      .filter((block) => block.fromTemplate === true !== canCarryTemplateFlag(block.type))
      .map((block) => `${block.id} (${block.type})`)

    expect(wrong).toEqual([])
    expect(everyBlock(template).some((block) => block.type === 'section')).toBe(true)
  })

  it('carries only fields the store implements', () => {
    const strays = everyBlock(template).flatMap((block) =>
      Object.keys(block)
        .filter((key) => !ALLOWED_KEYS.has(key))
        .map((key) => `${block.id}.${key}`),
    )

    expect(strays).toEqual([])
  })

  it('snaps every box to the 8px grid, inside the page, above its type minimum', () => {
    const violations: string[] = []

    for (const block of everyBlock(template)) {
      const definition = DEFINITION.get(block.type)
      if (!definition) {
        violations.push(`${block.id}: unknown block type "${block.type}"`)
        continue
      }

      for (const [field, value] of [
        ['x', block.x],
        ['y', block.y],
        ['width', block.width],
        ['height', block.height],
      ] as const) {
        if (!onGrid(value)) violations.push(`${block.id}.${field} = ${value} is off the grid`)
      }

      if (block.x < 0 || block.x + block.width > PAGE_WIDTH_PX) {
        violations.push(`${block.id} spans ${block.x}–${block.x + block.width}, outside the page`)
      }
      if (block.y < 0) violations.push(`${block.id}.y = ${block.y} is above the page`)

      if (block.width < definition.minSize.width || block.height < definition.minSize.height) {
        violations.push(
          `${block.id} ${block.width}×${block.height} is below the ${block.type} minimum`,
        )
      }
    }

    expect(violations).toEqual([])
  })

  it('stores text already normalised, with no draft-notation left in it', () => {
    const violations = everyBlock(template).flatMap((block) => {
      if (block.text !== normaliseBlockText(block.text)) return [`${block.id}: text not normalised`]
      // The content draft wrote newlines as ⏎; a literal one would render as a glyph.
      return block.text.includes('⏎') ? [`${block.id}: text still contains a literal ⏎`] : []
    })

    expect(violations).toEqual([])
  })

  it('fits every default string inside its box', () => {
    const violations: string[] = []

    for (const block of everyBlock(template)) {
      if ((block.type === 'text' || block.type === 'heading') && block.text.length > 0) {
        const metrics = TYPE_METRICS[block.type]
        const needed =
          wrappedLines(block.text, block.width - metrics.padX, metrics.charWidth) *
            metrics.lineHeight +
          metrics.padY
        if (needed > block.height) {
          violations.push(`${block.id} needs ~${Math.ceil(needed)}px, box is ${block.height}px`)
        }
      }

      if (block.type === 'button') {
        const needed = block.text.length * TYPE_METRICS.button.charWidth + TYPE_METRICS.button.padX
        if (needed > block.width) {
          violations.push(`${block.id} label needs ~${Math.ceil(needed)}px, pill is ${block.width}px`)
        }
      }

      if (block.type === 'nav-bar' && block.items) {
        const metrics = TYPE_METRICS['nav-bar']
        const needed =
          block.items.reduce((sum, item) => sum + item.label.length * metrics.charWidth, 0) +
          metrics.gap * Math.max(0, block.items.length - 1) +
          metrics.padX
        if (needed > block.width) {
          violations.push(`${block.id} nav items need ~${Math.ceil(needed)}px`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('gives every block only the per-type fields that belong to it', () => {
    const violations: string[] = []
    let generateBlocks = 0

    for (const block of everyBlock(template)) {
      const isCopy = block.type === 'heading' || block.type === 'text'

      if (isCopy) {
        if (block.copyMode !== 'real' && block.copyMode !== 'generate') {
          violations.push(`${block.id} has no valid copyMode`)
        } else if (block.copyMode === 'real') {
          if (block.text.length === 0) violations.push(`${block.id} is real copy with no text`)
          if (block.generateDescription) {
            violations.push(`${block.id} is real copy but carries a generateDescription`)
          }
        } else {
          generateBlocks += 1
          if (block.text !== '') violations.push(`${block.id} is a generate block carrying text`)
          if (!block.generateDescription?.trim()) {
            violations.push(`${block.id} is a generate block with no description`)
          }
        }
      } else if (block.copyMode) {
        violations.push(`${block.id} (${block.type}) should not carry copyMode`)
      }

      if (block.type === 'image') {
        if (block.fit !== 'cover' && block.fit !== 'contain') {
          violations.push(`${block.id} has no valid fit`)
        }
        // An empty slot WITH a description is the export's "source this" instruction.
        if (!block.description?.trim()) violations.push(`${block.id} image has no description`)
      } else if (block.fit ?? block.description) {
        violations.push(`${block.id} (${block.type}) should not carry fit/description`)
      }

      if (block.type !== 'button' && block.link) {
        violations.push(`${block.id} (${block.type}) should not carry a link`)
      }
      if (block.type !== 'nav-bar' && block.items) {
        violations.push(`${block.id} (${block.type}) should not carry nav items`)
      }
    }

    expect(violations).toEqual([])
    expect(generateBlocks).toBe(expected.generate)
  })

  it('resolves every link and nav item to a page in the same template', () => {
    const violations: string[] = []
    let crossPageButtons = 0

    for (const page of template.pages) {
      for (const block of page.blocks) {
        if (block.type === 'button') {
          if (!block.link) {
            violations.push(`${block.id} button has no link`)
          } else if (block.link.kind === 'page') {
            if (!pageIds.includes(block.link.pageId)) {
              violations.push(`${block.id} links to unknown page "${block.link.pageId}"`)
            } else if (block.link.pageId !== page.id) {
              crossPageButtons += 1
            }
          }
        }

        for (const item of block.items ?? []) {
          if (item.id.length === 0 || item.label.length === 0) {
            violations.push(`${block.id} has a nav item with no id/label`)
          }
          if (item.link.kind !== 'page' || !pageIds.includes(item.link.pageId)) {
            violations.push(`${block.id} nav item "${item.label}" points nowhere`)
          }
        }
      }
    }

    expect(violations).toEqual([])
    expect(crossPageButtons).toBe(expected.crossPageButtons)
  })

  it('puts exactly one full-width nav bar at the top of every page, uncovered', () => {
    const violations: string[] = []

    for (const page of template.pages) {
      const navs = page.blocks.filter((block) => block.type === 'nav-bar')
      if (navs.length !== 1) {
        violations.push(`${page.id}: expected 1 nav bar, found ${navs.length}`)
        continue
      }

      const [nav] = navs
      if (!nav) continue

      if (nav.x !== 0 || nav.y !== 0 || nav.width !== PAGE_WIDTH_PX) {
        violations.push(`${nav.id} does not span the full width at y=0`)
      }
      if ((nav.items?.length ?? 0) !== template.pages.length) {
        violations.push(`${nav.id} must have one item per page (${template.pages.length})`)
      } else {
        // `text` and `items` are two views of one menu; the block builder writes
        // both from one source so they cannot disagree. This is that promise.
        const labels = parseNavItems(nav.text).join('|')
        const fromItems = (nav.items ?? []).map((item) => item.label).join('|')
        if (labels !== fromItems) violations.push(`${nav.id} text labels disagree with its items`)
      }

      // Nothing may cover the nav — which is why the draft's "always on top" z-index
      // is unnecessary here (the landed palette puts bands at the BACK of the array).
      for (const block of page.blocks) {
        if (block !== nav && overlaps(nav, block)) {
          violations.push(`${block.id} overlaps the nav bar on ${page.id}`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('stacks section bands under the nav with no gaps, and nests content inside them', () => {
    const violations: string[] = []

    for (const page of template.pages) {
      const nav = page.blocks.find((block) => block.type === 'nav-bar')
      const sections = page.blocks.filter((block) => block.type === 'section')

      let cursor = nav?.height ?? 0
      for (const section of sections) {
        if (section.y !== cursor) {
          violations.push(`${section.id} starts at ${section.y}, expected ${cursor}`)
        }
        if (section.x !== 0 || section.width !== PAGE_WIDTH_PX) {
          violations.push(`${section.id} is not full width`)
        }
        cursor = section.y + section.height
      }

      for (const block of page.blocks.filter((candidate) => !isBand(candidate))) {
        const home = sections.find(
          (section) =>
            block.y >= section.y && block.y + block.height <= section.y + section.height,
        )
        if (!home) violations.push(`${block.id} is not wholly inside any band`)
      }
    }

    expect(violations).toEqual([])
  })

  it('orders each page as it paints: bands at the back, then content in reading order', () => {
    const violations: string[] = []

    for (const page of template.pages) {
      const bands = page.blocks.filter(isBand)
      const content = page.blocks.filter((block) => !isBand(block))

      if (!page.blocks.slice(0, bands.length).every(isBand)) {
        violations.push(`${page.id}: bands are not a contiguous run at the back`)
      }
      for (let index = 1; index < bands.length; index += 1) {
        const previous = bands[index - 1]
        const current = bands[index]
        if (previous && current && current.y < previous.y) {
          violations.push(`${page.id}: band "${current.id}" paints after a lower band`)
        }
      }
      for (let index = 1; index < content.length; index += 1) {
        const previous = content[index - 1]
        const current = content[index]
        if (!previous || !current) continue
        if (current.y < previous.y || (current.y === previous.y && current.x < previous.x)) {
          violations.push(`${page.id}: "${current.id}" precedes "${previous.id}" on the page`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('keeps content blocks from overlapping, bar the deliberate hero overlays', () => {
    const violations: string[] = []

    for (const page of template.pages) {
      const content = page.blocks.filter((block) => !isBand(block))

      for (let i = 0; i < content.length; i += 1) {
        for (let j = i + 1; j < content.length; j += 1) {
          const a = content[i]
          const b = content[j]
          if (!a || !b || !overlaps(a, b)) continue
          if (ALLOWED_OVERLAPS.has(`${a.id}|${b.id}`) || ALLOWED_OVERLAPS.has(`${b.id}|${a.id}`)) {
            continue
          }
          violations.push(`unintended overlap: "${a.id}" × "${b.id}"`)
        }
      }
    }

    expect(violations).toEqual([])
  })

  it('fits every page inside the canvas height ceiling', () => {
    for (const page of template.pages) {
      expect(pageHeightForContent(page.blocks)).toBeLessThanOrEqual(MAX_PAGE_HEIGHT_PX)
    }
  })

  it('is a valid document: it survives the .blueprint round trip unchanged', () => {
    // The real schema check. `documentFromTemplate` is what the picker hands the
    // store, so if the landed parser cannot read it back byte-identically, the
    // client's first autosave-and-reload would silently change their design.
    const document = documentFromTemplate(template)
    const result = parseBlueprint(serialiseDocument(document))

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.migratedFrom).toBeNull()
    expect(result.document).toEqual(document)
  })
})
