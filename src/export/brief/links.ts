/**
 * LINK NARRATION — `docs/export-format.md` §4.4 [N9] inventory "Links out",
 * [N10] resolved targets, iteration order and separators, plus the §3.2 nav-map
 * conditionals (shared nav, unlinked items, unreachable pages — the last mirroring
 * §5 V15).
 *
 * There is no nav-graph field in `site.json` by design (§2.1): the graph is derived
 * by walking `button` and `navBar` blocks, and this module is that walk.
 */

import type { ButtonBlock, ExportLink, ExportPage, NavBarBlock, SiteJson } from '../types.ts'

import { EMPTY_MARKER } from './boilerplate.ts'
import { escapeClientText, quote } from './text.ts'

/** [N10] separators. */
export const NAV_MAP_SEPARATOR = ' · '
export const LIST_SEPARATOR = ', '

export interface LinkCarrier {
  readonly block: ButtonBlock | NavBarBlock
  /** A nav item carries its own label; a button carries the block's. */
  readonly label: string
  readonly link: ExportLink
  readonly isButton: boolean
}

/**
 * [N10] iteration order — "walk the page's blocks in `z` order; a `navBar`
 * contributes its items in their own order".
 */
export function linkCarriers(page: ExportPage): LinkCarrier[] {
  const carriers: LinkCarrier[] = []

  for (const block of page.blocks.slice().sort((a, b) => a.z - b.z)) {
    if (block.type === 'navBar') {
      for (const item of block.items) {
        carriers.push({ block, label: item.label, link: item.link, isButton: false })
      }
    } else if (block.type === 'button') {
      carriers.push({ block, label: block.label, link: block.link, isButton: true })
    }
  }
  return carriers
}

const pageById = (site: SiteJson, id: string): ExportPage | undefined =>
  site.pages.find((page) => page.id === id)

/** [N10] `kind: "page"` → ``Name (`slug`)``. */
export function pageTarget(page: ExportPage): string {
  return `${escapeClientText(page.name)} (\`${page.slug}\`)`
}

/** [N10] the resolved target as it appears in a walkthrough bullet. */
export function resolvedTargetInWalkthrough(link: ExportLink, site: SiteJson): string {
  if (link.kind === 'page') {
    const target = pageById(site, link.pageId)
    return target ? pageTarget(target) : link.pageId
  }
  if (link.kind === 'external') return link.url
  return 'not linked yet — see Navigation map'
}

/** [N10] nav-map entry. Buttons carry the `button ` prefix; nav items do not. */
export function navMapEntry(carrier: LinkCarrier, site: SiteJson): string {
  const prefix = carrier.isButton ? 'button ' : ''
  const label = quote(carrier.label)

  if (carrier.link.kind === 'none') return `${prefix}${label} — unlinked`
  if (carrier.link.kind === 'external') return `${prefix}${label} to ${carrier.link.url}`

  const target = pageById(site, carrier.link.pageId)
  return `${prefix}${label} to ${target ? pageTarget(target) : carrier.link.pageId}`
}

/** [N9] external targets render as the URL hostname with a leading `www.` stripped. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/**
 * [N9] Inventory "Links out": distinct internal page targets excluding self-links,
 * rendered as the page Name in order of first appearance, then distinct external
 * hosts. `—` when empty. Unlinked (`none`) items never appear — the nav map's
 * conditional handles those.
 */
export function linksOut(page: ExportPage, site: SiteJson): string {
  const internal: string[] = []
  const external: string[] = []

  for (const carrier of linkCarriers(page)) {
    if (carrier.link.kind === 'page') {
      if (carrier.link.pageId === page.id) continue
      const target = pageById(site, carrier.link.pageId)
      const name = target ? escapeClientText(target.name) : carrier.link.pageId
      if (!internal.includes(name)) internal.push(name)
    } else if (carrier.link.kind === 'external') {
      const host = escapeClientText(hostOf(carrier.link.url))
      if (!external.includes(host)) external.push(host)
    }
  }

  const all = [...internal, ...external]
  return all.length > 0 ? all.join(LIST_SEPARATOR) : EMPTY_MARKER
}

/** "Same target" for the shared-nav comparison — labels are compared separately. */
const targetKey = (link: ExportLink): string =>
  link.kind === 'page' ? `page:${link.pageId}` : link.kind === 'external' ? `url:${link.url}` : 'none'

/**
 * §3.2 conditional: every page has exactly one navBar and their item lists match
 * pairwise on (label, resolved target). Returns the escaped label list, or `null`
 * when the condition does not hold and per-page navs must be built instead.
 */
export function sharedNavLabels(site: SiteJson): string[] | null {
  const navs = site.pages.map((page) =>
    page.blocks.filter((block): block is NavBarBlock => block.type === 'navBar'),
  )
  if (navs.length === 0 || navs.some((list) => list.length !== 1)) return null

  const signature = (nav: NavBarBlock): string =>
    nav.items.map((item) => `${item.label} ${targetKey(item.link)}`).join('')

  const first = navs[0]?.[0]
  if (first === undefined) return null
  if (!navs.every((list) => list[0] !== undefined && signature(list[0]) === signature(first))) {
    return null
  }
  return first.items.map((item) => escapeClientText(item.label))
}

export interface UnlinkedEntry {
  readonly page: ExportPage
  readonly carrier: LinkCarrier
}

/** Every `kind: "none"` link, in page order then [N10] iteration order. */
export function unlinkedEntries(site: SiteJson): UnlinkedEntry[] {
  const out: UnlinkedEntry[] = []
  for (const page of site.pages) {
    for (const carrier of linkCarriers(page)) {
      if (carrier.link.kind === 'none') out.push({ page, carrier })
    }
  }
  return out
}

/** [N10] "unlinked entries render `Page name — button «label»`". */
export function unlinkedEntryText({ page, carrier }: UnlinkedEntry): string {
  const prefix = carrier.isButton ? 'button ' : ''
  return `${escapeClientText(page.name)} — ${prefix}${quote(carrier.label)}`
}

/** §5 V15 — pages not reachable from `pages[0]` by walking page links. */
export function unreachablePages(site: SiteJson): ExportPage[] {
  const home = site.pages[0]
  if (home === undefined) return []

  const seen = new Set<string>([home.id])
  const queue: ExportPage[] = [home]

  while (queue.length > 0) {
    const page = queue.shift()
    if (page === undefined) break
    for (const carrier of linkCarriers(page)) {
      if (carrier.link.kind !== 'page' || seen.has(carrier.link.pageId)) continue
      const target = pageById(site, carrier.link.pageId)
      if (!target) continue
      seen.add(target.id)
      queue.push(target)
    }
  }

  return site.pages.filter((page) => !seen.has(page.id))
}
