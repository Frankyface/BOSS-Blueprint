/**
 * `generateBrief(siteJson) -> string` — `docs/export-format.md` §3.1.
 *
 * `brief.md` is generated 100% FROM `site.json` by a pure function, which is what
 * makes drift between the two impossible. No I/O, no `Date`, no `Math.random`, no
 * mutation of the input; section order is §3.3 rule 1 and every emitted line traces
 * to the §3.2 template plus exactly one [N1]–[N13] rule (rule 9: no invented data).
 *
 * Output form: unwrapped logical lines (§3.3 rule 10) — one physical line per
 * paragraph, bullet, header, table row or HTML comment — LF, final newline.
 * Appendix A's equality test B targets exactly this form, byte-exactly.
 *
 * Generated AFTER the validator's FIX pass, never before: stripping an unreferenced
 * asset renumbers `img_NNN`, which changes both the walkthrough and this file.
 */

import { EXPORT_PAGE_WIDTH, type CopyBlock, type ExportBlock, type ExportPage, type ImageSlotBlock, type SiteJson } from '../types.ts'

import {
  COPY_LIST_PREAMBLE,
  DEFINITION_OF_DONE_LINES,
  EMPTY_MARKER,
  FALLBACK_ABOUT,
  FALLBACK_COLORS,
  FALLBACK_NO_ASSETS,
  FALLBACK_NO_CONTEXT,
  FALLBACK_NO_COPY_ITEMS,
  FALLBACK_NO_DESCRIPTION_USAGE,
  FALLBACK_STYLE_NOTES,
  FALLBACK_TAGLINE,
  FALLBACK_VIBE,
  RESPONSIVE_LINES,
  ROLE_LINES,
  WALKTHROUGH_PREAMBLE,
} from './boilerplate.ts'
import { type Group, columnPlacement, columnsOf, groupBlocks, rowsOf } from './layout.ts'
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
} from './links.ts'
import {
  COPY_LIST_TYPE_LABEL,
  PROSE_TYPE_LABEL,
  blockBullet,
  referenceText,
} from './narration.ts'
import { clusterBullet, clustersOf } from './pen.ts'
import { escapeClientText, frameTuple, kilobytes, num, quote, quoteFilename } from './text.ts'

interface PageStructure {
  readonly groups: readonly Group[]
  /** Non-section blocks in walkthrough (reading) order — [N2]. */
  readonly order: readonly ExportBlock[]
  /** blockId → its [N1] group, which is the search space for [N8]'s context line. */
  readonly groupOf: ReadonlyMap<string, Group>
}

function structureOf(page: ExportPage): PageStructure {
  const groups = groupBlocks(page)
  const order: ExportBlock[] = []
  const groupOf = new Map<string, Group>()

  for (const group of groups) {
    for (const row of rowsOf(group.blocks)) {
      for (const column of columnsOf(row)) {
        for (const block of column) {
          order.push(block)
          groupOf.set(block.id, group)
        }
      }
    }
  }
  return { groups, order, groupOf }
}

/** [N3] Group headers — exact strings, en dash in the range ([N11]). */
function groupHeader(group: Group): string {
  if (group.kind === 'nav') return 'Nav bar:'
  if (group.kind === 'outside') return 'Outside any section:'

  const section = group.section
  if (section === null) return 'Outside any section:'

  const range = `y=${num(section.frame.y)}–${num(section.frame.y + section.frame.h)}`
  const background =
    section.background === null
      ? '(no background set — choose one from the palette above, or leave it the page background)'
      : `(background ${section.background})`

  return `Section band, full-width, ${range} ${background} — render as a full-bleed horizontal band; the blocks below sit inside it:`
}

/** [N8] Length estimate when `lengthHint` is null. */
function lengthEstimate(block: CopyBlock): string {
  if (block.type === 'heading') return 'a short headline, a few words'

  const chars = (block.frame.w / 8) * (block.frame.h / 24)
  return `roughly ${String(Math.floor(chars / 8))}–${String(Math.floor(chars / 5))} words`
}

