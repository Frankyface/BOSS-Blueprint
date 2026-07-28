import { NO_LINK } from '../canvas/links.ts'
import { navItemsFromText, withNavItems } from '../canvas/navItems.ts'
import { emptySiteSettings } from '../canvas/siteSettings.ts'
import type { Block, CanvasDocument, Page } from '../canvas/types.ts'

/**
 * Document fixtures shared by the storage, session and file-format tests.
 *
 * `testBlock` fills in the SAME per-type fields the parser defaults, so a fixture
 * can be compared deep-equal against whatever `parseBlueprint` gives back. It is a
 * deliberate independent restatement of those defaults rather than a call into the
 * parser — a fixture that used the code under test could not catch it changing.
 */

export const TEST_PAGE_ID = 'page-home'
export const TEST_PAGE_NAME = 'Home'

interface BlockBaseFields {
  id: string
  type: Block['type']
  x: number
  y: number
  width: number
  height: number
  text: string
}

export function testBlock(overrides: Partial<Block> = {}): Block {
  const merged: Block = {
    id: 'block-1',
    type: 'heading',
    x: 80,
    y: 120,
    width: 640,
    height: 72,
    text: 'Welcome to BOSS',
    ...overrides,
  }

  const base: BlockBaseFields = {
    id: merged.id,
    type: merged.type,
    x: merged.x,
    y: merged.y,
    width: merged.width,
    height: merged.height,
    text: merged.text,
  }

  if (base.type === 'heading' || base.type === 'text') {
    return {
      ...base,
      copyMode: merged.copyMode ?? 'real',
      generateDescription: merged.generateDescription ?? '',
      lengthHint: merged.lengthHint ?? '',
    }
  }

  if (base.type === 'button') return { ...base, link: merged.link ?? NO_LINK }

  if (base.type === 'nav-bar') {
    return withNavItems(base, merged.items ?? navItemsFromText(base.text))
  }

  return base
}

export function testPage(id: string, name: string, blocks: readonly Block[] = []): Page {
  return { id, name, blocks }
}

/** A one-page document — the shape a migrated schema-1 payload also produces. */
export function documentOf(...blocks: Block[]): CanvasDocument {
  return {
    siteSettings: emptySiteSettings(),
    pages: [testPage(TEST_PAGE_ID, TEST_PAGE_NAME, blocks)],
  }
}

export function documentOfPages(...pages: Page[]): CanvasDocument {
  return { siteSettings: emptySiteSettings(), pages }
}
