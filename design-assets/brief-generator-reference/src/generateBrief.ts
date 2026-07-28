/**
 * generateBrief(siteJson) -> string
 *
 * The pure function of docs/export-format.md §3.1: brief.md is generated 100%
 * from site.json, byte-deterministic, no I/O, no Date, no random. Section order
 * is §3.3 rule 1; every emitted line traces to the §3.2 template plus exactly
 * one [N1]–[N13] rule of §4.4 (rule 9: no invented data).
 *
 * Output form: unwrapped logical lines (§3.3 rule 10, v2.1) — one physical line
 * per paragraph, bullet, header, table row or HTML comment. LF endings, final
 * newline (§1 "UTF-8, no BOM, LF line endings").
 */

import type { Block, CopyBlock, ImageSlotBlock, Page, SiteJson } from './types.ts';
import {
  COPY_LIST_PREAMBLE,
  DEFINITION_OF_DONE_LINES,
  FALLBACK_ABOUT,
  FALLBACK_COLORS,
  FALLBACK_STYLE_NOTES,
  FALLBACK_TAGLINE,
  FALLBACK_VIBE,
  RESPONSIVE_LINES,
  ROLE_LINES,
  WALKTHROUGH_PREAMBLE,
} from './boilerplate.ts';
import {
  escapeClientText,
  frameTuple,
  kilobytes,
  num,
  quote,
  quoteFilename,
} from './text.ts';
import {
  type Group,
  columnPlacement,
  columnsOf,
  groupBlocks,
  rowsOf,
} from './layout.ts';
import {
  LIST_SEPARATOR,
  NAV_MAP_SEPARATOR,
  linkCarriers,
  linksOut,
  navMapEntry,
  sharedNavLabels,
  unlinkedEntries,
  unlinkedEntryText,
  unreachablePages,
} from './links.ts';
import { COPY_LIST_TYPE_LABEL, PROSE_TYPE_LABEL, blockBullet, blockDisplayText } from './narration.ts';
import { clusterBullet, clustersOf } from './pen.ts';

/** §0.2 — the PNG render width, printed in the inventory and each Sketch line. */
const PAGE_WIDTH = 1200;

/* ------------------------------------------------------------ page layout */

interface PageStructure {
  groups: Group[];
  /** Non-section blocks in emission (walkthrough / reading) order — [N2]. */
  order: Block[];
  /** blockId → its [N1] group, for the [N8] context line. */
  groupOf: Map<string, Group>;
}

function structureOf(page: Page): PageStructure {
  const groups = groupBlocks(page);
  const order: Block[] = [];
  const groupOf = new Map<string, Group>();
  for (const group of groups) {
    for (const row of rowsOf(group.blocks)) {
      for (const column of columnsOf(row)) {
        for (const block of column) {
          order.push(block);
          groupOf.set(block.id, group);
        }
      }
    }
  }
  return { groups, order, groupOf };
}

/** [N3] Group headers — exact strings, en dash in the range ([N11]). */
function groupHeader(group: Group): string {
  if (group.kind === 'nav') return 'Nav bar:';
  if (group.kind === 'outside') return 'Outside any section:';
  const s = group.section!;
  const range = `y=${num(s.frame.y)}–${num(s.frame.y + s.frame.h)}`;
  const background =
    s.background === null || s.background === undefined
      ? '(no background set — choose one from the palette above, or leave it the page background)'
      : `(background ${s.background})`;
  return `Section band, full-width, ${range} ${background} — render as a full-bleed horizontal band; the blocks below sit inside it:`;
}

/* ---------------------------------------------------------------- [N8] */

/** [N8] length estimate when `lengthHint` is null. */
function lengthEstimate(block: CopyBlock): string {
  if (block.type === 'heading') return 'a short headline, a few words';
  const chars = (block.frame.w / 8) * (block.frame.h / 24);
  return `roughly ${Math.floor(chars / 8)}–${Math.floor(chars / 5)} words`;
}

/**
 * [N8] Context line: "the nearest block above and the nearest below within the
 * same group … omit a side that doesn't exist".
 *
 * README D16: "nearest above/below" has no stated metric. Implemented as
 * strictly non-overlapping neighbours (bottom ≤ my top / top ≥ my bottom), which
 * is what makes the fixture's answer (the heading, not the tall image slot
 * beside it) come out right.
 */
function contextLine(block: Block, group: Group | undefined): string {
  const others = (group?.blocks ?? []).filter((b) => b.id !== block.id);
  const above = others
    .filter((b) => b.frame.y + b.frame.h <= block.frame.y)
    .sort((a, b) => b.frame.y + b.frame.h - (a.frame.y + a.frame.h))[0];
  const below = others
    .filter((b) => b.frame.y >= block.frame.y + block.frame.h)
    .sort((a, b) => a.frame.y - b.frame.y)[0];
  const parts: string[] = [];
  if (above) parts.push(`under the ${PROSE_TYPE_LABEL[above.type]} ${quote(blockDisplayText(above))}`);
  if (below) parts.push(`above the ${PROSE_TYPE_LABEL[below.type]} ${quote(blockDisplayText(below))}`);
  // README D17: the spec defines no fixed string for "no neighbours"; rule 4
  // forbids dropping the line, so this fallback is flagged for v2.3.
  if (parts.length === 0) return 'nothing directly above or below it';
  return `sits ${parts.join(', ')}`;
}

