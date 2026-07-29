/**
 * THE SIZE METER — what the client sees before they forward the package.
 *
 * It reads the REAL assembled archive, never an estimate of one: a number that
 * disagrees with the file's own properties dialog is worse than no number at all,
 * and assembly is fast enough to just do it.
 *
 * Formatting follows §4.4 [N11] (`~<round(bytes/1024)> KB`) so the meter, the
 * brief's asset list and the notification payload all say sizes the same way.
 */

import { kilobytes } from '../brief/text.ts'

import { BYTES_PER_MB, MAX_ZIP_BYTES, SIZE_TARGET_BYTES } from './constants.ts'

/** Above this many KB the meter switches to MB, per the feature's [N11] extension. */
const KB_BEFORE_MB = 1024
const BYTES_PER_KB = 1024
const MB_DECIMALS = 1

/** Plain language, not algorithm: what the number means for emailing it. */
export type SizeBand = 'comfortable' | 'large' | 'over-guideline'

export function sizeBand(bytes: number): SizeBand {
  if (bytes > MAX_ZIP_BYTES) return 'over-guideline'
  return bytes > SIZE_TARGET_BYTES ? 'large' : 'comfortable'
}

export const SIZE_BAND_TEXT: Readonly<Record<SizeBand, string>> = {
  comfortable: 'comfortable to email',
  large: 'large, but most mail providers will take it',
  'over-guideline': 'over our guideline — it may bounce, so tell us if it does',
}

/** `~24 KB`, or `~1.4 MB` once the KB figure passes 1024. */
export function formatPackageSize(bytes: number): string {
  const asKilobytes = Math.round(bytes / BYTES_PER_KB)
  if (asKilobytes <= KB_BEFORE_MB) return kilobytes(bytes)
  return `~${(bytes / BYTES_PER_MB).toFixed(MB_DECIMALS)} MB`
}

/** One short line, only when the ladder actually did something optional. */
export const LADDER_FIRED_TEXT = 'We compressed the page images to keep this emailable.'
