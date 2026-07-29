#!/usr/bin/env node
/**
 * R1.5 — the four committed fixture photographs, generated once and byte-stable.
 *
 * They do not need to be beautiful. They need to be
 *   (a) byte-identical on regeneration, on any machine, forever,
 *   (b) visually distinct enough for the dHash matching in R8.1 H7,
 *   (c) obviously identifiable when a human reviews the archived evidence.
 *
 * Everything here is deterministic: a seeded PRNG, integer arithmetic, a hand-rolled
 * bitmap font (`font5x7.mjs`) and a fixed jpeg-js quality. No system fonts, no canvas,
 * no `Math.random`, no timestamps. `fixtures.test.mjs` regenerates into a temp dir and
 * byte-compares against the committed files — a fixture that silently drifted would
 * move every perceptual-hash and dominant-colour result in R8 without anyone noticing.
 *
 *   node scripts/roundtrip/fixtures/make-fixtures.mjs [--out <dir>]
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jpeg from 'jpeg-js';

import { GLYPH_HEIGHT, GLYPH_WIDTH, glyph, textWidth } from './font5x7.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURE_WIDTH = 1600;
export const FIXTURE_HEIGHT = 1200;
/** Fixed so the encoder's output is a pure function of the pixels. */
export const JPEG_QUALITY = 82;

/**
 * One entry per fixture. `seed` drives the grain, `base`/`accent`/`ink` the palette.
 * The palettes are deliberately far apart in hue so S5's dominant-colour extraction
 * and H7's dHash both have an easy, unambiguous signal to work with.
 */
export const FIXTURES = Object.freeze([
  {
    file: 'fixture-patio.jpg',
    label: 'PATIO FIXTURE',
    seed: 0x50415449,
    base: [178, 96, 62],
    accent: [214, 148, 112],
    ink: [46, 26, 18],
    shape: 'grid',
  },
  {
    file: 'fixture-wall.jpg',
    label: 'WALL FIXTURE',
    seed: 0x57414c4c,
    base: [116, 132, 118],
    accent: [162, 176, 160],
    ink: [30, 38, 32],
    shape: 'courses',
  },
  {
    file: 'fixture-garden.jpg',
    label: 'GARDEN FIXTURE',
    seed: 0x47415244,
    base: [72, 132, 62],
    accent: [136, 190, 96],
    ink: [18, 40, 16],
    shape: 'lobes',
  },
  {
    file: 'fixture-dog.jpg',
    label: 'DOG FIXTURE',
    seed: 0x444f4720,
    base: [196, 168, 108],
    accent: [238, 220, 176],
    ink: [54, 40, 20],
    shape: 'rings',
  },
]);

