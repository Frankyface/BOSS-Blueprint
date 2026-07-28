/**
 * ASSET DERIVATION — `docs/export-format.md` §4.6.
 *
 * There is no asset store in the document: the photo IS the block's `imageData`
 * data URL. So `assets[]`, like every other export identity, is DERIVED at package
 * time — distinct data URLs numbered `img_001`, `img_002`, … in first-use order
 * (pages in order, blocks by `z`).
 *
 * Two slots holding the same data URL share one manifest entry and one staged file.
 * Two slots holding *visually* identical photos uploaded twice are two data URLs
 * (a JPEG re-encode is not byte-stable across ingests) and stay two assets:
 * deduping on the string is cheap, exact and deterministic, and a perceptual hash
 * would make `img_NNN` numbering depend on a threshold.
 */

import { MIME_EXTENSIONS, imageFacts } from './imageHeader.ts'
import type { ExportAsset } from './types.ts'

/** §4.6 — `img_001`, zero-padded to three digits (the schema's `^img_[0-9]{3}$`). */
const ASSET_ID_DIGITS = 3

export function assetId(ordinal: number): string {
  return `img_${String(ordinal).padStart(ASSET_ID_DIGITS, '0')}`
}

export interface AssetRegistry {
  /**
   * The `img_NNN` id for this data URL, minting one at first use. `null` when the
   * bytes are not a decodable JPEG/PNG/WebP — the caller exports an empty slot
   * rather than a reference to a file it could not stage.
   */
  readonly idFor: (dataUrl: string, originalFilename: string) => string | null
  /** The manifest in id order, which is first-use order by construction. */
  readonly manifest: () => ExportAsset[]
  /** The staged bytes, keyed by `asset.path` — what the zip writer needs. */
  readonly stagedDataUrls: () => Map<string, string>
}

/**
 * A registry scoped to ONE export pass. Deliberately not module state: two exports
 * in one session must not share numbering, and a test must not be able to leak into
 * the next one.
 */
export function createAssetRegistry(): AssetRegistry {
  const idByDataUrl = new Map<string, string>()
  const assets: ExportAsset[] = []
  const dataUrlByPath = new Map<string, string>()

  const idFor = (dataUrl: string, originalFilename: string): string | null => {
    const existing = idByDataUrl.get(dataUrl)
    if (existing !== undefined) return existing

    const facts = imageFacts(dataUrl)
    if (facts === null) return null

    const id = assetId(assets.length + 1)
    const path = `assets/${id}.${MIME_EXTENSIONS[facts.mimeType]}`

    idByDataUrl.set(dataUrl, id)
    dataUrlByPath.set(path, dataUrl)
    assets.push({
      id,
      path,
      // §4.6: verbatim, metadata only, never used as a path. A slot that somehow
      // reached the export without one still needs a non-empty string (the schema
      // requires it), and the staged filename is the only honest stand-in.
      originalFilename: originalFilename === '' ? `${id}.${MIME_EXTENSIONS[facts.mimeType]}` : originalFilename,
      mimeType: facts.mimeType,
      width: facts.width,
      height: facts.height,
      bytes: facts.bytes,
    })
    return id
  }

  return {
    idFor,
    manifest: () => assets.slice(),
    stagedDataUrls: () => new Map(dataUrlByPath),
  }
}