/**
 * [N8] Context line — the nearest block above and below within the same group.
 *
 * v2.3 pins the metric as STRICTLY NON-OVERLAPPING vertically: "above" means the
 * candidate's bottom is at or above my top, "below" means its top is at or below my
 * bottom. A tall same-row neighbour is therefore neither, which is exactly what
 * makes §7.1's answer (the heading, not the image slot beside it) correct.
 */
function contextLine(block: ExportBlock, group: Group | undefined): string {
  const others = (group?.blocks ?? []).filter((other) => other.id !== block.id)

  const above = others
    .filter((other) => other.frame.y + other.frame.h <= block.frame.y)
    .sort((a, b) => b.frame.y + b.frame.h - (a.frame.y + a.frame.h))[0]
  const below = others
    .filter((other) => other.frame.y >= block.frame.y + block.frame.h)
    .sort((a, b) => a.frame.y - b.frame.y)[0]

  const parts: string[] = []
  if (above !== undefined) {
    parts.push(`under the ${PROSE_TYPE_LABEL[above.type]} ${quote(referenceText(above))}`)
  }
  if (below !== undefined) {
    parts.push(`above the ${PROSE_TYPE_LABEL[below.type]} ${quote(referenceText(below))}`)
  }
  // Rule 4 forbids dropping the line, so "no neighbours" has its own fixed string.
  if (parts.length === 0) return FALLBACK_NO_CONTEXT
  return `sits ${parts.join(', ')}`
}

function businessSection(site: SiteJson): string[] {
  const settings = site.siteSettings
  return [
    '## The business',
    '',
    `- **Name:** ${escapeClientText(settings.businessName)}`,
    `- **Tagline:** ${settings.tagline === null ? FALLBACK_TAGLINE : escapeClientText(settings.tagline)}`,
    `- **About (client's own words):** ${settings.about === null ? FALLBACK_ABOUT : escapeClientText(settings.about)}`,
    '',
  ]
}

function lookAndFeelSection(site: SiteJson): string[] {
  const settings = site.siteSettings
  const colors = settings.colors.length > 0 ? settings.colors.join(LIST_SEPARATOR) : FALLBACK_COLORS

  return [
    '## Look & feel',
    '',
    `- **Vibe:** ${settings.vibe ?? FALLBACK_VIBE}`,
    `- **Preferred colors:** ${colors} (in the client's order of preference). Treat the first as the primary/brand color (headings, buttons, accents) and a light entry as the lightest surface color; derive neutrals and text colors yourself to meet WCAG AA contrast. Explicit section backgrounds in the walkthroughs override this. If the style notes below describe how colors should be used, those win.`,
    `- **Client style notes:** ${settings.styleNotes === null ? FALLBACK_STYLE_NOTES : quote(settings.styleNotes)}`,
    "- **Heading levels:** on each page the largest heading is that page's single `<h1>`; other headings become h2/h3 by relative size.",
    "- **Not captured by the sketch and therefore yours:** font families and sizes, text alignment inside blocks, button styling, body-text color, and the nav bar's styling (background, alignment, sticky behavior, whether it carries the business name as a wordmark — design it; keep the item order exactly as listed).",
    "- Typography, spacing, and visual polish are yours: the sketch shows *placement*, not final styling. Make it look professionally designed, not like the sketch's gray boxes.",
    '',
  ]
}

