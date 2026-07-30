/** Shared traversal helpers over a parsed site.json. All read-only. */

export function pagesOf(site) {
  return Array.isArray(site?.pages) ? site.pages : [];
}

export function assetsOf(site) {
  return Array.isArray(site?.assets) ? site.assets : [];
}

export function blocksOf(page) {
  return Array.isArray(page?.blocks) ? page.blocks : [];
}

export function strokesOf(page) {
  return Array.isArray(page?.penStrokes) ? page.penStrokes : [];
}

/** §2.5 (v2.5) — optional and omitted when the page's ink is all annotation. */
export function regionsOf(page) {
  return Array.isArray(page?.penRegions) ? page.penRegions : [];
}

/**
 * §4.4 [N7] (v2.5) — the strokes that are still the ANNOTATION pool: clusters form
 * over the ink no region claimed. A stroke published as part of a drawn card has
 * already been narrated as a thing to build; narrating it again as "a handwritten
 * annotation, read it in the PNG" is a contradiction, and V22's legibility warning
 * about it would be about ink nobody is being asked to read.
 */
export function unclaimedStrokesOf(page) {
  const claimed = new Set(
    regionsOf(page).flatMap((r) => (Array.isArray(r?.strokeIds) ? r.strokeIds : [])),
  );
  return strokesOf(page).filter((s) => !claimed.has(s?.id));
}

/** Every block with its page and 0-based indices. */
export function eachBlock(site) {
  const out = [];
  pagesOf(site).forEach((page, pageIndex) => {
    blocksOf(page).forEach((block, blockIndex) => {
      out.push({ page, pageIndex, block, blockIndex });
    });
  });
  return out;
}

/** Every link-bearing thing: buttons and nav items. */
export function eachLink(site) {
  const out = [];
  for (const { page, pageIndex, block } of eachBlock(site)) {
    if (block?.type === 'button' && block.link) {
      out.push({ page, pageIndex, block, link: block.link, where: `block ${block.id} (button «${block.label}»)` });
    }
    if (block?.type === 'navBar' && Array.isArray(block.items)) {
      block.items.forEach((item, i) => {
        if (!item?.link) return;
        out.push({
          page,
          pageIndex,
          block,
          item,
          link: item.link,
          where: `block ${block.id} nav item ${i + 1} (${item.id} «${item.label}»)`,
        });
      });
    }
  }
  return out;
}

export function blockLabel(block) {
  if (!block || typeof block !== 'object') return '<block>';
  if (typeof block.label === 'string' && block.label) return `«${block.label}»`;
  if (typeof block.text === 'string' && block.text.trim()) return `«${block.text.trim().slice(0, 40)}»`;
  if (typeof block.description === 'string' && block.description) return `«${block.description.slice(0, 40)}»`;
  return block.type ?? '<block>';
}

export function frameOf(block) {
  const f = block?.frame;
  if (!f || typeof f !== 'object') return null;
  const { x, y, w, h } = f;
  if ([x, y, w, h].some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
  return { x, y, w, h };
}

/** Every string value in the document, with a dotted path — used by V7 and V24. */
export function eachString(value, path = '$', out = []) {
  if (typeof value === 'string') {
    out.push({ path, value });
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => eachString(v, `${path}[${i}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) eachString(v, `${path}.${k}`, out);
  }
  return out;
}
