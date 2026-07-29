/**
 * ASSEMBLE THE PACKAGE — `docs/export-format.md` §1.
 *
 * The four artifact kinds go in and one archive comes out: `site.json` from the
 * canonical serializer, `brief.md` from the generator, one `pages/<NN>-<slug>.png`
 * per page from the renderer, and `assets/img_NNN.<ext>` staged verbatim from the
 * §4.6 manifest. Nothing else — no README, no thumbnail, no `.blueprint`.
 *
 * The paths are never invented here: they come from `page.screenshot` and
 * `asset.path` in `site.json`, so the archive and the machine truth agree
 * character for character by construction rather than by convention (V12/V17).
 *
 * Pure and deterministic. The submit flow supplies the renders and the ports.
 */

import { imageSize, parseImageDataUrl } from '../imageHeader.ts'
import { serializeSiteJson } from '../serialize.ts'
import type { SiteJson } from '../types.ts'
import type { RenderedPage, StagedAsset } from '../validate/types.ts'

import { assetEntry, entryPaths, renderEntry, textEntry, type PackageEntry } from './entries.ts'
import { packageFileName } from './filename.ts'
import { runLadder, type LadderPorts, type RungId } from './ladder.ts'
import { SIZE_TARGET_BYTES } from './constants.ts'

/** One rendered page, as the renderer hands it over (§4.3). */
export interface PageRenderBytes {
  readonly bytes: Uint8Array
  readonly width: number
  readonly height: number
  readonly nonBlank: boolean
  /** §4.3 — bars every lossy rung for this page. */
  readonly hasStrokes: boolean
}

export interface PackageInput {
  readonly site: SiteJson
  readonly brief: string
  /** In page order — index `i` is `site.pages[i]`, and takes its path from there. */
  readonly renders: readonly PageRenderBytes[]
  /** `asset.path` → the staged data URL, straight from the export payload (§4.6). */
  readonly stagedAssets: ReadonlyMap<string, string>
}

export interface BuiltPackage {
  readonly fileName: string
  readonly bytes: Uint8Array
  /** In §1 write order — what V12 compares against `site.json`. */
  readonly entries: readonly string[]
  readonly ladder: readonly RungId[]
  readonly ladderUnavailable: readonly RungId[]
  /** Evidence for V4/V21, derived from the very bytes that went into the archive. */
  readonly stagedAssetFacts: readonly StagedAsset[]
  /** Evidence for V6, likewise. */
  readonly renderedPageFacts: readonly RenderedPage[]
}

const UTF8 = new TextEncoder()

/**
 * §1 file conventions — UTF-8, no BOM, LF. `TextEncoder` emits no BOM, and both
 * generators already produce LF text with a final newline, so there is nothing to
 * normalize here; a normalization step would only hide a generator that stopped.
 */
function encodeText(text: string): Uint8Array {
  return UTF8.encode(text)
}

function renderEntries(input: PackageInput): PackageEntry[] {
  return input.site.pages.map((page, index) => {
    const render = input.renders[index]
    if (render === undefined) {
      throw new Error(`No render for page ${page.id} (${page.screenshot}) — the packager was called too early.`)
    }
    return renderEntry(page.screenshot, render.bytes, render.hasStrokes)
  })
}

/** §4.6 — the ingest bytes go into the archive AS-IS, never re-encoded. */
function assetEntries(input: PackageInput): PackageEntry[] {
  return input.site.assets.map((asset) => {
    const dataUrl = input.stagedAssets.get(asset.path)
    if (dataUrl === undefined) {
      throw new Error(`No staged bytes for ${asset.path} — the asset manifest and the staging map disagree.`)
    }
    const parsed = parseImageDataUrl(dataUrl)
    if (parsed === null) {
      throw new Error(`Staged bytes for ${asset.path} are not a JPEG, PNG or WebP data URL.`)
    }
    return assetEntry(asset.path, parsed.bytes)
  })
}

/**
 * V21's evidence, read back out of the bytes that ACTUALLY went into the archive
 * rather than copied off the manifest. Copying the manifest would make V21 compare
 * a number with itself; re-reading the header is what turns it into a real check
 * on the staging step (the brief prints these numbers to the builder).
 */
function stagedFacts(entries: readonly PackageEntry[], input: PackageInput): StagedAsset[] {
  const bytesByPath = new Map(entries.map((entry) => [entry.path, entry.bytes]))

  return input.site.assets.map((asset) => {
    const bytes = bytesByPath.get(asset.path) ?? new Uint8Array()
    const size = imageSize(asset.mimeType, bytes)
    return {
      path: asset.path,
      byteLength: bytes.length,
      width: size?.width ?? 0,
      height: size?.height ?? 0,
      mimeType: asset.mimeType,
    }
  })
}

export function buildPackage(
  input: PackageInput,
  ports: LadderPorts,
  targetBytes: number = SIZE_TARGET_BYTES,
): BuiltPackage {
  const entries: PackageEntry[] = [
    textEntry('site.json', encodeText(serializeSiteJson(input.site))),
    textEntry('brief.md', encodeText(input.brief)),
    ...renderEntries(input),
    ...assetEntries(input),
  ]

  const ladder = runLadder(entries, ports, targetBytes)

  return {
    fileName: packageFileName(input.site.siteSettings.businessName, input.site.submission.id),
    bytes: ladder.bytes,
    entries: entryPaths(ladder.entries),
    ladder: ladder.applied,
    ladderUnavailable: ladder.unavailable,
    stagedAssetFacts: stagedFacts(ladder.entries, input),
    renderedPageFacts: input.site.pages.map((page, index) => {
      const render = input.renders[index]
      return {
        path: page.screenshot,
        width: render?.width ?? 0,
        height: render?.height ?? 0,
        nonBlank: render?.nonBlank ?? false,
      }
    }),
  }
}