function inventorySection(site: SiteJson): string[] {
  const pages = site.pages
  const lines = [
    '## Site inventory',
    '',
    // [N11] v2.3 — a 1-page site must not read "1 pages".
    `${String(pages.length)} ${pages.length === 1 ? 'page' : 'pages'}. **Page 1 is the homepage.**`,
    '',
    '| # | Page | Slug | Sketch (ground truth) | Blocks | Links out |',
    '|---|---|---|---|---|---|',
  ]

  pages.forEach((page, index) => {
    lines.push(
      `| ${String(index + 1)} | ${escapeClientText(page.name)} | \`${page.slug}\` | \`${page.screenshot}\` (${String(EXPORT_PAGE_WIDTH)}×${num(page.height)}) | ${String(page.blocks.length)} | ${linksOut(page, site)} |`,
    )
  })
  lines.push('')
  return lines
}

function navigationSection(site: SiteJson): string[] {
  const lines = ['## Navigation map', '']

  for (const page of site.pages) {
    const entries = linkCarriers(page).map((carrier) => navMapEntry(carrier, site))
    // [N10] v2.3 — a page with no buttons and no navBar reuses [N9]'s empty marker.
    lines.push(
      `- **${escapeClientText(page.name)}** → ${entries.length > 0 ? entries.join(NAV_MAP_SEPARATOR) : EMPTY_MARKER}`,
    )
  }

  const shared = sharedNavLabels(site)
  if (shared) {
    lines.push('')
    lines.push(
      `All pages share an identical nav bar (${shared.join(LIST_SEPARATOR)}) — implement it once as the site navigation.`,
    )
  }

  const unlinked = unlinkedEntries(site)
  if (unlinked.length > 0) {
    lines.push('')
    lines.push(
      `Unlinked buttons/items (the client never wired them): ${unlinked.map(unlinkedEntryText).join(LIST_SEPARATOR)}. If a label exactly matches a page name or slug (case-insensitive), link it there and log it in BUILD_NOTES.md; otherwise render it inert — an \`<a>\` with no \`href\`, non-interactive styling, no cursor change — and log that instead.`,
    )
  }

  const unreachable = unreachablePages(site)
  if (unreachable.length > 0) {
    lines.push('')
    lines.push(
      `No link points at: ${unreachable.map((page) => `${escapeClientText(page.name)} (\`${page.slug}\`)`).join(LIST_SEPARATOR)}. Build them at their slugs anyway and add them to the site nav in inventory order; note it in BUILD_NOTES.md.`,
    )
  }

  lines.push('')
  return lines
}

function walkthroughSection(site: SiteJson, structures: ReadonlyMap<string, PageStructure>): string[] {
  const lines = ['## Page walkthroughs', '', WALKTHROUGH_PREAMBLE, '']

  site.pages.forEach((page, index) => {
    lines.push(`### Page ${String(index + 1)} — ${escapeClientText(page.name)} (\`${page.slug}\`)`)
    lines.push('')
    lines.push(`Sketch: \`${page.screenshot}\` — ${String(EXPORT_PAGE_WIDTH)} × ${num(page.height)} px.`)
    lines.push('')

    for (const group of structures.get(page.id)?.groups ?? []) {
      lines.push(groupHeader(group))
      for (const row of rowsOf(group.blocks)) {
        const columns = columnsOf(row)
        if (columns.length >= 2) {
          lines.push('')
          lines.push(`Row (side by side, left → right — ${String(columns.length)} columns):`)
          columns.forEach((column, columnIndex) => {
            const stacked = column.length >= 2 ? ', stacked top → bottom' : ''
            lines.push(`- Column ${String(columnIndex + 1)} (${columnPlacement(columnIndex, columns.length)}${stacked}):`)
            for (const block of column) lines.push(...blockBullet(block, page, site, 2))
          })
        } else {
          for (const block of columns[0] ?? []) lines.push(...blockBullet(block, page, site, 0))
        }
      }
      lines.push('')
    }

    const clusters = clustersOf(page)
    if (clusters.length > 0) {
      lines.push("**Client's pen marks on this page** (visible in the PNG):")
      for (const cluster of clusters) lines.push(clusterBullet(cluster, page))
      lines.push('')
    }
  })

  return lines
}

