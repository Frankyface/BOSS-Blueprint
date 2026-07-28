/**
 * Full PNG decode + the "non-blank pixel variance" measurement V6 / §4.3 require.
 *
 * "Non-blank" is not numerically defined in the spec, so this gate states its own
 * checkable floor and reports the measured number on every page (see README
 * limitations): a page is blank if its luminance variance is below
 * BLANK_VARIANCE_FLOOR **and** it has fewer than MIN_DISTINCT_LUMA distinct
 * luminance buckets. Both conditions must hold, so a legitimately minimal page
 * (a single dark heading on white) still passes while a uniform fill fails.
 */

import { PNG } from 'pngjs';

export const BLANK_VARIANCE_FLOOR = 1.0;
export const MIN_DISTINCT_LUMA = 3;

/**
 * @param {Buffer} buf raw PNG bytes
 * @returns {{ width: number, height: number, variance: number, distinctLuma: number, blank: boolean }}
 */
export function inspectPng(buf) {
  const png = PNG.sync.read(buf); // throws on a corrupt / non-PNG buffer
  const { width, height, data } = png;
  const buckets = new Set();
  let sum = 0;
  let sumSq = 0;
  let n = 0;

  // Sample on a stride so a 1200x8000 page stays fast; stride is deterministic.
  const totalPx = width * height;
  const stride = Math.max(1, Math.floor(totalPx / 200000));
  for (let px = 0; px < totalPx; px += stride) {
    const i = px * 4;
    const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    sum += luma;
    sumSq += luma * luma;
    n += 1;
    buckets.add(Math.round(luma / 8));
  }

  const mean = sum / n;
  const variance = Math.max(0, sumSq / n - mean * mean);
  const distinctLuma = buckets.size;
  return {
    width,
    height,
    variance,
    distinctLuma,
    sampled: n,
    blank: variance < BLANK_VARIANCE_FLOOR && distinctLuma < MIN_DISTINCT_LUMA,
  };
}
