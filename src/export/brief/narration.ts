/**
 * PER-BLOCK NARRATION — `docs/export-format.md` §3.2 (the branch texts are
 * normative, verbatim), §4.4 preamble (reference text), [N6] per-type narration,
 * [N12] template-filler marker, §3.3 rule 8 (the verbatim sub-block).
 */

import type { ExportBlock, ExportBlockType, ExportPage, SiteJson } from '../types.ts'

import { FALLBACK_NO_DESCRIPTION } from './boilerplate.ts'
import { overflowMarker, overlapSuffix, positionPhrase } from './layout.ts'
import { resolvedTargetInWalkthrough } from './links.ts'
import { escapeClientText, frameTuple, num, quote } from './text.ts'

/** Display names in walkthrough bullets — pinned by the §7.2 fixture. */
export const BULLET_TYPE_LABEL: Readonly<Record<ExportBlockType, string>> = {
  section: 'Section band',
  heading: 'Heading',
  text: 'Text',
  imageSlot: 'Image slot',
  button: 'Button',
  navBar: 'Nav bar',
}

/** Lowercase prose form — [N7]'s nearest-block guess and [N8]'s context line. */
export const PROSE_TYPE_LABEL: Readonly<Record<ExportBlockType, string>> = {
  section: 'section band',
  heading: 'heading',
  text: 'text',
  imageSlot: 'image slot',
  button: 'button',
  navBar: 'nav bar',
}

/** The copy list uses the bare discriminator ("— text at (…)"), also per the fixture. */
export const COPY_LIST_TYPE_LABEL: Readonly<Record<'heading' | 'text', string>> = {
  heading: 'heading',
  text: 'text',
}

/** [N12] normative marker text. */
export const FILLER_MARKER =
  ' (untouched template filler — treat as a request to write fitting content, do not ship it verbatim)'

/**
 * §4.4 preamble (v2.3) — the REFERENCE TEXT of a block, used by [N5], [N7] and [N8]
 * wherever they print "the block's text/label".
 *
 * A `generate` block's `text` is the residual draft and is normally `''`, so naive
 * use of it told the builder a block overlaps «» — nothing named. V5 guarantees the
 * description is non-empty, so it is the honest reference. `navBar` has no
 * text/label/description at all; its item labels are its only client text.
 */
export function referenceText(block: ExportBlock): string {
  switch (block.type) {
    case 'heading':
    case 'text':
      return block.copyMode === 'generate' ? (block.generateDescription ?? '') : block.text
    case 'button':
      return block.label
    case 'imageSlot':
      return block.description ?? ''
    case 'navBar':
      return block.items.map((item) => item.label).join(', ')
    case 'section':
      // [N6]: sections are the group headers, never item bullets.
      return ''
  }
}

function narrateCopy(block: Extract<ExportBlock, { type: 'heading' | 'text' }>): string {
  if (block.copyMode === 'real') return `reads: ${quote(block.text)}`

  const length =
    block.lengthHint === null ? '' : ` (length: ${escapeClientText(block.lengthHint)})`
  const residual =
    block.text.trim() === ''
      ? ''
      : ` (they had already typed ${quote(block.text)} — context for what they want, not copy to use)`

  // V5 makes a null description unreachable in a valid package; coalescing keeps
  // the function total for a hand-edited one (v2.3 explicitly permits this).
  return `**WRITE THIS COPY** — client asks for: ${quote(block.generateDescription ?? '')}${length}${residual}`
}