function copyListSection(site: SiteJson, structures: ReadonlyMap<string, PageStructure>): string[] {
  const items: { page: ExportPage; block: CopyBlock }[] = []
  for (const page of site.pages) {
    for (const block of structures.get(page.id)?.order ?? []) {
      if ((block.type === 'heading' || block.type === 'text') && block.copyMode === 'generate') {
        items.push({ page, block })
      }
    }
  }

  const lines = [
    `## Copy you must write (${String(items.length)} ${items.length === 1 ? 'item' : 'items'})`,
    '',
    COPY_LIST_PREAMBLE,
    '',
  ]

  if (items.length === 0) {
    lines.push(FALLBACK_NO_COPY_ITEMS)
  } else {
    items.forEach(({ page, block }, index) => {
      lines.push(
        `${String(index + 1)}. **${escapeClientText(page.name)}** — ${COPY_LIST_TYPE_LABEL[block.type]} at ${frameTuple(block.frame)}, block \`${block.id}\``,
      )
      lines.push(`   - Client's request: ${quote(block.generateDescription ?? '')}`)
      lines.push(
        `   - Length: ${block.lengthHint === null ? `fit the box: ${lengthEstimate(block)}` : escapeClientText(block.lengthHint)}`,
      )
      lines.push(
        `   - Surrounding context: ${contextLine(block, structures.get(page.id)?.groupOf.get(block.id))}`,
      )
    })
  }

  lines.push('')
  return lines
}

function assetsSection(site: SiteJson): string[] {
  const lines = ['## Assets', '']

  if (site.assets.length === 0) {
    lines.push(FALLBACK_NO_ASSETS)
    lines.push('')
    return lines
  }

  for (const asset of site.assets) {
    const usages: string[] = []
    for (const page of site.pages) {
      const slots = page.blocks
        .filter((block): block is ImageSlotBlock => block.type === 'imageSlot' && block.assetId === asset.id)
        .sort((a, b) => a.z - b.z)
      for (const slot of slots) {
        // [N6] v2.3 — a null description renders the bare fixed string here too.
        const description =
          slot.description === null ? FALLBACK_NO_DESCRIPTION_USAGE : quote(slot.description)
        usages.push(
          `${escapeClientText(page.name)} — image slot at (${num(slot.frame.x)}, ${num(slot.frame.y)}), ${slot.fit}, ${description}`,
        )
      }
    }
    lines.push(
      // [N11] v2.3 — usage entries join with "; " because the entries contain commas.
      `- \`${asset.path}\` — client's file ${quoteFilename(asset.originalFilename)}, ${num(asset.width)}×${num(asset.height)}, ${kilobytes(asset.bytes)}. Used: ${usages.join('; ')}`,
    )
  }

  lines.push('')
  return lines
}

/** The pure function of §3.1. Deterministic: same `site.json`, same bytes. */
export function generateBrief(site: SiteJson): string {
  const structures = new Map<string, PageStructure>(
    site.pages.map((page) => [page.id, structureOf(page)] as const),
  )

  const lines: string[] = [
    `# Build brief — ${escapeClientText(site.siteSettings.businessName)}`,
    '',
    // §6.7 — a stray brief.md separated from its zip stays traceable.
    `<!-- Generated by BOSS Blueprint ${site.submission.appVersion} · submission ${site.submission.id} · ${site.submission.submittedAt} · schemaVersion ${String(site.schemaVersion)} · DO NOT EDIT (regenerate instead) -->`,
    '',
    ...ROLE_LINES,
    '',
    ...businessSection(site),
    ...lookAndFeelSection(site),
    ...RESPONSIVE_LINES,
    '',
    ...inventorySection(site),
    ...navigationSection(site),
    ...walkthroughSection(site, structures),
    ...copyListSection(site, structures),
    ...assetsSection(site),
    ...DEFINITION_OF_DONE_LINES,
  ]

  return `${lines.join('\n')}\n`
}

export default generateBrief
