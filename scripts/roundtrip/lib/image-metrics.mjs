/**
 * The image maths SEG-6 needs: perceptual hashing (H7), dominant colours and CIEDE2000
 * (S5). Pure functions over decoded pixel buffers, so every one of them is unit-testable
 * without a browser.
 *
 * Decoders are the ones the gate already depends on — `pngjs` and `jpeg-js` — so the
 * harness gains no new runtime dependency and stays runnable offline.
 */

import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

/** @returns {{ width: number, height: number, data: Buffer }} RGBA */
export function decodeImage(buffer) {
  if (buffer.length > 8 && buffer[0] === 0x89 && buffer[1] === 0x50) {
    const png = PNG.sync.read(buffer);
    return { width: png.width, height: png.height, data: png.data };
  }
  const raw = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
  return { width: raw.width, height: raw.height, data: Buffer.from(raw.data) };
}

function luma(data, index) {
  return 0.2126 * data[index] + 0.7152 * data[index + 1] + 0.0722 * data[index + 2];
}

/** Nearest-neighbour box sample — deterministic, and enough for a 9×8 hash. */
function sampleGray(image, cols, rows) {
  const out = new Float64Array(cols * rows);
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const sx = Math.min(image.width - 1, Math.floor(((x + 0.5) / cols) * image.width));
      const sy = Math.min(image.height - 1, Math.floor(((y + 0.5) / rows) * image.height));
      out[y * cols + x] = luma(image.data, (sy * image.width + sx) * 4);
    }
  }
  return out;
}

/**
 * Difference hash: 9×8 grayscale, one bit per horizontal neighbour comparison.
 * Robust to the rescale and re-encode a built site puts a photo through, which is the
 * whole reason H7 is not a byte compare (it short-circuits on one when it can).
 * @returns {bigint} 64 bits
 */
export function dHash(image) {
  const gray = sampleGray(image, 9, 8);
  let hash = 0n;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      hash = (hash << 1n) | (gray[y * 9 + x] > gray[y * 9 + x + 1] ? 1n : 0n);
    }
  }
  return hash;
}

export function hamming(a, b) {
  let diff = a ^ b;
  let count = 0;
  while (diff !== 0n) {
    count += Number(diff & 1n);
    diff >>= 1n;
  }
  return count;
}

/**
 * The N most common colours, quantised to a 32-level cube so near-identical shades in a
 * gradient or a JPEG artefact do not each claim a slot.
 * @returns {{ rgb: number[], share: number }[]}
 */
export function dominantColours(image, count = 8) {
  const buckets = new Map();
  const step = 8;
  let total = 0;
  for (let i = 0; i < image.data.length; i += 4 * step) {
    if (image.data[i + 3] < 128) continue;
    const key = ((image.data[i] >> 3) << 10) | ((image.data[i + 1] >> 3) << 5) | (image.data[i + 2] >> 3);
    const entry = buckets.get(key) ?? { r: 0, g: 0, b: 0, n: 0 };
    entry.r += image.data[i];
    entry.g += image.data[i + 1];
    entry.b += image.data[i + 2];
    entry.n += 1;
    buckets.set(key, entry);
    total += 1;
  }
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((e) => ({ rgb: [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)], share: e.n / total }));
}

export function isGrayscale(rgb, tolerance = 16) {
  return Math.max(...rgb) - Math.min(...rgb) <= tolerance;
}

export function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

/* ─────────────────────────── CIELAB + CIEDE2000 ─────────────────────────── */

function srgbToLinear(c) {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab([r, g, b]) {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

/** CIEDE2000. S5's "ΔE00 < 12" is meaningless without the real formula, so: the real one. */
export function deltaE00(lab1, lab2) {
  const [l1, a1, b1] = lab1;
  const [l2, a2, b2] = lab2;
  const rad = Math.PI / 180;
  const deg = 180 / Math.PI;

  const avgC = (Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2;
  const g = 0.5 * (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)));
  const ap1 = a1 * (1 + g);
  const ap2 = a2 * (1 + g);
  const cp1 = Math.hypot(ap1, b1);
  const cp2 = Math.hypot(ap2, b2);
  const hp1 = ((Math.atan2(b1, ap1) * deg) % 360 + 360) % 360;
  const hp2 = ((Math.atan2(b2, ap2) * deg) % 360 + 360) % 360;

  const dL = l2 - l1;
  const dC = cp2 - cp1;
  let dh = hp2 - hp1;
  if (cp1 * cp2 === 0) dh = 0;
  else if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(cp1 * cp2) * Math.sin((dh * rad) / 2);

  const avgL = (l1 + l2) / 2;
  const avgCp = (cp1 + cp2) / 2;
  let avgH = (hp1 + hp2) / 2;
  if (cp1 * cp2 === 0) avgH = hp1 + hp2;
  else if (Math.abs(hp1 - hp2) > 180) avgH = (hp1 + hp2 + 360) / 2;

  const t =
    1 -
    0.17 * Math.cos((avgH - 30) * rad) +
    0.24 * Math.cos(2 * avgH * rad) +
    0.32 * Math.cos((3 * avgH + 6) * rad) -
    0.2 * Math.cos((4 * avgH - 63) * rad);

  const sL = 1 + (0.015 * (avgL - 50) ** 2) / Math.sqrt(20 + (avgL - 50) ** 2);
  const sC = 1 + 0.045 * avgCp;
  const sH = 1 + 0.015 * avgCp * t;
  const rt =
    -2 *
    Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7)) *
    Math.sin(60 * Math.exp(-(((avgH - 275) / 25) ** 2)) * rad);

  return Math.sqrt(
    (dL / sL) ** 2 + (dC / sC) ** 2 + (dH / sH) ** 2 + rt * (dC / sC) * (dH / sH),
  );
}

/** Distance from a hex colour to the nearest of a shot's dominant colours. */
export function nearestDeltaE(hex, dominants) {
  const target = rgbToLab(hexToRgb(hex));
  return Math.min(...dominants.map((d) => deltaE00(target, rgbToLab(d.rgb))));
}
