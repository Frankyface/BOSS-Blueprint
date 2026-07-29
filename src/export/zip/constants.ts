/**
 * Named constants for the package zip — `docs/export-format.md` §1 (layout, file
 * conventions), §4.3 (the lossless-on-stroke-pages rule) and §5 V10.
 */

/**
 * THE FIXED ENTRY TIMESTAMP, and why it is spelled as LOCAL date fields.
 *
 * Determinism is a contract property, not an aesthetic: the round-trip protocol
 * re-exports the same design many times and diffs the packages, which only works
 * if the bytes depend on the design and nothing else. Wall-clock mtimes would put
 * a fresh DOS timestamp in every entry header.
 *
 * A zip entry stores its date as DOS fields (year/month/day, hour/minute/second),
 * and `fflate` derives them with the LOCAL `Date` getters. So a UTC instant would
 * encode differently in Vancouver than on a UTC CI runner — deterministic per
 * machine, not across them. Constructing the Date from local field values instead
 * makes those getters read back these exact numbers in every timezone.
 *
 * Noon rather than midnight: a handful of zones have historically moved their
 * clocks AT midnight, which makes `00:00` a non-existent local time there and
 * would shift the encoded hour. Nothing shifts at noon.
 */
export const ZIP_ENTRY_YEAR = 2026
/** 1-based, as the DOS field stores it. */
export const ZIP_ENTRY_MONTH = 1
export const ZIP_ENTRY_DAY = 1
export const ZIP_ENTRY_HOUR = 12

const MONTH_INDEX_OFFSET = 1

export const ZIP_ENTRY_MTIME = new Date(
  ZIP_ENTRY_YEAR,
  ZIP_ENTRY_MONTH - MONTH_INDEX_OFFSET,
  ZIP_ENTRY_DAY,
  ZIP_ENTRY_HOUR,
  0,
  0,
  0,
)

/**
 * The fixed deflate level for the text entries. Fixed, because "level 9" is part
 * of what makes the output byte-stable; 9 because `site.json` and `brief.md` are
 * kilobytes of highly repetitive prose and the extra CPU is unmeasurable.
 */
export const TEXT_DEFLATE_LEVEL = 9

/** Rung 0's other half: already-compressed payloads are STORED, never re-deflated. */
export const STORE_LEVEL = 0

const BYTES_PER_KB = 1024
const KB_PER_MB = 1024

export const BYTES_PER_MB = BYTES_PER_KB * KB_PER_MB

/**
 * What the ladder aims at, deliberately well under V10's 15 MB warn.
 *
 * 8 MB sits comfortably inside the 20–25 MB attachment limit common to free mail
 * providers even after base64's ~33% expansion, which is the journey this package
 * actually has to survive (the client forwards it by hand — debate #2). Aiming at
 * the warn line instead would make the warn the normal case.
 */
export const SIZE_TARGET_BYTES = 8 * BYTES_PER_MB

/**
 * §5 V10 — over this the package still ships, still downloads and still validates;
 * the size is merely surfaced. Re-exported from the validator so the meter and the
 * rule cannot drift apart.
 */
export { MAX_ZIP_BYTES } from '../validate/rules/warnings.ts'
