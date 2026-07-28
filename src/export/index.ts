/**
 * THE EXPORT MODULE — `docs/export-format.md`.
 *
 * Everything here is pure: no React, no DOM, no I/O. The PNG renderer, the zip
 * writer and the submit UI compose these functions; none of them lives in here.
 */

export { generateBrief } from './brief/generateBrief.ts'
export { createAssetRegistry, assetId } from './assets.ts'
export { ID_PATTERNS, ordinalId } from './ids.ts'
export { MIME_EXTENSIONS, imageFacts, parseImageDataUrl } from './imageHeader.ts'
export { canonicalSiteJson, keyOrderProblems, serializeSiteJson } from './serialize.ts'
export {
  buildExportPayload,
  buildSiteJson,
  screenshotPath,
  type ExportDocument,
  type ExportDocumentBlock,
  type ExportDocumentPage,
  type ExportPayload,
  type SubmissionInfo,
} from './siteJson.ts'
export { MAX_SLUG_LENGTH, RESERVED_SLUGS, pageSlugs, slugifyBusinessName, slugifyCore } from './slug.ts'
export * from './types.ts'
export { validatePackage } from './validate/index.ts'
export type {
  AppliedFix,
  Finding,
  PackageBundle,
  RenderedPage,
  StagedAsset,
  ValidationReport,
} from './validate/types.ts'
