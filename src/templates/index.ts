import { withTypeDefaults } from '../canvas/blockEdits.ts'
import { emptyDocument } from '../canvas/document.ts'
import type { Block, CanvasDocument, Page } from '../canvas/types.ts'

import { PORTFOLIO_TEMPLATE } from './portfolio.ts'
import { RESTAURANT_TEMPLATE } from './restaurant.ts'
import { SHOP_TEMPLATE } from './shop.ts'
import { TRADES_TEMPLATE } from './trades.ts'
import type { StarterTemplate, TemplatePage } from './layout.ts'

export type { StarterTemplate, TemplateBlock, TemplatePage } from './layout.ts'

/**
 * THE STARTER TEMPLATES, and the one function that turns one into a document.
 *
 * A template is plain design state — the same `{ siteSettings, pages }` autosave
 * writes and the `.blueprint` file carries. There is no template machinery in the
 * store, no "template mode", and nothing a client cannot move, retype or delete:
 * choosing one is a document replacement and nothing else.
 */

/** The picker's four starter templates, in display order. */
export const STARTER_TEMPLATES: readonly StarterTemplate[] = [
  RESTAURANT_TEMPLATE,
  TRADES_TEMPLATE,
  PORTFOLIO_TEMPLATE,
  SHOP_TEMPLATE,
]

/**
 * The fifth option, which is deliberately NOT a fixture.
 *
 * Blank means ZERO blocks (docs/decisions.md 2026-07-28): seeding it with a nav
 * bar and a band would put content in the client's export that they never chose,
 * and would make the picker a lie. The coaching that replaces those blocks is UI —
 * a dismissible card over the empty page, not design state.
 */
export const BLANK_START = {
  id: 'blank',
  pickerTitle: 'Start blank',
  pickerLine: 'An empty page and a nudge in the right direction.',
} as const

export function templateById(id: string): StarterTemplate | null {
  return STARTER_TEMPLATES.find((template) => template.id === id) ?? null
}

/**
 * Fill in the per-type fields the fixture leaves off, exactly as the parser does.
 *
 * This is not cosmetic. A copy block always carries all four copy fields and an
 * image slot always carries all four image fields — `withTypeDefaults` puts them
 * on every block the factory makes, and `parseBlock` puts them on every block read
 * back from storage. A template block that skipped this would be a DIFFERENT SHAPE
 * from the same block after one autosave-and-reload, which is precisely the
 * defect `canvasSession.test.ts` caught on the reload path in batch 1.
 */
function landedBlock(block: Block): Block {
  return withTypeDefaults(block)
}

/**
 * `penStrokes: []` is added here rather than stored in the fixture: a template
 * ships no handwriting, and a field that is sometimes missing is a field every
 * consumer has to defend against (`Page.penStrokes` is required for that reason).
 */
function landedPage(page: TemplatePage): Page {
  return { id: page.id, name: page.name, blocks: page.blocks.map(landedBlock), penStrokes: [] }
}

/** A starter template as a document the store can simply be handed. */
export function documentFromTemplate(template: StarterTemplate): CanvasDocument {
  return { siteSettings: template.siteSettings, pages: template.pages.map(landedPage) }
}

/** Blank: one empty page, empty settings — the document a fresh session starts on. */
export function blankDocument(): CanvasDocument {
  return emptyDocument()
}
