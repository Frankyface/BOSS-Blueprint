/**
 * THE TRANSFORM — the editor's document becomes `site.json`.
 *
 * `docs/export-format.md` §4.1 slugs · §4.2 page height · §4.5 pen semantics ·
 * §4.6 assets · §4.7 discriminators · §4.8 identity remap, and §2 for the shape.
 *
 * Pure and deterministic: same document + same minted submission → deep-equal
 * output and byte-identical text. No DOM, no I/O, no `Date`, no `Math.random` —
 * everything non-deterministic (the UUID, the timestamps) is minted by the caller
 * and handed in.
 *
 * This is the stage's load-bearing module: `brief.md` is generated from its output,
 * the PNGs are sized from its `page.height`, and the zip is laid out from its
 * `assets[]` and `page.screenshot` paths.
 */

import { pageHeightForContent } from '../canvas/geometry.ts'
import type { Block, CanvasDocument, Page } from '../canvas/types.ts'

import { createAssetRegistry } from './assets.ts'
import { createIdMinter } from './ids.ts'
import { toExportStroke } from './penRoles.ts'
import { pageSlugs } from './slug.ts'
import {
  SCHEMA_VERSION,
  type ExportBlock,
  type ExportLink,
  type ExportNavItem,
  type ExportPage,
  type SiteJson,
} from './types.ts'

/**
 * The document as the export reads it: today's `Block` plus the two fields Stage 2
 * has not landed yet. Declaring them as optional structural extras (rather than
 * waiting) keeps the contract's rules implemented and tested now, and a real
 * `Block` is assignable to this without a cast the day they arrive.
 */
export interface ExportDocumentBlock extends Block {
  /** `feature-templates` — `true` until the client edits the block's content (§2.6). */
  readonly fromTemplate?: boolean
  /** §2.7 `section.background`; schema headroom with no UI today (ruled 2026-07-28). */
  readonly background?: string
}

export interface ExportDocumentPage extends Omit<Page, 'blocks'> {
  readonly blocks: readonly ExportDocumentBlock[]
}

export interface ExportDocument extends Omit<CanvasDocument, 'pages'> {
  readonly pages: readonly ExportDocumentPage[]
}

/** §2.3 — minted at submit time by the caller, never in here. */
export interface SubmissionInfo {
  readonly id: string
  readonly submittedAt: string
  readonly designCreatedAt: string | null
  readonly client: { readonly name: string; readonly email: string }
  readonly appVersion: string
}

export interface ExportPayload {
  readonly site: SiteJson
  /** `asset.path` → the data URL whose bytes belong at that path in the zip. */
  readonly stagedAssets: ReadonlyMap<string, string>
  /**
   * Internal id → export id. §4.8 rule 4: this NEVER ships in the package. It is
   * returned only so the export can log it — the one way to trace `blk_0007` back
   * to the block Cam is looking at in the editor.
   */
  readonly remap: ReadonlyMap<string, string>
}

/** §4.7 — internal palette id → export discriminator. */
const DISCRIMINATORS = {
  section: 'section',
  heading: 'heading',
  text: 'text',
  image: 'imageSlot',
  button: 'button',
  'nav-bar': 'navBar',
} as const

/** §2.6 — the flag means "content the client never touched", so a section can't carry it. */
const CONTENT_BEARING_TYPES: readonly ExportBlock['type'][] = [
  'heading',
  'text',
  'button',
  'navBar',
  'imageSlot',
]

const SCREENSHOT_INDEX_DIGITS = 2

/** §1 — `pages/<NN>-<slug>.png`, NN = zero-padded 1-based page order. */
export function screenshotPath(pageIndex: number, slug: string): string {
  return `pages/${String(pageIndex + 1).padStart(SCREENSHOT_INDEX_DIGITS, '0')}-${slug}.png`
}

/** §2.4 / §2.7 — the editor stores skipped optional text as `''`; the contract wants `null`. */
function textOrNull(value: string | undefined): string | null {
  return value === undefined || value === '' ? null : value
}

function toRects(blocks: readonly ExportDocumentBlock[]): { x: number; y: number; width: number; height: number }[] {
  return blocks.map((block) => ({
    x: block.x,
    y: block.y,
    width: block.width,
    height: block.height,
  }))
}

/**
 * §2.8 — rewrite an internal link into its export form.
 *
 * A `pageId` with no entry in the remap degrades to `{ kind: 'none' }`. The editor
 * reverts links on page deletion (Stage 2), so this is unreachable by construction;
 * if it ever happened the brief would list the button under "Unlinked buttons/items"
 * for Cam's eye, which beats leaking a dangling internal id into the package (V24)
 * or blocking a client's submission on a bug they cannot fix.
 */
function toExportLink(link: Block['link'], pageIds: ReadonlyMap<string, string>): ExportLink {
  if (link === undefined) return { kind: 'none' }
  if (link.kind === 'external') return { kind: 'external', url: link.url }
  if (link.kind === 'page') {
    const target = pageIds.get(link.pageId)
    return target === undefined ? { kind: 'none' } : { kind: 'page', pageId: target }
  }
  return { kind: 'none' }
}

