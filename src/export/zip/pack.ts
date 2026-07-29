/**
 * THE ZIP WRITER — `docs/export-format.md` §1.
 *
 * LIBRARY: `fflate` 0.8.3, MIT (verified in `node_modules/fflate/LICENSE`).
 * Chosen over JSZip because determinism is a success criterion here and fflate is
 * the only one of the two that lets a caller pin BOTH per-entry knobs that move
 * the output bytes — `level` and `mtime` — and that writes no unix extra fields,
 * no data descriptors, no directory entries and no external attributes (all
 * verified by reading a produced archive's headers back, see `pack.test.ts`).
 *
 * DETERMINISM, concretely: every entry is written with `ZIP_ENTRY_MTIME` and a
 * fixed level, and the packer sorts the entries itself. Two calls with the same
 * bundle therefore produce byte-identical archives — which is what makes a
 * package hashable and diffable across round-trip iterations.
 */

import { zipSync, type Zippable } from 'fflate'

import { STORE_LEVEL, TEXT_DEFLATE_LEVEL, ZIP_ENTRY_MTIME } from './constants.ts'
import { orderEntries, type PackageEntry } from './entries.ts'

/**
 * Rung 0 of the ladder, expressed where it actually takes effect.
 *
 * PNG and JPEG payloads are already entropy-coded; deflating them again typically
 * saves under 1% and costs real time on a multi-page package. Storing them also
 * makes the archive's own bytes trivially predictable, which the determinism test
 * likes. Text gets one fixed level, never an adaptive one.
 */
export function compressionLevelFor(entry: PackageEntry): 0 | 9 {
  return entry.kind === 'text' ? TEXT_DEFLATE_LEVEL : STORE_LEVEL
}

/** The archive bytes for these entries, in §1 order, deterministically. */
export function packZip(entries: readonly PackageEntry[]): Uint8Array {
  const zippable: Zippable = {}

  for (const entry of orderEntries(entries)) {
    zippable[entry.path] = [
      entry.bytes,
      { level: compressionLevelFor(entry), mtime: ZIP_ENTRY_MTIME },
    ]
  }

  return zipSync(zippable, { mtime: ZIP_ENTRY_MTIME })
}
