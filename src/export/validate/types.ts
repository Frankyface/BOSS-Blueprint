/**
 * VALIDATOR VOCABULARY — `docs/export-format.md` §5.
 *
 * One validator module, three call sites: the app at submit, Vitest against
 * fixtures, and the Stage 4 round-trip harness against a real extracted package.
 * That is why every rule is a pure function over a package object rather than a
 * React-aware check, and why the evidence a rule needs (staged bytes, rendered
 * PNGs, zip entries) is DATA on the bundle rather than something a rule goes and
 * fetches.
 */

import type { SiteJson } from '../types.ts'

/** Zero-padded so findings sort naturally and match the round-trip gate's ids. */
export type RuleId =
  | 'V01' | 'V02' | 'V03' | 'V04' | 'V05' | 'V06' | 'V07' | 'V08' | 'V09'
  | 'V10' | 'V11' | 'V12' | 'V13' | 'V14' | 'V15' | 'V16' | 'V17' | 'V18'
  | 'V19' | 'V20' | 'V21' | 'V22' | 'V23' | 'V24' | 'V25' | 'V26' | 'V27'

/** §5's three outcome classes. */
export type FindingClass = 'BLOCK' | 'FIX' | 'WARN'

/**
 * Who the message is for. `client` findings get a human sentence and a jump
 * target; `bug` findings get "something went wrong" plus detail for the console.
 */
export type Audience = 'client' | 'bug'

export interface Finding {
  readonly rule: RuleId
  readonly class: FindingClass
  readonly audience: Audience
  readonly message: string
  /** Page/block/asset ids the finding is about — what the UI highlights. */
  readonly targetIds: readonly string[]
  /** Where the submit UI should navigate to show the client the problem. */
  readonly jumpTo?: { readonly pageId: string; readonly blockId?: string }
}

export interface AppliedFix {
  readonly rule: RuleId
  readonly message: string
  readonly targetIds: readonly string[]
}

/** What the packager staged for `assets/` — supplied once the zip writer exists. */
export interface StagedAsset {
  readonly path: string
  readonly byteLength: number
  readonly width: number
  readonly height: number
  readonly mimeType: string
}

/** What the PNG renderer produced — supplied once the renderer exists. */
export interface RenderedPage {
  readonly path: string
  readonly width: number
  readonly height: number
  readonly nonBlank: boolean
}

/**
 * Everything the validator can see. The optional members are EVIDENCE: a rule that
 * needs evidence it was not given reports nothing rather than guessing, which is
 * what lets the same module run before the renderer and the zip writer exist and
 * again, fully armed, inside the Stage 4 harness.
 */
export interface PackageBundle {
  readonly site: SiteJson
  /** `brief.md`, or `null` to have the pipeline generate it from the fixed site. */
  readonly brief: string | null
  readonly stagedAssets?: readonly StagedAsset[]
  readonly renderedPages?: readonly RenderedPage[]
  readonly zipEntries?: readonly string[]
  readonly zipBytes?: number
  /** The app's pre-remap ids, enabling V24's exact leak scan. */
  readonly internalIds?: readonly string[]
  /** `asset.path` → staged data URL; kept in step with V4's renumbering. */
  readonly stagedDataUrls?: ReadonlyMap<string, string>
}

export interface ValidationReport {
  readonly level: 'block' | 'ok'
  readonly blocks: readonly Finding[]
  readonly warns: readonly Finding[]
  readonly fixes: readonly AppliedFix[]
  /** The package as it should ship — after the FIX pass and its re-derivations. */
  readonly package: PackageBundle
}

/** A rule that only inspects. */
export type CheckRule = (bundle: PackageBundle) => Finding[]

/** A rule that corrects. Returns the corrected bundle plus what it did. */
export interface FixResult {
  readonly bundle: PackageBundle
  readonly fixes: readonly AppliedFix[]
}
export type FixRule = (bundle: PackageBundle) => FixResult

export function finding(
  rule: RuleId,
  findingClass: FindingClass,
  audience: Audience,
  message: string,
  targetIds: readonly string[] = [],
  jumpTo?: { pageId: string; blockId?: string },
): Finding {
  return jumpTo === undefined
    ? { rule, class: findingClass, audience, message, targetIds }
    : { rule, class: findingClass, audience, message, targetIds, jumpTo }
}