interface BlockContext {
  readonly pageIds: ReadonlyMap<string, string>
  readonly mint: (prefix: 'pg' | 'blk' | 'nav' | 'stk') => string
  readonly remap: Map<string, string>
  readonly assetIdFor: (dataUrl: string, originalFilename: string) => string | null
}

function toNavItems(
  block: ExportDocumentBlock,
  context: BlockContext,
): readonly ExportNavItem[] {
  return (block.items ?? []).map((item) => {
    const id = context.mint('nav')
    context.remap.set(item.id, id)
    return { id, label: item.label, link: toExportLink(item.link, context.pageIds) }
  })
}

function toExportBlock(
  block: ExportDocumentBlock,
  z: number,
  context: BlockContext,
): ExportBlock {
  const id = context.mint('blk')
  context.remap.set(block.id, id)

  const type = DISCRIMINATORS[block.type]
  const frame = { x: block.x, y: block.y, w: block.width, h: block.height }
  // §2.6 scope rule: strip the flag from a section defensively rather than
  // exporting a flag that would make V23's warning permanent for every
  // template-start design.
  const filler =
    block.fromTemplate === true && CONTENT_BEARING_TYPES.includes(type)
      ? ({ fromTemplate: true } as const)
      : {}

  switch (type) {
    case 'section':
      return { id, type, z, frame, ...filler, background: textOrNull(block.background) }

    case 'heading':
    case 'text': {
      const copyMode = block.copyMode ?? 'real'
      return {
        id,
        type,
        z,
        frame,
        ...filler,
        copyMode,
        text: block.text,
        // §5 V20 territory: a mode switched back to `real` must not ship a
        // stranded description.
        generateDescription: copyMode === 'generate' ? textOrNull(block.generateDescription) : null,
        lengthHint: textOrNull(block.lengthHint),
      }
    }

    case 'imageSlot': {
      const dataUrl = block.imageData ?? ''
      const assetId =
        dataUrl === '' ? null : context.assetIdFor(dataUrl, block.originalFilename ?? '')
      return {
        id,
        type,
        z,
        frame,
        ...filler,
        assetId,
        fit: block.fit ?? 'cover',
        description: textOrNull(block.description),
      }
    }

    case 'button':
      return { id, type, z, frame, ...filler, label: block.text, link: toExportLink(block.link, context.pageIds) }

    case 'navBar':
      return { id, type, z, frame, ...filler, items: toNavItems(block, context) }
  }
}

function toExportPage(
  page: ExportDocumentPage,
  index: number,
  slug: string,
  context: BlockContext,
): ExportPage {
  const id = context.pageIds.get(page.id) ?? ''
  // §2.5/§5 V3: array order IS paint order in the document (Stage 1), so `z` is the
  // index and "blocks[] sorted by z ascending" is true by construction.
  const blocks = page.blocks.map((block, z) => toExportBlock(block, z, context))
  const penStrokes = page.penStrokes.map((stroke) =>
    toExportStroke(stroke, context.mint('stk'), blocks),
  )

  return {
    id,
    name: page.name,
    slug,
    // §4.2 — the SHARED editor/export height function. Computed from the committed
    // document strokes, not the export-thinned ones, so the canvas, the PNG and
    // `site.json` are literally the same pixels.
    height: pageHeightForContent(toRects(page.blocks), page.penStrokes),
    screenshot: screenshotPath(index, slug),
    blocks,
    penStrokes,
  }
}

/** The whole export pass: `site.json` plus the bytes the zip writer has to stage. */
export function buildExportPayload(
  document: ExportDocument,
  submission: SubmissionInfo,
): ExportPayload {
  const remap = new Map<string, string>()
  const mint = createIdMinter()
  const registry = createAssetRegistry()

  const slugs = pageSlugs(document.pages.map((page) => page.name))
  const pageIds = new Map<string, string>()
  document.pages.forEach((page) => {
    const id = mint('pg')
    pageIds.set(page.id, id)
    remap.set(page.id, id)
  })

  const context: BlockContext = { pageIds, mint, remap, assetIdFor: registry.idFor }
  const pages = document.pages.map((page, index) =>
    toExportPage(page, index, slugs[index] ?? `page-${String(index + 1)}`, context),
  )

  const settings = document.siteSettings
  const site: SiteJson = {
    schemaVersion: SCHEMA_VERSION,
    submission: {
      id: submission.id,
      submittedAt: submission.submittedAt,
      designCreatedAt: submission.designCreatedAt,
      client: { name: submission.client.name, email: submission.client.email },
      appVersion: submission.appVersion,
    },
    siteSettings: {
      businessName: settings.businessName,
      tagline: textOrNull(settings.tagline),
      about: textOrNull(settings.about),
      vibe: settings.vibe,
      styleNotes: textOrNull(settings.styleNotes),
      colors: settings.colors.slice(),
    },
    pages,
    // §4.6 — unreferenced uploads cannot exist structurally here (the image IS the
    // block), so the manifest is exactly the referenced set.
    assets: registry.manifest(),
  }

  return { site, stagedAssets: registry.stagedDataUrls(), remap }
}

/** `site.json` alone, for callers that do not stage files (tests, the brief). */
export function buildSiteJson(document: ExportDocument, submission: SubmissionInfo): SiteJson {
  return buildExportPayload(document, submission).site
}
