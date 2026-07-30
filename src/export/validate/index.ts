/**
 * THE VALIDATOR — `docs/export-format.md` §5, run at submit time after generating
 * every artifact in memory and BEFORE zipping, downloading or notifying.
 *
 * PIPELINE ORDER (this stage's ruling; §5 does not specify one):
 *   1. FIX pass, in rule-number order, each returning a new package.
 *   2. Re-derive what a fix invalidated — the brief above all: stripping an asset
 *      renumbers `img_NNN`, which rewrites `assetId`s, which changes the brief.
 *   3. Client-facing BLOCKs, so the UI can show a human message and a jump target.
 *   4. Bug-class BLOCKs.
 *   5. V1 schema last — by then a failure genuinely is a generator bug.
 *   6. WARNs, collected on the FINAL package for the notification payload.
 *
 * The whole module is pure except for V1's dynamic `import()`, which is why
 * `validatePackage` is async. One implementation, three call sites: the app at
 * submit, Vitest against fixtures, the Stage 4 harness against a real zip.
 */

import { generateBrief } from '../brief/generateBrief.ts'

import { BUG_BLOCK_RULES } from './rules/bugBlocks.ts'
import { v07BriefCrossCheck, v30BuildFromInkMarkers } from './rules/briefCrossCheck.ts'
import { CLIENT_BLOCK_RULES } from './rules/clientBlocks.ts'
import { applyFixes } from './rules/fixes.ts'
import { v01Schema } from './rules/schemaCheck.ts'
import { WARN_RULES } from './rules/warnings.ts'
import type { AppliedFix, Finding, PackageBundle, ValidationReport } from './types.ts'

export type {
  AppliedFix,
  Audience,
  Finding,
  FindingClass,
  PackageBundle,
  RenderedPage,
  RuleId,
  StagedAsset,
  ValidationReport,
} from './types.ts'

export { applyFixes, FIX_RULES } from './rules/fixes.ts'
export { CLIENT_BLOCK_RULES } from './rules/clientBlocks.ts'
export { BUG_BLOCK_RULES, expectedZipEntries } from './rules/bugBlocks.ts'
export { MAX_REGION_ANCESTORS, v28PenRegions } from './rules/inkRegions.ts'
export { WARN_RULES } from './rules/warnings.ts'
export { v01Schema } from './rules/schemaCheck.ts'
export {
  BUILD_FROM_INK_RE,
  SOURCE_AN_IMAGE_RE,
  WRITE_THIS_COPY_RE,
  v07BriefCrossCheck,
  v30BuildFromInkMarkers,
} from './rules/briefCrossCheck.ts'

/**
 * Step 2 — regenerate the brief from the FIXED site when the caller did not bring
 * one. A caller that DID bring one (the Stage 4 harness reading a real zip) keeps
 * it, because checking the shipped brief against the shipped JSON is the entire
 * point of V7.
 */
function rederive(bundle: PackageBundle): PackageBundle {
  return bundle.brief === null ? { ...bundle, brief: generateBrief(bundle.site) } : bundle
}

export async function validatePackage(input: PackageBundle): Promise<ValidationReport> {
  const fixed = applyFixes(input)
  const bundle = rederive(fixed.bundle)
  const fixes: readonly AppliedFix[] = fixed.fixes

  const blocks: Finding[] = []
  for (const rule of CLIENT_BLOCK_RULES) blocks.push(...rule(bundle))
  for (const rule of BUG_BLOCK_RULES) blocks.push(...rule(bundle))
  blocks.push(...v07BriefCrossCheck(bundle))
  // V30 sits beside V7 rather than in BUG_BLOCK_RULES for the same reason V7 does:
  // both read the brief, so both must run AFTER step 2 re-derived it.
  blocks.push(...v30BuildFromInkMarkers(bundle))
  blocks.push(...(await v01Schema(bundle)))

  const warns: Finding[] = []
  for (const rule of WARN_RULES) warns.push(...rule(bundle))

  return {
    level: blocks.length > 0 ? 'block' : 'ok',
    blocks,
    warns,
    fixes,
    package: bundle,
  }
}
