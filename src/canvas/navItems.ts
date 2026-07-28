import { parseNavItems } from './blockText.ts'
import { NO_LINK, pageLink, parseLink } from './links.ts'
import type { Block, BlockLink, NavItem, Page } from './types.ts'

/**
 * NAV BAR ITEMS — structured `{ id, label, link }` entries, not a comma string.
 *
 * The two representations are deliberately kept in step by ONE function
 * (`withNavItems`): `items` is the source of truth and `block.text` is always the
 * comma-joined labels. That keeps the Stage 1 inline editor, the placeholder rule
 * ("empty text = the client never touched it") and the block's rendered face all
 * working unchanged, while the links live on structured items where the export
 * needs them.
 */

/**
 * The editor UI stops offering "add item" here (the Stage 2 nav feature's lean);
 * the export schema's own outer bound is 10 (`docs/export-format.md` §2.7 —
 * "the schema is the outer bound, the UI the inner"). Labels typed straight into
 * the block past the schema bound are dropped, because a menu that cannot be
 * exported is not a menu we can promise to build.
 */
export const NAV_ITEMS_UI_MAX = 7
export const NAV_ITEMS_SCHEMA_MAX = 10

/** What the labels are joined with when they are written back into `block.text`. */
const NAV_LABEL_JOIN = ', '

/**
 * THE LABEL RULE: non-empty, and free of the separator.
 *
 * `withNavItems` keeps `block.text` as the comma-joined labels, and the inline
 * editor turns that text back into items by splitting on commas. A label
 * containing a comma therefore does not survive that round trip — "Bread, Cakes"
 * comes back as TWO items, the menu silently grows, and the wiring on the second
 * half is lost. The comma is the delimiter of the text form, so a label may not
 * contain one (review bounce #2).
 *
 * A comma is replaced with a SPACE rather than deleted, so "Home,Shop" reads as
 * "Home Shop" instead of "HomeShop"; runs of whitespace are then collapsed. This
 * is the only place a label is shaped, and every writer and the parser go through
 * it, so `navItemsFromText(navItemLabels(items), items)` is lossless by
 * construction (pinned by a regression test).
 */
/**
 * Invisible characters, stripped before anything else. A label pasted out of a Word
 * document or a website can carry a zero-width space or joiner: it survives `trim`,
 * it takes up no room on screen, and it makes "Home" ≠ "Home" — so the menu item
 * quietly stops matching the page called Home, both for the auto-link below and for
 * the label-matching that preserves wiring across an edit (review follow-up).
 */
const ZERO_WIDTH_CHARS = /[\u200B-\u200D\u2060\uFEFF]/g

export function normaliseNavLabel(label: string): string {
  return label.replace(ZERO_WIDTH_CHARS, '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Just enough of a page to match a menu label against. */
export type PageRef = Pick<Page, 'id' | 'name'>

/**
 * WIRE A NEW MENU ITEM UP BY NAME (UX audit POLISH-3).
 *
 * A client who types "Home, Menu" into the nav bar has said where those items go
 * as plainly as they know how — and used to get two items reading "Not linked yet"
 * next to two pages of exactly those names. Matching is case-insensitive and
 * otherwise exact: "Menu" finds the page called Menu, "Our menu" finds nothing and
 * stays unwired rather than guessing at a page the client did not name.
 *
 * `none` when there is no match, which is the honest answer — the nav map then says
 * so out loud, and the export's V-rules can flag it at submit.
 */
export function linkForLabel(label: string, pages: readonly PageRef[] = []): BlockLink {
  const wanted = normaliseNavLabel(label).toLowerCase()
  if (wanted.length === 0) return NO_LINK

  const match = pages.find((page) => normaliseNavLabel(page.name).toLowerCase() === wanted)
  return match ? pageLink(match.id) : NO_LINK
}

/** Monotonic within a session; `Date.now` keeps ids unique across reloads too. */
let sequence = 0

export function createNavItemId(): string {
  sequence += 1
  return `nav-${Date.now().toString(36)}-${sequence.toString(36)}`
}

/** Test-only: makes generated ids comparable across runs. */
export function resetNavItemIdSequence(): void {
  sequence = 0
}

/** A brand-new item, wired to the page of the same name when there is one. */
export function createNavItem(label: string, pages: readonly PageRef[] = []): NavItem {
  return {
    id: createNavItemId(),
    label: normaliseNavLabel(label),
    link: linkForLabel(label, pages),
  }
}

export function navItemLabels(items: readonly NavItem[]): string {
  return items.map((item) => item.label).join(NAV_LABEL_JOIN)
}

/**
 * Put `items` on a nav-bar block, keeping `text` as their joined labels.
 * The ONLY writer of `items`, so the two can never drift.
 */
export function withNavItems(block: Block, items: readonly NavItem[]): Block {
  const capped = items.slice(0, NAV_ITEMS_SCHEMA_MAX)
  return { ...block, items: capped, text: navItemLabels(capped) }
}

/**
 * Rebuild items from a comma-separated label string (what the inline editor
 * produces, and how a schema-1 nav bar is migrated).
 *
 * Existing items are matched to labels BY LABEL, not by position, so inserting
 * "Menu" in the middle of "Home, About" keeps About's wiring on About instead of
 * sliding it onto Menu.
 */
export function navItemsFromText(
  text: string,
  existing: readonly NavItem[] = [],
  pages: readonly PageRef[] = [],
): readonly NavItem[] {
  const unused = existing.slice()

  return parseNavItems(text)
    .slice(0, NAV_ITEMS_SCHEMA_MAX)
    .map((label) => {
      const index = unused.findIndex((item) => item.label.toLowerCase() === label.toLowerCase())
      // An item the client already had keeps its own wiring, auto-linked or not:
      // only a label that was not there before is a NEW item to wire up by name.
      if (index < 0) return createNavItem(label, pages)

      const [reused] = unused.splice(index, 1)
      return reused ?? createNavItem(label, pages)
    })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * One nav item from an untrusted payload. `null` = the payload is not readable.
 *
 * An EMPTY label is refused rather than defaulted: the export schema requires
 * `minLength: 1` (§2.7), a blank menu entry is not something we could build, and
 * silently keeping one would push the failure all the way out to export
 * validation. The label is put through the same `normaliseNavLabel` every writer
 * uses, so a comma smuggled in by a hand-edited file cannot break the
 * text↔items round trip either (review bounce #1 and #2).
 */
export function parseNavItem(value: unknown): NavItem | null {
  if (!isRecord(value)) return null

  const { id, label } = value
  if (typeof id !== 'string' || id.length === 0) return null
  if (typeof label !== 'string') return null

  const normalised = normaliseNavLabel(label)
  if (normalised.length === 0) return null

  const link = parseLink(value.link)
  if (!link) return null

  return { id, label: normalised, link }
}
