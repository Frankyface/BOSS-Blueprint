/**
 * V23'S PRE-FLIGHT — "some template placeholder text is still in your design".
 *
 * §5 V23 is a WARN: reviewing is offered, never forced. Showing it BEFORE the
 * send (rather than only in the completion list) is what makes it useful — the
 * client can still do something about it — and the round-2 UX audit's deferred
 * item asks for the blocks to be NAMED with their text, not merely counted.
 *
 * Walked over the DOCUMENT rather than over `site.json` on purpose: the panel
 * needs internal ids to jump to, and the client's own text to show. The validator
 * still owns the rule for the package (`v23TemplateFiller`); `templateFiller.test.ts`
 * asserts the two agree on a fixture, so this stays a view of the same condition
 * rather than a second opinion about it.
 */

import type { Block } from '../canvas/types.ts'
import type { ExportDocument } from '../export/siteJson.ts'

export interface FillerBlock {
  readonly pageId: string
  readonly pageName: string
  readonly blockId: string
  readonly type: Block['type']
  /** What the client would read on the canvas — trimmed for a one-line preview. */
  readonly preview: string
}

/** §2.6 scope rule: a `section` has no content for the flag to mean anything. */
const CONTENT_BEARING = (type: Block['type']): boolean => type !== 'section'

const PREVIEW_LIMIT = 80
const ELLIPSIS = '…'

function previewOf(block: Block): string {
  const source = block.text.trim() === '' ? (block.description ?? '') : block.text
  const oneLine = source.replace(/\s+/g, ' ').trim()
  return oneLine.length > PREVIEW_LIMIT ? `${oneLine.slice(0, PREVIEW_LIMIT).trimEnd()}${ELLIPSIS}` : oneLine
}

export function templateFillerBlocks(document: ExportDocument): FillerBlock[] {
  return document.pages.flatMap((page) =>
    page.blocks
      .filter((block) => block.fromTemplate === true && CONTENT_BEARING(block.type))
      .map((block) => ({
        pageId: page.id,
        pageName: page.name,
        blockId: block.id,
        type: block.type,
        preview: previewOf(block),
      })),
  )
}