/* ------------------------------------------------------------- generator */

export function generateBrief(site: SiteJson): string {
  const lines: string[] = [];
  const { siteSettings: s, submission, pages, assets } = site;
  const structures = new Map<string, PageStructure>(
    pages.map((p) => [p.id, structureOf(p)] as const),
  );

  /* Title + provenance comment (§3.2, §6.7) */
  lines.push(`# Build brief — ${escapeClientText(s.businessName)}`);
  lines.push('');
  lines.push(
    `<!-- Generated by BOSS Blueprint ${submission.appVersion} · submission ${submission.id} · ${submission.submittedAt} · schemaVersion ${site.schemaVersion} · DO NOT EDIT (regenerate instead) -->`,
  );
  lines.push('');

  /* 1. Your role (fixed boilerplate) */
  lines.push(...ROLE_LINES);
  lines.push('');

  /* 2. The business */
  lines.push('## The business');
  lines.push('');
  lines.push(`- **Name:** ${escapeClientText(s.businessName)}`);
  lines.push(`- **Tagline:** ${s.tagline ? escapeClientText(s.tagline) : FALLBACK_TAGLINE}`);
  lines.push(
    `- **About (client's own words):** ${s.about ? escapeClientText(s.about) : FALLBACK_ABOUT}`,
  );
  lines.push('');

  /* 3. Look & feel */
  const colors = s.colors ?? [];
  lines.push('## Look & feel');
  lines.push('');
  lines.push(`- **Vibe:** ${s.vibe ? s.vibe : FALLBACK_VIBE}`);
  lines.push(
    `- **Preferred colors:** ${colors.length > 0 ? colors.join(LIST_SEPARATOR) : FALLBACK_COLORS} (in the client's order of preference). Treat the first as the primary/brand color (headings, buttons, accents) and a light entry as the lightest surface color; derive neutrals and text colors yourself to meet WCAG AA contrast. Explicit section backgrounds in the walkthroughs override this. If the style notes below describe how colors should be used, those win.`,
  );
  lines.push(
    `- **Client style notes:** ${s.styleNotes ? quote(s.styleNotes) : FALLBACK_STYLE_NOTES}`,
  );
  lines.push(
    "- **Heading levels:** on each page the largest heading is that page's single `<h1>`; other headings become h2/h3 by relative size.",
  );
  lines.push(
    "- **Not captured by the sketch and therefore yours:** font families and sizes, text alignment inside blocks, button styling, body-text color, and the nav bar's styling (background, alignment, sticky behavior, whether it carries the business name as a wordmark — design it; keep the item order exactly as listed).",
  );
  lines.push(
    "- Typography, spacing, and visual polish are yours: the sketch shows *placement*, not final styling. Make it look professionally designed, not like the sketch's gray boxes.",
  );
  lines.push('');

  /* 4. Responsive rules (fixed boilerplate) */
  lines.push(...RESPONSIVE_LINES);
  lines.push('');

  /* 5. Site inventory */
  lines.push('## Site inventory');
  lines.push('');
  // README D18: the spec never pluralizes this count; "1 pages" would be a bug.
  lines.push(`${pages.length} ${pages.length === 1 ? 'page' : 'pages'}. **Page 1 is the homepage.**`);
  lines.push('');
  lines.push('| # | Page | Slug | Sketch (ground truth) | Blocks | Links out |');
  // README D19: §3.2's template omits the markdown delimiter row; §7.2 has it.
  lines.push('|---|---|---|---|---|---|');
  pages.forEach((page, i) => {
    lines.push(
      `| ${i + 1} | ${escapeClientText(page.name)} | \`${page.slug}\` | \`${page.screenshot}\` (${PAGE_WIDTH}×${num(page.height)}) | ${page.blocks.length} | ${linksOut(page, site)} |`,
    );
  });
  lines.push('');

  /* 6. Navigation map */
  lines.push('## Navigation map');
  lines.push('');
  for (const page of pages) {
    const entries = linkCarriers(page).map((c) => navMapEntry(c, site));
    // README D20: no rendering is defined for a page with no links at all.
    lines.push(
      `- **${escapeClientText(page.name)}** → ${entries.length > 0 ? entries.join(NAV_MAP_SEPARATOR) : '—'}`,
    );
  }
  const shared = sharedNavLabels(site);
  if (shared) {
    lines.push('');
    lines.push(
      `All pages share an identical nav bar (${shared.join(LIST_SEPARATOR)}) — implement it once as the site navigation.`,
    );
  }
  const unlinked = unlinkedEntries(site);
  if (unlinked.length > 0) {
    lines.push('');
    lines.push(
      `Unlinked buttons/items (the client never wired them): ${unlinked.map(unlinkedEntryText).join(LIST_SEPARATOR)}. If a label exactly matches a page name or slug (case-insensitive), link it there and log it in BUILD_NOTES.md; otherwise render it inert — an \`<a>\` with no \`href\`, non-interactive styling, no cursor change — and log that instead.`,
    );
  }
  const unreachable = unreachablePages(site);
  if (unreachable.length > 0) {
    lines.push('');
    lines.push(
      `No link points at: ${unreachable.map((p) => `${escapeClientText(p.name)} (\`${p.slug}\`)`).join(LIST_SEPARATOR)}. Build them at their slugs anyway and add them to the site nav in inventory order; note it in BUILD_NOTES.md.`,
    );
  }
  lines.push('');

  /* 7. Page walkthroughs */
  lines.push('## Page walkthroughs');
  lines.push('');
  lines.push(WALKTHROUGH_PREAMBLE);
  lines.push('');
  pages.forEach((page, i) => {
    lines.push(`### Page ${i + 1} — ${escapeClientText(page.name)} (\`${page.slug}\`)`);
    lines.push('');
    lines.push(`Sketch: \`${page.screenshot}\` — ${PAGE_WIDTH} × ${num(page.height)} px.`);
    lines.push('');
    for (const group of structures.get(page.id)!.groups) {
      lines.push(groupHeader(group));
      for (const row of rowsOf(group.blocks)) {
        const columns = columnsOf(row);
        if (columns.length >= 2) {
          lines.push('');
          lines.push(`Row (side by side, left → right — ${columns.length} columns):`);
          columns.forEach((column, k) => {
            const stacked = column.length >= 2 ? ', stacked top → bottom' : '';
            lines.push(`- Column ${k + 1} (${columnPlacement(k, columns.length)}${stacked}):`);
            for (const block of column) lines.push(...blockBullet(block, page, site, 2));
          });
        } else {
          for (const block of columns[0] ?? []) lines.push(...blockBullet(block, page, site, 0));
        }
      }
      lines.push('');
    }
    const clusters = clustersOf(page);
    if (clusters.length > 0) {
      lines.push("**Client's pen marks on this page** (visible in the PNG):");
      for (const cluster of clusters) lines.push(clusterBullet(cluster, page));
      lines.push('');
    }
  });

  /* 8. Copy you must write */
  const generateItems: Array<{ page: Page; block: CopyBlock }> = [];
  for (const page of pages) {
    for (const block of structures.get(page.id)!.order) {
      if ((block.type === 'heading' || block.type === 'text') && block.copyMode === 'generate') {
        generateItems.push({ page, block });
      }
    }
  }
  lines.push(
    `## Copy you must write (${generateItems.length} ${generateItems.length === 1 ? 'item' : 'items'})`,
  );
  lines.push('');
  lines.push(COPY_LIST_PREAMBLE);
  lines.push('');
  if (generateItems.length === 0) {
    lines.push('None — the client wrote all their own copy. Use it verbatim.');
  } else {
    generateItems.forEach(({ page, block }, i) => {
      lines.push(
        `${i + 1}. **${escapeClientText(page.name)}** — ${COPY_LIST_TYPE_LABEL[block.type]} at ${frameTuple(block.frame)}, block \`${block.id}\``,
      );
      lines.push(`   - Client's request: ${quote(block.generateDescription ?? '')}`);
      lines.push(
        `   - Length: ${block.lengthHint ? escapeClientText(block.lengthHint) : `fit the box: ${lengthEstimate(block)}`}`,
      );
      lines.push(
        `   - Surrounding context: ${contextLine(block, structures.get(page.id)!.groupOf.get(block.id))}`,
      );
    });
  }
  lines.push('');

  /* 9. Assets */
  lines.push('## Assets');
  lines.push('');
  if (assets.length === 0) {
    lines.push(
      'No uploaded images. Every image slot describes what it wants — see the walkthroughs.',
    );
  } else {
    for (const asset of assets) {
      const usages: string[] = [];
      for (const page of pages) {
        const slots = page.blocks
          .filter((b): b is ImageSlotBlock => b.type === 'imageSlot' && b.assetId === asset.id)
          .sort((a, b) => a.z - b.z);
        for (const slot of slots) {
          // README D13/D21: `«»` when description is null (spec-literal), and
          // the multi-usage separator is undefined — "; " chosen here.
          usages.push(
            `${escapeClientText(page.name)} — image slot at (${num(slot.frame.x)}, ${num(slot.frame.y)}), ${slot.fit}, ${quote(slot.description ?? '')}`,
          );
        }
      }
      lines.push(
        `- \`${asset.path}\` — client's file ${quoteFilename(asset.originalFilename)}, ${num(asset.width)}×${num(asset.height)}, ${kilobytes(asset.bytes)}. Used: ${usages.join('; ')}`,
      );
    }
  }
  lines.push('');

  /* 10. Definition of done (fixed boilerplate) */
  lines.push(...DEFINITION_OF_DONE_LINES);

  return `${lines.join('\n')}\n`;
}

export default generateBrief;
