/**
 * SLUGS — `docs/export-format.md` §4.1.
 *
 * Slugs are computed FRESH at every export from the current names; they are never
 * stored in the design state, so a rename can't leave a stale slug behind.
 *
 * Pure string work, no document knowledge: `pageSlugs()` takes the ordered page
 * names and returns the ordered slugs, because steps 3 and 6 (the `page-N`
 * fallback and the collision suffix) both need the page's position.
 */

/** §4.1 step 5 — a slug that would collide with a package path gets `-page`. */
export const RESERVED_SLUGS: readonly string[] = [
  'index',
  'assets',
  'pages',
  'site',
  'brief',
  'static',
  'public',
]

/**
 * §4.1 step 4 — truncate here, not at the schema's 40, so a `-2`…`-9` uniqueness
 * suffix can never push a slug past the cap.
 */
export const MAX_SLUG_LENGTH = 36

/** Combining marks left behind by NFKD, stripped in step 1. */
const COMBINING_MARKS = /[̀-ͯ]/g

const NON_SLUG_RUN = /[^a-z0-9]+/g
const EDGE_DASHES = /^-+|-+$/g
const TRAILING_DASHES = /-+$/

/**
 * §4.1 steps 1, 2 and 4 — the part shared by page slugs and the business slug.
 * May return `''`: a name of nothing but symbols or emoji has no usable core, and
 * the two callers differ on what to do about that (step 3 vs the `business`
 * fallback), so neither decision is taken here.
 */
export function slugifyCore(name: string): string {
  const stripped = name.normalize('NFKD').replace(COMBINING_MARKS, '').toLowerCase()
  const kebab = stripped.replace(NON_SLUG_RUN, '-').replace(EDGE_DASHES, '')
  return truncateAtBoundary(kebab, MAX_SLUG_LENGTH)
}

/** Cut at a `-` boundary "where possible" — a single long word has none, so it is cut hard. */
function truncateAtBoundary(slug: string, max: number): string {
  if (slug.length <= max) return slug

  const head = slug.slice(0, max)
  const lastDash = head.lastIndexOf('-')
  const cut = lastDash > 0 ? head.slice(0, lastDash) : head
  return cut.replace(TRAILING_DASHES, '')
}

/** §4.1 steps 3 and 5, for one page at 1-based position `position`. */
export function slugifyPageName(name: string, position: number): string {
  const core = slugifyCore(name)
  if (core === '') return `page-${String(position)}`
  return RESERVED_SLUGS.includes(core) ? `${core}-page` : core
}

/**
 * §4.1 step 6 — the uniqueness pass over the whole ordered page list. The first
 * occurrence keeps the bare slug; later ones get `-2`, `-3`, … in page order.
 */
export function pageSlugs(names: readonly string[]): string[] {
  const seen = new Map<string, number>()

  return names.map((name, index) => {
    const base = slugifyPageName(name, index + 1)
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}-${String(count)}`
  })
}

/**
 * §4.1 as applied to the business name for the zip filename. Steps 5–6 do not
 * apply (there is only ever one business slug and it names no route), and an
 * unusable name falls back to `business` rather than to `page-N` (v2.1 ruling).
 */
export function slugifyBusinessName(name: string): string {
  const core = slugifyCore(name)
  return core === '' ? 'business' : core
}
