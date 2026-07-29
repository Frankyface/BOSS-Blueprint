/**
 * THE DETERMINISTIC COMPRESSION LADDER — debate #2's binding adoption
 * (`docs/decisions.md` 2026-07-27) applied under `docs/export-format.md` §4.3.
 *
 * An ORDERED list of pure rungs, each `entries → entries`, applied in order while
 * the packed size exceeds `SIZE_TARGET_BYTES` and rungs remain. Which rungs fired
 * is recorded and surfaced by the size meter.
 *
 * THREE THINGS THE LADDER MUST NEVER TOUCH: `assets/` (§4.6 writes ingest bytes
 * as-is, and V21 decodes the staged file to check the manifest's
 * `width`/`height`/`bytes` — recompressing would either fail V21 or silently
 * rewrite numbers the brief prints to the builder), `site.json` and `brief.md`
 * (they are the machine truth and the prompt; deflate already handles them).
 *
 * RUNG 2 SHIPS AS A SEAM, NOT AS A DEPENDENCY. `feature-package-zip.md`'s open
 * question rules it: implement rungs 0 and 1 unconditionally, and add a quantizer
 * dependency only once a measurement shows one is needed. Measured this session
 * on the committed export baselines: a page render is 17–25 KB, so a four-page
 * package lands near 100 KB against an 8 MB target — three orders of magnitude of
 * headroom. So the rung is real, ordered and tested (the unit suite binds a fake
 * quantizer and proves it fires only on stroke-free pages), the app binds `null`,
 * and the day a real package needs quantization it is one binding and no redesign.
 */

import { SIZE_TARGET_BYTES } from './constants.ts'
import type { PackageEntry } from './entries.ts'
import { packZip } from './pack.ts'
import { stripAncillaryChunks } from './pngChunks.ts'

export type RungId =
  /** Store the already-compressed entries, deflate the text ones at a fixed level. */
  | 'rung0-store-and-deflate'
  /** Strip `tEXt`/`tIME`/`pHYs`/`iTXt` from the page renders. Lossless. */
  | 'rung1-strip-ancillary-chunks'
  /** Colour-quantize the page renders of STROKE-FREE pages only. Lossy (§4.3). */
  | 'rung2-quantize-stroke-free'

/** A deterministic PNG→PNG transform, or `null` when no quantizer is bound. */
export type PngQuantizer = ((png: Uint8Array) => Uint8Array) | null

export interface LadderPorts {
  readonly quantizePng: PngQuantizer
}

export interface LadderResult {
  readonly entries: readonly PackageEntry[]
  /** The packed archive — the ladder already paid for it, so the caller need not. */
  readonly bytes: Uint8Array
  readonly applied: readonly RungId[]
  /** Rungs the ladder reached for and could not run. */
  readonly unavailable: readonly RungId[]
}

/** Applied on every package, whatever its size. */
export const ALWAYS_ON_RUNGS: readonly RungId[] = [
  'rung0-store-and-deflate',
  'rung1-strip-ancillary-chunks',
]

/** Size-gated, tried in this order while the package is over target. */
const OPTIONAL_RUNG_ORDER: readonly RungId[] = ['rung2-quantize-stroke-free']

const isPageRender = (entry: PackageEntry): boolean => entry.kind === 'render'

function mapRenders(
  entries: readonly PackageEntry[],
  eligible: (entry: PackageEntry) => boolean,
  transform: (png: Uint8Array) => Uint8Array,
): PackageEntry[] {
  return entries.map((entry) =>
    isPageRender(entry) && eligible(entry) ? { ...entry, bytes: transform(entry.bytes) } : entry,
  )
}

/** Rung 1 — lossless, every page render. */
export function stripRenderMetadata(entries: readonly PackageEntry[]): PackageEntry[] {
  return mapRenders(entries, () => true, stripAncillaryChunks)
}

/** Rung 2 — lossy, and §4.3 bars it from any page carrying pen strokes. */
export function quantizeStrokeFreeRenders(
  entries: readonly PackageEntry[],
  quantize: (png: Uint8Array) => Uint8Array,
): PackageEntry[] {
  return mapRenders(entries, (entry) => !entry.hasStrokes, quantize)
}

/**
 * Run the ladder and pack. `targetBytes` is a parameter rather than a constant
 * read so the tests can drive the size gate with kilobyte fixtures instead of
 * having to manufacture eight megabytes of PNG.
 */
export function runLadder(
  input: readonly PackageEntry[],
  ports: LadderPorts,
  targetBytes: number = SIZE_TARGET_BYTES,
): LadderResult {
  const applied: RungId[] = [...ALWAYS_ON_RUNGS]
  const unavailable: RungId[] = []

  let entries: readonly PackageEntry[] = stripRenderMetadata(input)
  let bytes = packZip(entries)

  for (const rung of OPTIONAL_RUNG_ORDER) {
    if (bytes.length <= targetBytes) break

    const next = applyOptionalRung(rung, entries, ports)
    if (next === null) {
      unavailable.push(rung)
      continue
    }

    entries = next
    bytes = packZip(entries)
    applied.push(rung)
  }

  return { entries, bytes, applied, unavailable }
}

function applyOptionalRung(
  rung: RungId,
  entries: readonly PackageEntry[],
  ports: LadderPorts,
): readonly PackageEntry[] | null {
  if (rung !== 'rung2-quantize-stroke-free') return null
  return ports.quantizePng === null
    ? null
    : quantizeStrokeFreeRenders(entries, ports.quantizePng)
}

/** What the app binds today: rungs 0 and 1, and no quantizer (see the header). */
export const APP_LADDER_PORTS: LadderPorts = { quantizePng: null }
