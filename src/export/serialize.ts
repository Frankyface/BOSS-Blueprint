/**
 * CANONICAL `site.json` TEXT — `docs/export-format.md` §1 "File conventions" and
 * §2.1 "Key order is normative, and §7.1 is the canon".
 *
 * Determinism is a design principle of the contract: two exports of the same design
 * must be byte-identical so packages are diffable across round-trip iterations. That
 * needs three things, all of them here — a fixed key order, 2-space pretty printing,
 * and LF with a final newline.
 *
 * The key order below is transcribed from the §7.1 fixture, which §2.1 makes the
 * canon wherever a §2 listing disagreed (historically `z` before vs after `frame`).
 * The same tables drive V27, which is why they are exported: one source, two uses —
 * the writer can't drift from the checker.
 */

import type { SiteJson } from './types.ts'

/** §7.1 — the normative key sequence for every object shape in `site.json`. */
export const KEY_ORDER = {
  root: ['schemaVersion', 'submission', 'siteSettings', 'pages', 'assets'],
  submission: ['id', 'submittedAt', 'designCreatedAt', 'client', 'appVersion'],
  client: ['name', 'email'],
  siteSettings: ['businessName', 'tagline', 'about', 'vibe', 'styleNotes', 'colors'],
  page: ['id', 'name', 'slug', 'height', 'screenshot', 'blocks', 'penStrokes'],
  /**
   * §2.6 lists the common fields as id, type, z, frame, fromTemplate — so the
   * optional flag sits between the common fields and the per-type ones. §7.1 has
   * no `fromTemplate` block, so the fixture cannot arbitrate; this follows the
   * only ordering the spec does state.
   */
  block: ['id', 'type', 'z', 'frame', 'fromTemplate'],
  section: ['background'],
  heading: ['copyMode', 'text', 'generateDescription', 'lengthHint'],
  text: ['copyMode', 'text', 'generateDescription', 'lengthHint'],
  imageSlot: ['assetId', 'fit', 'description'],
  button: ['label', 'link'],
  navBar: ['items'],
  frame: ['x', 'y', 'w', 'h'],
  link: ['kind', 'pageId', 'url'],
  navItem: ['id', 'label', 'link'],
  penStroke: ['id', 'points', 'color', 'width', 'role', 'targetBlockId'],
  asset: ['id', 'path', 'originalFilename', 'mimeType', 'width', 'height', 'bytes'],
} as const satisfies Record<string, readonly string[]>

export type KeyOrderShape = keyof typeof KEY_ORDER

const BLOCK_TYPE_SHAPES: Record<string, KeyOrderShape> = {
  section: 'section',
  heading: 'heading',
  text: 'text',
  imageSlot: 'imageSlot',
  button: 'button',
  navBar: 'navBar',
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** `Array.isArray` widens `unknown` to `any[]`; this keeps the elements `unknown`. */
function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? (value as unknown[]) : null
}

/**
 * Rebuild `value` with its keys in `order`, dropping keys whose value is
 * `undefined` (an absent optional must not serialize as anything at all) and
 * appending any key the table does not know about — §6.2 tolerates unknown fields,
 * and silently eating one would turn a forward-compatible field into data loss.
 */
function ordered(
  value: Record<string, unknown>,
  order: readonly string[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of order) {
    if (key in value && value[key] !== undefined) out[key] = value[key]
  }
  for (const key of Object.keys(value)) {
    if (!order.includes(key) && value[key] !== undefined) out[key] = value[key]
  }
  return out
}

function canonicalLink(link: Record<string, unknown>): Record<string, unknown> {
  return ordered(link, KEY_ORDER.link)
}

function canonicalBlock(block: Record<string, unknown>): Record<string, unknown> {
  const shape = BLOCK_TYPE_SHAPES[String(block.type)]
  const perType: readonly string[] = shape ? KEY_ORDER[shape] : []
  const flat = ordered(block, [...KEY_ORDER.block, ...perType])

  if (isRecord(flat.frame)) flat.frame = ordered(flat.frame, KEY_ORDER.frame)
  if (isRecord(flat.link)) flat.link = canonicalLink(flat.link)
  const items = asArray(flat.items)
  if (items) {
    flat.items = items.map((item) => {
      if (!isRecord(item)) return item
      const navItem = ordered(item, KEY_ORDER.navItem)
      if (isRecord(navItem.link)) navItem.link = canonicalLink(navItem.link)
      return navItem
    })
  }
  return flat
}

