/**
 * THE ENTRIES OF A PACKAGE, and the order §1 writes them in.
 *
 * `docs/export-format.md` §1: "Zip entries are written in the order listed above:
 * `site.json`, `brief.md`, `pages/` in page order, `assets/` in id order." The
 * round-trip gate checks that order (C01), so it is a property of the packer, not
 * of whoever happened to build the list — the packer sorts, the caller does not
 * have to.
 */

/**
 * What an entry IS, which is the only thing the compression ladder needs to know
 * about it: text is deflated, renders may be optimized, uploaded bytes are
 * untouchable (§4.6 — the manifest's `width`/`height`/`bytes` describe the file in
 * the zip and V21 decodes it to check).
 */
export type EntryKind = 'text' | 'render' | 'asset'

export interface PackageEntry {
  /** Zip-relative, forward slashes, exactly as `site.json` spells it. */
  readonly path: string
  readonly bytes: Uint8Array
  readonly kind: EntryKind
  /**
   * §4.3 — page renders only: a page carrying pen strokes is barred from every
   * lossy rung. The RENDERER decides this and hands it over; deriving it a second
   * time here would be a second place for it to be wrong.
   */
  readonly hasStrokes: boolean
}

const SITE_JSON = 'site.json'
const BRIEF_MD = 'brief.md'
const PAGES_PREFIX = 'pages/'
const ASSETS_PREFIX = 'assets/'

/** §1's four positions, in order. */
const SECTION_ORDER = { site: 0, brief: 1, page: 2, asset: 3, other: 4 } as const

function sectionOf(path: string): number {
  if (path === SITE_JSON) return SECTION_ORDER.site
  if (path === BRIEF_MD) return SECTION_ORDER.brief
  if (path.startsWith(PAGES_PREFIX)) return SECTION_ORDER.page
  if (path.startsWith(ASSETS_PREFIX)) return SECTION_ORDER.asset
  // Unreachable through `buildPackage`, and V12 blocks it anyway; sorting it last
  // beats throwing here, where the only outcome would be a bug report with no zip.
  return SECTION_ORDER.other
}

/**
 * §1 order. Inside `pages/` and `assets/` a plain string sort IS the required
 * order: both names are zero-padded (`01-`, `img_001`), so lexicographic and
 * numeric agree — which is exactly why §1 pads them.
 */
export function orderEntries(entries: readonly PackageEntry[]): PackageEntry[] {
  return [...entries].sort((left, right) => {
    const bySection = sectionOf(left.path) - sectionOf(right.path)
    return bySection === 0 ? left.path.localeCompare(right.path, 'en') : bySection
  })
}

/** The entry list the validator's V12 compares against `site.json` (§5). */
export function entryPaths(entries: readonly PackageEntry[]): string[] {
  return orderEntries(entries).map((entry) => entry.path)
}

export function textEntry(path: string, bytes: Uint8Array): PackageEntry {
  return { path, bytes, kind: 'text', hasStrokes: false }
}

export function renderEntry(path: string, bytes: Uint8Array, hasStrokes: boolean): PackageEntry {
  return { path, bytes, kind: 'render', hasStrokes }
}

export function assetEntry(path: string, bytes: Uint8Array): PackageEntry {
  return { path, bytes, kind: 'asset', hasStrokes: false }
}
