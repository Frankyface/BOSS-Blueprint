/**
 * THE PACKAGE ZIP — `docs/export-format.md` §1.
 *
 * Pure and deterministic like the rest of `src/export/**`: bytes in, bytes out.
 * The download itself is a browser concern and lives in `src/platform/`.
 */

export { buildPackage, type BuiltPackage, type PackageInput, type PageRenderBytes } from './buildPackage.ts'
export {
  MAX_ZIP_BYTES,
  SIZE_TARGET_BYTES,
  STORE_LEVEL,
  TEXT_DEFLATE_LEVEL,
  ZIP_ENTRY_DAY,
  ZIP_ENTRY_HOUR,
  ZIP_ENTRY_MONTH,
  ZIP_ENTRY_MTIME,
  ZIP_ENTRY_YEAR,
} from './constants.ts'
export {
  assetEntry,
  entryPaths,
  orderEntries,
  renderEntry,
  textEntry,
  type EntryKind,
  type PackageEntry,
} from './entries.ts'
export { packageFileName, uuid8, UUID8_LENGTH } from './filename.ts'
export {
  ALWAYS_ON_RUNGS,
  APP_LADDER_PORTS,
  quantizeStrokeFreeRenders,
  runLadder,
  stripRenderMetadata,
  type LadderPorts,
  type LadderResult,
  type PngQuantizer,
  type RungId,
} from './ladder.ts'
export { compressionLevelFor, packZip } from './pack.ts'
export { readChunks, stripAncillaryChunks, STRIPPED_CHUNK_TYPES } from './pngChunks.ts'
export { formatPackageSize, LADDER_FIRED_TEXT, sizeBand, SIZE_BAND_TEXT, type SizeBand } from './size.ts'