function canonicalPage(page: Record<string, unknown>): Record<string, unknown> {
  const flat = ordered(page, KEY_ORDER.page)
  const blocks = asArray(flat.blocks)
  if (blocks) flat.blocks = blocks.map((block) => (isRecord(block) ? canonicalBlock(block) : block))

  const strokes = asArray(flat.penStrokes)
  if (strokes) {
    flat.penStrokes = strokes.map((stroke) =>
      isRecord(stroke) ? ordered(stroke, KEY_ORDER.penStroke) : stroke,
    )
  }
  return flat
}

/** `site.json` as a plain object with every key in its normative position. */
export function canonicalSiteJson(site: SiteJson): Record<string, unknown> {
  const root = ordered({ ...site }, KEY_ORDER.root)

  if (isRecord(root.submission)) {
    const submission = ordered(root.submission, KEY_ORDER.submission)
    if (isRecord(submission.client)) submission.client = ordered(submission.client, KEY_ORDER.client)
    root.submission = submission
  }
  if (isRecord(root.siteSettings)) {
    root.siteSettings = ordered(root.siteSettings, KEY_ORDER.siteSettings)
  }
  const pages = asArray(root.pages)
  if (pages) root.pages = pages.map((page) => (isRecord(page) ? canonicalPage(page) : page))

  const assets = asArray(root.assets)
  if (assets) root.assets = assets.map((asset) => (isRecord(asset) ? ordered(asset, KEY_ORDER.asset) : asset))
  return root
}

/**
 * The exact bytes that go into the zip: 2-space pretty print, LF, final newline,
 * no BOM. The round-trip gate's C02 check reprints `JSON.stringify(site, null, 2)`
 * and compares, so this shape is not ours to choose.
 */
export function serializeSiteJson(site: SiteJson): string {
  return `${JSON.stringify(canonicalSiteJson(site), null, 2)}\n`
}

/**
 * V27 — does an already-parsed `site.json` carry its keys in the normative order?
 *
 * Unknown keys are ignored rather than flagged: §6.2 requires consumers to tolerate
 * them, so their position cannot be a violation. Only the RELATIVE order of the
 * keys the contract defines is checked.
 */
export function keyOrderProblems(parsed: unknown): string[] {
  const problems: string[] = []

  const checkNode = (value: unknown, order: readonly string[], path: string): void => {
    if (!isRecord(value)) return
    const known = Object.keys(value).filter((key) => order.includes(key))
    const positions = known.map((key) => order.indexOf(key))
    const sorted = positions.every((position, index) => index === 0 || position > (positions[index - 1] ?? -1))
    if (!sorted) {
      problems.push(`${path}: keys [${known.join(', ')}] are not in the §7.1 order [${order.join(', ')}]`)
    }
  }

  checkNode(parsed, KEY_ORDER.root, 'site.json')
  if (!isRecord(parsed)) return problems

  checkNode(parsed.submission, KEY_ORDER.submission, 'submission')
  if (isRecord(parsed.submission)) checkNode(parsed.submission.client, KEY_ORDER.client, 'submission.client')
  checkNode(parsed.siteSettings, KEY_ORDER.siteSettings, 'siteSettings')

  const pages = asArray(parsed.pages) ?? []
  pages.forEach((page, pageIndex) => {
    const pagePath = `pages[${String(pageIndex)}]`
    checkNode(page, KEY_ORDER.page, pagePath)
    if (!isRecord(page)) return

    const blocks = asArray(page.blocks) ?? []
    blocks.forEach((block, blockIndex) => {
      if (!isRecord(block)) return
      const blockPath = `${pagePath}.blocks[${String(blockIndex)}]`
      const shape = BLOCK_TYPE_SHAPES[String(block.type)]
      checkNode(block, [...KEY_ORDER.block, ...(shape ? KEY_ORDER[shape] : [])], blockPath)
      checkNode(block.frame, KEY_ORDER.frame, `${blockPath}.frame`)
      checkNode(block.link, KEY_ORDER.link, `${blockPath}.link`)
      const items = asArray(block.items) ?? []
      items.forEach((item, itemIndex) => {
        const itemPath = `${blockPath}.items[${String(itemIndex)}]`
        checkNode(item, KEY_ORDER.navItem, itemPath)
        if (isRecord(item)) checkNode(item.link, KEY_ORDER.link, `${itemPath}.link`)
      })
    })

    const strokes = asArray(page.penStrokes) ?? []
    strokes.forEach((stroke, strokeIndex) => {
      checkNode(stroke, KEY_ORDER.penStroke, `${pagePath}.penStrokes[${String(strokeIndex)}]`)
    })
  })

  const assets = asArray(parsed.assets) ?? []
  assets.forEach((asset, index) => {
    checkNode(asset, KEY_ORDER.asset, `assets[${String(index)}]`)
  })

  return problems
}
