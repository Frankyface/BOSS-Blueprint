/**
 * Minimal image header parser for PNG (IHDR), JPEG (SOFn) and WebP (VP8/VP8L/VP8X).
 * V21 compares the manifest's width/height/bytes against the staged file, and V16
 * compares the path extension against the declared mimeType — both need the real
 * format and dimensions of the bytes actually in the zip.
 *
 * Returns { format, width, height } or throws with a specific reason.
 */

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** export-format.md §4.6 MIME → extension mapping. */
export const MIME_TO_EXT = Object.freeze({
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
});

export const FORMAT_TO_MIME = Object.freeze({
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
});

export function readImageHeader(buf) {
  if (!Buffer.isBuffer(buf)) throw new Error('not a buffer');
  if (buf.length >= 8 && buf.subarray(0, 8).equals(PNG_SIG)) return readPng(buf);
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return readJpeg(buf);
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return readWebp(buf);
  }
  throw new Error('unrecognized image signature (not PNG, JPEG or WebP)');
}

function readPng(buf) {
  if (buf.length < 33) throw new Error('PNG truncated before IHDR');
  if (buf.toString('ascii', 12, 16) !== 'IHDR') throw new Error('PNG first chunk is not IHDR');
  return { format: 'png', width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

const SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function readJpeg(buf) {
  let off = 2;
  while (off + 3 < buf.length) {
    if (buf[off] !== 0xff) {
      off += 1; // fill byte / resync
      continue;
    }
    const marker = buf[off + 1];
    if (marker === 0xff) {
      off += 1;
      continue;
    }
    // Standalone markers carry no length payload.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      off += 2;
      continue;
    }
    if (marker === 0xd9) break; // EOI
    const len = buf.readUInt16BE(off + 2);
    if (len < 2) throw new Error(`JPEG segment 0x${marker.toString(16)} has bogus length ${len}`);
    if (SOF_MARKERS.has(marker)) {
      if (off + 9 > buf.length) throw new Error('JPEG truncated inside SOF');
      return { format: 'jpeg', height: buf.readUInt16BE(off + 5), width: buf.readUInt16BE(off + 7) };
    }
    if (marker === 0xda) break; // SOS reached without an SOF
    off += 2 + len;
  }
  throw new Error('JPEG has no SOF segment');
}

function readWebp(buf) {
  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8 ') {
    if (buf.length < 30) throw new Error('WebP (lossy) truncated');
    return {
      format: 'webp',
      width: buf.readUInt16LE(26) & 0x3fff,
      height: buf.readUInt16LE(28) & 0x3fff,
    };
  }
  if (fourcc === 'VP8L') {
    if (buf.length < 25) throw new Error('WebP (lossless) truncated');
    const bits = buf.readUInt32LE(21);
    return { format: 'webp', width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (fourcc === 'VP8X') {
    if (buf.length < 30) throw new Error('WebP (extended) truncated');
    const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
    const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
    return { format: 'webp', width, height };
  }
  throw new Error(`unsupported WebP chunk "${fourcc}"`);
}
