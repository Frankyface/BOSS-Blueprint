/**
 * Per-block narration.
 * docs/export-format.md §3.2 (normative branch texts), §4.4 [N6] per-type
 * narration, [N12] template-filler marker, §3.3 rule 8 (verbatim sub-block).
 */

import type { Block, BlockType, Page, SiteJson } from './types.ts';
import { escapeClientText, frameTuple, num, quote } from './text.ts';
import { overflowMarker, overlapSuffix, positionPhrase } from './layout.ts';
import { resolvedTargetInWalkthrough } from './links.ts';

/**
 * Display names in walkthrough bullets — pinned by the §7.2 fixture
 * (feature-brief-generator.md "Block type labels in bullets").
 */
export const BULLET_TYPE_LABEL: Record<BlockType, string> = {
  section: 'Section band',
  heading: 'Heading',
  text: 'Text',
  imageSlot: 'Image slot',
  button: 'Button',
  navBar: 'Nav bar',
};

/** Lowercase prose form — [N7] nearest-block guess, [N8] context line. */
export const PROSE_TYPE_LABEL: Record<BlockType, string> = {
  section: 'section band',
  heading: 'heading',
  text: 'text',
  imageSlot: 'image slot',
  button: 'button',
  navBar: 'nav bar',
};

/** Bare discriminator — the copy list uses it ("— text at (…)"), per the fixture. */
export const COPY_LIST_TYPE_LABEL: Record<'heading' | 'text', string> = {
  heading: 'heading',
  text: 'text',
};

/** [N12] normative marker text. */
export const FILLER_MARKER =
  ' (untouched template filler — treat as a request to write fitting content, do not ship it verbatim)';

/**
 * [N5]/[N7]/[N8] "the block's text/label/description".
 *
 * README D11: [N5] names three fields, which covers heading/text, button and
 * imageSlot. `navBar` has none of them; its only client text is its item labels,
 * so that is what this returns.
 */
export function blockDisplayText(block: Block): string {
  switch (block.type) {
    case 'heading':
    case 'text':
      // README D22: on a `copyMode: "generate"` block `text` is the residual
      // draft and is usually "", so every [N5]/[N7]/[N8] reference to it renders
      // «» — measured in the wide fixture. Kept spec-literal; the recommended
      // v2.3 fix is to fall back to `generateDescription` for generate blocks.
      return block.text;
    case 'button':
      return block.label;
    case 'imageSlot':
      return block.description ?? '';
    case 'navBar':
      return block.items.map((i) => i.label).join(', ');
    case 'section':
      return '';
  }
}

/** [N6] Per-type narration — the template's branch texts are normative, verbatim. */
export function narrate(block: Block, site: SiteJson): string {
  switch (block.type) {
    case 'heading':
    case 'text': {
      if (block.copyMode === 'real') return `reads: ${quote(block.text)}`;
      const length = block.lengthHint ? ` (length: ${escapeClientText(block.lengthHint)})` : '';
      const residual =
        block.text.trim() !== ''
          ? ` (they had already typed ${quote(block.text)} — context for what they want, not copy to use)`
          : '';
      // README D12: `generateDescription` is non-null by V5; `?? ''` only keeps
      // the function total for a hand-edited file.
      return `**WRITE THIS COPY** — client asks for: ${quote(block.generateDescription ?? '')}${length}${residual}`;
    }
    case 'imageSlot': {
      // README D13: the FILLED branch has no null-description fallback in the
      // spec and no validator guarantees one (V14 only covers empty slots), so a
      // null description renders «» here. Spec-literal on purpose.
      const description = quote(block.description ?? '');
      if (block.assetId !== null) {
        const asset = site.assets.find((a) => a.id === block.assetId);
        const path = asset ? asset.path : block.assetId;
        const dims = asset ? `${num(asset.width)}×${num(asset.height)}` : '?×?';
        return (
          `shows \`${path}\` — uploaded image is ${dims}, this slot is ` +
          `${num(block.frame.w)}×${num(block.frame.h)}; crop with \`object-fit: ${block.fit}\` and ` +
          `choose an \`object-position\` that keeps the subject in frame (the sketch PNG shows the ` +
          `client's framing). Client's description: ${description} — write alt text FROM this; ` +
          `don't copy it verbatim (it may contain notes meant for a human).`
        );
      }
      return (
        `**SOURCE AN IMAGE** — no upload; client wants: ${description} (${block.fit}). ` +
        `Create the placeholder as a local file at \`assets/placeholders/${block.id}.<ext>\` ` +
        `(a stock or generated photo matching the description is best; a clean solid-color or ` +
        `gradient panel in the site palette is an acceptable fallback — never gray lorem-ipsum ` +
        `with a filename on it). Write alt text FROM the description, and list it under ` +
        `'Images to replace' in BUILD_NOTES.md with the block id, page, and description.`
      );
    }
    case 'button': {
      const label = quote(block.label);
      if (block.link.kind === 'none') return `labeled ${label}, not linked yet — see Navigation map`;
      return `labeled ${label}, links to ${resolvedTargetInWalkthrough(block.link, site)}`;
    }
    case 'navBar': {
      const items = block.items
        .map((i) => `${quote(i.label)} → ${resolvedTargetInWalkthrough(i.link, site)}`)
        .join(', ');
      return `items: ${items}`;
    }
    case 'section':
      // [N6]: "sections are the group headers; never item bullets".
      return '';
  }
}

/**
 * [N12] — "a block with `fromTemplate: true` whose narration carries
 * client-visible content". Every non-section type carries client text.
 */
function fillerMarker(block: Block): string {
  return block.fromTemplate === true && block.type !== 'section' ? FILLER_MARKER : '';
}

/**
 * §3.3 rule 8 — a multi-line `real` text block is ADDITIONALLY rendered beneath
 * its bullet as an indented fenced verbatim sub-block.
 */
function verbatimSubBlock(block: Block, indent: number): string[] {
  if (block.type !== 'heading' && block.type !== 'text') return [];
  if (block.copyMode !== 'real') return [];
  const lines = block.text.split(/\r\n|\r|\n/);
  if (lines.length < 2) return [];
  const pad = ' '.repeat(indent);
  return ['', `${pad}\`\`\``, ...lines.map((l) => (l === '' ? '' : pad + l)), `${pad}\`\`\``];
}

/**
 * One walkthrough block bullet (plus any rule-8 sub-block), at `indent` spaces.
 * Shape (§3.2): `- **Type** <position> (x, y, w, h)<overlap><overflow>:<filler> <narration>`
 */
export function blockBullet(block: Block, page: Page, site: SiteJson, indent: number): string[] {
  const pad = ' '.repeat(indent);
  const head =
    `${pad}- **${BULLET_TYPE_LABEL[block.type]}** ${positionPhrase(block.frame)} ` +
    `${frameTuple(block.frame)}${overlapSuffix(block, page, blockDisplayText)}` +
    `${overflowMarker(block.frame)}:${fillerMarker(block)} ${narrate(block, site)}`;
  return [head, ...verbatimSubBlock(block, indent + 2)];
}
