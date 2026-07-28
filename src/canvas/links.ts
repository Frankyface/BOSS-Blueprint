import type { BlockLink } from './types.ts'

/**
 * THE LINK UNION — the one definition of "where does this button/nav item go".
 *
 * Shape and validation both mirror `docs/export-format.md` §2.8: internal pages by
 * id, external destinations restricted to http(s), and an explicit `none` for
 * "the client never wired it" (which the brief flags rather than guesses at).
 *
 * Pure: no store, no React. Deleting a page reverts links to it through
 * `withPageLinkCleared` here, so the "no dangling pageId" rule has one home.
 */

/**
 * Shared "not wired yet" value. Frozen because it is handed out by reference to
 * every unlinked block — one accidental write would otherwise poison all of them.
 */
export const NO_LINK: BlockLink = Object.freeze({ kind: 'none' })

/** The export schema's own external-URL rule (`"pattern": "^https?://"`). */
const EXTERNAL_URL_PREFIX = /^https?:\/\//i

export const EXTERNAL_URL_HINT = 'Web addresses need to start with http:// or https://'

export function pageLink(pageId: string): BlockLink {
  return { kind: 'page', pageId }
}

export function externalLink(url: string): BlockLink {
  return { kind: 'external', url: url.trim() }
}

/**
 * Is this something we can put in an `href`? Prefix test first (that is the
 * contract the export validates), then a real parse so `https://` on its own —
 * which passes the prefix — is still rejected.
 */
export function isValidExternalUrl(value: string): boolean {
  const trimmed = value.trim()
  if (!EXTERNAL_URL_PREFIX.test(trimmed)) return false

  try {
    const url = new URL(trimmed)
    return url.hostname.length > 0
  } catch {
    return false
  }
}

export function isPageLinkTo(link: BlockLink | undefined, pageId: string): boolean {
  return link !== undefined && link.kind === 'page' && link.pageId === pageId
}

/** A link that pointed at `pageId` comes back as `none`; everything else is untouched. */
export function withPageLinkCleared(link: BlockLink, pageId: string): BlockLink {
  return isPageLinkTo(link, pageId) ? NO_LINK : link
}

/** Two links are the same when they mean the same destination. */
export function linksEqual(a: BlockLink, b: BlockLink): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'page' && b.kind === 'page') return a.pageId === b.pageId
  if (a.kind === 'external' && b.kind === 'external') return a.url === b.url
  return true
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validate an untrusted link from a stored payload. `null` means the payload
 * cannot be trusted — the caller turns that into a corrupt-file outcome rather
 * than silently downgrading a wired button to `none`.
 */
export function parseLink(value: unknown): BlockLink | null {
  if (!isRecord(value)) return null

  const { kind } = value

  if (kind === 'none') return NO_LINK

  if (kind === 'page') {
    const { pageId } = value
    if (typeof pageId !== 'string' || pageId.length === 0) return null
    return pageLink(pageId)
  }

  if (kind === 'external') {
    const { url } = value
    if (typeof url !== 'string' || !isValidExternalUrl(url)) return null
    return externalLink(url)
  }

  return null
}
