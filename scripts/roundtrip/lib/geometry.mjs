/**
 * Geometry helpers shared by the pen-stroke rules (V22 clusters, §4.5) and the
 * frame rules (V18, V25, N13).
 */

export const PAGE_WIDTH = 1200;

export function strokeBbox(stroke) {
  const pts = Array.isArray(stroke?.points) ? stroke.points : [];
  if (pts.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const [x, y] = p;
    if (typeof x !== 'number' || typeof y !== 'number') continue;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function boxesIntersect(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function expandBox(box, pad) {
  return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 };
}

export function unionBox(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    w: Math.max(a.x + a.w, b.x + b.w) - x,
    h: Math.max(a.y + a.h, b.y + b.h) - y,
  };
}

/**
 * §4.5 / [N7] clustering: union-find over a page's strokes, joining two strokes
 * whose bboxes — each expanded by 40px — intersect.
 * @returns {{ strokes: object[], bbox: object, points: number, role: string }[]}
 */
export function clusterStrokes(strokes, pad = 40) {
  const items = strokes
    .map((s) => ({ stroke: s, bbox: strokeBbox(s) }))
    .filter((it) => it.bbox !== null);
  const parent = items.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a, b) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      if (boxesIntersect(expandBox(items[i].bbox, pad), expandBox(items[j].bbox, pad))) union(i, j);
    }
  }

  const groups = new Map();
  items.forEach((item, i) => {
    const root = find(i);
    const g = groups.get(root) ?? { strokes: [], bbox: null, points: 0 };
    g.strokes.push(item.stroke);
    g.bbox = g.bbox === null ? item.bbox : unionBox(g.bbox, item.bbox);
    g.points += Array.isArray(item.stroke.points) ? item.stroke.points.length : 0;
    groups.set(root, g);
  });

  return [...groups.values()]
    .map((g) => ({
      ...g,
      role:
        g.strokes.every(
          (s) => s.role === 'imageSketch' && s.targetBlockId === g.strokes[0].targetBlockId,
        ) && g.strokes[0].role === 'imageSketch'
          ? 'imageSketch'
          : 'annotation',
    }))
    .sort((a, b) => a.bbox.y - b.bbox.y);
}