/** mulberry32 — small, fast, and identical on every engine. */
function makeRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(width, height) {
  const data = Buffer.alloc(width * height * 4, 0);
  return {
    width,
    height,
    data,
    set(x, y, [r, g, b]) {
      if (x < 0 || y < 0 || x >= width || y >= height) return;
      const i = (y * width + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = 255;
    },
    fillRect(x0, y0, w, h, colour) {
      for (let y = y0; y < y0 + h; y += 1) for (let x = x0; x < x0 + w; x += 1) this.set(x, y, colour);
    },
  };
}

function clampByte(value) {
  return value < 0 ? 0 : value > 255 ? 255 : value | 0;
}

/** A soft vertical gradient plus deterministic grain — enough texture to hash on. */
function paintBackground(canvas, { base, accent }, random) {
  for (let y = 0; y < canvas.height; y += 1) {
    const mix = y / (canvas.height - 1);
    for (let x = 0; x < canvas.width; x += 1) {
      const grain = Math.floor(random() * 17) - 8;
      canvas.set(x, y, [
        clampByte(base[0] + (accent[0] - base[0]) * mix + grain),
        clampByte(base[1] + (accent[1] - base[1]) * mix + grain),
        clampByte(base[2] + (accent[2] - base[2]) * mix + grain),
      ]);
    }
  }
}

/** One large, obviously different shape per fixture — the eye's index into the set. */
function paintShape(canvas, { shape, ink, accent }) {
  const { width, height } = canvas;
  if (shape === 'grid') {
    for (let y = 200; y < height - 200; y += 160) canvas.fillRect(160, y, width - 320, 8, ink);
    for (let x = 160; x < width - 160; x += 200) canvas.fillRect(x, 200, 8, height - 400, ink);
    return;
  }
  if (shape === 'courses') {
    for (let row = 0, y = 180; y < height - 180; y += 120, row += 1) {
      const offset = row % 2 === 0 ? 0 : 130;
      for (let x = 140 + offset; x < width - 200; x += 260) canvas.fillRect(x, y, 240, 100, accent);
    }
    return;
  }
  if (shape === 'lobes') {
    for (const [cx, cy, r] of [[520, 520, 260], [1080, 460, 200], [820, 880, 230]]) {
      for (let y = cy - r; y <= cy + r; y += 1) {
        for (let x = cx - r; x <= cx + r; x += 1) {
          if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) canvas.set(x, y, accent);
        }
      }
    }
    return;
  }
  // rings
  for (const [cx, cy, r] of [[800, 560, 380], [800, 560, 260], [800, 560, 140]]) {
    for (let a = 0; a < 4096; a += 1) {
      const t = (a / 4096) * Math.PI * 2;
      for (let w = 0; w < 14; w += 1) {
        canvas.set(Math.round(cx + Math.cos(t) * (r + w)), Math.round(cy + Math.sin(t) * (r + w)), ink);
      }
    }
  }
}

/** Bake the label in, at a scale that survives a thumbnail in the evidence archive. */
function paintLabel(canvas, label, ink) {
  const scale = 14;
  const w = textWidth(label) * scale;
  const h = GLYPH_HEIGHT * scale;
  const x0 = Math.floor((canvas.width - w) / 2);
  const y0 = Math.floor(canvas.height - h - 120);

  canvas.fillRect(x0 - 32, y0 - 32, w + 64, h + 64, [255, 255, 255]);

  let penX = x0;
  for (const char of label) {
    const rows = glyph(char);
    for (let gy = 0; gy < GLYPH_HEIGHT; gy += 1) {
      for (let gx = 0; gx < GLYPH_WIDTH; gx += 1) {
        if (rows[gy][gx] !== '1') continue;
        canvas.fillRect(penX + gx * scale, y0 + gy * scale, scale, scale, ink);
      }
    }
    penX += (GLYPH_WIDTH + 1) * scale;
  }
}

/** @returns {Buffer} the encoded JPEG bytes for one fixture spec. */
export function renderFixture(spec) {
  const canvas = makeCanvas(FIXTURE_WIDTH, FIXTURE_HEIGHT);
  const random = makeRandom(spec.seed);
  paintBackground(canvas, spec, random);
  paintShape(canvas, spec);
  paintLabel(canvas, spec.label, spec.ink);
  const encoded = jpeg.encode({ data: canvas.data, width: canvas.width, height: canvas.height }, JPEG_QUALITY);
  return Buffer.from(encoded.data);
}

/** Write every fixture into `outDir`. @returns {Promise<{file:string,bytes:number}[]>} */
export async function writeFixtures(outDir) {
  await mkdir(outDir, { recursive: true });
  const written = [];
  for (const spec of FIXTURES) {
    const bytes = renderFixture(spec);
    await writeFile(path.join(outDir, spec.file), bytes);
    written.push({ file: spec.file, bytes: bytes.length });
  }
  return written;
}

async function main() {
  const argv = process.argv.slice(2);
  const outIndex = argv.indexOf('--out');
  const outDir = outIndex === -1 ? HERE : path.resolve(argv[outIndex + 1]);
  const written = await writeFixtures(outDir);
  for (const { file, bytes } of written) {
    process.stdout.write(`wrote ${path.join(outDir, file)} (${bytes} B)\n`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`make-fixtures: ${err.message}\n`);
    process.exit(1);
  });
}
