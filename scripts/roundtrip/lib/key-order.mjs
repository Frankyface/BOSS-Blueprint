/**
 * V27 (v2.4) — canonical `site.json` key order.
 *
 * §2.1: "Key order is normative, and §7.1 is the canon." So this module does not
 * hardcode the order: it DERIVES it by walking the §7.1 worked example and recording
 * the key sequence observed for each node kind. §7.1 exercises all six block types,
 * all three link kinds, both copy modes and both slot states, so the derivation is
 * complete — with exactly one documented exception:
 *
 *   §2.1/§2.6 (v2.4): "§7.1 has no flagged block to pin it, so the §2.6 table order is
 *   blessed as canon" — `fromTemplate`, when present, follows `frame` and precedes the
 *   per-type fields. That single position is spliced in below.
 */

/** Classify a node so two nodes of the same kind can be compared for key order. */
export function nodeKind(path, value) {
  if (path === '$') return 'root';
  if (/^\$\.submission$/.test(path)) return 'submission';
  if (/^\$\.submission\.client$/.test(path)) return 'client';
  if (/^\$\.siteSettings$/.test(path)) return 'siteSettings';
  if (/^\$\.pages\[\d+\]$/.test(path)) return 'page';
  if (/^\$\.assets\[\d+\]$/.test(path)) return 'asset';
  if (/\.frame$/.test(path)) return 'frame';
  if (/\.link$/.test(path)) return `link:${value?.kind ?? 'unknown'}`;
  if (/\.items\[\d+\]$/.test(path)) return 'navItem';
  if (/^\$\.pages\[\d+\]\.penStrokes\[\d+\]$/.test(path)) return 'penStroke';
  if (/^\$\.pages\[\d+\]\.penRegions\[\d+\]$/.test(path)) return 'penRegion';
  if (/^\$\.pages\[\d+\]\.penRegions\[\d+\]\.bbox$/.test(path)) return 'bbox';
  if (/^\$\.pages\[\d+\]\.penRegions\[\d+\]\.text$/.test(path)) return 'regionText';
  if (/^\$\.pages\[\d+\]\.blocks\[\d+\]$/.test(path)) return `block:${value?.type ?? 'unknown'}`;
  return null; // not a node with a normative key order (e.g. a points pair)
}

/** Walk any site.json-shaped document, yielding { path, kind, keys } for every classified object. */
export function* walkNodes(value, path = '$') {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) yield* walkNodes(value[i], `${path}[${i}]`);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const kind = nodeKind(path, value);
  if (kind !== null) yield { path, kind, keys: Object.keys(value) };
  for (const [k, v] of Object.entries(value)) yield* walkNodes(v, `${path}.${k}`);
}

/**
 * Derive the canonical order table from the §7.1 example.
 * @param {object} exampleSiteJson parsed §7.1
 * @returns {{ table: Map<string,string[]>, conflicts: string[] }}
 */
export function deriveCanonicalOrder(exampleSiteJson) {
  const table = new Map();
  const conflicts = [];
  for (const { path, kind, keys } of walkNodes(exampleSiteJson)) {
    const seen = table.get(kind);
    if (seen === undefined) {
      table.set(kind, keys);
      continue;
    }
    if (seen.join(',') !== keys.join(',')) {
      conflicts.push(`§7.1 is self-inconsistent for ${kind}: [${seen}] at first sight vs [${keys}] at ${path}`);
    }
  }

  // §2.6 v2.4: fromTemplate sits after `frame`, before the per-type fields.
  for (const [kind, keys] of table) {
    if (!kind.startsWith('block:')) continue;
    if (keys.includes('fromTemplate')) continue;
    const at = keys.indexOf('frame');
    if (at === -1) continue;
    table.set(kind, [...keys.slice(0, at + 1), 'fromTemplate', ...keys.slice(at + 1)]);
  }

  for (const [kind, keys] of Object.entries(STATIC_CANON)) {
    if (!table.has(kind)) table.set(kind, keys);
  }

  return { table, conflicts };
}

/**
 * §7.1's ink is one image sketch and one annotation over a button, so the worked
 * example emits NO `penRegions` and cannot arbitrate their key order. Deriving
 * nothing would be worse than a static table: `nodeKind` would return null for the
 * whole new structure and `checkKeyOrder` would skip it silently — a gate that
 * reads green while covering nothing.
 *
 * So the order is stated here, from §2.2's own property sequence, exactly as the
 * `fromTemplate` position above is. The `table.has` guard means the day §7.1 does
 * gain a region, the DERIVED order takes over and this becomes dead weight rather
 * than a second opinion.
 */
const STATIC_CANON = {
  penRegion: [
    'id',
    'kind',
    'variant',
    'confidence',
    'bbox',
    'strokeIds',
    'parentRegionId',
    'setId',
    'setIndex',
    'text',
  ],
  bbox: ['x', 'y', 'w', 'h'],
  regionText: ['lines', 'words', 'glyphHeight', 'align', 'emphasis'],
};

/**
 * Compare a package's key order against the canonical table.
 * Keys the canon does not mention are skipped: §6 requires consumers to tolerate
 * unknown fields, and an unknown field has no normative position to violate.
 * @returns {string[]} one problem per out-of-order node
 */
export function checkKeyOrder(site, table) {
  const problems = [];
  for (const { path, kind, keys } of walkNodes(site)) {
    const canon = table.get(kind);
    if (canon === undefined) {
      problems.push(`${path}: no canonical key order known for kind "${kind}" (unexpected node shape)`);
      continue;
    }
    const known = keys.filter((k) => canon.includes(k));
    const expected = canon.filter((k) => known.includes(k));
    if (known.join(',') !== expected.join(',')) {
      problems.push(`${path} (${kind}): key order [${known.join(', ')}] != canonical [${expected.join(', ')}]`);
    }
  }
  return problems;
}