function narrateImageSlot(
  block: Extract<ExportBlock, { type: 'imageSlot' }>,
  site: SiteJson,
): string {
  if (block.assetId !== null) {
    const asset = site.assets.find((candidate) => candidate.id === block.assetId)
    const path = asset ? asset.path : block.assetId
    const dimensions = asset ? `${num(asset.width)}×${num(asset.height)}` : '?×?'
    // v2.3 [N6]: a filled slot MAY legitimately have no description (an uploaded
    // photo without a caption is a real state and no validator forbids it), so the
    // whole "Client's description" clause is replaced rather than rendering «».
    const description =
      block.description === null
        ? FALLBACK_NO_DESCRIPTION
        : `Client's description: ${quote(block.description)} — write alt text FROM this; don't copy it verbatim (it may contain notes meant for a human).`

    return (
      `shows \`${path}\` — uploaded image is ${dimensions}, this slot is ` +
      `${num(block.frame.w)}×${num(block.frame.h)}; crop with \`object-fit: ${block.fit}\` and ` +
      `choose an \`object-position\` that keeps the subject in frame (the sketch PNG shows the ` +
      `client's framing). ${description}`
    )
  }

  // The empty-slot branch has no null fallback by design: V14 blocks submission on
  // an empty slot with no description, because the description IS the sourcing prompt.
  return (
    `**SOURCE AN IMAGE** — no upload; client wants: ${quote(block.description ?? '')} (${block.fit}). ` +
    `Create the placeholder as a local file at \`assets/placeholders/${block.id}.<ext>\` ` +
    `(a stock or generated photo matching the description is best; a clean solid-color or ` +
    `gradient panel in the site palette is an acceptable fallback — never gray lorem-ipsum ` +
    `with a filename on it). Write alt text FROM the description, and list it under ` +
    `'Images to replace' in BUILD_NOTES.md with the block id, page, and description.`
  )
}

/** [N6] Per-type narration — the template's branch texts are normative, verbatim. */
export function narrate(block: ExportBlock, site: SiteJson): string {
  switch (block.type) {
    case 'heading':
    case 'text':
      return narrateCopy(block)
    case 'imageSlot':
      return narrateImageSlot(block, site)
    case 'button': {
      const label = quote(block.label)
      if (block.link.kind === 'none') return `labeled ${label}, not linked yet — see Navigation map`
      return `labeled ${label}, links to ${resolvedTargetInWalkthrough(block.link, site)}`
    }
    case 'navBar': {
      const items = block.items
        .map((item) => `${quote(item.label)} → ${resolvedTargetInWalkthrough(item.link, site)}`)
        .join(', ')
      return `items: ${items}`
    }
    case 'section':
      return ''
  }
}

/**
 * [N12] — "a block with `fromTemplate: true` whose narration carries client-visible
 * content". Every non-section type does; sections are never narrated as bullets, so
 * the marker structurally cannot fire for them (§2.6's v2.3 scope rule).
 */
function fillerMarker(block: ExportBlock): string {
  return block.fromTemplate === true && block.type !== 'section' ? FILLER_MARKER : ''
}

/**
 * §3.3 rule 8 — a multi-line `real` text block is ADDITIONALLY rendered beneath its
 * bullet as an indented fenced verbatim sub-block. The builder takes line breaks
 * from here (or from `site.json`), never from the `↵` glyph inside the quote.
 */
function verbatimSubBlock(block: ExportBlock, indent: number): string[] {
  if (block.type !== 'heading' && block.type !== 'text') return []
  if (block.copyMode !== 'real') return []

  const lines = block.text.split(/\r\n|\r|\n/)
  if (lines.length < 2) return []

  const pad = ' '.repeat(indent)
  return ['', `${pad}\`\`\``, ...lines.map((line) => (line === '' ? '' : pad + line)), `${pad}\`\`\``]
}

/**
 * One walkthrough block bullet plus any rule-8 sub-block, at `indent` spaces.
 * Shape (§3.2): `- **Type** <position> (x, y, w, h)<overlap><overflow>:<filler> <narration>`
 */
export function blockBullet(
  block: ExportBlock,
  page: ExportPage,
  site: SiteJson,
  indent: number,
): string[] {
  const pad = ' '.repeat(indent)
  const head =
    `${pad}- **${BULLET_TYPE_LABEL[block.type]}** ${positionPhrase(block.frame)} ` +
    `${frameTuple(block.frame)}${overlapSuffix(block, page, referenceText)}` +
    `${overflowMarker(block.frame)}:${fillerMarker(block)} ${narrate(block, site)}`

  return [head, ...verbatimSubBlock(block, indent + 2)]
}
