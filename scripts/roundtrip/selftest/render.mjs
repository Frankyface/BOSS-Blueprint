/**
 * Placeholder artifact generation for the synthetic self-test package.
 *
 * The page PNGs are drawn programmatically at exactly 1200 x page.height with the
 * block frames and pen strokes painted, so they are non-blank in the same way a
 * real sketch render is (structured light/dark regions), and V6's dimension check
 * is exercised against genuinely decoded pixels.
 */

import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const PAGE_WIDTH = 1200;

function hexToRgb(hex, fallback = [235, 235, 235]) {
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function setPx(png, x, y, [r, g, b]) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (png.width * y + x) << 2;
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
  png.data[i + 3] = 255;
}

function fillRect(png, x, y, w, h, rgb) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(png.width, Math.round(x + w));
  const y1 = Math.min(png.height, Math.round(y + h));
  for (let py = y0; py < y1; py += 1) for (let px = x0; px < x1; px += 1) setPx(png, px, py, rgb);
}

function strokeRect(png, x, y, w, h, rgb, thickness = 2) {
  fillRect(png, x, y, w, thickness, rgb);
  fillRect(png, x, y + h - thickness, w, thickness, rgb);
  fillRect(png, x, y, thickness, h, rgb);
  fillRect(png, x + w - thickness, y, thickness, h, rgb);
}

function line(png, x0, y0, x1, y1, rgb, width) {
  const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const half = Math.max(1, Math.round(width / 2));
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const cx = Math.round(x0 + (x1 - x0) * t);
    const cy = Math.round(y0 + (y1 - y0) * t);
    for (let dy = -half; dy <= half; dy += 1) for (let dx = -half; dx <= half; dx += 1) setPx(png, cx + dx, cy + dy, rgb);
  }
}

const BLOCK_FILL = {
  section: [246, 246, 244],
  heading: [200, 200, 200],
  text: [219, 219, 219],
  imageSlot: [176, 176, 176],
  button: [150, 150, 150],
  navBar: [120, 120, 120],
};

/**
 * Render one page PNG.
 * @param {object} page a site.json page
 * @returns {Buffer}
 */
export function renderPagePng(page) {
  const png = new PNG({ width: PAGE_WIDTH, height: page.height });
  fillRect(png, 0, 0, PAGE_WIDTH, page.height, [255, 255, 255]);

  for (const block of page.blocks ?? []) {
    const { x, y, w, h } = block.frame;
    if (block.type === 'section') {
      fillRect(png, x, y, w, h, hexToRgb(block.background, BLOCK_FILL.section));
      continue;
    }
    fillRect(png, x, y, w, h, BLOCK_FILL[block.type] ?? [210, 210, 210]);
    strokeRect(png, x, y, w, h, [90, 90, 90], 2);
    // a couple of "type" bars so the page has fine-grained variance, like real text
    const rows = Math.max(1, Math.min(6, Math.floor(h / 24)));
    for (let r = 0; r < rows; r += 1) {
      fillRect(png, x + 12, y + 12 + r * 20, Math.max(8, w * 0.6 - r * 12), 8, [60, 60, 60]);
    }
  }

  for (const stroke of page.penStrokes ?? []) {
    const rgb = hexToRgb(stroke.color, [217, 79, 48]);
    const pts = stroke.points ?? [];
    for (let i = 1; i < pts.length; i += 1) {
      line(png, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], rgb, stroke.width ?? 4);
    }
  }

  return PNG.sync.write(png);
}

/** A deliberately blank (uniform white) page render — the V6 red path. */
export function renderBlankPng(width, height) {
  const png = new PNG({ width, height });
  fillRect(png, 0, 0, width, height, [255, 255, 255]);
  return PNG.sync.write(png);
}

/** A page render at the wrong size — the V6 dimension red path. */
export function renderPagePngAtSize(page, width, height) {
  const png = new PNG({ width, height });
  fillRect(png, 0, 0, width, height, [255, 255, 255]);
  for (const block of page.blocks ?? []) {
    const { x, y, w, h } = block.frame;
    fillRect(png, x, y, w, h, BLOCK_FILL[block.type] ?? [200, 200, 200]);
  }
  return PNG.sync.write(png);
}

/**
 * Encode a JPEG of the given dimensions and then pad it, with legal COM segments,
 * to EXACTLY `targetBytes` — so the synthetic package can reproduce the §7.1
 * manifest (1600x1200, 214733 bytes) verbatim and V21 compares real bytes.
 */
export function makeJpeg(width, height, targetBytes, quality = 35) {
  // A smooth gradient plus one soft disc: photographic enough to be a believable
  // stand-in, low-frequency enough that the encoded size leaves room for padding.
  const data = Buffer.alloc(width * height * 4);
  const cx = width * 0.45;
  const cy = height * 0.5;
  const radius = Math.min(width, height) * 0.32;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      const gx = x / width;
      const gy = y / height;
      const disc = Math.max(0, 1 - Math.hypot(x - cx, y - cy) / radius);
      data[i] = Math.round(180 * gx + 40 * gy + 60 * disc);
      data[i + 1] = Math.round(120 * gx + 90 * gy + 70 * disc);
      data[i + 2] = Math.round(70 * gx + 140 * gy + 30 * disc);
      data[i + 3] = 255;
    }
  }
  const encoded = jpeg.encode({ data, width, height }, quality).data;
  if (targetBytes === undefined) return Buffer.from(encoded);
  return padJpegToExactly(Buffer.from(encoded), targetBytes);
}

const MAX_COM_PAYLOAD = 65533;

export function padJpegToExactly(buf, targetBytes) {
  const needed = targetBytes - buf.length;
  if (needed === 0) return buf;
  if (needed < 4) throw new Error(`cannot pad JPEG from ${buf.length} to ${targetBytes} (needs >= 4 spare bytes)`);

  let segments = 1;
  while (needed - 4 * segments > MAX_COM_PAYLOAD * segments) segments += 1;
  let payloadLeft = needed - 4 * segments;

  const parts = [buf.subarray(0, 2)]; // SOI
  for (let s = 0; s < segments; s += 1) {
    const take = Math.min(MAX_COM_PAYLOAD, payloadLeft - (segments - s - 1) * 0);
    const size = s === segments - 1 ? payloadLeft : Math.min(MAX_COM_PAYLOAD, take);
    payloadLeft -= size;
    const header = Buffer.alloc(4);
    header[0] = 0xff;
    header[1] = 0xfe; // COM
    header.writeUInt16BE(size + 2, 2);
    parts.push(header, Buffer.alloc(size, 0x20));
  }
  parts.push(buf.subarray(2));
  const out = Buffer.concat(parts);
  if (out.length !== targetBytes) throw new Error(`padding produced ${out.length} bytes, wanted ${targetBytes}`);
  return out;
}
