/**
 * export-format.md §4.1 slugify. Used to cross-check the zip filename's business
 * slug against siteSettings.businessName, and page.slug against page.name.
 */

const RESERVED = new Set(['index', 'assets', 'pages', 'site', 'brief', 'static', 'public']);
const MAX_SLUG_LEN = 36;

/** Steps 1-2 + step 4 truncation: the shared core of the page and business slug. */
export function slugifyCore(name) {
  const stripped = String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const kebab = stripped.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return truncateAtBoundary(kebab, MAX_SLUG_LEN);
}

function truncateAtBoundary(slug, max) {
  if (slug.length <= max) return slug;
  const head = slug.slice(0, max);
  const lastDash = head.lastIndexOf('-');
  const cut = lastDash > 0 ? head.slice(0, lastDash) : head;
  return cut.replace(/-+$/, '');
}

/** §4.1 applied to a page name at 1-based position `n` (steps 3, 5 included). */
export function slugifyPageName(name, n) {
  const core = slugifyCore(name);
  if (core === '') return `page-${n}`;
  return RESERVED.has(core) ? `${core}-page` : core;
}

/** §4.1 as applied to the business name for the zip filename (steps 5-6 do not apply). */
export function slugifyBusinessName(name) {
  const core = slugifyCore(name);
  return core === '' ? 'business' : core;
}

/**
 * §4.1 step 6 uniqueness pass over an ordered page list.
 * @param {{name: string}[]} pages
 * @returns {string[]} expected slugs, in page order
 */
export function expectedPageSlugs(pages) {
  const seen = new Map();
  return pages.map((page, i) => {
    const base = slugifyPageName(page.name, i + 1);
    const count = (seen.get(base) ?? 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  });
}
