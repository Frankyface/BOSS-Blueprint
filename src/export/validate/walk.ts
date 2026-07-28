/**
 * Shared traversal helpers for the V-rules. Every rule that needs "every block
 * site-wide" or "every client string" uses these, so a new block type is added in
 * one place rather than in twenty rules.
 */

import type { ExportBlock, ExportPage, SiteJson } from '../types.ts'

export interface BlockRef {
  readonly page: ExportPage
  readonly block: ExportBlock
}

export function eachBlock(site: SiteJson): BlockRef[] {
  return site.pages.flatMap((page) => page.blocks.map((block) => ({ page, block })))
}

export function jumpTarget({ page, block }: BlockRef): { pageId: string; blockId: string } {
  return { pageId: page.id, blockId: block.id }
}

export interface StringField {
  readonly value: string
  readonly path: string
}

/** Every client-supplied string in `site.json` — V7's comparison universe. */
export function eachClientString(site: SiteJson): StringField[] {
  const fields: StringField[] = []
  const push = (value: string | null, path: string): void => {
    if (value !== null) fields.push({ value, path })
  }

  push(site.siteSettings.businessName, 'siteSettings.businessName')
  push(site.siteSettings.tagline, 'siteSettings.tagline')
  push(site.siteSettings.about, 'siteSettings.about')
  push(site.siteSettings.styleNotes, 'siteSettings.styleNotes')
  push(site.submission.client.name, 'submission.client.name')

  site.pages.forEach((page, pageIndex) => {
    const base = `pages[${String(pageIndex)}]`
    push(page.name, `${base}.name`)

    page.blocks.forEach((block, blockIndex) => {
      const path = `${base}.blocks[${String(blockIndex)}]`
      switch (block.type) {
        case 'heading':
        case 'text':
          push(block.text, `${path}.text`)
          push(block.generateDescription, `${path}.generateDescription`)
          push(block.lengthHint, `${path}.lengthHint`)
          break
        case 'button':
          push(block.label, `${path}.label`)
          break
        case 'imageSlot':
          push(block.description, `${path}.description`)
          break
        case 'navBar':
          block.items.forEach((item, itemIndex) => {
            push(item.label, `${path}.items[${String(itemIndex)}].label`)
          })
          break
        case 'section':
          break
      }
    })
  })

  site.assets.forEach((asset, index) => {
    push(asset.originalFilename, `assets[${String(index)}].originalFilename`)
  })

  return fields
}

/** Blocks whose narration can carry a `**WRITE THIS COPY**` marker (§3.3 rule 2). */
export function generateBlocks(site: SiteJson): BlockRef[] {
  return eachBlock(site).filter(
    ({ block }) =>
      (block.type === 'heading' || block.type === 'text') && block.copyMode === 'generate',
  )
}

/** Slots whose narration can carry a `**SOURCE AN IMAGE**` marker. */
export function emptySlots(site: SiteJson): BlockRef[] {
  return eachBlock(site).filter(
    ({ block }) => block.type === 'imageSlot' && block.assetId === null,
  )
}
